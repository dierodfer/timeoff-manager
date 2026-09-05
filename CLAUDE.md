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
| `src/data/`   | IndexedDB, copias de seguridad, PIN, datos iniciales | Nadie más habla con el almacenamiento                 |
| `src/state/`  | Operaciones de negocio y estado de la aplicación     | `actions.ts` son funciones puras `Database → Outcome` |
| `src/ui/`     | Componentes: calendarios, rejilla anual, formularios |                                                       |
| `src/pages/`  | Pantallas                                            |                                                       |

**`VacationRepository` (`src/data/repository.ts`) es el único punto de acceso a los datos.** La
interfaz de usuario nunca toca IndexedDB. Cambiar a un almacenamiento compartido (Supabase u otro)
es escribir otra implementación de esa interfaz, sin tocar la interfaz de usuario.

**Toda la base de datos se guarda como un único documento JSON.** El volumen es pequeño —una
plantilla y sus días— así que no compensa coordinar escrituras entre colecciones, y la copia de
seguridad sale gratis.

**`src/data/migrations.ts` es el único sitio donde se migran formatos antiguos.** Lo usan los dos
puntos por los que entran datos de fuera: `indexedDbRepository.load()` y el `parseBackup()` de
`backup.ts`, que antes aceptaba una copia antigua sin migrarla. Es una función pura, y por eso tiene
tests igual que el dominio y `state/actions.ts`. La migración se persiste en la primera escritura, no
al leer.

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
- **Estimación:** `0,0737 × días trabajados`, **sin redondear** y limitada a la base anual, que
  funciona como tope. Un «día trabajado» es un día de `Settings.workweek` dentro de los tramos en
  activo; los festivos no se descuentan. Con la jornada de lunes a sábado un año completo son 313
  días → 23,07, que el tope deja en 23. Se aplica igual a todos los empleados.
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
- **La lista de Empleados oculta por defecto a quien no está en activo hoy** (`isActive()`), con el
  interruptor «Ver inactivos» para verlos. Ahí entra también un fijo discontinuo entre llamamientos,
  que es justo desde donde se le vuelve a dar de alta.
- **Liquidación al dar de baja:** `terminationSettlement()` (`domain/balance.ts`) compara los días
  aprobados y ya pasados (disfrutados de verdad, no los aprobados a futuro) contra la estimación
  recalculada cerrando el periodo en curso en la fecha elegida en el diálogo, no en la de hoy ni el
  31 de diciembre. Cuenta también los tramos anteriores del mismo año. Si la estimación es mayor, se
  le deben días; si es menor, los debe el empleado.
- **Un día no laborable de Mi calendario se puede pulsar para saber por qué lo es**: abre un globo
  con el nombre del festivo y su ámbito, o con el día de la semana si solo es un domingo. El `title`
  nativo no basta porque en un móvil no hay puntero con el que pasar por encima.

### Invariantes de los datos

- `VacationRequest.days` contiene **días laborables ya filtrados**: nunca domingos ni festivos.
  `toWorkingDays()` los descarta antes de guardar.
- Las solicitudes `rechazada` no reservan días.
- `batchId` agrupa las solicitudes creadas en una misma asignación masiva.
- **Una solicitud tiene un único estado para todos sus días.** El administrador aprueba o rechaza
  días sueltos de una solicitud `pendiente` con varios días mediante `resolveRequestDay()`, que
  separa el día resuelto en una solicitud nueva y deja el resto pendiente en la original. Por eso
  la bandeja de Solicitudes agrupa por empleado y muestra cada día por separado, no por solicitud.
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
- **`commit()` no espera a IndexedDB** y por eso devuelve `void`, no una promesa: la pantalla se
  actualiza al instante y la escritura va por detrás, avisando con un aviso si falla.
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
