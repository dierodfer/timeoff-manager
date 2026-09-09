-- =============================================================================
-- Gestor de vacaciones — esquema de Supabase
-- =============================================================================
-- Pegar entero en el SQL Editor de Supabase. Se puede volver a ejecutar sin que
-- falle, pero no migra: si una tabla ya existe, se deja como está.
--
-- Multiempresa: cada empleado pertenece a una empresa y las políticas RLS aíslan
-- por empresa. La aplicación se despliega en GitHub Pages, así que la anon key
-- es pública: RLS es la única barrera real. Lo que no esté en una política se
-- puede saltar llamando a la API REST con un curl.
--
-- El diagrama del modelo y los pasos del panel están en supabase/README.md.
--
-- Si ya ejecutaste una versión anterior con `vacation_requests.org_id`: como el
-- fichero no migra, hay que quitarla a mano antes de reejecutar este, o las
-- políticas de más abajo (que ya no la usan) convivirían con una columna
-- `not null` sin ningún `insert`/`update` que la rellene.
--   alter table public.vacation_requests drop column org_id;
-- =============================================================================

-- Para el EXCLUDE de activity_periods: mezcla = sobre uuid con && sobre un rango
-- de fechas en el mismo índice.
create extension if not exists btree_gist;

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------
-- Los estados van como text + check en vez de enum: cada uno se usa en una sola
-- columna, y así añadir un valor es cambiar el check y no un `alter type`. El
-- cliente los ve como cadenas igual, así que STATUS_LABEL y SCOPE_LABELS valen.

-- Settings del modelo actual: nombre, base anual y jornada semanal.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  -- Identifica a la empresa en la pantalla de acceso, cuando todavía no hay
  -- sesión y por tanto no se sabe de quién es la base de datos. La aplicación
  -- lo lleva en VITE_ORG_SLUG: un despliegue por empresa.
  slug text not null unique,
  name text not null,
  default_annual_days numeric(5, 2) not null default 23,
  -- 0 = domingo … 6 = sábado, igual que Settings.workweek.
  workweek smallint[] not null default '{1,2,3,4,5,6}'
    check (workweek <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[] and workweek <> '{}'),
  created_at timestamptz not null default now()
);

-- user_id queda a null hasta que existe el usuario de auth: el trigger de abajo
-- los empareja por email en cuanto el administrador lo crea.
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

