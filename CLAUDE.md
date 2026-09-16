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

| Carpeta       | Qué hace                                             | Reglas                                                |
| ------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| `src/domain/` | Fechas, días laborables, estimación, saldo, festivos | Código puro. Sin React ni almacenamiento              |
| `src/data/`   | IndexedDB, PIN, datos iniciales                      | Nadie más habla con el almacenamiento                 |
| `src/state/`  | Operaciones de negocio y estado de la aplicación     | `actions.ts` son funciones puras `Database → Outcome` |
| `src/ui/`     | Componentes: calendarios, rejilla anual, formularios |                                                       |
| `src/pages/`  | Pantallas                                            |                                                       |

**`VacationRepository` (`src/data/repository.ts`) es el único punto de acceso a los datos.** La
interfaz de usuario nunca toca IndexedDB. Cambiar a un almacenamiento compartido (Supabase u otro)
es escribir otra implementación de esa interfaz, sin tocar la interfaz de usuario.

**Toda la base de datos se guarda como un único documento JSON.** El volumen es pequeño —una
plantilla y sus días— así que no compensa coordinar escrituras entre colecciones.

**`src/data/migrations.ts` es el único sitio donde se migran formatos antiguos**, y lo usa el único
punto por el que entran datos de fuera: `indexedDbRepository.load()`. Es una función pura, y por eso
tiene tests igual que el dominio y `state/actions.ts`. La migración se persiste en la primera
escritura, no al leer.

La v2 pasó `hireDate`/`terminationDate` a la lista de periodos de actividad. En un fijo discontinuo
los llamamientos se recortan al tramo de relación laboral, como los recortaba `employmentSpanInYear`
en la v1, y **el que contiene hoy queda abierto**: eso es exactamente lo que en la v1 significaba
proyectarlo hasta el 31 de diciembre, así que ninguna estimación cambia al migrar.

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
- **Estimación:** proporcional a los días de alta en el año — `días de alta × base anual / días
del año` (365 o 366, `daysInYear()`) —, redondeada a 2 decimales (`roundDays()`,
  `domain/format.ts`). «Días de alta» son los días naturales de `activityIntervalsInYear()`
  dentro del año, no solo los de `Settings.workweek`: un tramo cerrado a mitad de año cuenta sus
  días de calendario, festivos y domingos incluidos. Como esos días nunca superan los del año, el
  resultado nunca supera la base anual sin necesidad de un tope aparte. Se aplica igual a todos
  los empleados.
- **La relación laboral de un empleado es una lista de periodos de actividad**
  (`Employee.activityPeriods`), no un par alta/baja. Un fijo tiene normalmente uno; un fijo
  discontinuo, uno por llamamiento; y cualquiera acumula varios al darse de baja y volver. El
  devengo suma todos los tramos del año, fusionándolos antes para no contar dos veces los solapados.
- **El periodo sin fecha de fin (`end: null`) es el que está en curso**, y se recorta al 31 de
  diciembre al calcular el año. La proyección de quien sigue en activo ya no es un cálculo contra
  «hoy», sino el propio modelo: por eso `activityIntervalsInYear()` no recibe la fecha de hoy. Un
  llamamiento que ya terminó se guarda cerrado y cuenta solo sus días.
- **`isSeasonal` (Fijo / Fijo discontinuo) ya no cambia cómo se calcula nada**: solo distingue el
  tipo de contrato, fija la fecha por defecto del primer periodo y cambia el texto de ayuda del
  formulario.
- **El formulario de empleado edita la lista completa de periodos**, para los dos tipos de contrato.
  Es la vía para corregir un histórico; el camino normal son los diálogos de alta y baja, que además
  calculan la liquidación. Admite fechas futuras, porque tanto la baja como la re-alta se pueden
  programar con antelación.
- **Un periodo se elige con `react-datepicker` (`selectsRange`), no con dos `<input type="date">`.**
  Es un input de texto que abre un calendario al pulsarlo, con `dateFormat` fijado a `dd-MM-yyyy` a
  juego con `formatDate()`. **Asignación masiva sigue usando el `DateRangePicker`
  (`ui/DateRangePicker.tsx`, envoltorio de `react-day-picker`) que antes también usaban los
  periodos**: son dos widgets de rango distintos a propósito, cada uno donde encaja mejor —
  Asignación masiva quiere un calendario siempre visible con festivos pintados, el formulario de
  empleado quiere un campo compacto dentro de una lista de periodos.
- **Los límites `minDate`/`maxDate` de un periodo los ponen sus vecinos**, no el año: el día
  siguiente al fin del periodo anterior y el día anterior al inicio del siguiente. Es la única
  restricción real, y deja que un periodo cruce el fin de año y que el que está en curso acabe en el
  futuro. El solape sigue comprobándose además en `submit()`, porque el picker no impide teclear.
- **El tipo de contrato (Fijo / Fijo discontinuo) es un segmentado, no un checkbox**, a juego con el
  de Rol. Cambiar de tipo fija también la fecha de inicio a su valor por defecto: 1 de enero del año
  en curso para Fijo, hoy para Fijo discontinuo — pero solo si el tipo cambia de verdad y solo si hay
  un único periodo, para no pisar ni una fecha editada a mano ni un histórico ya registrado.
