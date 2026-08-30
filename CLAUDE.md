# Notas para trabajar en este repositorio

Gestor de vacaciones desplegado en **GitHub Pages**. Pages solo sirve ficheros estáticos, así que
no hay servidor ni base de datos remota: todo ocurre en el navegador.

```bash
npm run dev           # desarrollo
npm test              # tests del dominio (Vitest)
npm run lint          # ESLint con reglas que usan tipos
npm run format        # Prettier
npm run build         # tsc -b && vite build
npm run preview       # sirve dist/ como en producción
```

El workflow de despliegue corre `lint`, `format:check`, `test` y `build`: si algo de eso falla en
local, también falla el despliegue.

## Capas

| Carpeta       | Qué hace                                             | Reglas                                                          |
| ------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| `src/domain/` | Fechas, días laborables, estimación, saldo, festivos | Código puro. Sin React ni almacenamiento. Es lo único con tests |
| `src/data/`   | IndexedDB, copias de seguridad, PIN, datos iniciales | Nadie más habla con el almacenamiento                           |
| `src/state/`  | Operaciones de negocio y estado de la aplicación     | `actions.ts` son funciones puras `Database → Outcome`           |
| `src/ui/`     | Componentes: calendarios, rejilla anual, formularios |                                                                 |
| `src/pages/`  | Pantallas                                            |                                                                 |

**`VacationRepository` (`src/data/repository.ts`) es el único punto de acceso a los datos.** La
interfaz de usuario nunca toca IndexedDB. Cambiar a un almacenamiento compartido (Supabase u otro)
es escribir otra implementación de esa interfaz, sin tocar la interfaz de usuario.

**Toda la base de datos se guarda como un único documento JSON.** El volumen es pequeño —una
plantilla y sus días— así que no compensa coordinar escrituras entre colecciones, y la copia de
seguridad sale gratis. `StoredDatabase.version` y la función `migrate()` de
`indexedDbRepository.ts` son el gancho para migrar formatos antiguos cuando aparezca la versión 2.

**Las operaciones de negocio viven en `state/actions.ts` como transformaciones puras**, fuera de
React. Eso permite encadenarlas: una asignación masiva son varias altas seguidas, cada una validada
contra el estado que dejó la anterior.

**El contexto y sus hooks están separados del proveedor:** `state/appContext.ts` define
`AppContextValue`, `useApp` y `useSession`; `state/AppStore.tsx` solo exporta `AppProvider`. Si los
hooks vuelven al fichero del componente, Fast Refresh deja de conservar el estado al editarlo.

**`ui/ErrorBoundary.tsx` envuelve toda la aplicación.** No hay servidor donde registrar fallos: sin
él, cualquier excepción no controlada deja una pantalla en blanco sin rastro.

## Reglas de negocio

- **Día laborable:** de lunes a sábado, descontando festivos. La jornada semanal es configurable en
  Ajustes (`Settings.workweek`, donde `0` es domingo y `6` sábado).
- **Estimación:** `0,0737 × días trabajados`, **sin redondear** y limitada a la base anual, que
  funciona como tope. Un «día trabajado» es un día de `Settings.workweek` dentro de los tramos en
  activo; los festivos no se descuentan. Con la jornada de lunes a sábado un año completo son 313
  días → 23,07, que el tope deja en 23. Se aplica igual a todos los empleados.
- Un empleado ordinario está en activo entre el alta y la baja; un **fijo discontinuo** solo durante
  sus periodos de llamamiento, que se fusionan antes de sumar para no contar dos veces los
  solapados. **El periodo en curso se proyecta hasta el 31 de diciembre**, asumiendo que seguirá
  llamado, así que su estimación no baja según se acerca la fecha de fin.
- **Los días de vacaciones son decimales.** `formatDays()` (`domain/format.ts`) es lo único que los
  pinta; los controles `+`/`−` de un ajuste manual saltan al entero de al lado.
- **Días efectivos:** si existe un registro en `allowances` para ese empleado y año, manda ese
  valor; si no, la estimación. Borrar el registro devuelve al empleado a la estimación.
- **Saldo:** asignados − aprobados − pendientes. Las pendientes reservan saldo para que los mismos
  días no se comprometan dos veces.
- **El límite se aplica también al administrador.** Para asignar más días hay que subir antes el
  contador del empleado. Tampoco se puede bajar el contador por debajo de lo ya comprometido.
- **Cancelación:** el empleado solo retira solicitudes `pendiente`. El administrador puede eliminar
  cualquiera, incluidas las aprobadas, y los días vuelven al saldo.
- **Una selección a caballo entre dos años genera una solicitud por año**, porque el saldo es anual.
- Al dar de baja se marca `terminationDate` en vez de borrar el registro, para conservar el
  histórico de vacaciones disfrutadas.

### Invariantes de los datos

- `VacationRequest.days` contiene **días laborables ya filtrados**: nunca domingos ni festivos.
  `toWorkingDays()` los descarta antes de guardar.
