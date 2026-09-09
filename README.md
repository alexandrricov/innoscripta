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

Everything in the scope works. See
[what is not built yet](#what-is-not-built-yet) at the end - nothing in this
README describes something that does not run.

What is here: the domain, both remote UIs, persistence that survives a reload,
the contracts the two remotes publish to each other, the host-owned display
currency and active user pushed into both remotes at runtime, failure isolation
with a way to trigger it, and `docker compose up` serving the suite on port 8080.

## Running it

One command from a clean clone, with nothing but Docker on the machine:

```sh
docker compose up
```

Then open http://localhost:8080. The remotes are published too, because it is
the browser that fetches them:

| App      | URL                   |
| -------- | --------------------- |
| shell    | http://localhost:8080 |
| people   | http://localhost:8081 |
| delivery | http://localhost:8082 |

To point the suite at real hostnames, set `PEOPLE_URL` and `DELIVERY_URL` - the
same images, no rebuild. See [how the images work](#how-the-images-work).

### Without Docker

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
  contracts/    what the remotes publish to each other, and the runtime config
  seed/         reading and validating the fixture, shared by both remotes
  theme/        design tokens, so three apps on one page agree on how they look
  mf-shared/    the federation `shared` block, declared once for all three builds
fixtures/
  baseline-seed.json    the fixed-id seed that ships with the exercise
```

Each app holds React and wiring. Anything worth testing that does not need React
mounted lives in a package, or next to the code it belongs to inside the app -
the stores and the grid's row shaping are tested that way, without a browser.

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
| `unit-roll-up.ts`    | rolling the tree up in whichever unit is on screen                        |
| `capacity.ts`        | cross-project load against a person's capacity                            |

142 tests, a quarter of a second, no browser involved. 320 across the whole
repo.

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
| **R4** | Parents are derived                         | `breakdown.ts`, `unit-roll-up.ts`                                          |
| **R5** | Capacity is cross-project                   | `capacity.ts`                                                              |

## What each app does

### People

A searchable register of sixty employees. Open one and their cost-rate history is
editable: rates addable, correctable and removable, and dates in the past are
allowed because correcting history retroactively is the point.

An edit commits on blur or Enter, never per keystroke - clearing a date to retype
it passes through an empty field on the way, and that is neither an edit worth
saving nor one worth complaining about. Two rates starting on the same day are
refused: the domain would cope, since sorting makes the later one win, but a
history with two rates "from 12 March" means nothing to whoever reads it.

Removing the last rate is allowed. The employee then costs nothing and their
cells are marked unpriced, which R1 already describes, so no special case
appears anywhere.

The detail also shows the size of a person-month for the current month, which is
free to compute and makes visible that 40 h/week is not a fixed number of hours.

Somebody committed beyond their contracted hours carries a badge - a word, not
only a colour - and the detail lists the months with the numbers. That is R5's
first half, and the numbers come from Delivery.

### Delivery

Two views of the same tree, one at a time, because the grid's row headers _are_
the breakdown tree and showing both at once would put it on screen twice.

**Work breakdown** creates, renames, moves and deletes. Moving is a select of
legal destinations rather than drag and drop: no tree or dnd package is allowed
here, a hand-rolled drag is a lot of code keyboard users cannot operate, and a
list of only-legal destinations makes an illegal move impossible to express. The
options are labelled by path, because the fixture has two "Implementation"
packages in one project and bare names left the reader guessing.

Adding a child under a package that holds allocations moves them onto the child,
in one transaction, and the form says so before you commit. Deleting says what it
will take: "1 work package and 18 allocations will go". R4 allows either moving
or refusing and forbids losing them quietly.

**Staffing grid** is twelve months and a total, in person-months, hours, % of
capacity or cost. Every assignment cell takes a value in whichever unit is on
screen; derived rows do not. A cell is flagged with a dagger when the person is
over capacity across every project - that is R5's second half.

R1's other half is the unpriced mark, and it is per month rather than per row: a
person can be unpriced in April and priced in December. Such a cell shows `0.00`
with an asterisk rather than a blank, because a blank reads as "nobody is
assigned here" instead of "these hours have no rate". Derived cells above it
carry the same mark, so a total that is short by whatever is unpriced says so
without opening the tree. Cost only - a person-month is perfectly well defined
without a rate, and marking it there would be noise about a correct number.

Staffing somebody onto a package is a row under each package that can hold
people. Without it a package created in the tree could never be staffed.

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

What crosses the boundary is one small record per person and month
(`MonthPricing` in `packages/contracts`):

```ts
interface MonthPricing {
  readonly personMonthHours: number; // weeklyHours * workingDays / 5
  readonly blendedHourlyRate: number; // weighted by working days, 0 when unpriced
  readonly hasUnpricedDays: boolean;
}
```

Two numbers convert a month in all four directions, which is why one record
serves every unit rather than one call per unit. Cost is `hours * rate` and hours
are `cost / rate`; both hold because the blended rate does not depend on the size
of the allocation.

Delivery asks for every visible pair in one call - `pricing(refs)` - and then
reads the snapshot synchronously while walking the tree. A call per cell would be
up to two thousand round trips for one grid, and nothing should reach over the
network in the middle of a render.

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

The case for person-months instead, which is stronger than it first looks: the
seed already arrives in them, the grid's default display is in them, and storing
them would make two units free of the People contract rather than one, since % of
capacity is just person-months times a hundred.

It still loses on the point above. A stored person-month only means something
once you know whose month and which month, so the number in the store is not
self-contained. A stored hour is. The conversion cost is paid at the edge, where
it is visible and tested; the ambiguity would be paid in the store, where it is
not.

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

### Rows add up exactly; columns may be off by one last place

The grid has two directions to reconcile, and they conflict. Along a row, the
total has to equal the sum of the twelve displayed months. Down a column, a
parent's month cell has to equal the sum of its children in that same month. No
independent per-row rounding satisfies both at once - fixing a row can only move
a unit sideways, which is exactly what breaks the column it moves out of.

Making both hold is two-dimensional controlled rounding: a small transportation
problem solved over the whole visible table, not a pass over each row. That is a
different algorithm and a different amount of work than this exercise asks for.

The decision is to be exact in one direction and honest about the other. Every
row is exact by construction - that is the direction R3 names, and the one a
reader checks by adding up what is in front of them. A parent's month cell can
differ from the sum of its children's month cells by one unit of the last place:
one hundredth of a person-month, one cent, six minutes of an hour. It is written
down here rather than left to be found.

### Grid keys: Tab and Enter, not arrows

A cell is a `<button>` that turns into an `<input>` when activated, so Tab
reaches every cell, Enter opens one, Enter or blur commits, Escape abandons.
Nothing is written on the way in or out of edit mode except on an explicit
commit.

A real grid of this size navigates with arrow keys and a roving tabindex - one
tab stop for the whole table, arrows moving the focused cell. That is the right
answer and it is a bigger piece of work than this exercise wants, so it is not
here. What is here is keyboard-operable, just slower to cross.

The cell is a button rather than a live input for a reason beyond keys: twelve
months by 165 rows is about two thousand inputs, and mounting them all to have
them sit idle is a lot of DOM for nothing.

### One tab at a time

An edit in a hidden panel reaches the other remote with no reload and no
navigation, because each store publishes its own changes and the contract exposes
`subscribe`. That works inside one document only.

Two browser tabs of the app would not see each other: they share the IndexedDB
database but nothing tells the second tab that the first one wrote. The answer is
`BroadcastChannel` - post the same change notification the in-page subscribers
already get, and re-read on receipt - and it is out of scope here. The
consequence is that a second tab shows stale numbers until it is reloaded.

### Cost cannot be derived from a parent's hours

Hours add up the tree; cost adds up the tree too, but it cannot be computed
anywhere except on an assignment. A leaf holding 88 hours of one person at
EUR 89.5455/h and 88 of another at EUR 120/h has 176 hours and no rate behind
them - dividing gives EUR 104.77/h, which is nobody's rate.

So every non-hours unit is computed per assignment and summed upwards.
`rollUpHours` walks the tree with no knowledge of People at all;
`rollUpInUnit(roots, unit, basisOf, horizon)` converts at the assignment rows and
adds the results. Hours need nothing from People; the other three need a basis
per person and month.

That is also the whole of the degradation. When the People contract is
unavailable, `basisOf` returns nothing, the non-hours units come out as `null`
and the grid still renders and stays editable in hours. There is no flag
anywhere - a missing basis is the flag.

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

### The shell owns the currency and the active user, and pushes them in

Both belong to the host by the exercise's own description, and both are things a
remote must not decide for itself: two panels on one page showing money in two
currencies would be a bug, and "who is signed in" has one answer for the whole
suite.

They arrive as a prop on the exposed `./App`, not through a shared module or a
global:

- A remote also runs standalone, where a prop has an obvious default
  (`DEFAULT_SESSION` - euros at par, nobody signed in) and a global would simply
  be absent.
- A React context created in the shell and read in a remote would depend on both
  sides resolving the same module instance. Federation shares one React, but that
  is a build-time coincidence to rest a feature on.
- A prop re-renders. A mutable global would need its own change notification, and
  props already have one.

Each remote turns the prop into its own context at its own root, so the value is
threaded once and read where it is used - a grid cell reads the currency itself
rather than having it passed down through two components two thousand times.

`sessionFromHost` treats the prop as input rather than fact, the same way
`readRuntimeConfig` treats the injected config. A remote is deployed separately
from its host, so an older shell may push nothing and a newer one may push a
currency this build has never heard of. Neither is worth blanking a panel over:
fall back to euros, warn once, render.

The active user is a person from the register, and the register belongs to People

- so the shell asks the People contract, over the same runtime seam the remotes
  use on each other. There is no authentication and none is scored; the picker
  stands in for what an identity provider would supply. With People unreachable the
  picker is empty and says why, and both remotes receive `user: null`, which is
  exactly what they see standalone. The shell holds only the id and derives the
  name from the register, so a rename in People reaches the header through the same
  subscription and a person removed from the register signs out on their own.

Where the user shows up: their own rows are marked in both apps, with the word
"you" rather than a colour. A plan of 165 rows and a register of sixty are both
long enough that "what am I on" is a real question.

### Money converts for display; rates do not

The stored data is in euros - rate records carry an hourly cost with no currency
on them - so the display currency is a conversion applied on the way to the
screen, and undone on the way back from an edit. The rate travels with the code
across the boundary (`{ code, perEur }`), because a remote handed only `'USD'`
would have to find a rate somewhere, and then two remotes could disagree about
what a dollar is.

The rates themselves are a fixed table in the shell, stated as of a date and
labelled indicative in the header. A live feed means a provider, a key, a refresh
policy and a stale-value story, none of which is scored. The seam is the shape:
replace the table with a fetch and nothing downstream changes.

Two details that are not cosmetic:

- **Conversion happens before the rounding, not after.** R3 says the displayed
  cells have to add up to the displayed total, and in a non-euro currency the
  displayed numbers are the converted ones. Rounding euros and converting the
  rounded figures afterwards leaves the column not adding up in every currency
  but the stored one. Checked in the browser: the twelve month cells of a row in
  USD add to the row total exactly.
- **`Intl.NumberFormat` with `style: 'currency'` is wrong here.** It uses each
  currency's own minor units, so some currencies would print three decimals and
  some none - breaking both R2's fixed 2dp for cost and the alignment of the
  grid. The symbol comes from a small table and the digits from `toFixed(2)`.

Rates in People stay in euros whatever the host selected, and the panel says so
when the display currency is not EUR. A rate is data somebody negotiated and
typed, not a figure derived for the eye. Converting it in and back out would make
what is stored depend on which currency happened to be selected, and an exchange
rate that moved would rewrite history. Derived money converts; entered rates do
not.

A bug this turned up, worth keeping in mind: with a cell mid-edit, switching the
unit or the currency used to carry the draft over, so "2767.57" typed as dollars
of cost and committed after a switch to hours was written as 2767.57 hours - the
digits survive and the meaning does not. The cell is now keyed by month, unit and
currency, so switching either closes the editor and drops the draft. A commit
only ever happens in the unit it was typed in.

### How the two remotes talk

The dependency runs both ways, which is easy to miss:

| Consumer | Needs                                                     | Owner    |
| -------- | --------------------------------------------------------- | -------- |
| Delivery | cell cost, person-month size                              | People   |
| People   | total load per person-month, for the oversubscribed badge | Delivery |

R5 asks for both halves: People shows the badge, Delivery names the assignment
that caused it. So each remote exposes a typed contract through Module Federation
and resolves the other's URL from the same runtime configuration.

Neither app needs the other to render or to accept an edit. People down means
Delivery still shows its tree and its grid and still takes edits, in hours.
Delivery down means People loses only the oversubscription badge.

Be precise about what a People outage actually costs, because it is more than
the cost column: **hours are the only unit that survives it.** A person-month is
`weeklyHours * workingDays / 5`, so its size is a property of the contract People
owns; person-months, % of capacity and cost all go through the same contract and
all become unavailable together. Hours are the canonical unit precisely because
they depend on nobody.

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

### How the images work

One `Dockerfile` builds all three apps from the workspace and then splits into
three images, selected with an `APP` build argument. The install and build layers
are shared, so `docker compose build` resolves the workspace once rather than
three times. The final stage is `nginx:alpine` with a static bundle in it -
there is no Node in the running image and none on the host.

Three services, not one, because three teams deploy three artifacts. The remotes
are published on their own ports (8081, 8082) because it is **the browser** that
fetches `remoteEntry.js`, not the shell's container: an address that only
resolves inside the compose network would work for server-to-server traffic and
fail here.

`config.js` is generated at container start by a script in
`/docker-entrypoint.d`, which the nginx image runs before starting the server -
so no `ENTRYPOINT` of our own, and the image keeps its own signal handling. The
script reads `PEOPLE_URL` and `DELIVERY_URL` and refuses to start without them,
because a missing address is a deployment mistake, not a runtime condition to
recover from. That file is what makes the same three images run in any
environment, and it is why no URL appears in any bundle.

Two nginx details that are not decoration:

- **CORS on the remotes.** A hosted remote's assets are fetched by a page served
  from the shell's origin. Scripts would load cross-origin without a header, but
  `fetch` would not - and each remote fetches the seed fixture on first run, so
  the first hosted run would fail to seed itself. Wide open here on purpose:
  everything served is a public static bundle, and which shells may host a remote
  is not a decision a static file server can make.
- **`remoteEntry.js` is never cached.** Its name is stable and its content
  changes with every deploy of that remote, so caching it would pin a host to a
  remote's previous build. Hashed chunks get a year; `index.html` and `config.js`
  get `no-store`.

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

- **Two-dimensional reconciliation in the grid.** Rows are exact, columns can be
  one last place out. The reasoning is above; the algorithm is not here.
- **Cross-tab updates.** In-page subscriptions only, no `BroadcastChannel`.
- **Arrow-key grid navigation.** Tab and Enter work; a roving tabindex does not
  exist.
- **Live exchange rates and real authentication.** The shell's currency table is
  fixed and dated, and the active user is picked from the register rather than
  supplied by an identity provider. Both are stubs with the right shape.
