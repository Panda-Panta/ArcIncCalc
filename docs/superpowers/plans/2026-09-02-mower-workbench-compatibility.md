# Mower-Compatible Roster Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Mower-compatible RIIC roster workbench for the shift-run edition and connect its main/sub-plan schedule to the existing morale and long-term daily-yield engine.

**Architecture:** Add a framework-independent workspace model, a lossless Mower compatibility layer, and a single simulation adapter in front of the current `AppConfig` engine. Vue components edit only the workspace store; an event-driven timeline compiles effective plans into calculation intervals without importing any Mower automation backend.

**Tech Stack:** Vue 3.5, TypeScript 5.9 strict mode, Pinia, Naive UI, pinyin-pro, vue-slicksort, html-to-image, Vitest, Vue Test Utils, jsdom, Vite 7, pnpm 11.

**Spec:** `docs/superpowers/specs/2026-09-02-mower-workbench-compatibility-design.md`

## Global Constraints

- Work only on branch `mode/shift-run`; do not modify the standard edition branch.
- Preserve the existing efficiency, morale, global-resource, drone, and shift-run order algorithms as the calculation source of truth.
- Use Mower room IDs in workspace state and map the nine output rooms to `B1` through `B9` only inside the simulation adapter.
- Store sub-plans as complete snapshots and evaluate simultaneously true sub-plans in displayed order.
- Support ordered replacements while preserving schema-v7 one-to-one backup data during migration.
- Never execute imported trigger text with `eval`, `Function`, or another dynamic-code mechanism.
- Keep unsupported Mower automation fields losslessly round-trippable and label them as excluded from yield simulation.
- Keep drone capacity at a default of 235 and calculate long-term output as a daily average.
- Preserve substantial copied Mower code under the MIT license with `Copyright (c) 2021 Nano` attribution.
- Each task uses test-first development and commits only its own files; preserve unrelated dirty-worktree changes.

## File Structure

- `src/workbench/model.ts`: persistent workspace types and room constants.
- `src/workbench/defaults.ts`: deterministic default workspace and facility factories.
- `src/workbench/migrate.ts`: schema-v7 `AppConfig` to schema-v8 workspace migration.
- `src/workbench/validate.ts`: structured workspace validation issues.
- `src/workbench/compat/mower.ts`: lossless Mower JSON import/export.
- `src/workbench/store.ts`: Pinia editor commands and local persistence boundary.
- `src/workbench/adapter.ts`: workspace plan to `AppConfig` and compiled-scenario conversion.
- `src/workbench/trigger.ts`: typed trigger AST, parser, serializer, and safe evaluator.
- `src/workbench/tasks.ts`: scheduled task normalization and room override semantics.
- `src/workbench/timeline.ts`: sub-plan selection and event-driven roster simulation.
- `src/workbench/report.ts`: interval aggregation into daily-average report.
- `src/components/workbench/WorkbenchShell.vue`: workbench page composition.
- `src/components/workbench/PlanToolbar.vue`: main/sub-plan and file actions.
- `src/components/workbench/BaseMap.vue`: complete facility map and output-room swapping.
- `src/components/workbench/FacilityEditor.vue`: selected facility and slot editing.
- `src/components/workbench/OperatorSelect.vue`: Mower-style searchable operator selector.
- `src/components/workbench/ReplacementList.vue`: ordered replacements.
- `src/components/workbench/TriggerDialog.vue`: typed trigger editor.
- `src/components/workbench/TaskDialog.vue`: room task override editor.
- `src/components/workbench/PolicyEditor.vue`: per-plan policy editor and simulation labels.
- `src/components/workbench/ValidationPanel.vue`: navigable errors and warnings.
- `src/components/CalculationReport.vue`: extracted existing yield-report UI.
- `src/workbench/styles.css`: workbench layout, Mower-compatible visual language, and responsive rules.
- `THIRD_PARTY_NOTICES.md`: Mower MIT attribution and reused-file inventory.

---

### Task 1: Install UI/Test Dependencies and Define the Workspace Model

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/main.ts`
- Create: `src/workbench/model.ts`
- Create: `src/workbench/defaults.ts`
- Test: `src/workbench/defaults.spec.ts`

**Interfaces:**
- Consumes: existing operator IDs and `ManufactureProduct`, `TradeStrategy` domain values.
- Produces: `MOWER_ROOM_IDS`, `MowerRoomId`, `RosterSlot`, `RosterFacility`, `RosterPlan`, `RosterSubPlan`, `ScheduledRosterTask`, `RosterWorkspace`, `SimulationSettings`, and `createDefaultWorkspace(): RosterWorkspace`.

- [ ] **Step 1: Add the failing default-workspace test**

```ts
import { describe, expect, it } from 'vitest'
import { MOWER_OUTPUT_ROOM_IDS } from './model'
import { createDefaultWorkspace } from './defaults'

