-- =============================================================================
-- Gestor de vacaciones — esquema de Supabase
-- =============================================================================
-- Define el estado actual del esquema, no una migración: pegar entero en el SQL Editor de
-- Supabase crea lo que falte, pero no hay ningún ALTER aquí que actualice una tabla que ya
-- existe con otra forma. Para llevar un proyecto ya creado a este esquema, borrar las tablas
-- y volver a ejecutar el fichero entero — «Recrear el esquema» en supabase/README.md tiene los
-- comandos. Diagrama y pasos del panel también en supabase/README.md.
--
-- RLS es la única barrera real: GitHub Pages hace pública la anon key.
-- =============================================================================

create extension if not exists btree_gist; -- para el EXCLUDE de activity_periods

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------
-- Los estados van como text + check en vez de enum: añadir un valor es tocar
-- el check, no un `alter type`.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  -- Los valores del check son las rutas del modo local (App.tsx): inalcanzables como slug.
  slug text not null unique
    check (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$')
    check (slug not in
      ('mis-solicitudes', 'planificacion', 'solicitudes', 'empleados', 'asignacion', 'festivos',
       'ajustes')),
  name text not null,
  default_annual_days numeric(5, 2) not null default 23,
  -- 0 = domingo … 6 = sábado, igual que Settings.workweek.
  workweek smallint[] not null default '{1,2,3,4,5,6}'
    check (workweek <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[] and workweek <> '{}'),
  created_at timestamptz not null default now()
);

-- user_id queda a null hasta que exista el usuario de auth: el trigger de la sección 2
-- los empareja por email.
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid unique references auth.users (id) on delete set null,
  email text,
  first_name text not null,
  last_name text not null default '',
  role text not null default 'employee' check (role in ('admin', 'employee')),
  is_seasonal boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists employees_org_email_key
  on public.employees (org_id, lower(email)) where email is not null;

-- Sin este índice, el join de perfiles_para_acceso() (abierto a `anon`, se pide en cada
-- carga de la pantalla de Acceso) recorre entera la tabla employees de todas las empresas.
create index if not exists employees_org_id_idx on public.employees (org_id);

-- end_date null = periodo en curso.
create table if not exists public.activity_periods (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  -- Rango cerrado '[]' a propósito: compartir el día entre baja y alta siguiente contaría
  -- ese día dos veces.
  -- «Como mucho un periodo abierto por empleado» va implícito aquí, no hace falta un índice
  -- aparte: daterange(start_date, null, '[]') es [start_date, ∞), así que dos periodos del
  -- mismo empleado con end_date null siempre se solapan entre sí, sea cual sea su fecha de
  -- inicio, y este EXCLUDE ya los rechaza.
  constraint periodos_sin_solape exclude using gist (
    employee_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
);

-- Un día es festivo o no lo es: WorkCalendar mapea día -> festivo uno a uno.
create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  day date not null,
  name text not null,
  scope text not null check (scope in ('nacional', 'andalucia', 'algarrobo')),
  unique (org_id, day)
);

-- Allowance: el ajuste manual que sustituye a la estimación de un año.
create table if not exists public.allowances (
  employee_id uuid not null references public.employees (id) on delete cascade,
  year smallint not null,
  days numeric(5, 2) not null check (days >= 0),
  primary key (employee_id, year)
);

-- Sin org_id: era redundante con employee_id y sin FK que lo comprobara, permitía que un
-- admin creara una solicitud a nombre de otra empresa. Las políticas usan
-- employee_in_my_org(employee_id).
create table if not exists public.vacation_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  year smallint not null,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'aprobada', 'rechazada')),
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_by uuid references public.employees (id) on delete set null,
  resolved_at timestamptz,
  batch_id uuid,
  constraint resuelta_coherente check (
    status <> 'pendiente' or (resolved_at is null and resolved_by is null)
  )
);

create index if not exists vacation_requests_employee_year_idx
  on public.vacation_requests (employee_id, year);

-- Días laborables ya filtrados: nunca domingos ni festivos (toWorkingDays() en el cliente).
create table if not exists public.vacation_request_days (
  request_id uuid not null references public.vacation_requests (id) on delete cascade,
  day date not null,
  primary key (request_id, day)
);

-- author_name copiado a propósito: sobrevive a que se borre el empleado.
create table if not exists public.request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.vacation_requests (id) on delete cascade,
  author_id uuid references public.employees (id) on delete set null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists request_comments_request_idx
  on public.request_comments (request_id);

-- -----------------------------------------------------------------------------
-- 2. Enlace con Supabase Auth
-- -----------------------------------------------------------------------------
-- Enlaza el empleado con su usuario por email en cuanto se crea en el panel.