- **«Añadir periodo» se deshabilita mientras hay uno en curso.** Un periodo nuevo se añade siempre al
  final y abierto; con otro ya abierto no habría hueco donde ponerlo sin solapar, así que primero hay
  que cerrarlo. Para reabrir el último hay un botón «Dejar en curso».
- **Los campos obligatorios de un formulario llevan `required`**, para que el navegador bloquee el
  envío antes de que se ejecute el `onSubmit`: nombre del empleado, y fecha y nombre de un festivo
  nuevo. El input de un periodo de actividad no lo lleva: por construcción siempre tiene una fecha
  de inicio válida (`pendingStart`, ver más abajo), así que no hay estado
  "vacío" que bloquear — y si se teclea texto que no es una fecha, `react-datepicker` lo descarta al
  cerrar el calendario sin tocar el valor guardado. Un campo con validación cruzada (rango de
  fechas, solapes, saldo) tampoco tiene equivalente nativo y sigue comprobándose en JavaScript.
- **Las fechas se muestran siempre como `dd-mm-aaaa`.** `formatDate()` (`domain/format.ts`) es lo
  único que las pinta; nadie más formatea una fecha a mano ni llama a `toLocaleDateString()`. No
  cubre el propio selector nativo (`<input type="date">`): su formato de fecha lo decide el
  navegador según el idioma configurado en el dispositivo, no la página. `formatWeekdayShort()`
  vive al lado, en el mismo fichero: pinta un dato distinto (el día de la semana en 3 letras, «Mar»,
  «Mié»), así que no compite con `formatDate()` por ser «lo único que pinta fechas».
- **Los días de vacaciones son decimales.** `formatDays()` (`domain/format.ts`) es lo único que los
  pinta; los controles `+`/`−` de un ajuste manual saltan al entero de al lado. La tarjeta de saldo
  de Mi calendario trunca «Totales» y «Disponibles» con `truncateDays()` en vez de mostrar los
  decimales: solo cambia lo que se pinta, el saldo real sigue siendo decimal para las comprobaciones
  de `checkSelection()` y `useDaySelection()`.
- **Días efectivos:** si existe un registro en `allowances` para ese empleado y año, manda ese
  valor; si no, la estimación. Borrar el registro devuelve al empleado a la estimación.
- **Saldo:** asignados − aprobados − pendientes. Las pendientes reservan saldo para que los mismos
  días no se comprometan dos veces.
- **En Mi calendario no se puede marcar más días de los disponibles.** `useDaySelection()` rechaza
  el clic (o el rango) que se pasaría del saldo y avisa con «Solo tienes X días disponibles para
  AAAA, no puedes solicitar más.», en vez de dejar marcar de más y fallar solo al enviar la
  solicitud.
- **Tampoco se puede volver a marcar un día ya aprobado o pendiente.** `canSelect()` (en
  `pages/MyCalendar.tsx`) descarta esos días igual que descarta los no laborables, y
  `MonthCalendar` los pinta con el mismo globo informativo de un festivo en vez de dejarlos pulsar
  para seleccionar: al tocarlos se abre «Vacaciones aprobadas»/«Solicitud pendiente» con la fecha,
  no se añaden a la selección.
- **El límite se aplica también al administrador.** Para asignar más días hay que subir antes el
  contador del empleado. Tampoco se puede bajar el contador por debajo de lo ya comprometido.
- **Cancelación:** el empleado solo retira solicitudes `pendiente`. El administrador puede eliminar
  cualquiera, incluidas las aprobadas, y los días vuelven al saldo.
- **Una selección a caballo entre dos años genera una solicitud por año**, porque el saldo es anual.
- **Dar de baja cierra el periodo en curso** en vez de borrar el registro, para conservar el
  histórico de vacaciones disfrutadas. Se confirma en un diálogo con la fecha propuesta en hoy,
  editable a partir del inicio de ese periodo y también hacia el futuro (una baja se puede programar
  con antelación); no se da de baja al pulsar el botón directamente.
- **Dar de alta añade un periodo nuevo en curso.** El botón sustituye al de baja en cuanto no hay
  ningún periodo abierto, incluida una baja programada a futuro: así se puede encadenar la baja y la
  vuelta de una vez. La fecha tiene que ser **posterior** al fin del último periodo (compartir el día
  sería un solape que contaría ese día dos veces) y también puede ser futura. El diálogo adelanta los
  días que le corresponderían en el año con esa fecha.
- **Solo puede haber un periodo en curso, y es el último.** Lo comprueban `terminateEmployee()` y
  `rehireEmployee()` en `state/actions.ts`, que devuelven `Outcome` como el resto del fichero, y
  también el `submit()` del formulario.