describe('createDefaultWorkspace', () => {
  it('creates a 243 main plan with all stable Mower room ids', () => {
    const workspace = createDefaultWorkspace()
    expect(workspace.schemaVersion).toBe(8)
    expect(Object.keys(workspace.mainPlan.facilities)).toHaveLength(21)
    expect(MOWER_OUTPUT_ROOM_IDS.map((id) => workspace.mainPlan.facilities[id].type))
      .toEqual(['manufacture', 'manufacture', 'manufacture', 'manufacture', 'trading', 'trading', 'power', 'power', 'power'])
    expect(workspace.simulation.droneCapacity).toBe(235)
    expect(workspace.subPlans).toEqual([])
  })
})
```

- [ ] **Step 2: Run the focused test and confirm the missing module failure**

Run: `pnpm vitest run src/workbench/defaults.spec.ts`

Expected: FAIL because `./model` and `./defaults` do not exist.

- [ ] **Step 3: Install dependencies and implement the model/default factories**

Run:

```powershell
pnpm add naive-ui pinia pinyin-pro vue-slicksort html-to-image
pnpm add -D @vue/test-utils jsdom tsx
```

Define explicit discriminated unions for `operator`, `free`, `current`, and `empty` occupants. Define the 21 room IDs as `as const`; create every room in `createDefaultWorkspace()` with a fresh slots array and no shared object references. Update `src/main.ts` to call `app.use(createPinia())` before mounting.

- [ ] **Step 4: Run model tests and static checks**

Run: `pnpm vitest run src/workbench/defaults.spec.ts && pnpm typecheck`

Expected: PASS with no TypeScript diagnostics.

- [ ] **Step 5: Commit the workspace foundation**

```powershell
git add package.json pnpm-lock.yaml src/main.ts src/workbench/model.ts src/workbench/defaults.ts src/workbench/defaults.spec.ts
git commit -m "feat: define roster workspace model"
```

### Task 2: Migrate Schema-v7 Calculator Configurations

**Files:**
- Create: `src/workbench/migrate.ts`
- Test: `src/workbench/migrate.spec.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/domain/defaults.ts`

**Interfaces:**
- Consumes: `AppConfig`, `RosterWorkspace`, and `createDefaultWorkspace()`.
- Produces: `migrateAppConfig(config: AppConfig): RosterWorkspace` and `isLegacyAppConfig(value: unknown): value is AppConfig`.

- [ ] **Step 1: Write migration tests for rooms, groups, and replacements**

```ts
it('preserves v7 assignments, cross-room groups, and one-to-one backups', () => {
  const legacy = createDefaultConfig()
  legacy.rooms[0]!.operatorIds = ['char_1', 'char_2']
  legacy.rooms[1]!.operatorIds = ['char_3']
  legacy.operatorGroups = [{ id: 'night', name: '夜班', operatorIds: ['char_1', 'char_3'] }]
  legacy.operatorBackups = { char_1: 'char_4' }

  const workspace = migrateAppConfig(legacy)

  expect(workspace.mainPlan.facilities.room_1_1.slots[0]).toMatchObject({
    occupant: { kind: 'operator', operatorId: 'char_1' },
    groupId: 'night',
    replacements: ['char_4'],
  })
  expect(workspace.mainPlan.facilities.room_1_2.slots[0]!.groupId).toBe('night')
})
```

- [ ] **Step 2: Verify migration tests fail**

Run: `pnpm vitest run src/workbench/migrate.spec.ts`

Expected: FAIL because `migrateAppConfig` is missing.

- [ ] **Step 3: Implement guarded migration without deleting legacy storage**

Map `config.rooms[index]` through `MOWER_OUTPUT_ROOM_IDS[index]`, map support facilities to their stable IDs, convert backups to a one-item replacement list, and copy simulation settings. Keep `AppConfig.schemaVersion` at 7 for the legacy engine; schema 8 belongs only to `RosterWorkspace`.

- [ ] **Step 4: Run migration and existing domain tests**

Run: `pnpm vitest run src/workbench/migrate.spec.ts src/domain/edition.spec.ts src/engine/rosterEditor.spec.ts`

Expected: PASS; the edition remains `shift-run`.

- [ ] **Step 5: Commit migration support**

```powershell
git add src/workbench/migrate.ts src/workbench/migrate.spec.ts src/domain/types.ts src/domain/defaults.ts
git commit -m "feat: migrate legacy rosters to workspace schema"
```

### Task 3: Add Structured Validation

**Files:**
- Create: `src/workbench/validate.ts`
- Test: `src/workbench/validate.spec.ts`

**Interfaces:**
- Consumes: `RosterWorkspace` and operator IDs.
- Produces: `ValidationIssue`, `ValidationSeverity`, and `validateWorkspace(workspace: RosterWorkspace): ValidationIssue[]`.

- [ ] **Step 1: Write location-aware validation tests**

```ts
it('reports duplicate workers and replacement conflicts at exact slots', () => {
  const workspace = createDefaultWorkspace()
  const first = workspace.mainPlan.facilities.room_1_1.slots[0]!
  const second = workspace.mainPlan.facilities.room_1_2.slots[0]!
  first.occupant = { kind: 'operator', operatorId: 'char_a' }
  second.occupant = { kind: 'operator', operatorId: 'char_a' }
  first.replacements = ['char_a']

  expect(validateWorkspace(workspace)).toEqual(expect.arrayContaining([
    expect.objectContaining({ severity: 'error', code: 'duplicate-active', roomId: 'room_1_2', slotIndex: 0 }),
    expect.objectContaining({ severity: 'error', code: 'replacement-is-active', roomId: 'room_1_1', slotIndex: 0 }),
  ]))
})
```

- [ ] **Step 2: Confirm the validation test fails**

Run: `pnpm vitest run src/workbench/validate.spec.ts`

Expected: FAIL because `validateWorkspace` is missing.

- [ ] **Step 3: Implement errors, warnings, and informational diagnostics**

Return immutable issues containing `planId`, `roomId`, `slotIndex`, `code`, `severity`, and Chinese `message`. Include capacity, duplicate-active, replacement overlap, power shortage, unknown operator, unexecutable trigger, unreachable sub-plan, empty replacement, drone overflow risk, and gold imbalance rules. Only `error` blocks report totals.

- [ ] **Step 4: Run validation and legacy layout tests**

Run: `pnpm vitest run src/workbench/validate.spec.ts src/engine/calculate.spec.ts`

Expected: PASS without weakening existing validation.

- [ ] **Step 5: Commit validation**

```powershell
git add src/workbench/validate.ts src/workbench/validate.spec.ts
git commit -m "feat: validate roster workspaces"
```

### Task 4: Implement Lossless Mower JSON Compatibility

**Files:**
- Create: `src/workbench/compat/mower.ts`
- Test: `src/workbench/compat/mower.spec.ts`
- Test fixture: `src/workbench/compat/fixtures/mower-minimal.json`

**Interfaces:**
- Consumes: `RosterWorkspace`, `OPERATOR_MAP`, and workspace defaults.
- Produces: `importMowerWorkspace(text: string): ImportResult` and `exportMowerWorkspace(workspace: RosterWorkspace): string`.

- [ ] **Step 1: Add round-trip and unknown-field tests**

```ts
it('round-trips unknown Mower fields while resolving operator names', () => {
  const source = JSON.stringify({
    plan: { room_1_1: { name: '制造站', product: 'gold', plans: [{ agent: '温蒂', group: '自动化', replacement: ['森蚺'] }] } },
    backup_plans: [],
    custom_future_flag: { enabled: true },
  })
  const imported = importMowerWorkspace(source)
  expect(imported.errors).toEqual([])
  expect(imported.workspace!.mainPlan.facilities.room_1_1.slots[0]!.occupant.kind).toBe('operator')
  expect(JSON.parse(exportMowerWorkspace(imported.workspace!)).custom_future_flag).toEqual({ enabled: true })
})
```

- [ ] **Step 2: Verify compatibility tests fail**

Run: `pnpm vitest run src/workbench/compat/mower.spec.ts`

Expected: FAIL because the compatibility module does not exist.

- [ ] **Step 3: Implement parse, normalize, preserve, and serialize stages**

Return `{ workspace, errors, warnings }`; never throw for user-controlled JSON. Store unknown root, plan, sub-plan, facility, policy, trigger, and task fields in explicit compatibility envelopes. Preserve unresolved names as warnings and raw values. Export known fields from current state and merge unknown fields without allowing old known values to overwrite edits.

- [ ] **Step 4: Test against the three user-supplied Mower plans**

Run:

```powershell
pnpm vitest run src/workbench/compat/mower.spec.ts
pnpm tsx scripts/check-mower-import.mts "E:/OneDrive/Mower/252二赤金Test.json" "E:/OneDrive/Mower/252三赤金.json" "E:/OneDrive/Mower/252二赤金.json"
```

Expected: all files parse; unresolved or unsupported fields are warnings, not data loss. Add `scripts/check-mower-import.mts` in this step and assert imported/exported main-plan room keys match.

- [ ] **Step 5: Commit compatibility support**

```powershell
git add src/workbench/compat scripts/check-mower-import.mts
git commit -m "feat: import and export Mower rosters"
```

### Task 5: Implement Atomic Workspace Editing Commands

**Files:**
- Create: `src/workbench/store.ts`
- Test: `src/workbench/store.spec.ts`

**Interfaces:**
- Consumes: defaults, compatibility import/export, and validation.
- Produces: `useRosterWorkspaceStore()` with `selectPlan`, `createSubPlan`, `cloneSubPlan`, `renameSubPlan`, `deleteSubPlan`, `moveSubPlan`, `swapOutputRooms`, `setOccupant`, `setGroup`, `setReplacements`, `replaceOperatorEverywhere`, `importWorkspace`, and `resetWorkspace` actions.

- [ ] **Step 1: Test transactional room swapping across every reference**

```ts
it('swaps rooms in plans, triggers, and tasks as one action', () => {
  const store = createTestWorkspaceStore()
  store.createSubPlan('夜班')
  const sub = store.workspace.subPlans[0]!
  sub.trigger = roomEqualsTrigger('room_1_1')
  sub.task = { room_1_1: ['Current'] }

  store.swapOutputRooms('room_1_1', 'room_3_3')

  expect(readTriggerRoom(sub.trigger)).toBe('room_3_3')
  expect(sub.task).toEqual({ room_3_3: ['Current'] })
  expect(store.history.at(-1)?.kind).toBe('swap-output-rooms')
})
```

- [ ] **Step 2: Confirm store tests fail**

Run: `pnpm vitest run src/workbench/store.spec.ts`

Expected: FAIL because the Pinia store is missing.

- [ ] **Step 3: Implement commands with clone-before-commit semantics**

Every multi-object action edits a `structuredClone` candidate, validates invariants, then replaces store state. Global replacement must update active occupants and all ordered replacements in main/sub-plans while leaving operator IDs embedded in unknown compatibility fields untouched.

- [ ] **Step 4: Run store tests**

Run: `pnpm vitest run src/workbench/store.spec.ts src/workbench/validate.spec.ts`

Expected: PASS, including rollback when an invalid room ID is supplied.

- [ ] **Step 5: Commit the editor store**

```powershell
git add src/workbench/store.ts src/workbench/store.spec.ts
git commit -m "feat: add atomic roster editor commands"
```

### Task 6: Compile a Fixed Workspace Plan to the Existing Engine

**Files:**
- Create: `src/workbench/adapter.ts`
- Test: `src/workbench/adapter.spec.ts`
- Modify: `src/engine/calculate.ts`
- Modify: `src/engine/calculate.spec.ts`

**Interfaces:**
- Consumes: `RosterPlan`, `SimulationSettings`, `AppConfig`, and `calculate(config)`.
- Produces: `compilePlan(plan: RosterPlan, settings: SimulationSettings): AppConfig` and `compileWorkspace(workspace: RosterWorkspace, horizonHours: number): CompiledRosterScenario`.

- [ ] **Step 1: Write fixed-plan parity tests**

```ts
it('produces the same room efficiencies as the equivalent legacy config', () => {
  const legacy = configuredAutomationPlan()
  const workspace = migrateAppConfig(legacy)
  const compiled = compilePlan(workspace.mainPlan, workspace.simulation)

  expect(calculate(compiled).manufacture.map((room) => room.efficiency))
    .toEqual(calculate(legacy).manufacture.map((room) => room.efficiency))
})
```

- [ ] **Step 2: Verify the parity test fails**

Run: `pnpm vitest run src/workbench/adapter.spec.ts`

Expected: FAIL because `compilePlan` is missing.

- [ ] **Step 3: Implement the only Mower-ID to B-room mapping seam**

Convert output facilities in `MOWER_OUTPUT_ROOM_IDS` order, convert support assignments, groups, first replacements, initial morale, global resources, drone target, and plan policies. Reject `free` and unresolved occupants at this fixed-plan boundary with structured compile issues; preserve `current` only in timeline compilation.

- [ ] **Step 4: Run adapter and calculation regression tests**

Run: `pnpm vitest run src/workbench/adapter.spec.ts src/engine/calculate.spec.ts src/engine/operatorRules.spec.ts src/engine/morale.spec.ts`

Expected: PASS with exact fixed-plan efficiency parity.

- [ ] **Step 5: Commit the adapter**

```powershell
git add src/workbench/adapter.ts src/workbench/adapter.spec.ts src/engine/calculate.ts src/engine/calculate.spec.ts
git commit -m "feat: compile roster plans for calculation"
```

### Task 7: Build the Workbench Shell and Plan Toolbar

**Files:**
- Create: `src/components/workbench/WorkbenchShell.vue`
- Create: `src/components/workbench/PlanToolbar.vue`
- Create: `src/components/workbench/ValidationPanel.vue`
- Create: `src/components/CalculationReport.vue`
- Create: `src/workbench/styles.css`
- Test: `src/components/workbench/PlanToolbar.spec.ts`
- Modify: `src/App.vue`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `useRosterWorkspaceStore()` actions and validation issues.
- Produces: a mounted workbench page with selected-plan toolbar events and an extracted calculation report component.

- [ ] **Step 1: Write a toolbar behavior test**

```ts
it('creates, renames, orders, and deletes sub-plans through store actions', async () => {
  const wrapper = mountWorkbenchWithPinia()
  await wrapper.get('[data-test=create-sub-plan]').trigger('click')
  expect(useRosterWorkspaceStore().workspace.subPlans).toHaveLength(1)
  await wrapper.get('[data-test=move-sub-plan-up]').trigger('click')
  expect(wrapper.get('[data-test=plan-select]').exists()).toBe(true)
})
```

- [ ] **Step 2: Run the component test in jsdom**

Run: `pnpm vitest run --environment jsdom src/components/workbench/PlanToolbar.spec.ts`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the shell without moving calculation logic into Vue**

Extract the current result markup from `App.vue` into `CalculationReport.vue`. Mount `PlanToolbar`, a map/editor slot, `ValidationPanel`, policies slot, calculate action, and report. Use Naive UI providers in `App.vue`; file import uses an invisible `<input type="file" accept="application/json">` and displays import diagnostics before replacing state.

- [ ] **Step 4: Run component tests, typecheck, and build**

Run: `pnpm vitest run --environment jsdom src/components/workbench/PlanToolbar.spec.ts && pnpm typecheck && pnpm build`

Expected: PASS and a production bundle is generated.

- [ ] **Step 5: Commit the shell**

```powershell
git add src/App.vue src/main.ts src/components/CalculationReport.vue src/components/workbench/WorkbenchShell.vue src/components/workbench/PlanToolbar.vue src/components/workbench/ValidationPanel.vue src/components/workbench/PlanToolbar.spec.ts src/workbench/styles.css
git commit -m "feat: add roster workbench shell"
```

### Task 8: Implement the Complete Base Map and Facility Editor

**Files:**
- Create: `src/components/workbench/BaseMap.vue`
- Create: `src/components/workbench/FacilityEditor.vue`
- Test: `src/components/workbench/BaseMap.spec.ts`
- Modify: `src/components/workbench/WorkbenchShell.vue`
- Modify: `src/workbench/styles.css`

**Interfaces:**
- Consumes: selected plan, `swapOutputRooms`, and facility mutations from the store.
- Produces: all 21 Mower room cards, stable selection, output-room drag exchange, and level/product/type editing.

- [ ] **Step 1: Write map rendering and swap tests**

```ts
it('renders every facility and swaps output rooms through one store command', async () => {
  const wrapper = mountBaseMap()
  expect(wrapper.findAll('[data-room-id]')).toHaveLength(21)
  await dragRoom(wrapper, 'room_1_1', 'room_3_3')
  expect(useRosterWorkspaceStore().history.at(-1)).toMatchObject({
    kind: 'swap-output-rooms', source: 'room_1_1', target: 'room_3_3',
  })
})
```

- [ ] **Step 2: Confirm map tests fail**

Run: `pnpm vitest run --environment jsdom src/components/workbench/BaseMap.spec.ts`

Expected: FAIL because `BaseMap.vue` is missing.

- [ ] **Step 3: Port Mower layout semantics and product visuals**

Render the 3×3 output grid separately from central/support rooms while preserving the visual adjacency. Cards show type, product, occupants, group name/stripe, and selected state. Restrict drag targets to output rooms and call only `swapOutputRooms`; do not mutate props directly.

- [ ] **Step 4: Run map tests and build**

Run: `pnpm vitest run --environment jsdom src/components/workbench/BaseMap.spec.ts && pnpm typecheck && pnpm build`

Expected: PASS at 21 facilities with no direct-state mutation warning.

- [ ] **Step 5: Commit map/editor UI**

```powershell
git add src/components/workbench/BaseMap.vue src/components/workbench/FacilityEditor.vue src/components/workbench/BaseMap.spec.ts src/components/workbench/WorkbenchShell.vue src/workbench/styles.css
git commit -m "feat: add Mower-style base map editor"
```

### Task 9: Add the Mower-Style Operator, Group, and Replacement Editor

**Files:**
- Create: `src/components/workbench/OperatorSelect.vue`
- Create: `src/components/workbench/ReplacementList.vue`
- Test: `src/components/workbench/OperatorSelect.spec.ts`
- Test: `src/components/workbench/ReplacementList.spec.ts`
- Modify: `src/components/workbench/FacilityEditor.vue`
- Modify: `src/workbench/styles.css`

**Interfaces:**
- Consumes: `OPERATORS`, pinyin-pro, room type, reserved assignment map, and store slot actions.
- Produces: name/pinyin search, room-skill summaries, conflict-disabled options, `Free`/`Current`/empty choices, group editing, and ordered replacement changes.

- [ ] **Step 1: Test pinyin search and replacement ordering**

```ts
it('finds operators by pinyin and exposes their relevant RIIC skills', async () => {
  const wrapper = mountOperatorSelect({ roomType: 'manufacture' })
  await wrapper.get('input').setValue('wendi')
  expect(wrapper.text()).toContain('温蒂')
  expect(wrapper.text()).toContain('仿生海龙')
})

