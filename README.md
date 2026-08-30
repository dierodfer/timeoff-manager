# Time Off Manager

An application for managing a team's vacation days through a shared calendar. It's built to run
on **GitHub Pages**, so it's a client-only app: React + TypeScript, no server and no hosting cost.

## How data is stored

Everything is stored in the browser's **IndexedDB** as a single JSON document.

This has an important consequence worth understanding before using the app:

> **Data does not sync across devices.** What the admin records on their computer is not visible
> to an employee on their phone. In practice the app is used from one machine — or from several,
> each with its own copy — and data moves between them via the backup file exported from Settings.

Data access is isolated behind the `VacationRepository` interface (`src/data/repository.ts`).
Moving to shared storage is just writing another implementation of that interface; the UI never
needs to know.

## Business rules

- **Working day:** Monday through Saturday, minus holidays. Sundays and holidays never count even
  if selected. The work week can be changed from Settings.
- **Day estimate:** `0.0737 × worked days`, **never rounded**, capped at the annual base (23 by
  default, configurable in Settings). A "worked day" is a day of the configured work week inside
  an active period; holidays are not deducted. A full Monday–Saturday year is 313 days → 23.07,
  which the cap trims to 23.
  - A regular employee is active between their hire date and termination date.
  - A **seasonal (intermittent) employee** is only active during their call-up periods, defined
    one by one on their profile. The period in progress is projected to 31 December, assuming the
    employee stays called up.
- **Effective days:** the estimate is the default; the admin can override it with the `+` and `−`
  controls and revert to the estimate with "Reset". The override is per year.
- **Balance:** assigned days minus approved and pending ones. A pending request reserves balance
  so the same days can't be committed twice.
- **Limit:** no request or assignment can push the balance negative, **not even for the admin**.
  To assign more days, raise the employee's count first.
- **Cancellation:** an employee can only withdraw their own requests while `Pending`. The admin
  can delete any request, including approved ones, and the days return to the balance.
- A selection spanning two calendar years creates one request per year, since balances are annual.

## Holidays

Holidays for **Algarrobo (Málaga, Spain)** come preloaded: national, Andalusia regional, and the
municipality's two local holidays. All of them are editable from Settings, which is also where
new years get added.

- **2026:** Resolution of 17 October 2025 from the Directorate-General of Labour
  (BOE-A-2025-21667), plus the list of Andalusia local holidays for 2026.
- **2027:** Decree 84/2026, of 29 April (BOJA no. 84, of 5 May 2026). The **two local holidays for
  2027 are not preloaded**: municipalities propose them after that decree, and they're published
  in a later resolution. Add them by hand once they're out.

## Roles and access

- **Employee:** views their yearly calendar, requests days off, and cancels their own pending
  requests.
- **Admin:** additionally manages employees and day counts, approves or rejects requests, creates
  already-approved vacations directly, and runs bulk assignments.

Everyone signs in by picking their profile and entering a PIN.

> **The PIN is not a security measure.** It only guards against switching profiles by accident.
> The data lives in the browser's IndexedDB, and anyone with access to the device can read it.
> Only the PIN's hash is stored, not the number itself, so it isn't exposed in backups.

## Getting started

```bash
npm install
npm run dev        # dev server
npm test           # domain logic tests
npm run lint       # ESLint with type-aware rules
npm run format     # Prettier
npm run build      # production build into dist/
npm run preview    # serve dist/ as in production
```

## Deployment

The `.github/workflows/deploy.yml` workflow runs lint, format check, tests and build, then
publishes on every push to `main`. It needs to be enabled once under
**Settings → Pages → Source: GitHub Actions**.

The app is served from a subdirectory (`/timeoff-manager/`), configured in `vite.config.ts`.
If you rename the repository, update `base` there or pass `BASE_PATH` at build time.

`HashRouter` is used on purpose: GitHub Pages can't rewrite routes, and refreshing on
`/requests` would otherwise return a 404.

## Structure

```
src/
  domain/     pure logic: dates, working days, estimates, balance, holidays
  data/       IndexedDB, backups, PIN, seed data
  state/      business operations and application state
  ui/         components: calendars, year grid, forms
  pages/      screens
```

The `domain/` folder has no dependency on React or storage, and is the one covered by tests.
