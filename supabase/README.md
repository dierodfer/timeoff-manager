# Supabase: modelo de datos y configuración

Este directorio es **solo el modelo**. La aplicación sigue funcionando contra IndexedDB: conectar el
cliente (`supabase-js`, la pantalla de acceso con email y contraseña y la implementación de
`VacationRepository`) es el paso siguiente.

- **`schema.sql`** — script único e idempotente: tipos, tablas, restricciones, triggers, funciones y
  políticas RLS. Se pega entero en el **SQL Editor** de Supabase.

## Cómo se traduce el modelo actual

| Hoy (`src/domain/types.ts`)    | Supabase                                              |
| ------------------------------ | ----------------------------------------------------- |
| `Settings`                     | fila de `organizations` (nombre, base anual, jornada) |
| `Employee`                     | `employees` (+ `user_id` → `auth.users`)              |
| `Employee.pinHash` / `pinSalt` | **desaparecen**: los sustituye Supabase Auth          |
| `Employee.activityPeriods[]`   | `activity_periods`                                    |
| `VacationRequest`              | `vacation_requests`                                   |
| `VacationRequest.days[]`       | `vacation_request_days`                               |
| `VacationRequest.comments[]`   | `request_comments`                                    |
| `Holiday`                      | `holidays`                                            |
| `Allowance`                    | `allowances`                                          |
| `newId('emp')` (`emp_a1b2…`)   | `uuid` con `gen_random_uuid()`                        |
| `IsoDate` (`'2026-09-08'`)     | `date`                                                |

Multiempresa: cada empleado pertenece a una empresa y las políticas aíslan por empresa, así que en el
mismo proyecto pueden convivir varias sin verse entre ellas.

## Por qué RLS es aquí lo único que protege

La aplicación se despliega en **GitHub Pages**, es decir, ficheros estáticos: la `anon key` viaja
dentro del bundle y **es pública**. Cualquiera puede llamar a la API REST de Supabase con ella. Lo
que decide qué puede leer y escribir cada persona son las políticas de `schema.sql`, no el código de
la interfaz: una comprobación que solo esté en React se salta con un `curl`.

Por eso las reglas de negocio que importan están duplicadas en la base de datos:

| Regla                                          | Dónde vive ahora                              |
| ---------------------------------------------- | --------------------------------------------- |
| Los periodos de un empleado no se solapan      | `exclude … periodos_sin_solape`               |
| Como mucho un periodo abierto                  | índice parcial `activity_periods_uno_abierto` |
| El mismo día no se compromete dos veces        | trigger `check_day_not_committed()`           |
| No se puede dejar la empresa sin administrador | trigger `protect_last_admin()`                |
| El empleado solo retira solicitudes pendientes | política `vacation_requests_delete`           |
| Aprobar y rechazar es cosa del administrador   | política `vacation_requests_update`           |

## Configuración en el panel de Supabase

1. **Crear el proyecto** (región de la UE) y ejecutar `schema.sql` en el **SQL Editor**.

2. **Authentication → Sign In / Providers → Email**: dejar el proveedor activo, pero
   - **desactivar «Allow new users to sign up»** — nadie se registra solo; las altas las hace el
     administrador;
   - **desactivar «Confirm email»** — los usuarios que crea el administrador llevan una contraseña
     entregada en mano y deben poder entrar sin pasar por el correo (los emails son internos, del
     tipo `luis@agrorifer.local`, y no reciben nada).

3. **Authentication → Users → Add user**: crear el primer usuario con su email y contraseña,
   marcando **«Auto Confirm User»**. Copiar su UUID.

4. **Arranque**: en el SQL Editor, descomentar el bloque del final de `schema.sql`, pegar ese UUID y
   ejecutarlo. Crea la empresa, su primer administrador, su periodo de actividad y los festivos
   precargados de 2026 y 2027. Hace falta hacerlo desde ahí porque el SQL Editor ejecuta como
   `postgres` y no pasa por RLS: RLS necesita una fila en `employees` para saber a qué empresa
   perteneces, y el primer administrador todavía no la tiene.

5. **Dar de alta a alguien nuevo** (mientras no exista la Edge Function del paso siguiente):
   1. crear el empleado desde la aplicación, con su email;
   2. crear el usuario en **Authentication → Users** con **ese mismo email**.

   El trigger `link_employee_to_auth_user()` los empareja solo en cuanto se crea el usuario.

6. **Database → Replication**: añadir las ocho tablas a la publicación `supabase_realtime` si quieres
   que un cambio hecho en un dispositivo aparezca en el otro sin recargar. Es justo lo que hoy no se
   puede hacer («Los datos no se sincronizan» en `CLAUDE.md`).

7. **Settings → API**: copiar _Project URL_ y _anon public key_. Van como secretos del repositorio
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) y se pasan al paso `npm run build` del workflow de
   Pages. Hacen falta en el paso siguiente, no todavía.

No hay que tocar CORS (la API REST de Supabase acepta cualquier origen) ni las _Redirect URLs_ (solo
importan con enlaces mágicos u OAuth, y aquí es email + contraseña).

**La `service_role key` no se usa en ningún sitio del cliente**: se salta RLS entera. Solo vale para
scripts que ejecutes tú o para una Edge Function.

## Qué queda para el paso siguiente

- Cliente `supabase-js`, acceso con email y contraseña e implementación de `VacationRepository`
  contra Supabase.
- Edge Function para que el administrador cree usuarios desde la propia aplicación (la Admin API
  necesita la `service_role key`, que nunca puede ir en el navegador). Mientras tanto, el paso 5.
- Subir lo que ya tengas en IndexedDB: exportar el JSON desde Ajustes y volcarlo con un script.
- **Cuidado al portar `resolveRequestDay()`**: separa un día en una solicitud nueva, así que hay que
  quitarlo de la original **antes** de insertarlo en la nueva o el trigger lo rechazará por
  duplicado. Lo natural es hacerlo en una función RPC, que es atómica.