it('emits the exact reordered replacement ids', async () => {
  const wrapper = mountReplacementList(['char_a', 'char_b'])
  await moveReplacement(wrapper, 1, 0)
  expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([['char_b', 'char_a']])
})
```

- [ ] **Step 2: Confirm selector tests fail**

Run: `pnpm vitest run --environment jsdom src/components/workbench/OperatorSelect.spec.ts src/components/workbench/ReplacementList.spec.ts`

Expected: FAIL because the components are missing.

- [ ] **Step 3: Implement compact Mower interaction rules**

Compute a normalized search key from operator name and pinyin. Show only skills relevant to the selected facility first, then other skills collapsed. Disable active conflicts with a visible room label. Keep replacements sortable and unique; reject the current occupant and every active occupant in the same plan. Group names remain visible in addition to color stripes.

- [ ] **Step 4: Run selector tests and typecheck**

Run: `pnpm vitest run --environment jsdom src/components/workbench/OperatorSelect.spec.ts src/components/workbench/ReplacementList.spec.ts && pnpm typecheck`

Expected: PASS, including keyboard selection and outside-click closing.

- [ ] **Step 5: Commit roster editing UI**

```powershell
git add src/components/workbench/OperatorSelect.vue src/components/workbench/ReplacementList.vue src/components/workbench/OperatorSelect.spec.ts src/components/workbench/ReplacementList.spec.ts src/components/workbench/FacilityEditor.vue src/workbench/styles.css
git commit -m "feat: add Mower-style roster slot editor"
```

### Task 10: Implement Safe Trigger Parsing and Evaluation

**Files:**
- Create: `src/workbench/trigger.ts`
- Test: `src/workbench/trigger.spec.ts`
- Create: `src/components/workbench/TriggerDialog.vue`
- Test: `src/components/workbench/TriggerDialog.spec.ts`
- Modify: `src/components/workbench/PlanToolbar.vue`

**Interfaces:**
- Consumes: Mower `{ left, operator, right }` trigger values and `TriggerContext`.
- Produces: `parseMowerTrigger(value: unknown): TriggerParseResult`, `serializeMowerTrigger(node: TriggerNode): unknown`, `evaluateTrigger(node: TriggerNode, context: TriggerContext): boolean`, and `rewriteTriggerRoom(node, source, target): TriggerNode`.

- [ ] **Step 1: Write parser/evaluator safety tests**

```ts
it('evaluates nested morale and room conditions without executing source text', () => {
  const parsed = parseMowerTrigger({
    left: "op_data.operators['温蒂'].current_mood()",
    operator: '<=',
    right: 3,
  })
  expect(parsed.errors).toEqual([])
  expect(evaluateTrigger(parsed.node!, contextWith({ name: '温蒂', morale: 2, roomId: 'room_1_1' }))).toBe(true)
})

