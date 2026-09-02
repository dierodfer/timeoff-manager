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
- **El formulario de empleado solo admite periodos de llamamiento ya transcurridos.** Ni la fecha de
  inicio ni la de fin pueden ser posteriores a hoy, y dos periodos del mismo empleado no pueden
  solaparse. El periodo en curso se representa con la fecha de fin en el día de hoy: la proyección a
  31 de diciembre la calcula `activeIntervalsInYear()`, no hace falta anticiparla a mano.
- **El tipo de contrato (Fijo / Fijo discontinuo) es un segmentado, no un checkbox**, a juego con el
  de Rol. Cambiar de tipo fija también la fecha de alta a su valor por defecto: 1 de enero del año en
  curso para Fijo, hoy para Fijo discontinuo — pero solo si el tipo cambia de verdad, para no pisar
  una fecha ya editada a mano si se vuelve a pulsar el botón ya activo. Al elegir Fijo discontinuo
  solo se explica que los periodos son de este último año; ya no se repite ahí la validación de
  fechas futuras y solapes, que vive en el propio datepicker y en `submit()`.
- **Un periodo de llamamiento se elige con `DateRangePicker` (`ui/DateRangePicker.tsx`), no con dos
  `<input type="date">`.** Es un envoltorio fino sobre `react-day-picker` (`mode="range"`), el mismo
  componente que ya usaba Asignación masiva; en `EmployeeForm` se le pasa un calendario en blanco
  (`BLANK_CALENDAR`, sin festivos ni jornada real) porque aquí solo importa marcar el rango, no si el
  día es laborable. Cada periodo se pinta en el año de su propia fecha de inicio, no en el año en
  curso del formulario: así uno histórico de un año anterior se sigue viendo y editando en su propio
  año en vez de no aparecer marcado y perderse al tocar cualquier día del año en curso.
- **La fecha futura se bloquea con `disabled` (matchers `before`/`after`) del propio
  `react-day-picker`, no con un error tras enviar.** `minDate`/`maxDate` (props añadidas sobre el
  componente) se traducen a esos matchers; para el periodo del año en curso eso es
  `[1 de enero, hoy]`, y para uno de un año anterior, ese año entero. El solape entre periodos sigue
  necesitando comprobación en `submit()`, porque no hay forma de expresarlo con los límites del
  propio picker.
- **Los campos obligatorios de un formulario llevan `required`**, para que el navegador bloquee el
  envío antes de que se ejecute el `onSubmit`: nombre y fecha de alta del empleado, y fecha y nombre
  de un festivo nuevo. Un periodo de llamamiento no tiene equivalente, porque `DateRangePicker` no es
  un `<input>`: en su lugar siempre tiene una fecha de inicio y de fin válidas por construcción, así
  que no hay estado "vacío" que bloquear. Un campo con validación cruzada (rango de fechas, solapes,
  saldo) tampoco tiene equivalente nativo y sigue comprobándose en JavaScript.
- **Las fechas se muestran siempre como `dd-mm-aaaa`.** `formatDate()` (`domain/format.ts`) es lo
  único que las pinta; nadie más formatea una fecha a mano ni llama a `toLocaleDateString()`. No
  cubre el propio selector nativo (`<input type="date">`): su formato de fecha lo decide el
  navegador según el idioma configurado en el dispositivo, no la página.
- **Los días de vacaciones son decimales.** `formatDays()` (`domain/format.ts`) es lo único que los
  pinta; los controles `+`/`−` de un ajuste manual saltan al entero de al lado. La tarjeta de saldo
  de Mi calendario trunca «Asignados» y «Disponibles» con `truncateDays()` en vez de mostrar los
  decimales: solo cambia lo que se pinta, el saldo real sigue siendo decimal para las comprobaciones
  de `checkSelection()` y `useDaySelection()`.
- **Días efectivos:** si existe un registro en `allowances` para ese empleado y año, manda ese
  valor; si no, la estimación. Borrar el registro devuelve al empleado a la estimación.
- **Saldo:** asignados − aprobados − pendientes. Las pendientes reservan saldo para que los mismos
  días no se comprometan dos veces.
- **En Mi calendario no se puede marcar más días de los disponibles.** `useDaySelection()` rechaza
  el clic (o el rango) que se pasaría del saldo y avisa con un error, en vez de dejar marcar de más
  y fallar solo al enviar la solicitud.