create or replace function public.link_employee_to_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.employees
     set user_id = new.id
   where user_id is null
     and email is not null
     and lower(email) = lower(new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.link_employee_to_auth_user();

-- Única rendija abierta a `anon`: la lista de perfiles se pide sin sesión. Trátala como
-- pública — lo que protege los datos es la contraseña.
--
-- left join a propósito: una empresa sin perfiles todavía devuelve una fila con id null,
-- para distinguirla de «no existe esa empresa» (0 filas) sin otra llamada.
create or replace function public.perfiles_para_acceso(p_slug text)
returns table (org_name text, id uuid, first_name text, last_name text, email text)
language sql stable security definer set search_path = public as $$
  select o.name, e.id, e.first_name, e.last_name, e.email
    from public.organizations o
    left join public.employees e on e.org_id = o.id and e.user_id is not null
   where o.slug = p_slug
   order by e.first_name, e.last_name
$$;

grant execute on function public.perfiles_para_acceso(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Funciones auxiliares de RLS
-- -----------------------------------------------------------------------------
-- security definer es obligatorio: sin él, una política sobre employees que
-- consultara employees se evaluaría a sí misma en bucle.

create or replace function public.current_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.employees where user_id = auth.uid() limit 1
$$;

create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.employees where user_id = auth.uid() limit 1
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employees
     where user_id = auth.uid() and role = 'admin'
  )
$$;

-- Para las tablas que cuelgan de un empleado en vez de llevar org_id.
create or replace function public.employee_in_my_org(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employees e
     where e.id = p_employee_id and e.org_id = public.current_org_id()
  )
$$;

-- Una solicitud la ve su dueño, y el administrador de su empresa.
create or replace function public.can_read_request(p_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vacation_requests r
     where r.id = p_request_id
       and (
         r.employee_id = public.current_employee_id()
         or (public.is_admin() and public.employee_in_my_org(r.employee_id))
       )
  )
$$;

-- El dueño solo puede tocarla mientras siga pendiente; el administrador, siempre.
create or replace function public.can_write_request(p_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vacation_requests r
     where r.id = p_request_id
       and (
         (r.employee_id = public.current_employee_id() and r.status = 'pendiente')
         or (public.is_admin() and public.employee_in_my_org(r.employee_id))
       )
  )
$$;

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------
-- Los grants van primero: sin ellos la API responde «permission denied» aunque las
-- políticas sean correctas. A `anon` no se le concede nada.

grant usage on schema public to authenticated;

grant select, update                 on public.organizations         to authenticated;
grant select, insert, update, delete on public.employees             to authenticated;
grant select, insert, update, delete on public.activity_periods      to authenticated;
grant select, insert, update, delete on public.holidays              to authenticated;
grant select, insert, update, delete on public.allowances            to authenticated;
grant select, insert, update, delete on public.vacation_requests     to authenticated;
grant select, insert, update, delete on public.vacation_request_days to authenticated;
grant select, insert                 on public.request_comments      to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations', 'employees', 'activity_periods', 'holidays',
    'allowances', 'vacation_requests', 'vacation_request_days', 'request_comments'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- Borra las políticas anteriores para poder reejecutar el fichero entero.
    execute (
      select coalesce(string_agg(format('drop policy %I on public.%I;', policyname, t), ' '), '')
        from pg_policies where schemaname = 'public' and tablename = t
    );
  end loop;
end $$;

-- organizations ---------------------------------------------------------------
-- Sin insert ni delete: crear o borrar una empresa no se hace por API.
--
-- (select public.is_admin()) en vez de public.is_admin(): sin el select, Postgres no puede
-- tratarla como constante para toda la consulta y la reejecuta (con su propia subconsulta a
-- employees) fila a fila. Con (select ...) la calcula una sola vez. Aplica a is_admin(),
-- current_org_id() y current_employee_id() en todas las políticas de aquí abajo; no a
-- employee_in_my_org()/can_read_request()/can_write_request(), que reciben una columna de la
-- fila como argumento y por eso no se pueden precalcular igual.
create policy organizations_select on public.organizations
  for select to authenticated using (id = (select public.current_org_id()));

create policy organizations_update on public.organizations
  for update to authenticated
  using (id = (select public.current_org_id()) and (select public.is_admin()))
  with check (id = (select public.current_org_id()) and (select public.is_admin()));

-- employees -------------------------------------------------------------------
-- Un empleado normal solo se ve a sí mismo: con Supabase Auth el acceso ya no
-- lista perfiles y ninguna de sus pantallas necesita a sus compañeros.
create policy employees_select on public.employees
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_admin()) and org_id = (select public.current_org_id()))
  );

create policy employees_admin_write on public.employees
  for all to authenticated
  using ((select public.is_admin()) and org_id = (select public.current_org_id()))
  with check ((select public.is_admin()) and org_id = (select public.current_org_id()));