it('rejects executable JavaScript as an opaque unsupported value', () => {
  const parsed = parseMowerTrigger('globalThis.fetch("https://example.invalid")')
  expect(parsed.node).toBeNull()
  expect(parsed.errors[0]!.code).toBe('unsupported-trigger-string')
})
```

- [ ] **Step 2: Verify trigger tests fail**

Run: `pnpm vitest run src/workbench/trigger.spec.ts`

Expected: FAIL because the trigger module is missing.

- [ ] **Step 3: Implement a closed AST and recursive evaluator**

Support only `and`, `or`, equality/ordering comparisons, `+`, `-`, constants, operator working/resting/room/morale selectors, and simulation time. Parse recognized Mower strings with anchored regular expressions. Return errors for every unknown operator or selector. Implement the dialog by recursively editing AST nodes and showing the serialized JSON preview.

- [ ] **Step 4: Run logic and component tests**

Run: `pnpm vitest run --environment jsdom src/workbench/trigger.spec.ts src/components/workbench/TriggerDialog.spec.ts`

Expected: PASS; the unsafe input remains inert.

- [ ] **Step 5: Commit trigger support**

```powershell
git add src/workbench/trigger.ts src/workbench/trigger.spec.ts src/components/workbench/TriggerDialog.vue src/components/workbench/TriggerDialog.spec.ts src/components/workbench/PlanToolbar.vue
git commit -m "feat: add safe roster trigger editor"
```

### Task 11: Add Task Overrides and Per-Plan Policies

**Files:**
- Create: `src/components/workbench/TaskDialog.vue`
- Create: `src/components/workbench/PolicyEditor.vue`
- Test: `src/components/workbench/TaskDialog.spec.ts`
- Create: `src/workbench/tasks.ts`
- Test: `src/workbench/tasks.spec.ts`
- Modify: `src/workbench/model.ts`
- Modify: `src/workbench/store.ts`
- Modify: `src/components/workbench/WorkbenchShell.vue`

**Interfaces:**
- Consumes: sub-plan room tasks, special occupant values, and `RosterPolicies`.
- Produces: `applyTaskOverride(previous: EffectiveRoster, plan: RosterPlan, task: RosterTask): EffectiveRoster`, ordered `ScheduledRosterTask` records with absolute simulation-hour timestamps, and editors that distinguish simulated, automation-only, and unknown settings.

- [ ] **Step 1: Test `Current`, `Free`, and unsupported task behavior**

```ts
it('keeps Current, resolves Free from replacements, and preserves automation-only tasks', () => {
  const result = applyTaskOverride(previousRoster('char_a'), planWithReplacement('char_b'), {
    room_1_1: ['Current', 'Free'],
    __compatibility: { task_type: '加工材料', meta_data: '年' },
  })
  expect(result.rooms.room_1_1).toEqual(['char_a', 'char_b'])
  expect(result.compatibility.task_type).toBe('加工材料')
})