- **Los días trabajados que pinta la lista de Empleados sólo llegan hasta hoy y descuentan
  festivos** (`workedDaysBreakdown()`, en `domain/accrual.ts`), a diferencia de `altaDaysInYear()`,
  que alimenta la estimación y que cuenta días naturales, no de jornada (ver la regla de
  Estimación, arriba). Son dos cálculos a propósito distintos: uno es un dato de pantalla, el otro
  es dinero. Al contar día a día si cada uno es laborable y no festivo, `workedDaysBreakdown()`
  nunca puede dar negativo (un 1 de enero festivo cuenta 0, no −1). El desglose por tramos y la
  lista de festivos descontados salen del mismo cálculo y se ven en un popover al pulsar la cifra
  (`ui/MetricInfo.tsx`); la de Estimación abre otro con la cuenta (`días de alta × base anual /
días del año = ...`).
- **«Aprobados» y «Pendientes» de una fila de Empleados enlazan a la persona**: «Ver calendario»
  abre `/?empleado=<id>` (Mi calendario, viendo a esa persona) y «Ver solicitudes» abre
  `/solicitudes?empleado=<id>`, que acota la bandeja de Solicitudes a esa única tarjeta con un
  aviso y un enlace «Ver todos» para quitar el filtro — el mismo patrón de `?empleado=` que ya
  usaban Mi calendario y Mis solicitudes para que un administrador mire a otra persona.
- **La lista de Empleados los muestra todos y se acota con filtros**: búsqueda por nombre, Estado
  (Todos / En activo / De baja, sobre `isActive()`), Tipo de contrato y orden. Cada fila lleva el
  chip «Activo» o «De baja», así que ya no hace falta esconder a nadie por defecto. Un fijo
  discontinuo entre llamamientos cuenta como de baja: es justo desde donde se le vuelve a dar de
  alta.
- **Liquidación al dar de baja:** `terminationSettlement()` (`domain/balance.ts`) compara los días
  aprobados y ya pasados (disfrutados de verdad, no los aprobados a futuro) contra la estimación
  recalculada cerrando el periodo en curso en la fecha elegida en el diálogo, no en la de hoy ni el
  31 de diciembre. Cuenta también los tramos anteriores del mismo año. Si la estimación es mayor, se
  le deben días; si es menor, los debe el empleado.
- **Eliminar un empleado exige que esté de baja** (sin periodo en curso), para que la baja quede
  siempre registrada antes del borrado definitivo, y no se puede borrar al único administrador. Las
  dos reglas viven en `deleteEmployee()` (`state/actions.ts`), que devuelve `Outcome` como sus
  hermanas `terminateEmployee()`/`rehireEmployee()`; el menú de la fila solo deshabilita la opción
  por cortesía.
- **Un día que no se puede seleccionar en Mi calendario se puede pulsar para saber por qué**: abre
  un globo con el nombre del festivo y su ámbito, con el día de la semana si solo es un domingo, o
  con «Vacaciones aprobadas»/«Solicitud pendiente» si ya tiene una solicitud. El `title` nativo no
  basta porque en un móvil no hay puntero con el que pasar por encima. El cursor al pasar por
  encima es el normal de un enlace (`cursor-pointer`), no el de ayuda (`cursor-help`, la flecha con
  interrogación): el día sí es pulsable, solo que para ver información en vez de para seleccionar.

### Invariantes de los datos

- `VacationRequest.days` contiene **días laborables ya filtrados**: nunca domingos ni festivos.
  `toWorkingDays()` los descarta antes de guardar.
- Las solicitudes `rechazada` no reservan días.
- `batchId` agrupa las solicitudes creadas en una misma asignación masiva.
- **Una solicitud tiene un único estado y un único hilo de comentarios para todos sus días.** El
  administrador aprueba, rechaza o comenta días sueltos de una solicitud `pendiente` con varios
  días mediante `resolveRequestDay()`/`addRequestDayComment()`, que separan el día afectado en una
  solicitud nueva y dejan el resto en la original. Por eso la bandeja de Solicitudes agrupa por
  empleado y muestra cada día por separado, no por solicitud: si un comentario colgara del
  `VacationRequest` sin separar el día, aparecería repetido en todos los días de esa solicitud.
- **La bandeja de Solicitudes agrupa a cada empleado en una tarjeta plegable**, con el total de
  solicitudes y días de todo el año (todos los estados) en la cabecera, independiente de la
  pestaña activa (Pendientes/Aprobadas/Rechazadas/Todas), que sí filtra qué días se ven en la
  tabla de debajo. Cada día pendiente lleva una casilla; seleccionar varias y pulsar «Aprobar» o
  «Rechazar seleccionados» resuelve todas de una vez con `resolveRequestDays()`
  (`state/actions.ts`), nunca con varias llamadas a `apply()` seguidas — ver la trampa
  correspondiente. Un día con más de un comentario se pinta con «+N» y un desplegable con el hilo
  completo (autor y fecha de cada uno).
- **`Employee.activityPeriods` nunca está vacío**, sus periodos no se solapan y **como mucho uno
  tiene `end: null`, que es además el de inicio más tardío**. Todo lo que antes se leía de
  `hireDate`/`terminationDate` sale ahora de ahí: `hireDateOf()` es el inicio del primero,
  `lastEndDate()` el fin del último y `openPeriod()` el que sigue abierto.

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
- **Nunca llamar a `apply()` varias veces seguidas para una acción en lote.** `apply()` cierra
  sobre el `database` del render en curso (vía `useCallback`), así que una segunda llamada en el
  mismo manejador sigue viendo la base de datos anterior a la primera y la pisa al guardar: solo
  sobrevive el último `commit()`. Una acción sobre varios elementos tiene que ser una única función
  pura en `state/actions.ts` que va enhebrando el `Database` internamente y hace un solo `apply()`
  al final — así lo hacen `bulkAssign()`, `resolveAllPending()` y `resolveRequestDays()`.
