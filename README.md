# Baseline Planning Suite

A planning tool for an organisation that sells its people's time. It answers one
question, month by month: who is assigned to which piece of work, whether anyone
is committed beyond their contracted hours, and what the plan costs at the rates
those people are paid.

Three applications, built and deployed independently:

| App        | Role   | Owns                                                          |
| ---------- | ------ | ------------------------------------------------------------- |
| `shell`    | host   | navigation, display currency, the active user                 |
| `people`   | remote | the employee register: roles, weekly hours, cost-rate history |
| `delivery` | remote | the work breakdown and the staffing grid of people by months  |

They are separate because the data is owned by separate teams on separate release
schedules. The register of people and their rates, and the plan that spends them,
do not belong to one application.

## Status

The domain core is complete and the federation is wired and verified. The two
remote UIs and the Docker packaging are not built yet. See
[what is not built yet](#what-is-not-built-yet) at the end - nothing in this
README describes something that does not run.

## Running it

Node 24 and pnpm 11.

```sh
pnpm install
pnpm dev
```

That starts all three dev servers:

| App      | URL                   |
| -------- | --------------------- |
| shell    | http://localhost:3000 |
| people   | http://localhost:3001 |
| delivery | http://localhost:3002 |

Open the shell. Each remote also runs on its own URL, from the same build - see
[standalone and hosted](#standalone-and-hosted-from-one-build).

Everything else:

```sh
pnpm test          # domain unit tests, no browser and no React
pnpm typecheck     # tsc -b across the workspace
pnpm lint          # eslint, type-aware
pnpm format:check  # prettier
pnpm build         # production build of all three apps
```

## Breaking a remote on purpose

Add `?break=` and the name of a remote to the shell's URL:

- http://localhost:3000/?break=people
- http://localhost:3000/?break=delivery
- http://localhost:3000/?break=people,delivery

The named remote is pointed at an unreachable origin, so the failure travels the
real code path: the manifest fetch rejects. The shell stays up, its navigation
keeps working, and the panel says which remote is unavailable. Switching to the
other remote still loads it.

That last part was a bug at first. One dead remote left the error boundary in its
failed state and poisoned the panel of every other remote; the boundary is now
keyed by remote name so switching remounts it.

## Repo map

```
apps/
  shell/        the host: navigation, runtime remote resolution, failure isolation
  people/       remote: employee register and rate history
  delivery/     remote: work breakdown tree and staffing grid
packages/
  domain/       all the arithmetic. no React, no DOM, no imports from apps/
  mf-shared/    the federation `shared` block, declared once for all three builds
fixtures/
  baseline-seed.json    the fixed-id seed that ships with the exercise
```

### Inside `packages/domain`

| File                 | What it answers                                                           |
| -------------------- | ------------------------------------------------------------------------- |
| `calendar.ts`        | what a month and a day are, leap years, is this a working day             |
| `working-days.ts`    | working days in a month, and on each side of a mid-month boundary         |
| `person-month.ts`    | how many hours one person-month is, for this contract in this month       |
| `rate-schedule.ts`   | which runs of working days sit at which rate                              |
| `allocation-cost.ts` | what an allocation costs, and the blended rate for the month              |
| `units.ts`           | hours, person-months, % of capacity and cost, in both directions          |
| `rounding.ts`        | largest-remainder distribution so displayed cells add to displayed totals |
| `breakdown.ts`       | rolling hours up the work breakdown                                       |
| `cost-roll-up.ts`    | rolling cost up the work breakdown                                        |
| `capacity.ts`        | cross-project load against a person's capacity                            |

126 tests, under 200 ms, no browser involved.

## The reference calculation

The exercise gives one worked example and says to check it first. All ten
quantities are asserted by tests.

A. Okafor, 40 h/week. Rates EUR 80.00/h from 2025-01-01 and EUR 95.00/h from
2026-03-12. One leaf cell of 0.50 person-months in March 2026.

| Quantity                    | Value                           |
| --------------------------- | ------------------------------- |
| March 2026 working days     | 22                              |
| Working days before 12 Mar  | 8                               |
| Working days from 12 Mar on | 14                              |
| One person-month            | 40 x 22 / 5 = 176.00 h          |
| This allocation in hours    | 0.50 x 176 = 88.00 h            |
| Hours per working day       | 88 / 22 = 4.00 h                |
| Cost                        | 8x4x80 + 14x4x95 = EUR 7,880.00 |
| Same cell in % of capacity  | 50.0%                           |
| Blended rate                | EUR 89.5455/h                   |

Every intermediate value there is exactly representable as a double, so the tests
assert `7880` rather than a tolerance. That is deliberate: an exact assertion also
works as a canary if a later change introduces drift.

## The domain rules, by their labels

The exercise numbers its five domain rules in the margin of section 3.3. This
README and the comments in `packages/domain` refer to them by those labels, so
here they are spelled out:

|        | Rule                                        | Where it lives                                                             |
| ------ | ------------------------------------------- | -------------------------------------------------------------------------- |
| **R1** | Rates are effective-dated, and months split | `calendar.ts`, `working-days.ts`, `rate-schedule.ts`, `allocation-cost.ts` |
| **R2** | Four units, one truth                       | `person-month.ts`, `units.ts`                                              |
| **R3** | Totals must add up                          | `rounding.ts`, and the horizon rule in `breakdown.ts`                      |
| **R4** | Parents are derived                         | `breakdown.ts`, `cost-roll-up.ts`                                          |
| **R5** | Capacity is cross-project                   | `capacity.ts`                                                              |

## Decisions

### Where the domain logic lives

`packages/domain` holds every calculation and imports nothing from the apps. It
has no React and no DOM, so it can be tested as ordinary functions - the whole
suite runs in under 200 ms with no browser.

The apps display what it returns. When something is wrong with a number, there is
one place to look, and it is the place with the tests.

### Who owns rates, and who computes cost

**Delivery never holds a rate record.** People owns rate history and publishes a
computed answer; Delivery asks what an amount of hours costs.

The exercise says either arrangement can be right, so here is why this one:

- The rate-splitting rule from R1 is subtle - `validFrom` is inclusive, a month
  can carry several rates, a month before the first rate costs zero. It should
  exist once. If Delivery computed cost itself, that rule would live in two
  applications and drift the first time it changed.
- R5 needs both sides to agree on what a person-month is. One owner, one answer.
- Changing how rates work then means deploying People, not both apps.

The cost of that choice, stated plainly: the interface is chattier, and Delivery
depends on People at runtime for its cost column. That dependency is handled by
degrading rather than failing - see below.

The seam is one function type:

```ts
type CostOfHours = (employeeId: string, month: YearMonth, hours: number) => HoursCost;
```

It is synchronous. Whoever owns the rates resolves the visible pairs first;
nothing reaches over the network in the middle of a tree walk.

One thing worth being explicit about: **the boundary is about data, not module
visibility.** Both apps share `packages/domain`, so Delivery can see
`splitMonthByRates`. What stops it pricing the grid itself is that it never holds
the rate records.

### The canonical unit is hours

Allocations are stored in hours. Person-months, % of capacity and cost are
derived at the edge with the UI.

An hour means the same thing everywhere. A person-month does not - it is
`weeklyHours * workingDays / 5`, so its size depends on the person and on the
calendar. If person-months were stored, then changing what counts as a working
day (adding public holidays, say) would silently change how many hours every
stored allocation represents. The plan would get more expensive with nothing
edited.

Against it: the seed arrives in person-months and the grid's default display is
person-months, so conversion happens more often this way round. The seed is
converted once, on import.

### Switching units never writes

Rule R2 says switching units and switching back must not change the stored value.
Converting and formatting are therefore separate functions, and the display value
never feeds back into the store.

The reason is concrete. 88.4 hours is 0.5022... person-months, which displays as
`0.50` at the fixed two decimals. Write that back and the cell becomes 88 hours -
four tenths of an hour gone, with the user having edited nothing. A test pins this
down so the two functions do not get merged later.

An edit parses the number the user typed, never the string they were shown.

### Totals reconcile by largest remainder

Totals come from exact values and are rounded once for display, so the cells are
the ones that get nudged. Three cells of 0.334, 0.333 and 0.333 each display as
0.33 and add up to 0.99 under a total of 1.00; largest-remainder distribution
hands the missing hundredth to the cell that came closest to rounding up.

Ties go to the **larger** value, not the earlier one. A positional tie-break made
the result depend on the order of the row, so re-sorting renumbered the cells -
and ties are the common case here, not an exotic one: any set of values ending in
half a unit ties completely. Giving the unit to the larger cell also keeps its
relative error smaller.

The guarantee is about displayed numbers, so it is checked on integers.
`33.4 + 33.3 + 33.3` is `99.99999999999999` as doubles, which is a different
question from whether the column adds up on screen.

### Cost cannot be derived from a parent's hours

Hours add up the tree; cost adds up the tree too, but it cannot be computed
anywhere except on an assignment. A leaf holding 88 hours of one person at
EUR 89.5455/h and 88 of another at EUR 120/h has 176 hours and no rate behind
them - dividing gives EUR 104.77/h, which is nobody's rate.

So cost is computed per assignment and summed upwards, in a module separate from
the hours roll-up. Hours need nothing from People; cost does. Keeping them apart
is what lets the grid render and stay editable in hours, person-months and % when
the rate source is unavailable, with only the cost column reporting itself
missing. There is no flag anywhere for that - the caller simply does not call the
cost roll-up.

### % of capacity shows nothing on a derived row

R2 defines it as percent of _that person's_ person-month. A work package has no
person, so it has no capacity to be a percentage of. Two people at 50% each are
not "100% loaded".

Hours, person-months and cost aggregate on derived rows; % does not.

### Capacity ignores the grid's horizon

The grid shows a twelve-month window, and a row's total is the total of that
window - anything else would put a number on screen that the user cannot check by
adding up the visible cells, which R3 forbids.

Capacity is the opposite. A person is either overcommitted in a month or not,
whatever the grid happens to be showing, and the load is summed across every
project including ones nobody has open. So `capacityLoad` takes no horizon
argument at all. There is nothing there to get wrong.

This matters for the fixtures specifically. The largest single allocation in the
seed file is 0.65 person-months, but six person-months are over capacity once the
other projects are counted. A check inside one project finds nothing and looks
like it works.

### How the two remotes talk

The dependency runs both ways, which is easy to miss:

| Consumer | Needs                                                     | Owner    |
| -------- | --------------------------------------------------------- | -------- |
| Delivery | cell cost, person-month size                              | People   |
| People   | total load per person-month, for the oversubscribed badge | Delivery |

R5 asks for both halves: People shows the badge, Delivery names the assignment
that caused it. So each remote exposes a typed contract through Module Federation
and resolves the other's URL from the same runtime configuration.

Neither app needs the other to function. People down means Delivery still edits
in hours, person-months and %, with the cost column reporting itself unavailable.
Delivery down means People loses only the oversubscription badge.

The remotes do reference each other at runtime. There is no build-time cycle -
two independent lookups through configuration - but it is worth saying so before
it is raised as a smell. The alternative was routing both contracts through the
shell, which gives a cleaner dependency graph but costs the standalone remotes
their cost column and their badge, and standalone is its own requirement.

### Module Federation specifics

**Remote URLs resolve at runtime.** `apps/shell/public/config.js` sets a global
before the bundle runs, and the shell hands those URLs to the federation runtime
with `registerRemotes()`. No URL appears in any bundle, so one built artifact runs
in any environment. In Docker that file will be generated from environment
variables on container start.

**One React.** `packages/mf-shared` declares the `shared` block once, because it
has to be byte-identical in all three builds - disagree on the version and
federation quietly loads two copies of React, which surfaces as broken hooks
rather than as a configuration error. Verified in the browser: React is fetched
once, from the host's origin only, and never from a remote's.

Only `react` and `react-dom` are shared. The JSX runtime is a stateless factory,
so a second copy costs a couple of kilobytes and cannot change behaviour; package
subpaths are also not registered as shares by this version of the plugin, so
declaring it would leave dead configuration behind.

**The async boundary.** Every entry file contains one dynamic import and nothing
else. Shared modules resolve asynchronously - the runtime has to settle which
copy of React wins before any module that imports React is evaluated - and an
entry runs synchronously, so an entry that imports React fails with
`loadShareSync failed`. All three apps have this boundary, remotes included,
because a remote's standalone entry consumes the shared React too.

### Standalone and hosted from one build

Each remote produces two things from a single `rspack build`: `main.js` with an
`index.html` that mounts the app on its own, and `remoteEntry.js` for a host to
fetch. No build flags, no second mode.

The HTML plugin is restricted to the `main` chunk. By default it injects every
entrypoint including the federation container, so the standalone page ran two
runtimes from one compilation, both claiming the same hot-update global, and HMR
wrote into the wrong module registry. `remoteEntry.js` is for hosts to fetch, not
for that page to execute.

Note that HMR does not cross the host boundary: editing a remote's UI updates it
on its own port, while the shell needs a reload to pick the change up. That is
how Module Federation works rather than a property of this bundler.

### Why Rspack

Module Federation is built on the webpack chunk runtime, and Rspack is
webpack-compatible, so the official `@module-federation/enhanced` plugin and all
of its documentation apply directly, at Rust build speeds. Vite needs a plugin
that emulates that runtime, and the weakest part of the emulation is exactly the
part being assessed here - the shared singleton and runtime remote resolution.

Two Rspack-specific things are turned off, both with reasons in the config:
`lazyCompilation`, which the CLI enables for `serve` unless the key is present
and which breaks HMR here, and the federation `dts` feature, which starts its own
server on the app's own port.

### Types

TypeScript strict, plus `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. ESLint runs type-aware rules, which catch a
different class of problem than the compiler: promises nobody awaits, conditions
that can never be false, values narrowed out of `any` unnoticed.

Where a wrong state can be made unrepresentable, it is:

- A rate slice is `{ kind: 'priced', hourlyCost }` or `{ kind: 'unpriced' }`, not
  `hourlyCost: number | null`. No rate is not a rate of zero, and `unpriced` has
  no `hourlyCost` to multiply by accident.
- A grid row is an item row or an assignment row, not a row with an `isEditable`
  flag. "Parents are read-only" is then a fact about the type: an item row has no
  `employeeId`, so an edit has nowhere to land.

TypeScript is pinned to 6.0.3 rather than 7, because no `typescript-eslint`
release supports 7 yet and the type-aware rules were worth more than the faster
compiler.

## What is not built yet

- **Docker.** No `Dockerfile` and no `compose.yaml`, so the one-command
  `docker compose up` on port 8080 does not exist yet. `public/config.js` is
  already the seam it will be generated into.
- **The People UI.** The employee register and rate-history editing.
- **The Delivery UI.** The breakdown tree and the staffing grid.
- **Persistence.** The design is IndexedDB with one database per remote behind an
  async repository interface, so that ownership is physical rather than a
  convention and the interface has the shape an HTTP client would. Nothing is
  written yet.
- **The published contracts** between the remotes. Designed and described above;
  only the domain-side seam (`CostOfHours`) exists.
- **Two-directional reconciliation in the grid.** A derived row's month cells have
  to add to its row total, and each month cell has to equal the sum of its
  children in that month. Independent rounding cannot always satisfy both, and
  the resolution is still open.