it('orders scheduled room overrides by simulation hour and stable task id', () => {
  const tasks = normalizeScheduledTasks([
    { id: 'second', atHour: 12, roomTask: { room_1_1: ['Current'] } },
    { id: 'first', atHour: 6, roomTask: { room_1_2: ['Free'] } },
  ])
  expect(tasks.map((task) => task.id)).toEqual(['first', 'second'])
})
```

- [ ] **Step 2: Confirm task tests fail**

Run: `pnpm vitest run --environment jsdom src/components/workbench/TaskDialog.spec.ts src/workbench/tasks.spec.ts`

Expected: FAIL because task application and dialog are missing.

- [ ] **Step 3: Implement room overrides and policy classification**

Resolve `Current` by slot index from the previous effective roster. Resolve `Free` from the first available ordered replacement, otherwise emit an empty-seat warning. Store scheduled tasks as `{ id, atHour, roomTask, taskType, metadata, compatibility }`, sort by `atHour` and stable ID, and expose task time in the dialog. Render every policy with one of `参与模拟`, `仅保留给 Mower`, or `未知兼容字段`; never silently apply automation-only fields.

- [ ] **Step 4: Run task/store/component tests**

Run: `pnpm vitest run --environment jsdom src/components/workbench/TaskDialog.spec.ts src/workbench/tasks.spec.ts src/workbench/store.spec.ts && pnpm typecheck`

Expected: PASS and unsupported fields survive store edits.

- [ ] **Step 5: Commit tasks and policies**

```powershell
git add src/components/workbench/TaskDialog.vue src/components/workbench/PolicyEditor.vue src/components/workbench/TaskDialog.spec.ts src/workbench/tasks.ts src/workbench/tasks.spec.ts src/workbench/model.ts src/workbench/store.ts src/components/workbench/WorkbenchShell.vue
git commit -m "feat: edit roster tasks and policies"
```

### Task 12: Extract a Reusable Morale Kernel and Add the Event Timeline

**Files:**
- Modify: `src/engine/morale.ts`
- Modify: `src/engine/morale.spec.ts`
- Create: `src/engine/moraleKernel.ts`
- Create: `src/engine/moraleKernel.spec.ts`
- Create: `src/workbench/timeline.ts`
- Test: `src/workbench/timeline.spec.ts`

**Interfaces:**
- Consumes: `CompiledRosterScenario`, trigger evaluator, group IDs, ordered replacements, and existing operator morale rules.
- Produces: `createMoraleKernel(initial: MoraleKernelInput): MoraleKernel`, `simulateRosterTimeline(scenario: CompiledRosterScenario): TimelineResult`, and interval records `{ start, end, planId, config, activeOperatorIds, events }`.

- [ ] **Step 1: Lock existing morale behavior with a kernel equivalence test**

```ts
it('preserves existing fixed-roster morale averages after kernel extraction', () => {
  const config = configuredGroupedRoster()
  const before = simulateMorale(config, { warmupHours: 24, sampleHours: 72 })
  const after = simulateMoraleWithKernel(config, { warmupHours: 24, sampleHours: 72 })
  expect(after.averageEfficiencyPercent).toEqual(before.averageEfficiencyPercent)
  expect(after.averagePowerBonusPercent).toBeCloseTo(before.averagePowerBonusPercent, 10)
})
```

- [ ] **Step 2: Write timeline ordering and strict-group tests**

```ts
it('evaluates trigger stages in order and picks the first true sub-plan', () => {
  const result = simulateRosterTimeline(twoTrueSubPlansScenario())
  expect(result.events[0]).toMatchObject({ stage: 'BEGINNING', toPlanId: 'sub-first' })
  expect(result.intervals[0]!.planId).toBe('sub-first')
})