- **`commit()` no espera al repositorio** (IndexedDB o Supabase, según el modo) y por eso devuelve
  `void`, no una promesa: la pantalla se actualiza al instante y la escritura va por detrás,
  avisando con un aviso si falla. En modo empresa, además, resincroniza recargando del servidor:
  a diferencia de IndexedDB, un fallo de red no es la excepción.
- **Fechas en UTC, salvo en `EmployeeForm`.** `src/domain/dates.ts` trabaja sobre cadenas
  `yyyy-MM-dd` con aritmética UTC; con hora local, un 1 de enero cambia de día según la zona
  horaria. `DateRangePicker` (Asignación masiva) sigue esa convención con `timeZone="UTC"` en el
  `react-day-picker` que envuelve, emparejado con `toUtcDate()`/`toIso()`. Los periodos de
  `EmployeeForm`, en cambio, usan `react-datepicker`, que interpreta sus `Date` en hora **local**
  del navegador, no en UTC: por eso ese fichero tiene sus propias `isoToLocalDate()`/
  `localDateToIso()` y nunca `toUtcDate()`/`toIso()`. Mezclar las dos parejas de conversión en el
  sitio equivocado desplaza el día mostrado según la zona horaria, exactamente el bug que ambas
  parejas existen para evitar, cada una a su manera.
- **`HashRouter`, no `BrowserRouter`.** Pages no reescribe rutas: un refresco daría un 404.
- **`createSupabaseRepository()` se memoiza con `useMemo` en `CompanyGate.tsx`, no se crea en cada
  render.** El repositorio guarda su última instantánea cargada en una variable de módulo interna
  (`lastKnown`); si `AppProvider` recibiera una instancia nueva en cada render de su padre, `commit()`
  acabaría escribiendo contra un repositorio que nunca ha llegado a cargar nada, porque el efecto de
  carga de `AppProvider` solo se ejecuta una vez (`useEffect(..., [])`) y queda atado a la instancia
  del primer render.
- **`base` en `vite.config.ts`** apunta a `/timeoff-manager/`. Si se renombra el repositorio, hay
  que cambiarlo o pasar `BASE_PATH`.
- **El formulario de festivos de Ajustes se remonta con `key={year}`.** Sin eso la fecha propuesta
  se queda en el año en que se montó y añadir un festivo desde otro año lo mete en el año
  equivocado, donde no se ve.
- **La sección General de Ajustes (nombre, tope anual, jornada) no guarda al vuelo.** A diferencia
  de Festivos, cuyas acciones ya son un `commit()` cada una, esos tres campos viven en un `draft`
  local hasta que se pulsa «Guardar cambios» — el botón se deshabilita cuando `draft` coincide con
  `database.settings` (`settingsEqual()`). Si se vuelve a un `onBlur`/`onChange` que haga `commit()`
  directo, el botón deja de reflejar si hay algo sin guardar.
- **`crypto.subtle` solo existe en contextos seguros.** Por eso `pin.ts` tiene un hash de reserva:
  al abrir la aplicación por IP en la red local no está disponible.
- **`crypto.randomUUID()` también exige contexto seguro**, así que los identificadores (`ids.ts`) y
  la sal del PIN salen de `crypto.getRandomValues()`, que sí funciona por IP en la red local.
  `newId()` compone un UUID v4 a mano con esos bytes: las claves primarias de Supabase son `uuid`,
  así que el mismo id sirve en los dos modos sin traducirlo.
- **Separar un día de una solicitud regenera el id de cada comentario copiado.**
  `resolveRequestDay()`/`addRequestDayComment()` mueven el hilo entero a la solicitud nueva; si se
  copiara tal cual, los mismos objetos de comentario (mismo id) quedarían en dos solicitudes a la
  vez, y en Supabase `request_comments.id` es la clave primaria — la segunda inserción chocaría con
  la primera. En modo local nunca se notó porque nadie busca un comentario por su id.
- **`checkSelection()` compara el saldo con un margen de `1e-9`.** El saldo es decimal: sin ese
  margen, el ruido de coma flotante puede rechazar 13 días contra un saldo real de 13 pero
  representado como 12,999999999. `useDaySelection()` aplica el mismo margen al tope de días
  seleccionables en Mi calendario, por la misma razón.
- **Un periodo en curso y un rango a medio elegir se ven idénticos desde `react-datepicker`:** en los
  dos casos `startDate` está puesto y `endDate` es `null`. El primer clic de un rango llega como
  `[fecha, null]`, y `EmployeeForm` guarda ese estado intermedio en `pendingStart` en vez de volcarlo
  a `activityPeriods`, donde se confundiría con «este periodo sigue abierto». Esto no es capricho
  propio: `react-datepicker` decide si un clic empieza un rango nuevo o completa el que ya hay
  mirando si `startDate` y `endDate` (los props controlados que se le pasan) están ambos rellenos
  (`isRangeFilled`, en su propio manejador de selección). Si en vez de `pendingStart` se completara
  `endDate` con la misma fecha de inicio, el picker vería un rango ya completo y trataría el segundo
  clic como el inicio de otro: la selección de dos clics dejaría de poder completarse. La
  contrapartida es que **el segundo clic sobre un periodo abierto lo cierra**, y para volver a
  abrirlo hace falta el botón «Dejar en curso»; no hay forma de expresar «sigue abierto» con dos
  clics en el propio calendario.