- Las solicitudes `rechazada` no reservan días.
- `batchId` agrupa las solicitudes creadas en una misma asignación masiva.
- **Una solicitud tiene un único estado para todos sus días.** El administrador aprueba o rechaza
  días sueltos de una solicitud `pendiente` con varios días mediante `resolveRequestDay()`, que
  separa el día resuelto en una solicitud nueva y deja el resto pendiente en la original. Por eso
  la bandeja de Solicitudes agrupa por empleado y muestra cada día por separado, no por solicitud.

## Festivos

Precargados para **Algarrobo (Málaga)** en `src/domain/holidays.es.ts`:

- **2026:** Resolución de 17 de octubre de 2025 de la Dirección General de Trabajo
  (BOE-A-2025-21667) más la relación de fiestas locales de Andalucía para 2026 (20 de enero y 3 de
  agosto).
- **2027:** Decreto 84/2026, de 29 de abril (BOJA núm. 84, de 5 de mayo de 2026). **Faltan las dos
  fiestas locales**: los ayuntamientos las proponen después de ese decreto y se publican en una
  resolución posterior. Hay que añadirlas desde Ajustes cuando salgan.

Al añadir un año nuevo, verificar las fechas contra el BOE y el BOJA. No inventarlas.

## Trampas conocidas

Estas son las que ya han mordido una vez y están comentadas en el código:

- **`useDaySelection`:** el ancla del rango se lee antes de moverla. Si se lee dentro del
  actualizador de `setSelected`, React lo ejecuta más tarde, cuando el ref ya apunta al día recién
  pulsado, y el rango se reduce a sus dos extremos.
- **`apply()` es síncrona a propósito.** Si vuelve a ser `async`, el estado que depende del
  resultado se actualiza en otro render y la selección anterior se queda a la vista.
- **`commit()` no espera a IndexedDB** y por eso devuelve `void`, no una promesa: la pantalla se
  actualiza al instante y la escritura va por detrás, avisando con un aviso si falla.
- **Fechas en UTC.** `src/domain/dates.ts` trabaja sobre cadenas `yyyy-MM-dd` con aritmética UTC.
  Con hora local, un 1 de enero cambia de día según la zona horaria.
- **`HashRouter`, no `BrowserRouter`.** Pages no reescribe rutas: un refresco daría un 404.
- **`base` en `vite.config.ts`** apunta a `/timeoff-manager/`. Si se renombra el repositorio, hay
  que cambiarlo o pasar `BASE_PATH`.
- **El formulario de festivos de Ajustes se remonta con `key={year}`.** Sin eso la fecha propuesta
  se queda en el año en que se montó y añadir un festivo desde otro año lo mete en el año
  equivocado, donde no se ve.
- **`crypto.subtle` solo existe en contextos seguros.** Por eso `pin.ts` tiene un hash de reserva:
  al abrir la aplicación por IP en la red local no está disponible.
- **`checkSelection()` compara el saldo con un margen de `1e-9`.** El saldo es decimal: sin ese
  margen, el ruido de coma flotante puede rechazar 13 días contra un saldo real de 13 pero
  representado como 12,999999999.

## El PIN no es seguridad

Evita cambiar de perfil por descuido, nada más. Los datos están en el IndexedDB del navegador y
cualquiera con acceso al dispositivo puede leerlos. Se guarda el hash y no el número para no
dejarlo a la vista en las copias de seguridad. No presentarlo como control de acceso.

## Los datos no se sincronizan

Viven en el navegador de cada dispositivo. Lo que registra el administrador en su ordenador no lo
ve un empleado desde su móvil. El fichero JSON que se exporta desde Ajustes es la única forma de
mover los datos. Tenerlo presente antes de prometer flujos multiusuario.

## Diseño

Tokens en `src/index.css`: un `@theme` con la paleta clara y un bloque `:root[data-theme='dark']`
que solo redefine valores, de modo que el modo oscuro no duplica reglas.

**Solo hay tema claro.** No se sigue a `prefers-color-scheme` ni hay conmutador: `index.html`
declara `color-scheme: light` y la paleta vive en un único `@theme`. Jerarquía por tipografía y espacio en vez de por bordes, radios generosos y un
único color de acento. Los componentes reutilizables (`.card`, `.btn`, `.field`, `.segmented`,
`.chip`, `.day`, `.grid-day`) están en `@layer components`; preferirlos a repetir utilidades en el
JSX y no pintar colores con `style` inline.

**Qué color gana en una celda de calendario lo decide `dayState()` (`ui/calendarGrid.ts`)**, no cada
componente. `MONTH_DAY_CLASS` y `GRID_DAY_CLASS` traducen ese estado a las clases del calendario
mensual y de la rejilla anual, y la leyenda de Planificación usa las mismas clases para no
desincronizarse.

## Comentarios

El código lleva los comentarios mínimos: solo las trampas de arriba. Lo que explica decisiones,
reglas o contexto va en este fichero, no en el código. Al añadir un comentario, preguntarse si
evita una regresión concreta; si no, su sitio es CLAUDE.md.