it('does not partially switch a cross-room group when one replacement is unavailable', () => {
  const result = simulateRosterTimeline(blockedGroupScenario())
  expect(result.events).toContainEqual(expect.objectContaining({ kind: 'group-switch-blocked' }))
  expect(result.intervals.at(-1)!.activeOperatorIds).toEqual(expect.arrayContaining(['char_a', 'char_b']))
})
```

- [ ] **Step 3: Verify new tests fail before refactoring**

Run: `pnpm vitest run src/engine/moraleKernel.spec.ts src/workbench/timeline.spec.ts`

Expected: FAIL because the kernel and timeline do not exist.

- [ ] **Step 4: Extract rate/boundary transitions, then implement event stepping**

Move rate calculation, boundary discovery, morale advance, dorm recovery, and operator-state mutation into `MoraleKernel` without changing formulas. The timeline selects the minimum next boundary, recovery completion, explicit task time, trigger-observable transition, or horizon. At each event evaluate `BEGINNING`, departures, `BEFORE_PLANNING`, replacements, `AFTER_PLANNING`, interval accumulation, then `END`. Enforce one committed plan change per stage/time pair.

- [ ] **Step 5: Run morale and timeline regressions**

Run: `pnpm vitest run src/engine/morale.spec.ts src/engine/moraleKernel.spec.ts src/workbench/timeline.spec.ts`

Expected: PASS with fixed-roster results unchanged and no zero-duration loop.

- [ ] **Step 6: Commit the event engine**

```powershell
git add src/engine/morale.ts src/engine/morale.spec.ts src/engine/moraleKernel.ts src/engine/moraleKernel.spec.ts src/workbench/timeline.ts src/workbench/timeline.spec.ts
git commit -m "feat: simulate event-driven roster timelines"
```

### Task 13: Aggregate Intervals into Long-Term Daily Yield

**Files:**
- Create: `src/workbench/report.ts`
- Test: `src/workbench/report.spec.ts`
- Modify: `src/engine/calculate.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/components/workbench/WorkbenchShell.vue`
- Modify: `src/components/CalculationReport.vue`

**Interfaces:**
- Consumes: `TimelineResult`, static interval output, power/drone state, and existing manufacture/trade formulas.
- Produces: `calculateStaticInterval(config, hours, state): IntervalCalculation`, `aggregateIntervals(intervals): WorkspaceCalculationReport`, `calculateWorkspace(workspace): WorkspaceCalculationReport`, daily averages, plan-switch events, efficiency traces, and room shift details.

- [ ] **Step 1: Write aggregation invariance tests**

```ts
it('returns the same daily output when an unchanged interval is split', () => {
  const one = aggregateIntervals([fixedInterval(0, 48)])
  const split = aggregateIntervals([fixedInterval(0, 12), fixedInterval(12, 48)])
  expect(split.summary).toEqual(one.summary)
})