- **El límite se aplica también al administrador.** Para asignar más días hay que subir antes el
  contador del empleado. Tampoco se puede bajar el contador por debajo de lo ya comprometido.
- **Cancelación:** el empleado solo retira solicitudes `pendiente`. El administrador puede eliminar
  cualquiera, incluidas las aprobadas, y los días vuelven al saldo.
- **Una selección a caballo entre dos años genera una solicitud por año**, porque el saldo es anual.
- Al dar de baja se marca `terminationDate` en vez de borrar el registro, para conservar el
  histórico de vacaciones disfrutadas. Se confirma en un diálogo con la fecha propuesta en hoy,
  editable a partir de la fecha de alta y también hacia el futuro (una baja se puede programar con
  antelación); no se da de baja al pulsar el botón directamente. El formulario de alta no tiene
  campo de fecha de baja: es un dato que solo se fija desde este diálogo.
- **Liquidación al dar de baja:** `terminationSettlement()` (`domain/balance.ts`) compara los días
  aprobados y ya pasados (disfrutados de verdad, no los aprobados a futuro) contra la estimación
  recalculada como si `terminationDate` fuera la fecha elegida en el diálogo, no la de hoy ni el 31
  de diciembre. Si la estimación es mayor, se le deben días; si es menor, los debe el empleado.

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
  Con hora local, un 1 de enero cambia de día según la zona horaria. `DateRangePicker` sigue la
  misma convención con `timeZone="UTC"` en el `react-day-picker` que envuelve: sin eso, sus objetos
  `Date` (construidos con `toUtcDate()`) se interpretarían en la zona horaria del navegador y un día
  podría mostrarse desplazado en usos horarios con offset negativo.
- **`HashRouter`, no `BrowserRouter`.** Pages no reescribe rutas: un refresco daría un 404.
- **`base` en `vite.config.ts`** apunta a `/timeoff-manager/`. Si se renombra el repositorio, hay
  que cambiarlo o pasar `BASE_PATH`.
- **El formulario de festivos de Ajustes se remonta con `key={year}`.** Sin eso la fecha propuesta
  se queda en el año en que se montó y añadir un festivo desde otro año lo mete en el año
  equivocado, donde no se ve.
- **`crypto.subtle` solo existe en contextos seguros.** Por eso `pin.ts` tiene un hash de reserva:
  al abrir la aplicación por IP en la red local no está disponible.
- **`crypto.randomUUID()` también exige contexto seguro**, así que los identificadores (`ids.ts`) y
  la sal del PIN salen de `crypto.getRandomValues()`, que sí funciona por IP en la red local.
- **`checkSelection()` compara el saldo con un margen de `1e-9`.** El saldo es decimal: sin ese
  margen, el ruido de coma flotante puede rechazar 13 días contra un saldo real de 13 pero
  representado como 12,999999999. `useDaySelection()` aplica el mismo margen al tope de días
  seleccionables en Mi calendario, por la misma razón.
- **El `DateRangePicker` de un periodo usa el año de la propia fecha de inicio del periodo
  (`yearOf(period.start)`), nunca el año en curso del formulario.** Si usara siempre este último, un
  periodo histórico de un año anterior no tendría ningún día marcado en la rejilla (sus fechas caen
  fuera del año que se está pintando) y el primer clic en cualquier celda lo sustituiría en silencio
  por un periodo nuevo en el año en curso.
- **El primer clic de un periodo llega como `{ end: null }` y `ActivityPeriod.end` no admite
  `null`.** `EmployeeForm` guarda ese estado a medias en `pendingStart` en vez de volcarlo a
  `activityPeriods`. Esto no es capricho propio: `react-day-picker` decide si un clic empieza un
  rango nuevo o completa el que ya hay mirando si el `selected` que se le pasa tiene `to` relleno
  (`hasFullRange`, en su propio `useRange`). Si en vez de `pendingStart` se completa `end` con la
  misma fecha de inicio para tener un `ActivityPeriod` válido, el picker ve un rango ya completo y
  trata el segundo clic como el inicio de uno nuevo en vez de como su fin: la selección de dos clics
  deja de poder completarse.
- **El `BLANK_CALENDAR` que `EmployeeForm` le pasa al `DateRangePicker` de un periodo lleva los 7
  días en `workweek`, no un `Set` vacío.** `isWorkingDay()` da `false` para cualquier día si
  `workweek` está vacío, y entonces cada celda del calendario sale pintada como día no laborable
  (`day-off`, atenuada) en vez de neutra, aunque no haya festivos.
