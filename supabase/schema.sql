-- =============================================================================
-- Gestor de vacaciones — esquema de Supabase
-- =============================================================================
-- Pegar entero en el SQL Editor de Supabase y ejecutar. Es idempotente: volver a
-- ejecutarlo no rompe nada ni duplica datos.
--
-- Multiempresa: cada empleado pertenece a una empresa (organizations) y las
-- políticas RLS aíslan por empresa. La aplicación se despliega en GitHub Pages,
-- así que la anon key es pública: RLS es la única barrera real de seguridad.
-- Todo lo que no esté en una política se puede saltar llamando a la API REST.
--
-- Los pasos manuales del panel de Supabase están en supabase/README.md.
-- =============================================================================

-- Necesaria para el EXCLUDE de activity_periods (mezcla = sobre uuid con && sobre
-- un rango de fechas en el mismo índice).
create extension if not exists btree_gist;

-- -----------------------------------------------------------------------------
-- 1. Tipos
-- -----------------------------------------------------------------------------
-- Copian literalmente las uniones de src/domain/types.ts, para que STATUS_LABEL
-- y SCOPE_LABELS del cliente sigan valiendo sin traducir nada.

do $$ begin
  create type public.employee_role as enum ('admin', 'employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum ('pendiente', 'aprobada', 'rechazada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.holiday_scope as enum ('nacional', 'andalucia', 'algarrobo');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- 2. Tablas
-- -----------------------------------------------------------------------------

-- Settings del modelo actual: nombre, base anual y jornada semanal de la empresa.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  default_annual_days numeric(5, 2) not null default 23 check (default_annual_days >= 0),
  -- 0 = domingo … 6 = sábado, igual que Settings.workweek.
  workweek smallint[] not null default '{1,2,3,4,5,6}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workweek_no_vacia check (array_length(workweek, 1) between 1 and 7),
  constraint workweek_dias_validos check (workweek <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
);

-- user_id queda a null hasta que existe el usuario de auth: el trigger
-- link_employee_to_auth_user() los empareja por email al crearlo.
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid unique references auth.users (id) on delete set null,
  email text,
  first_name text not null check (length(btrim(first_name)) > 0),
  last_name text not null default '',
  role public.employee_role not null default 'employee',
  is_seasonal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists employees_org_email_key
  on public.employees (org_id, lower(email)) where email is not null;
create index if not exists employees_org_idx on public.employees (org_id);

-- Employee.activityPeriods. end_date null = periodo en curso.
create table if not exists public.activity_periods (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  constraint periodo_fechas_ordenadas check (end_date is null or end_date >= start_date),
  -- daterange(start, NULL) ya es «sin fin», así que un periodo en curso encaja sin
  -- ningún truco. El rango es cerrado '[]' a propósito: compartir el día de la baja
  -- con el alta siguiente contaría ese día dos veces, y aquí se rechaza.
  constraint periodos_sin_solape exclude using gist (
    employee_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
);

-- «Como mucho un periodo abierto por empleado», la otra invariante del dominio.
create unique index if not exists activity_periods_uno_abierto
  on public.activity_periods (employee_id) where end_date is null;
create index if not exists activity_periods_employee_idx
  on public.activity_periods (employee_id);

-- Un día es festivo o no lo es: WorkCalendar mapea día -> festivo uno a uno.
create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  day date not null,
  name text not null check (length(btrim(name)) > 0),
  scope public.holiday_scope not null,
  created_at timestamptz not null default now(),
  unique (org_id, day)
);

-- Allowance: el ajuste manual que sustituye a la estimación de un año.
create table if not exists public.allowances (
  employee_id uuid not null references public.employees (id) on delete cascade,
  year smallint not null check (year between 2000 and 2100),
  days numeric(5, 2) not null check (days >= 0),
  updated_at timestamptz not null default now(),
  primary key (employee_id, year)
);

create table if not exists public.vacation_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  year smallint not null check (year between 2000 and 2100),
  status public.request_status not null default 'pendiente',
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
create index if not exists vacation_requests_org_year_idx
  on public.vacation_requests (org_id, year);
create index if not exists vacation_requests_batch_idx
  on public.vacation_requests (batch_id) where batch_id is not null;

-- VacationRequest.days, normalizado. Contiene días laborables ya filtrados:
-- nunca domingos ni festivos (lo garantiza toWorkingDays() en el cliente).
create table if not exists public.vacation_request_days (
  request_id uuid not null references public.vacation_requests (id) on delete cascade,
  day date not null,
  primary key (request_id, day)
);

create index if not exists vacation_request_days_day_idx
  on public.vacation_request_days (day);

-- author_name se guarda copiado a propósito: es el nombre que tenía quien comentó
-- en ese momento, y debe sobrevivir a que se borre el empleado.
create table if not exists public.request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.vacation_requests (id) on delete cascade,
  author_id uuid references public.employees (id) on delete set null,
  author_name text not null,
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists request_comments_request_idx
  on public.request_comments (request_id);

-- -----------------------------------------------------------------------------
-- 3. Triggers de integridad
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists organizations_updated_at on public.organizations;
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

drop trigger if exists employees_updated_at on public.employees;
create trigger employees_updated_at before update on public.employees
  for each row execute function public.set_updated_at();

drop trigger if exists allowances_updated_at on public.allowances;
create trigger allowances_updated_at before update on public.allowances
  for each row execute function public.set_updated_at();

-- Enlaza el empleado con su usuario de auth en cuanto el admin lo crea en el
-- panel con el mismo email. Es lo que permite dar de alta gente sin escribir
-- todavía una Edge Function con la service_role key.
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

-- «Las pendientes reservan saldo para que los mismos días no se comprometan dos
-- veces». Hoy lo comprueba checkSelection() en el cliente; con varios
-- dispositivos escribiendo a la vez esa comprobación tiene carrera, así que la
-- regla baja a la base de datos.
--
-- OJO al implementar el cliente: resolveRequestDay() separa un día en una
-- solicitud nueva. Hay que quitar el día de la solicitud original ANTES de
-- insertarlo en la nueva, o este trigger lo rechazará por duplicado. Cuando se
-- migre la capa de datos conviene hacerlo en una función RPC, que es atómica.
create or replace function public.check_day_not_committed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_employee_id uuid;
begin
  select employee_id into v_employee_id
    from public.vacation_requests
   where id = new.request_id;

  if exists (
    select 1
      from public.vacation_request_days d
      join public.vacation_requests r on r.id = d.request_id
     where d.day = new.day
       and d.request_id <> new.request_id
       and r.employee_id = v_employee_id
       and r.status <> 'rechazada'
  ) then
    raise exception 'El día % ya está comprometido en otra solicitud de ese empleado', new.day
      using errcode = 'unique_violation';
  end if;

  return new;
end $$;

drop trigger if exists vacation_request_days_sin_duplicar on public.vacation_request_days;
create trigger vacation_request_days_sin_duplicar
  before insert or update on public.vacation_request_days
  for each row execute function public.check_day_not_committed();

-- No se puede borrar ni degradar al único administrador: la regla de
-- deleteEmployee(), que aquí además evita dejar la empresa sin acceso.
create or replace function public.protect_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_admins integer;
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    select count(*) into v_admins
      from public.employees
     where org_id = old.org_id and role = 'admin';

    if v_admins <= 1 then
      raise exception 'No se puede dejar la empresa sin ningún administrador';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists employees_protege_ultimo_admin on public.employees;
create trigger employees_protege_ultimo_admin
  before update or delete on public.employees
  for each row execute function public.protect_last_admin();

-- -----------------------------------------------------------------------------
-- 4. Funciones auxiliares de RLS
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

-- Una solicitud la ve su dueño, y el administrador de su empresa.
create or replace function public.can_read_request(p_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vacation_requests r
     where r.id = p_request_id
       and (
         r.employee_id = public.current_employee_id()
         or (public.is_admin() and r.org_id = public.current_org_id())
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
         or (public.is_admin() and r.org_id = public.current_org_id())
       )
  )
$$;

-- -----------------------------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------------------------
-- Todas las políticas son para el rol `authenticated`. No hay ninguna para
-- `anon`: sin sesión no se ve absolutamente nada.

alter table public.organizations         enable row level security;
alter table public.employees             enable row level security;
alter table public.activity_periods      enable row level security;
alter table public.holidays              enable row level security;
alter table public.allowances            enable row level security;
alter table public.vacation_requests     enable row level security;
alter table public.vacation_request_days enable row level security;
alter table public.request_comments      enable row level security;

-- organizations ---------------------------------------------------------------
-- Sin políticas de insert/delete: crear o borrar una empresa no se hace por API.
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (id = public.current_org_id());

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (id = public.current_org_id() and public.is_admin())
  with check (id = public.current_org_id() and public.is_admin());

-- employees -------------------------------------------------------------------
-- Un empleado normal solo se ve a sí mismo: con Supabase Auth el acceso ya no
-- lista perfiles y ninguna de sus pantallas necesita a sus compañeros.
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select to authenticated
  using (
    user_id = auth.uid()
    or (public.is_admin() and org_id = public.current_org_id())
  );

drop policy if exists employees_admin_write on public.employees;
create policy employees_admin_write on public.employees
  for all to authenticated
  using (public.is_admin() and org_id = public.current_org_id())
  with check (public.is_admin() and org_id = public.current_org_id());

-- activity_periods ------------------------------------------------------------
drop policy if exists activity_periods_select on public.activity_periods;
create policy activity_periods_select on public.activity_periods
  for select to authenticated
  using (exists (
    select 1 from public.employees e
     where e.id = employee_id
       and (
         e.user_id = auth.uid()
         or (public.is_admin() and e.org_id = public.current_org_id())
       )
  ));

drop policy if exists activity_periods_admin_write on public.activity_periods;
create policy activity_periods_admin_write on public.activity_periods
  for all to authenticated
  using (public.is_admin() and exists (
    select 1 from public.employees e
     where e.id = employee_id and e.org_id = public.current_org_id()
  ))
  with check (public.is_admin() and exists (
    select 1 from public.employees e
     where e.id = employee_id and e.org_id = public.current_org_id()
  ));

-- holidays --------------------------------------------------------------------
drop policy if exists holidays_select on public.holidays;
create policy holidays_select on public.holidays
  for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists holidays_admin_write on public.holidays;
create policy holidays_admin_write on public.holidays
  for all to authenticated
  using (public.is_admin() and org_id = public.current_org_id())
  with check (public.is_admin() and org_id = public.current_org_id());

-- allowances ------------------------------------------------------------------
drop policy if exists allowances_select on public.allowances;
create policy allowances_select on public.allowances
  for select to authenticated
  using (
    employee_id = public.current_employee_id()
    or (public.is_admin() and exists (
      select 1 from public.employees e
       where e.id = employee_id and e.org_id = public.current_org_id()
    ))
  );

drop policy if exists allowances_admin_write on public.allowances;
create policy allowances_admin_write on public.allowances
  for all to authenticated
  using (public.is_admin() and exists (
    select 1 from public.employees e
     where e.id = employee_id and e.org_id = public.current_org_id()
  ))
  with check (public.is_admin() and exists (
    select 1 from public.employees e
     where e.id = employee_id and e.org_id = public.current_org_id()
  ));

-- vacation_requests -----------------------------------------------------------
drop policy if exists vacation_requests_select on public.vacation_requests;
create policy vacation_requests_select on public.vacation_requests
  for select to authenticated
  using (
    employee_id = public.current_employee_id()
    or (public.is_admin() and org_id = public.current_org_id())
  );

-- Un empleado solo crea solicitudes suyas y pendientes. El administrador puede
-- crearlas para cualquiera y ya aprobadas («Crear directamente como aprobadas»).
drop policy if exists vacation_requests_insert on public.vacation_requests;
create policy vacation_requests_insert on public.vacation_requests
  for insert to authenticated
  with check (
    org_id = public.current_org_id()
    and (
      (employee_id = public.current_employee_id() and status = 'pendiente')
      or public.is_admin()
    )
  );

-- Resolver (aprobar o rechazar) es cosa del administrador.
drop policy if exists vacation_requests_update on public.vacation_requests;
create policy vacation_requests_update on public.vacation_requests
  for update to authenticated
  using (public.is_admin() and org_id = public.current_org_id())
  with check (public.is_admin() and org_id = public.current_org_id());

-- «El empleado solo retira solicitudes pendientes; el administrador, cualquiera».
drop policy if exists vacation_requests_delete on public.vacation_requests;
create policy vacation_requests_delete on public.vacation_requests
  for delete to authenticated
  using (
    (employee_id = public.current_employee_id() and status = 'pendiente')
    or (public.is_admin() and org_id = public.current_org_id())
  );

-- vacation_request_days -------------------------------------------------------
drop policy if exists vacation_request_days_select on public.vacation_request_days;
create policy vacation_request_days_select on public.vacation_request_days
  for select to authenticated
  using (public.can_read_request(request_id));

drop policy if exists vacation_request_days_write on public.vacation_request_days;
create policy vacation_request_days_write on public.vacation_request_days
  for all to authenticated
  using (public.can_write_request(request_id))
  with check (public.can_write_request(request_id));

-- request_comments ------------------------------------------------------------
-- Sin update ni delete: un comentario, una vez escrito, no se toca.
drop policy if exists request_comments_select on public.request_comments;
create policy request_comments_select on public.request_comments
  for select to authenticated
  using (public.can_read_request(request_id));

drop policy if exists request_comments_insert on public.request_comments;
create policy request_comments_insert on public.request_comments
  for insert to authenticated
  with check (
    author_id = public.current_employee_id()
    and public.can_read_request(request_id)
  );

-- -----------------------------------------------------------------------------
-- 6. Arranque: primera empresa y primer administrador
-- -----------------------------------------------------------------------------
-- Huevo y gallina: RLS necesita una fila en employees para saber tu empresa, y
-- el primer administrador todavía no la tiene. Se resuelve una sola vez desde
-- aquí, porque el SQL Editor ejecuta como `postgres` y no pasa por RLS.
--
-- No hay ninguna función RPC para esto a propósito: una que aceptara un user_id
-- arbitrario sería un agujero si quedara expuesta en la API.
--
-- ANTES: crear el usuario en Authentication -> Users -> Add user (con «Auto
-- Confirm User») y copiar su UUID. Después, descomentar, rellenar y ejecutar:

-- do $$
-- declare
--   v_user  uuid := 'PEGA-AQUI-EL-UUID-DEL-USUARIO';
--   v_email text := 'mari@agrorifer.local';  -- el mismo del usuario de auth
--   v_org   uuid;
--   v_admin uuid;
-- begin
--   insert into public.organizations (name) values ('Agrorifer') returning id into v_org;
--
--   insert into public.employees (org_id, user_id, email, first_name, last_name, role)
--        values (v_org, v_user, v_email, 'Mari', 'Rivas', 'admin')
--     returning id into v_admin;
--
--   insert into public.activity_periods (employee_id, start_date)
--        values (v_admin, date_trunc('year', now())::date);
--
--   -- Festivos precargados de Algarrobo (Málaga), los mismos de holidays.es.ts.
--   -- Fuentes: BOE-A-2025-21667 para 2026 y Decreto 84/2026 (BOJA) para 2027.
--   -- A 2027 le faltan las dos fiestas locales: aún no estaban publicadas.
--   insert into public.holidays (org_id, day, name, scope) values
--     (v_org, '2026-01-01', 'Año Nuevo', 'nacional'),
--     (v_org, '2026-01-06', 'Epifanía del Señor', 'nacional'),
--     (v_org, '2026-01-20', 'Fiesta local de Algarrobo', 'algarrobo'),
--     (v_org, '2026-02-28', 'Día de Andalucía', 'andalucia'),
--     (v_org, '2026-04-02', 'Jueves Santo', 'andalucia'),
--     (v_org, '2026-04-03', 'Viernes Santo', 'nacional'),
--     (v_org, '2026-05-01', 'Fiesta del Trabajo', 'nacional'),
--     (v_org, '2026-08-03', 'Fiesta local de Algarrobo', 'algarrobo'),
--     (v_org, '2026-08-15', 'Asunción de la Virgen', 'nacional'),
--     (v_org, '2026-10-12', 'Fiesta Nacional de España', 'nacional'),
--     (v_org, '2026-11-02', 'Día siguiente a Todos los Santos', 'andalucia'),
--     (v_org, '2026-12-07', 'Lunes siguiente al Día de la Constitución', 'andalucia'),
--     (v_org, '2026-12-08', 'Inmaculada Concepción', 'nacional'),
--     (v_org, '2026-12-25', 'Natividad del Señor', 'nacional'),
--     (v_org, '2027-01-01', 'Año Nuevo', 'nacional'),
--     (v_org, '2027-01-06', 'Epifanía del Señor', 'nacional'),
--     (v_org, '2027-03-01', 'Día de Andalucía (trasladado)', 'andalucia'),
--     (v_org, '2027-03-25', 'Jueves Santo', 'andalucia'),
--     (v_org, '2027-03-26', 'Viernes Santo', 'nacional'),
--     (v_org, '2027-05-01', 'Fiesta del Trabajo', 'nacional'),
--     (v_org, '2027-08-16', 'Asunción de la Virgen (trasladada)', 'andalucia'),
--     (v_org, '2027-10-12', 'Fiesta Nacional de España', 'nacional'),
--     (v_org, '2027-11-01', 'Todos los Santos', 'nacional'),
--     (v_org, '2027-12-06', 'Día de la Constitución Española', 'nacional'),
--     (v_org, '2027-12-08', 'Inmaculada Concepción', 'nacional'),
--     (v_org, '2027-12-25', 'Natividad del Señor', 'nacional');
-- end $$;