- **El input de un periodo no lleva `readOnly`, aunque tecleando se pueda escribir cualquier cosa.**
  `readOnly` en `react-datepicker` no es solo "no se puede teclear": también apaga la selección por
  calendario (`handleSelect` corta en seco si `readOnly`), así que con él puesto el campo deja de
  abrir el picker de verdad. Si se teclea texto que no es una fecha válida, `activityPeriods` no se
  toca (el `onChange` de `react-datepicker` no llega a completar el rango) y el valor mostrado
  vuelve a la fecha guardada en cuanto se cierra el calendario.
- **`.day-off` atenúa con el color, no con `opacity`.** El globo informativo de un día no laborable
  es hijo de la propia celda, así que una `opacity` en la celda se la aplicaría también a él y lo
  dejaría medio transparente sobre los días de al lado. Por eso el gris del domingo sale de un
  `color-mix` y no de bajar la opacidad de todo el elemento.
- **La tarjeta que lista los empleados no lleva `overflow-hidden`.** El menú `⋮` de una fila se
  posiciona en absoluto y sobresale de la tarjeta: con el recorte puesto, sus últimas opciones se
  quedan invisibles. Las esquinas redondeadas se sostienen solas porque las filas no pintan fondo.
- **`Modal` cierra con Escape mirando `event.defaultPrevented`, no solo `event.key`.** El calendario
  de un periodo también cierra con Escape y hace `preventDefault()` en su propio manejador; sin ese
  chequeo, ese mismo Escape burbujea hasta el `document.addEventListener` del modal y lo cierra
  también a él, perdiendo la edición en curso. Cualquier otro control con su propio Escape dentro de
  un modal necesita el mismo cuidado.
- **`DateRangePicker` (el de Asignación masiva) fija `resetOnSelect` en `react-day-picker`.** Sin
  él, al pulsar un día con un rango ya completo el picker no empieza una selección nueva: mueve el
  extremo más cercano del rango existente al día pulsado. Es un comportamiento válido, pero no el
  que se espera de "elige otro periodo" tras completar uno.
- **Las clases de `classNames`/`modifiersClassNames` de un día del `DateRangePicker` de Asignación
  masiva (`selected`, `range_start`, `range_middle`, `today`, `disabled`, y los modificadores
  `holiday`/`off`) las pone `react-day-picker` en la celda `<td>`, nunca en el `<button>` de
  dentro.** Por eso las reglas CSS de `.range-picker-day-*` en `index.css` usan el combinador
  `.range-picker-day-selected > .range-picker-day` en vez de una sola clase: si se intenta pintar el
  estado con una clase plana sobre `.range-picker-day`, no se aplica porque esa clase vive en el
  elemento equivocado.

## El PIN no es seguridad

Es del modo local — en modo empresa no hay PIN, hay una contraseña de verdad contra Supabase Auth
(ver «El modo empresa» más abajo). Evita cambiar de perfil por descuido, nada más. Los datos están
en el IndexedDB del navegador y cualquiera con acceso al dispositivo puede leerlos. Se guarda el
hash y no el número por costumbre, no porque proteja de nada. No presentarlo como control de
acceso.

**El PIN es opcional.** `isValidPin()` acepta la cadena vacía además de 4-8 dígitos, así que un
empleado sin PIN entra en Acceso dejando el campo en blanco. Ojo al editar: el campo de PIN en
blanco del formulario de edición ya significaba «no cambiar el PIN actual», así que para quitarle
el PIN a un empleado que ya tiene uno hay que teclear un PIN válido y luego, en otra edición,
volver a dejarlo en blanco no sirve — hace falta pasar por la baja y un alta nueva.

## El modo local es una demostración, y por eso es simple

Viven en el navegador de cada dispositivo y no salen de ahí. Lo que registra el administrador en su
ordenador no lo ve un empleado desde su móvil, y **no hay forma de mover los datos de un sitio a
otro**: si se borran los datos de navegación o se cambia de equipo, se empieza de cero. Es
deliberado — antes había exportar e importar un fichero JSON y se quitó, porque un modo de
demostración no justifica mantener un camino por el que entran datos de fuera.

Eso quita de un plumazo la validación de esos datos, que era el único fallo capaz de destruir lo
guardado: `parseBackup()` solo comprobaba la forma del contenedor, aceptaba un empleado vacío, lo
escribía en IndexedDB y a partir de ahí la aplicación reventaba en cada arranque, sin salida.

**Si aun así los datos quedan dañados, el `ErrorBoundary` ofrece «Empezar de cero»**, que borra
IndexedDB y recarga. Habla con `indexedDbRepository` directamente porque envuelve al `AppProvider`:
cuando se pinta, el contexto puede no existir todavía o ser justo lo que está roto. Sin ese botón,
recargar releía lo mismo y volvía a fallar: la única salida era borrar los datos del sitio a mano.