- **`DateRangePicker` fija `resetOnSelect` en `react-day-picker`.** Sin él, al pulsar un día con un
  rango ya completo el picker no empieza una selección nueva: mueve el extremo más cercano del rango
  existente al día pulsado. Es un comportamiento válido, pero no el que se espera de "elige otro
  periodo" tras completar uno.
- **Las clases de `classNames`/`modifiersClassNames` de un día (`selected`, `range_start`,
  `range_middle`, `today`, `disabled`, y los modificadores `holiday`/`off`) las pone
  `react-day-picker` en la celda `<td>`, nunca en el `<button>` de dentro.** Por eso las reglas CSS
  de `.range-picker-day-*` en `index.css` usan el combinador `.range-picker-day-selected >
.range-picker-day` en vez de una sola clase: si se intenta pintar el estado con una clase plana
  sobre `.range-picker-day`, no se aplica porque esa clase vive en el elemento equivocado.

## El PIN no es seguridad

Evita cambiar de perfil por descuido, nada más. Los datos están en el IndexedDB del navegador y
cualquiera con acceso al dispositivo puede leerlos. Se guarda el hash y no el número para no
dejarlo a la vista en las copias de seguridad. No presentarlo como control de acceso.

**El PIN es opcional.** `isValidPin()` acepta la cadena vacía además de 4-8 dígitos, así que un
empleado sin PIN entra en Acceso dejando el campo en blanco. Ojo al editar: el campo de PIN en
blanco del formulario de edición ya significaba «no cambiar el PIN actual», así que para quitarle
el PIN a un empleado que ya tiene uno hay que teclear un PIN válido y luego, en otra edición,
volver a dejarlo en blanco no sirve — hace falta pasar por la baja y un alta nueva, o editar el JSON
exportado a mano.

## Los datos no se sincronizan

Viven en el navegador de cada dispositivo. Lo que registra el administrador en su ordenador no lo
ve un empleado desde su móvil. El fichero JSON que se exporta desde Ajustes es la única forma de
mover los datos. Tenerlo presente antes de prometer flujos multiusuario.

## Diseño

Tokens en `src/index.css`: un único `@theme` con toda la paleta.

**Solo hay tema claro.** No se sigue a `prefers-color-scheme` ni hay conmutador: `index.html`
declara `color-scheme: light` y la paleta vive en un único `@theme`. Jerarquía por tipografía y espacio en vez de por bordes, radios generosos y un
único color de acento. Los componentes reutilizables (`.card`, `.btn`, `.field`, `.segmented`,
`.chip`, `.day`, `.grid-day`) están en `@layer components`; preferirlos a repetir utilidades en el
JSX y no pintar colores con `style` inline.

**El hueco previo al día 1 de cada mes es `grid-column-start`, no celdas vacías.** `monthCells()`
devuelve solo días reales y `firstDayOffset()` coloca el primero en su columna. Añadir huecos de
relleno obligaría a inventarles una clave y a filtrarlos en cada `map`.

**Qué color gana en una celda de calendario lo decide `dayState()` (`ui/calendarGrid.ts`)**, no cada
componente. `MONTH_DAY_CLASS` y `GRID_DAY_CLASS` traducen ese estado a las clases del calendario
mensual y de la rejilla anual, y la leyenda de Planificación usa las mismas clases para no
desincronizarse. **Festivo es rojo y pendiente es amarillo** (`--color-holiday`, `--color-pending`
en `index.css`): son los únicos dos tokens de estado que no coinciden con su nombre de variable
histórico, así que al tocar uno hay que tocar también su versión `-soft` y, si aplica, la de la
rejilla anual (`--color-grid-holiday`).

**La rejilla anual de Planificación centra la columna de hoy al montar.** `YearGrid` marca cada
columna con `data-date` y usa ese atributo para calcular el scroll inicial y para dibujarle un
borde sutil (cabecera y celdas); sin el atributo, el `useEffect` no encuentra la columna y no
mueve el scroll.

## Comentarios

El código lleva los comentarios mínimos: solo las trampas de arriba. Lo que explica decisiones,
reglas o contexto va en este fichero, no en el código. Al añadir un comentario, preguntarse si
evita una regresión concreta; si no, su sitio es CLAUDE.md.