-- Employee.activityPeriods. end_date null = periodo en curso.
create table if not exists public.activity_periods (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  -- daterange(start, NULL) ya es «sin fin», así que un periodo en curso encaja
  -- sin ningún truco. El rango es cerrado '[]' a propósito: compartir el día de
  -- la baja con el alta siguiente contaría ese día dos veces, y aquí se rechaza.
  constraint periodos_sin_solape exclude using gist (
    employee_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
);

-- «Como mucho un periodo abierto por empleado», la otra invariante del dominio.
create unique index if not exists activity_periods_uno_abierto
  on public.activity_periods (employee_id) where end_date is null;

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

-- Sin org_id: sería redundante con employee_id (que ya la fija vía employees) y
-- sin una FK que lo comprobara, nada impediría que se desincronizaran. Las
-- políticas usan employee_in_my_org(employee_id), igual que activity_periods y
-- allowances.
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

-- VacationRequest.days, normalizado. Contiene días laborables ya filtrados:
-- nunca domingos ni festivos (lo garantiza toWorkingDays() en el cliente).
create table if not exists public.vacation_request_days (
  request_id uuid not null references public.vacation_requests (id) on delete cascade,
  day date not null,
  primary key (request_id, day)
);

-- author_name se guarda copiado a propósito: es el nombre que tenía quien
-- comentó en ese momento, y debe sobrevivir a que se borre el empleado.
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
-- No es una regla de negocio, es el cableado: enlaza el empleado con su usuario
-- en cuanto el administrador lo crea en el panel con el mismo email. Es lo que
-- permite dar de alta gente sin escribir todavía una Edge Function.

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

-- La pantalla de acceso lista a los empleados de la empresa para elegir perfil,
-- y eso ocurre SIN sesión: ninguna política puede servirlo, así que va por esta
-- función security definer, que es la única rendija abierta a `anon`.
--
-- Devuelve solo lo justo para pintar la lista y para poder llamar después a
-- signInWithPassword(). Asúmelo como público: quien tenga la URL puede leer la
-- plantilla de la empresa. Lo que protege los datos es la contraseña.
create or replace function public.perfiles_para_acceso(p_slug text)
returns table (id uuid, first_name text, last_name text, email text)
language sql stable security definer set search_path = public as $$
  select e.id, e.first_name, e.last_name, e.email
    from public.employees e
    join public.organizations o on o.id = e.org_id
   where o.slug = p_slug
     and e.user_id is not null
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
-- Todas las políticas son para el rol `authenticated`. No hay ninguna para
-- `anon`: sin sesión no se ve absolutamente nada.
--
-- Los permisos de tabla van primero y son imprescindibles: PostgREST se conecta
-- como `authenticated` (o como `anon` si no hay sesión), y RLS solo filtra filas
-- una vez que el rol tiene permiso sobre la tabla. Sin estos grants la API
-- responde «permission denied» aunque las políticas sean correctas.
--
-- Están aquí escritos a mano a propósito, para poder crear el proyecto con
-- «Automatically expose new tables» desactivado, que es lo que recomienda
-- Supabase: así lo que se expone es solo esto y no lo que aparezca en el futuro.
-- A `anon` no se le concede nada.

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
create policy organizations_select on public.organizations
  for select to authenticated using (id = public.current_org_id());

create policy organizations_update on public.organizations
  for update to authenticated
  using (id = public.current_org_id() and public.is_admin())
  with check (id = public.current_org_id() and public.is_admin());

-- employees -------------------------------------------------------------------
-- Un empleado normal solo se ve a sí mismo: con Supabase Auth el acceso ya no
-- lista perfiles y ninguna de sus pantallas necesita a sus compañeros.
create policy employees_select on public.employees
  for select to authenticated
  using (user_id = auth.uid() or (public.is_admin() and org_id = public.current_org_id()));

create policy employees_admin_write on public.employees
  for all to authenticated
  using (public.is_admin() and org_id = public.current_org_id())
  with check (public.is_admin() and org_id = public.current_org_id());

-- activity_periods ------------------------------------------------------------
create policy activity_periods_select on public.activity_periods
  for select to authenticated
  using (
    employee_id = public.current_employee_id()
    or (public.is_admin() and public.employee_in_my_org(employee_id))
  );

create policy activity_periods_admin_write on public.activity_periods
  for all to authenticated
  using (public.is_admin() and public.employee_in_my_org(employee_id))
  with check (public.is_admin() and public.employee_in_my_org(employee_id));

-- holidays --------------------------------------------------------------------
create policy holidays_select on public.holidays
  for select to authenticated using (org_id = public.current_org_id());

create policy holidays_admin_write on public.holidays
  for all to authenticated
  using (public.is_admin() and org_id = public.current_org_id())
  with check (public.is_admin() and org_id = public.current_org_id());

-- allowances ------------------------------------------------------------------
create policy allowances_select on public.allowances
  for select to authenticated
  using (
    employee_id = public.current_employee_id()
    or (public.is_admin() and public.employee_in_my_org(employee_id))
  );

create policy allowances_admin_write on public.allowances
  for all to authenticated
  using (public.is_admin() and public.employee_in_my_org(employee_id))
  with check (public.is_admin() and public.employee_in_my_org(employee_id));

-- vacation_requests -----------------------------------------------------------
create policy vacation_requests_select on public.vacation_requests
  for select to authenticated
  using (
    employee_id = public.current_employee_id()
    or (public.is_admin() and public.employee_in_my_org(employee_id))
  );

-- Un empleado solo crea solicitudes suyas y pendientes. El administrador puede
-- crearlas para cualquiera de su empresa y ya aprobadas («Crear directamente
-- como aprobadas»). employee_in_my_org() es lo que evita que un administrador
-- cree una solicitud a nombre de alguien de otra empresa.
create policy vacation_requests_insert on public.vacation_requests
  for insert to authenticated
  with check (
    (employee_id = public.current_employee_id() and status = 'pendiente')
    or (public.is_admin() and public.employee_in_my_org(employee_id))
  );

-- Resolver (aprobar o rechazar) es cosa del administrador.
create policy vacation_requests_update on public.vacation_requests
  for update to authenticated
  using (public.is_admin() and public.employee_in_my_org(employee_id))
  with check (public.is_admin() and public.employee_in_my_org(employee_id));

-- «El empleado solo retira solicitudes pendientes; el administrador, cualquiera».
create policy vacation_requests_delete on public.vacation_requests
  for delete to authenticated
  using (
    (employee_id = public.current_employee_id() and status = 'pendiente')
    or (public.is_admin() and public.employee_in_my_org(employee_id))
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

create policy request_comments_insert on public.request_comments
  for insert to authenticated
  with check (
    author_id = public.current_employee_id() and public.can_read_request(request_id)
  );

-- -----------------------------------------------------------------------------
-- 5. Arranque: primera empresa y primer administrador
-- -----------------------------------------------------------------------------
-- Huevo y gallina: RLS necesita una fila en employees para saber tu empresa, y
-- el primer administrador todavía no la tiene. Se resuelve una sola vez desde
-- aquí, porque el SQL Editor ejecuta como `postgres` y no pasa por RLS.
--
-- No hay ninguna función RPC para esto a propósito: una que aceptara un user_id
-- arbitrario sería un agujero si quedara expuesta en la API.
--
-- ANTES: crear el usuario en Authentication -> Users -> Add user (con «Auto
-- Confirm User») y copiar su UUID. Después, descomentar, rellenar y ejecutar.
-- Los festivos se añaden luego desde Ajustes.

-- do $$
-- declare
--   v_user  uuid := 'PEGA-AQUI-EL-UUID-DEL-USUARIO';
--   v_email text := 'mari@agrorifer.local';  -- el mismo del usuario de auth
--   v_org   uuid;
--   v_admin uuid;
-- begin
--   insert into public.organizations (slug, name) values ('agrorifer', 'Agrorifer') returning id into v_org;
--
--   insert into public.employees (org_id, user_id, email, first_name, last_name, role)
--        values (v_org, v_user, v_email, 'Mari', 'Rivas', 'admin')
--     returning id into v_admin;
--
--   insert into public.activity_periods (employee_id, start_date)
--        values (v_admin, date_trunc('year', now())::date);
-- end $$;