**La etiqueta «Modo local» (`ui/LocalModeBadge.tsx`) es la señal de en qué modo se está.** Sale en
Acceso, en la primera configuración y en la cabecera —solo cuando `mode === 'local'`; en modo
empresa no sale— porque los datos de verdad viven en el navegador y no en ningún sitio más.

## El modo empresa

`/<slug>` (por ejemplo `/agrorifer`) es la puerta de una empresa conectada a Supabase: la misma
aplicación, las mismas ocho pantallas, pero con los datos compartidos entre dispositivos en vez de
encerrados en un navegador. `supabase/README.md` documenta el modelo de datos, las políticas RLS y
cómo se configura un proyecto; aquí se documenta cómo encaja con el resto de la aplicación.

**El slug se decide una sola vez, en `main.tsx`, antes de montar nada.** `readCompanySlug()` lee
`window.location.hash` a mano (no un hook de router: `HashRouter` todavía no existe) y aplica
`isCompanySlug()` (`src/domain/orgSlug.ts`) — la misma lista de palabras reservadas que el `check`
de `organizations.slug` en el esquema. El resultado se pasa como `basename` de `HashRouter` (raíz
en local, `/<slug>` en empresa) y como prop a `<App>`. Con el `basename` ya puesto, ningún
`NavLink to="/empleados"` ni `<Route path="ajustes">` sabe en qué modo está: los resuelve el router
solo, relativos a donde toque. Si `App.tsx` volviera a mirar `useLocation()` para decidir el modo,
vería el primer tramo _después_ del basename (`/empleados`, no `/agrorifer`) y la detección se
rompería — por eso el slug baja como prop en vez de recalcularse.

**`CompanyGate.tsx`** es la pantalla de acceso: lista los perfiles con `perfiles_para_acceso()` y
entra con `signInWithPassword()`, igual que antes. La diferencia es que la sesión de Supabase Auth
—no un `useState` local— es la fuente de verdad de «ha entrado» (`getSession()` +
`onAuthStateChange()`), así que sobrevive a un recargo de página y refleja un cierre de sesión
desde otra pestaña sin que nadie llame a nada. En cuanto hay sesión, monta `AppProvider` con
`createSupabaseRepository()` y las mismas `AuthenticatedRoutes` que usa el modo local
(`src/AppRoutes.tsx`): es el único componente que las comparten, para que las ocho pantallas no se
dupliquen entre modos.

**Arquitectura: instantánea + diff, no un cliente que hable tabla a tabla.** `apply()` sigue siendo
síncrona y `state/actions.ts` sigue produciendo un `Database` completo, igual que en local — eso es
lo que permite reutilizar el dominio, las acciones y casi toda la interfaz sin tocarlas.
`supabaseRepository.ts` es quien encaja las dos piezas: `load()` trae la empresa entera de las ocho
tablas (RLS decide qué filas ve cada rol, no hay filtros de más en el cliente) y la ensambla con la
forma exacta del `Database` del modo local; `save()` compara esa instantánea con la última
conocida usando `diffDatabase()` (`src/data/diffDatabase.ts`) y escribe solo lo que cambió, tabla a
tabla, en el orden que no pisa claves foráneas.

**`diffDatabase()` sustituye el conjunto entero de `activity_periods` y de `vacation_request_days`
del padre afectado, en vez de diferenciar fila a fila.** Son conjuntos pequeños, y sustituir
esquiva el constraint `EXCLUDE` de no-solape de `activity_periods`: si se insertara un periodo
nuevo antes de cerrar el viejo en la misma operación, chocaría contra el que se está a punto de
cerrar. Borrar todos e insertar todos de nuevo no tiene ese problema de orden. `comments` se
compara por id a través de **todas** las solicitudes anteriores, no solicitud a solicitud: separar
un día (`resolveRequestDay()`/`addRequestDayComment()`) mueve el hilo a una solicitud con un id
distinto y regenera el id de cada comentario copiado (ver la trampa correspondiente), así que
cualquier id que no existiera antes en ninguna solicitud es, por definición, una fila nueva.

**Las escrituras van en una cola de promesas dentro del repositorio**, no en `AppStore.tsx`: dos
`commit()` seguidos no pueden solapar sus diffs sobre la misma base. Si una escritura falla, el
`AppStore` avisa y **resincroniza recargando del servidor** — a diferencia del modo local, aquí un
fallo de red es frecuente, y dejar la pantalla mostrando algo que no llegó a guardarse sería peor
que el propio fallo.

**El alta de empleado no pasa por `commit()`.** Crear un usuario exige la Admin API de Supabase, y
la Admin API exige la `service_role key`, que nunca puede viajar al navegador — por eso vive en la
Edge Function `crear-empleado`, no en el cliente. `AppContextValue.createEmployee()` es el único
método que ven las pantallas: en local hashea el PIN y hace `commit()`; en empresa llama a la Edge
Function y recarga con `repository.load()`. La pantalla no sabe cuál de las dos está pasando.
Cambiar la contraseña de alguien ya dado de alta es la misma idea con `updateEmployee()` y la Edge
Function `cambiar-password` — **solo un administrador puede cambiarla**, no hay autoservicio: el
propio empleado no tiene desde dónde hacerlo todavía.