it('caps drones at 235 and reports discarded charge', () => {
  const report = calculateWorkspace(idleDroneWorkspace({ horizonHours: 48, droneCapacity: 235 }))
  expect(report.drone.peakStored).toBe(235)
  expect(report.drone.discarded).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Verify report tests fail**

Run: `pnpm vitest run src/workbench/report.spec.ts`

Expected: FAIL because interval aggregation is missing.

- [ ] **Step 3: Separate static interval formulas from fixed-roster morale sampling**

Refactor `calculate()` to remain a backward-compatible wrapper. `calculateStaticInterval` receives already-decided active operators and duration, advances drone storage continuously, applies the existing shift-run special order at order-generation boundaries, and returns raw totals. `calculateWorkspace` sums raw totals and divides by `horizonHours / 24`; it never averages pre-rounded daily values.

- [ ] **Step 4: Run all engine and workspace tests**

Run: `pnpm vitest run src/engine src/workbench`

Expected: PASS; fixed legacy reports remain within `1e-9` for deterministic quantities.

- [ ] **Step 5: Commit long-term reporting**

```powershell
git add src/workbench/report.ts src/workbench/report.spec.ts src/engine/calculate.ts src/domain/types.ts src/components/workbench/WorkbenchShell.vue src/components/CalculationReport.vue
git commit -m "feat: calculate long-term roster yield"
```

### Task 14: Add Persistence, Import Preview, Global Replacement, and Image Export

**Files:**
- Modify: `src/workbench/store.ts`
- Modify: `src/components/workbench/PlanToolbar.vue`
- Create: `src/components/workbench/ImportPreviewDialog.vue`
- Create: `src/components/workbench/GlobalReplaceDialog.vue`
- Test: `src/components/workbench/PlanToolbar.integration.spec.ts`
- Modify: `src/domain/edition.ts`

**Interfaces:**
- Consumes: edition storage namespace, Mower compatibility functions, validation, and html-to-image.
- Produces: recoverable autosave, import preview/replace, JSON download, image download, and global replacement UI.

- [ ] **Step 1: Test that failed imports do not overwrite persisted state**

```ts
it('previews import diagnostics and keeps the current workspace on errors', async () => {
  const wrapper = mountToolbarIntegration()
  const before = structuredClone(useRosterWorkspaceStore().workspace)
  await chooseImportFile(wrapper, '{broken json')
  expect(wrapper.get('[data-test=import-errors]').text()).toContain('JSON')
  expect(useRosterWorkspaceStore().workspace).toEqual(before)
})
```

- [ ] **Step 2: Confirm integration tests fail**

Run: `pnpm vitest run --environment jsdom src/components/workbench/PlanToolbar.integration.spec.ts`

Expected: FAIL because preview and persistence flows are incomplete.

- [ ] **Step 3: Implement recoverable storage and export actions**

Use `${EDITION.storageNamespace}:roster-workspace:v8` and a sibling `:last-good` key. Parse the active key first, recover from last-good on failure, and offer the corrupt string as a download. Export the 980px base-plan element with explicit background color and pixel ratio 2. Global replacement shows an affected-slot count before committing.

- [ ] **Step 4: Run integration, type, and production checks**

Run: `pnpm vitest run --environment jsdom src/components/workbench/PlanToolbar.integration.spec.ts && pnpm typecheck && pnpm build`

Expected: PASS; malformed imports leave state unchanged.

- [ ] **Step 5: Commit persistence and export flows**

```powershell
git add src/workbench/store.ts src/components/workbench/PlanToolbar.vue src/components/workbench/ImportPreviewDialog.vue src/components/workbench/GlobalReplaceDialog.vue src/components/workbench/PlanToolbar.integration.spec.ts src/domain/edition.ts
git commit -m "feat: persist and export roster workspaces"
```

### Task 15: Complete Responsive Styling, Attribution, and End-to-End Verification

**Files:**
- Modify: `src/workbench/styles.css`
- Modify: `src/styles.css`
- Create: `THIRD_PARTY_NOTICES.md`
- Modify: `README.md`
- Modify: `一键启动.bat`
- Test: `src/workbench/mowerSamples.spec.ts`
- Create: `src/workbench/fixtures/mower-efficiency-expectations.json`

**Interfaces:**
- Consumes: completed workbench and the three user Mower JSON samples.
- Produces: responsive visual parity, license compliance, launcher verification, and final sample-efficiency evidence.

- [ ] **Step 1: Add sample-efficiency regression cases**

```ts
it.each([
  ['252二赤金Test.json', '252二赤金 (Test)', 2],
  ['252二赤金.json', '252二赤金', 2],
  ['252三赤金.json', '252三赤金', 3],
])('imports %s and matches workbook efficiency trace', (filename, sheetName, expectedGoldFactories) => {
  const workspace = importSample(filename)
  const report = calculateWorkspace(workspace)
  expect(countGoldFactories(workspace.mainPlan)).toBe(expectedGoldFactories)
  expect(validateWorkspace(workspace).filter((issue) => issue.severity === 'error')).toEqual([])
  expectEfficiencyTrace(report.efficiencyTrace, expectations[sheetName], 0.0001)
})
```

- [ ] **Step 2: Create the workbook-derived fixture and run sample tests before styling**

Transcribe expectations from `E:/OneDrive/桌面/mower表.xlsx` without using engine output as the expected value. Ignore the first sheet. Pair each operator header with the numeric cell directly beneath it in the sheet's `效率` rows:

- `252二赤金`: rows 21, 25, 30, 34, 39, and 43.
- `252二赤金 (Test)`: rows 20, 24, 29, 33, 38, and 42.
- `252三赤金`: rows 21, 25, 30, 34, 39, and 43.

Store sheet name, roster section, operator label, expected efficiency contribution, and source cell address in `mower-efficiency-expectations.json`. Preserve labels such as `温蒂(主)` and `温蒂(副)` because they describe distinct work intervals.

Run: `pnpm vitest run src/workbench/mowerSamples.spec.ts`

Expected: PASS for import/layout and every workbook efficiency contribution within `0.0001`; a failure prints sheet name, source cell, operator label, expected value, and actual interval contribution.

- [ ] **Step 3: Apply responsive and accessibility acceptance rules**

At widths above 1200px show editor/report side by side; from 768–1199px stack them and wrap the toolbar; below 768px retain a usable minimum map width inside a scroll container. Keep primary actions sticky/reachable, constrain dialogs to the viewport, expose visible keyboard focus, and label groups with text as well as color.

- [ ] **Step 4: Add MIT attribution and operating instructions**

List the adapted Mower source components and full MIT notice in `THIRD_PARTY_NOTICES.md`. Update `README.md` with branch-safe launcher instructions, workspace import/export, unsupported automation semantics, and the meaning of long-term daily average. Keep the launcher on the shift-run fixed port with `--strictPort`.

- [ ] **Step 5: Run the complete automated verification**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm audit:data
git diff --check
cmd /c "一键启动.bat --check"
```

Expected: all tests pass, typecheck/build complete, the RIIC data audit reports no missing operator facility skills, diff check is clean, and launcher check exits 0 without starting the long-running server.

- [ ] **Step 6: Perform browser acceptance at three viewport sizes**

Start with `一键启动.bat`, then verify 1920×1080, 1366×768, and 720×900. Exercise plan creation/order/deletion, room drag swap, operator pinyin search, cross-room group, replacement reorder, trigger/task dialogs, malformed/valid import, JSON/image export, calculation, error navigation, and report rendering. Capture one screenshot per viewport in `artifacts/visual-qa/` and document deviations in `artifacts/visual-qa/README.md`; the task passes only when no primary action is clipped and the 21-room map remains operable.

- [ ] **Step 7: Commit final parity and verification artifacts**

```powershell
git add src/workbench/styles.css src/styles.css THIRD_PARTY_NOTICES.md README.md "一键启动.bat" src/workbench/mowerSamples.spec.ts src/workbench/fixtures/mower-efficiency-expectations.json artifacts/visual-qa
git commit -m "feat: complete Mower workbench parity"
```

## Final Acceptance Checklist

- [ ] Main and ordered sub-plans can be created, copied, renamed, reordered, selected, and deleted.
- [ ] All 21 facilities appear in one Mower-style map and nine output rooms swap transactionally.
- [ ] Operators support name/pinyin search, skill display, conflict marking, groups, and ordered replacements.
- [ ] Cross-facility groups leave and re-enter synchronously under strict replacement rules.
- [ ] Trigger stages and task overrides affect the event timeline deterministically.
- [ ] Unsupported Mower automation data remains editable/round-trippable and is visibly excluded from simulation.
- [ ] Fixed-plan efficiency matches the legacy engine; long-term output is an interval-weighted daily average.
- [ ] Drone storage caps at 235 and reports discarded charge.
- [ ] Shift-run order effects remain order-generation events, not sub-plan switches.
- [ ] Invalid power/layout/roster states block totals but remain editable.
- [ ] The three user JSON samples import and their gold-factory counts and established efficiency expectations match.
- [ ] Full tests, typecheck, build, data audit, launcher check, and visual QA pass.
