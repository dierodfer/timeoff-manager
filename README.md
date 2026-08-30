# Vacaciones

Aplicación para gestionar las vacaciones de una plantilla desde un calendario centralizado.
Está pensada para desplegarse en **GitHub Pages**, así que es una aplicación de solo cliente:
React + TypeScript, sin servidor y sin coste de alojamiento.

## Cómo se guardan los datos

Todo se guarda en el **IndexedDB del navegador** como un único documento JSON.

Esto tiene una consecuencia importante que conviene tener clara antes de usarla:

> **Los datos no se sincronizan entre dispositivos.** Lo que registra el administrador en su
> ordenador no lo ve un empleado desde su móvil. En la práctica la aplicación se usa desde un
> equipo —o desde varios, cada uno con su propia copia— y los datos se mueven con el fichero de
> copia de seguridad que se exporta desde Ajustes.

El acceso a los datos está aislado detrás de la interfaz `VacationRepository`
(`src/data/repository.ts`). Para pasar a un almacenamiento compartido basta con escribir otra
implementación de esa interfaz: la interfaz de usuario no se entera.

## Reglas de negocio

- **Día laborable:** de lunes a sábado, descontando los festivos. Los domingos y festivos no
  computan aunque se seleccionen. La jornada semanal se puede cambiar desde Ajustes.
- **Estimación de días:** `base anual × días en activo en el año ÷ días del año`, redondeado.
  La base son 23 días y se configura en Ajustes.
  - Un empleado ordinario está en activo entre su fecha de alta y su fecha de baja.
  - Un **fijo discontinuo** solo está en activo durante sus periodos de llamamiento, que se
    definen uno a uno en su ficha.
- **Días efectivos:** la estimación es el valor por defecto; el administrador la ajusta con los
  controles `+` y `−` y puede volver a la estimación con «Restablecer». El ajuste es por año.
- **Saldo:** días asignados menos los aprobados y los pendientes. Una solicitud pendiente reserva
  saldo para que los mismos días no se puedan comprometer dos veces.
- **Límite:** ninguna solicitud ni asignación puede dejar el saldo en negativo, **tampoco las del
  administrador**. Para asignar más días hay que subir antes el contador del empleado.
- **Cancelación:** el empleado solo retira sus solicitudes mientras están `Pendiente`. El
  administrador puede eliminar cualquiera, incluidas las aprobadas, y los días vuelven al saldo.
- Una selección a caballo entre dos años genera una solicitud por año, porque el saldo es anual.

## Festivos

Vienen precargados los festivos de **Algarrobo (Málaga)**: nacionales, de Andalucía y las dos
fiestas locales del municipio. Todos son editables desde Ajustes, donde también se añaden años
nuevos.

- **2026:** Resolución de 17 de octubre de 2025 de la Dirección General de Trabajo
  (BOE-A-2025-21667) y relación de fiestas locales de Andalucía para 2026.
- **2027:** Decreto 84/2026, de 29 de abril (BOJA núm. 84, de 5 de mayo de 2026). Las **dos
  fiestas locales de 2027 no están precargadas**: los ayuntamientos las proponen después de ese
  decreto y se publican en una resolución posterior. Hay que añadirlas a mano cuando salgan.

## Roles y acceso

- **Empleado:** consulta su calendario anual, solicita días y cancela sus solicitudes pendientes.
- **Administrador:** además gestiona empleados y días, aprueba o rechaza solicitudes, genera
  vacaciones ya aprobadas y hace asignaciones masivas.

Cada persona entra eligiendo su perfil e introduciendo un PIN.

> **El PIN no es una medida de seguridad.** Evita cambiar de perfil por descuido, nada más.
> Los datos están en el IndexedDB del navegador y cualquiera con acceso al dispositivo puede
> leerlos. Se guarda el hash del PIN, no el número, para no dejarlo a la vista en las copias.

## Puesta en marcha

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # tests de la lógica de dominio
npm run build      # build de producción en dist/
npm run preview    # sirve dist/ como en producción
```

## Despliegue

El workflow `.github/workflows/deploy.yml` construye y publica en cada push a `main`.
Hay que habilitarlo una sola vez en **Settings → Pages → Source: GitHub Actions**.

La aplicación se sirve bajo un subdirectorio (`/timeoff-manager/`), configurado en
`vite.config.ts`. Si renombras el repositorio, cambia ahí el `base` o define `BASE_PATH` al
construir.

Se usa `HashRouter` a propósito: GitHub Pages no sabe reescribir rutas y un refresco en
`/solicitudes` daría un 404.

## Estructura

```
src/
  domain/     lógica pura: fechas, días laborables, estimación, saldo, festivos
  data/       IndexedDB, copias de seguridad, PIN, datos iniciales
  state/      operaciones de negocio y estado de la aplicación
  ui/         componentes: calendarios, rejilla anual, formularios
  pages/      pantallas
```

La carpeta `domain/` no depende de React ni del almacenamiento y es la que está cubierta por los
tests.