**`resolveCurrentEmployeeId()` (`src/data/supabaseSession.ts`) es quien decide «quién soy».** No
sale de `database.employees.find(...)`: un empleado normal solo ve su propia fila por RLS, pero un
administrador ve las de toda la empresa, así que asumir la primera sería asumir mal la mitad de las
veces. Consulta `employees` filtrando por `user_id = auth.uid()` aparte.

**«Borrar todo» de Ajustes no existe en modo empresa.** Ni hay permiso en la base de datos para
borrar una organización desde la aplicación (a propósito, ver `supabase/README.md`), ni tendría
sentido ofrecerlo: borrar una empresa es una operación del panel de Supabase, no un botón.

## Diseño

Tokens en `src/index.css`: un único `@theme` con toda la paleta.

**Solo hay tema claro.** No se sigue a `prefers-color-scheme` ni hay conmutador: `index.html`
declara `color-scheme: light` y la paleta vive en un único `@theme`. Jerarquía por tipografía y espacio en vez de por bordes, radios generosos y un
único color de acento. Los componentes reutilizables (`.card`, `.btn`, `.field`, `.segmented`,
`.chip`, `.day`, `.grid-day`, `.avatar`, `.icon-btn`, `.badge-icon`, `.row-menu`, `.stat-card`,
`.filter-tab`, `.sidebar-link`) están en `@layer components`; preferirlos a repetir utilidades en el JSX y no pintar
colores con `style` inline.

**`.filter-tab` es distinto de `.segmented`, a propósito.** Los dos son controles de filtro con
varias opciones, pero `.segmented` (Rol, Tipo de contrato) marca la opción activa con fondo blanco
y sombra, estilo iOS; `.filter-tab` (pestañas de Solicitudes, con contador) la marca con
`--color-accent-soft`, el mismo lenguaje visual que ya usa la fila activa de la barra lateral. No
son intercambiables: usar uno u otro según si el control vive dentro de una tarjeta compacta
(`.segmented`) o es la navegación principal de una vista (`.filter-tab`).

**Los iconos son de `lucide-react`.** Nada de SVG dibujados a mano: se importa por nombre y solo
entra en el bundle lo que se usa.

**La barra lateral (`ui/AppSidebar.tsx`) es CSS propio, no una librería.** Antes era
`react-pro-sidebar`: 204 KB de fuente más el runtime de emotion, para cuatro enlaces estáticos.
Fijo por encima de `xl` (`xl:static xl:translate-x-0`) y cajón deslizante por debajo
(`fixed … -translate-x-full`, con `translate-x-0` cuando `toggled`), con un botón a pantalla
completa de fondo oscurecido para cerrarlo — el botón de menú de la cabecera lo abre. El enlace
activo lo pinta `.sidebar-link[aria-current='page']`: `NavLink` pone ese atributo solo, no hace
falta calcularlo a mano comparando `pathname`.

**`Avatar` (`ui/Avatar.tsx`) pinta las iniciales de un empleado** y elige uno de cinco tonos a
partir de su `id`, para que el color sea siempre el mismo persona a persona. Es lo único que dibuja
iniciales: Acceso, la barra lateral y la lista de Empleados lo comparten.

**Las acciones de una fila viven en un menú `⋮` (`ui/RowMenu.tsx`)**, no en botones sueltos: con
Editar, Dar de alta/baja y Eliminar en línea, la fila no cabía junto a las cifras y el contador.

**Piezas compartidas que evitan copiar y pegar:** `ui/useDismiss.ts` (cerrar un popover al pulsar
fuera o con Escape; lo usan `RowMenu`, `UserMenu`, `YearCalendar` y `MetricInfo`), `ui/Metric.tsx`
(la pareja cifra/etiqueta de `BalanceCard` y de la lista de Empleados), `ui/MetricInfo.tsx` (un
`Metric` que al pulsarlo despliega un popover con el detalle del cálculo, para «Días trabajados» y
«Estimación» de Empleados), `ui/SelectField.tsx` (etiqueta + `select` de una lista de
opciones) y el prop `confirm` de `Modal` (con `disabled` opcional, para el botón que exige rellenar
algo antes, como el de «Añadir comentario»), que pinta el pie Cancelar + acción en vez de repetir
los dos botones en cada diálogo. `footer` sigue existiendo para un pie que no sea ese par.

**Solicitudes y Asignación masiva no están en la barra lateral**, que se queda con las cuatro
pantallas que se visitan a diario. Sus rutas siguen existiendo y se llega a ellas desde donde hacen
falta: a Solicitudes, por la campana con el número de días pendientes de la cabecera y por la
tarjeta de resumen de Empleados; a Asignación masiva, por un botón junto a «Nuevo empleado». El
globo de la campana cuenta días pendientes, así que va en `--color-pending` como el resto de lo
pendiente, no en rojo. El recuento sale de `pendingDaysInYear()` (`domain/balance.ts`), que es lo
único que define «día pendiente del año».