-- activity_periods ------------------------------------------------------------
create policy activity_periods_select on public.activity_periods
  for select to authenticated
  using (
    employee_id = (select public.current_employee_id())
    or ((select public.is_admin()) and public.employee_in_my_org(employee_id))
  );

create policy activity_periods_admin_write on public.activity_periods
  for all to authenticated
  using ((select public.is_admin()) and public.employee_in_my_org(employee_id))
  with check ((select public.is_admin()) and public.employee_in_my_org(employee_id));

-- holidays --------------------------------------------------------------------
create policy holidays_select on public.holidays
  for select to authenticated using (org_id = (select public.current_org_id()));

create policy holidays_admin_write on public.holidays
  for all to authenticated
  using ((select public.is_admin()) and org_id = (select public.current_org_id()))
  with check ((select public.is_admin()) and org_id = (select public.current_org_id()));

-- allowances ------------------------------------------------------------------
create policy allowances_select on public.allowances
  for select to authenticated
  using (
    employee_id = (select public.current_employee_id())
    or ((select public.is_admin()) and public.employee_in_my_org(employee_id))
  );

create policy allowances_admin_write on public.allowances
  for all to authenticated
  using ((select public.is_admin()) and public.employee_in_my_org(employee_id))
  with check ((select public.is_admin()) and public.employee_in_my_org(employee_id));

-- vacation_requests -----------------------------------------------------------
create policy vacation_requests_select on public.vacation_requests
  for select to authenticated
  using (
    employee_id = (select public.current_employee_id())
    or ((select public.is_admin()) and public.employee_in_my_org(employee_id))
  );

-- Un empleado crea solo las suyas y pendientes; el admin, cualquiera de su empresa y ya
-- aprobadas.
create policy vacation_requests_insert on public.vacation_requests
  for insert to authenticated
  with check (
    (employee_id = (select public.current_employee_id()) and status = 'pendiente')
    or ((select public.is_admin()) and public.employee_in_my_org(employee_id))
  );

-- Resolver (aprobar o rechazar) es cosa del administrador.
create policy vacation_requests_update on public.vacation_requests
  for update to authenticated
  using ((select public.is_admin()) and public.employee_in_my_org(employee_id))
  with check ((select public.is_admin()) and public.employee_in_my_org(employee_id));

-- «El empleado solo retira solicitudes pendientes; el administrador, cualquiera».
create policy vacation_requests_delete on public.vacation_requests
  for delete to authenticated
  using (
    (employee_id = (select public.current_employee_id()) and status = 'pendiente')
    or ((select public.is_admin()) and public.employee_in_my_org(employee_id))
  );

-- vacation_request_days -------------------------------------------------------
create policy vacation_request_days_select on public.vacation_request_days
  for select to authenticated using (public.can_read_request(request_id));

create policy vacation_request_days_write on public.vacation_request_days
  for all to authenticated
  using (public.can_write_request(request_id))
  with check (public.can_write_request(request_id));

-- request_comments ------------------------------------------------------------
-- Sin update ni delete: un comentario, una vez escrito, no se toca.
create policy request_comments_select on public.request_comments
  for select to authenticated using (public.can_read_request(request_id));

-- Un admin puede firmar un comentario como otro empleado: resolveRequestDay() copia el
-- hilo al separar un día, y esa copia la ejecuta quien resuelve.
create policy request_comments_insert on public.request_comments
  for insert to authenticated
  with check (
    public.can_read_request(request_id)
    and (
      author_id = (select public.current_employee_id())
      or ((select public.is_admin()) and public.employee_in_my_org(author_id))
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Arranque: primera empresa y primer administrador
-- -----------------------------------------------------------------------------
-- Huevo y gallina: RLS necesita una fila en employees, y el primer admin todavía no la
-- tiene. Se resuelve aquí porque el SQL Editor ejecuta como `postgres`, sin RLS. Sin RPC
-- a propósito: una que aceptara un user_id arbitrario sería un agujero si se expusiera.
--
-- ANTES: descomentar, rellenar y ejecutar este bloque (sin user_id: el trigger de la
-- sección 2 lo empareja por email).
-- DESPUÉS: Authentication -> Users -> Add user, con el MISMO email y marcando
-- «Auto Confirm User». Los festivos se añaden luego desde Ajustes.

-- do $$
-- declare
--   v_email text := 'mari@agrorifer.local';
--   v_org   uuid;
--   v_admin uuid;
-- begin
--   insert into public.organizations (slug, name) values ('agrorifer', 'Agrorifer') returning id into v_org;
--
--   insert into public.employees (org_id, email, first_name, last_name, role)
--        values (v_org, v_email, 'Mari', 'Rivas', 'admin')
--     returning id into v_admin;
--
--   insert into public.activity_periods (employee_id, start_date)
--        values (v_admin, date_trunc('year', now())::date);
-- end $$;