**La barra lateral es solo para el administrador.** Un empleado normal tiene dos pantallas —Mi
calendario y Mis solicitudes— y llega a la segunda desde la primera, así que un menú de navegación
con una sola entrada sobra: `AppShell` no monta el `Sidebar` (ni el botón de menú del móvil) si el
usuario no es administrador, y en su lugar la cabecera pinta el logo y el nombre de la organización,
que si no se perderían con la barra.

**El usuario vive en la esquina superior derecha (`ui/UserMenu.tsx`)**, no al pie de la barra
lateral: al pulsar su avatar se abre un popover con su nombre, su rol y «Salir». Reutiliza las
clases `.row-menu`/`.row-menu-item` del menú `⋮` de una fila y el `useDismiss()` de siempre, porque
es el mismo patrón de popover. Es lo único que cierra la sesión, y está donde está para que también
lo tenga a mano quien no ve barra lateral.

**Mis solicitudes es una pantalla propia (`pages/MyRequests.tsx`)**, a la que se entra desde dos
sitios de Mi calendario: el botón «Ver mis solicitudes» de `BalanceCard` (prop `requestsTo`) y el
enlace «Ver todas» de la vista previa de solicitudes recientes de la propia página. Antes era una
sección al final del calendario, donde quedaba lejos del saldo que la explica. **A quién mira un
administrador vive en la URL** (`?empleado=<id>`) y no en un estado local: es lo que permite ir de
un calendario ajeno a sus solicitudes y volver sin perder de vista a esa persona.

**`BalanceCard` lleva sus propias acciones («Solicitar vacaciones» y «Ver mis solicitudes»)**, no
una tarjeta clicable entera: son dos intenciones distintas (pedir días nuevos, consultar las que ya
existen) y un botón por intención es más claro que un enlace ambiguo sobre toda la tarjeta.
«Solicitar vacaciones» se deshabilita mientras no haya ningún día marcado en el calendario — abre el
mismo diálogo que el botón del mismo nombre del resumen de selección, encima de la rejilla de meses,
que aparece con la misma selección. «Ver mis solicitudes» es la única vía a Mis solicitudes desde Mi
calendario: no hay vista previa de solicitudes en la propia página, solo el botón.

**El aviso «Ten en cuenta» de Mi calendario son solo las reglas que no son evidentes por sí solas**
(qué días se pueden seleccionar y qué pasa con una solicitud pendiente), no una lista exhaustiva de
todo lo que hace la pantalla: el límite de saldo y el bloqueo de un día ya solicitado ya se ven al
intentar marcarlos, así que no hace falta explicarlos también aquí.

**La selección de días de Mi calendario no lleva barra flotante.** El resumen («N días: rango») y el
botón «Limpiar» viven dentro de la propia tarjeta del calendario, encima de la rejilla de meses;
«Solicitar vacaciones» ya vive en `BalanceCard` y no necesita otro sitio. Una barra `fixed` tapaba
contenido en pantallas pequeñas y obligaba a un `pb-24` de relleno que ya no hace falta.

**Una solicitud se muestra y se cancela por tramos de días consecutivos, no por solicitud entera.**
`RequestCard` (`ui/RequestCard.tsx`) agrupa `request.days` con `dayRanges()`
(`ui/calendarGrid.ts`, la misma agrupación que ya usaba `summarizeDays()` para el texto) y pinta una
fila por tramo, cada una con su propio botón de cancelar. `removeRequestDays()`
(`state/actions.ts`) cancela los días de un tramo de una sola vez —el mismo motivo que
`resolveRequestDays()`: nunca varios `apply()` seguidos—, reutilizando `removeRequestDay()` en un
bucle interno; como no cambia el id de la solicitud al quitar un día (a diferencia de
`resolveRequestDay()`, que sí lo hace al resolver), no hace falta enhebrar ningún id entre
iteraciones. Sustituye a la antigua `removeRequest()`, que cancelaba la solicitud entera de golpe.

**`.btn-alt` es la única excepción al color de acento único.** Lo lleva Asignación masiva para
distinguirse de «Nuevo empleado» sin competir con él, y reutiliza el verde de `--color-approved`,
que ya es el del logo de la barra lateral.

**El hueco previo al día 1 de cada mes es `grid-column-start`, no celdas vacías.** `monthCells()`
devuelve solo días reales y `firstDayOffset()` coloca el primero en su columna. Añadir huecos de
relleno obligaría a inventarles una clave y a filtrarlos en cada `map`.

**`YearCalendar` pinta un mes solo en móvil, los doce en pantallas `sm:` o mayores** —no los doce
apilados en una columna—, porque desplazarse por un año entero de golpe en el móvil es demasiado.
El selector de mes reutiliza la clase `.year-picker` (la misma del año, en la cabecera de
`AppShell`) y `MonthCalendar` recibe `hideTitle` para no repetir el nombre del mes que ya pinta ese
selector. **El mes mostrado en móvil vive en un componente aparte (`MobileMonth`) montado con
`key={year}`**, no sincronizado con un efecto: así, al cambiar de año, React lo remonta entero y su
`useState` vuelve a arrancar en el mes de hoy (o en enero si el año ya no es el actual) sin la
cascada de renders de un `setState` dentro de un `useEffect`. Los botones anterior/siguiente se
deshabilitan en enero y diciembre — cruzar a otro año es cosa del selector de año de la cabecera,
no de este control.

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
