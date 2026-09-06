# Mower-Compatible Main Roster Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a high-fidelity Mower-compatible Main Roster Workbench for the shift-run edition (`mode/shift-run`) replicating Mower's layout, visual density, facility theming, and interaction vocabulary, with bidirectional Mower JSON and 16-QR JPG interchange (strictly following `arknights_mower/utils/qrcode.py` without OCR), while preserving existing calculation engines (`calculate.ts`, `morale.ts`, `operatorRules.ts`) completely untouched through a pure adapter.

**Architecture:** Three deep modules at distinct architectural seams: (1) Mower Transport Codec (lossless JSON envelope and 16-QR Base45 JPG encoder/decoder with repeated masking and geometric coordinate sorting), (2) Roster Workbench Editing Model (workspace model, facility state, intelligent 2/3-power-plant level inference, drag-swap atomic transactions, global operator replacement, and real-time validation), and (3) Pure AppConfig Adapter (`compileMainPlanToAppConfig` bridging workspace state to schema-v7 `AppConfig` without engine modifications).

**Tech Stack:** Vue 3.5, TypeScript 5.9 strict mode, Pinia 4, Naive UI, pinyin-pro, vue-slicksort, html-to-image, jsQR, Vitest 3, Vue Test Utils, jsdom, Vite 7, pnpm 11.

**Spec:** `docs/superpowers/specs/2026-09-02-mower-workbench-compatibility-design.md`

## Global Constraints

- **Branch and Scope Boundary**: Work strictly on branch `mode/shift-run`. Standard edition branch `mode/standard` is completely untouched.
- **Engine Immutability**: Absolutely zero edits to `src/engine/calculate.ts`, `src/engine/morale.ts`, `src/engine/operatorRules.ts`, or shift-run dispatch rules. Changes are guarded by SHA-256 hash checks and golden equivalence tests.
- **Strict Scope Containment**: All sub-plans, triggers, scheduled tasks, dynamic simulation, and timeline engines are excluded from scope. Imported `backup_plans`, triggers, and unknown fields are stored losslessly inside `MowerCompatibilityEnvelope` without UI editing or calculation semantics.
- **Uncreative Visual Fidelity**: Faithfully reproduce Mower `Plan.vue`/`PlanEditor.vue` layout (980px fixed width base canvas), density, facility dark/light colors, product watermarks, operator portraits, and interaction vocabulary. Do not introduce an invented aesthetic.
- **Deterministic 16-QR Pipeline**: Adhere strictly to `arknights_mower/utils/qrcode.py`: zlib level 9 compression, RFC 9285 Base45 encoding, 16 equal chunks without custom headers, placed at top 7, bottom-left 7, and bottom-right 2. Decoding uses iterative `jsQR` with canvas masking and geometric coordinate sorting. Strictly zero OCR.
- **Initial WIP Audit Rule**: No file or snippet from `.worktrees/mower-workbench` may be copied until a matching test is first written in the target branch and observed failing for the expected reason. WIP code must be audited against the approved spec to discard obsolete sub-plan/trigger/timeline code.
- **Sanitized External Fixtures**: Real samples from `E:\OneDrive\Mower` (`252三赤金.json`, `252三赤金.jpg`, `342纯钱.json`, `342搓玉.json`) are copied into sanitized repository fixtures under `src/workbench/compat/fixtures/`. No hardcoded personal paths (e.g. `E:\OneDrive\Mower`) in committed source or tests.
- **Open Source Attribution**: All third-party or derivative Mower code must preserve MIT License notices with `Copyright (c) 2021 Nano`.
- **Visual QA Multi-Resolution Requirement**: Visual layout and interaction must be verified at 1920x1080, 1366x768, and 720x900 against actual Mower screenshots.

---

## Initial WIP Audit & Porting Strategy

The repository contains an existing candidate worktree at `.worktrees/mower-workbench`. That worktree was drafted prior to the approved main roster core specification and contains:
- Obsolete sub-plan models (`RosterSubPlan`, `subPlans`), triggers (`TriggerDialog`, AST parser), scheduled task overrides (`ScheduledRosterTask`, `roomTask`), and timeline simulation stubs.
- Divergences in Mower JSON policy mapping (e.g. placing `free_blacklist` into the main plan instead of treating it as sub-plan specific in the compatibility envelope).

### Strict Audit Rules:
1. **Never mass-copy files**: Every file imported from `.worktrees/mower-workbench` must be audited line-by-line against `docs/superpowers/specs/2026-09-02-mower-workbench-compatibility-design.md`.
2. **Test-First Barrier**: A unit test asserting the exact behavior mandated by the approved spec must be written and executed in the target workspace first. The test MUST fail before any candidate code is copied or adapted.
3. **Prune Prohibited Concepts**: Discard any references to sub-plans, triggers, tasks, or dynamic timeline engines when porting domain models, stores, or components.

---

## File Structure & Module Layout

```
src/
├── domain/
│   ├── types.ts                     # Existing domain types (schemaVersion 7)
│   └── defaults.ts                  # Existing domain defaults
├── engine/
│   ├── calculate.ts                 # PROTECTED: 0 modifications
│   ├── morale.ts                    # PROTECTED: 0 modifications
│   └── operatorRules.ts             # PROTECTED: 0 modifications
├── workbench/
│   ├── model.ts                     # Schema-v8 RosterWorkspace & MowerMainPlan types
│   ├── levelInference.ts            # Intelligent 2/3-power-plant facility level inference
│   ├── defaults.ts                  # Deterministic default workspace factories
│   ├── migrate.ts                   # Schema-v7 AppConfig -> Schema-v8 RosterWorkspace migration
│   ├── adapter.ts                   # Pure compiler: MowerMainPlan -> schema-v7 AppConfig
│   ├── store.ts                     # Pinia store: drag-swap, facility edit, global replace
│   ├── validate.ts                  # Real-time constraint validation engine
│   ├── styles.css                   # Mower-identical visual styles, colors & watermarks
│   ├── compat/
│   │   ├── mowerJson.ts             # Mower JSON import/export with lossless envelope
│   │   ├── base45.ts                # RFC 9285 Base45 pure encoder/decoder
│   │   ├── mowerQrConstants.ts      # qrcode.py geometric constants & chunk coordinates
│   │   ├── mowerQrCodec.ts          # 16-QR JPG export & repeated masking decode (no OCR)
│   │   └── fixtures/                # Sanitized test fixtures from real Mower samples
│   │       ├── mower-252-3gold.json
│   │       ├── mower-342-pure-lmd.json
│   │       ├── mower-342-orirock.json
│   │       └── mower-252-sample.jpg
│   └── __tests__/
│       └── engine-protection.spec.ts# Checksum & equivalence tests for engine files
└── components/workbench/
    ├── WorkbenchShell.vue           # Main workbench page layout & provider
    ├── PlanToolbar.vue              # Top action toolbar (import/export, replace, validate)
    ├── BaseMap.vue                  # 980px 3-column facility map with HTML5 drag-swap
    ├── FacilityCard.vue             # Individual facility card with badges & watermarks
    ├── FacilityEditor.vue           # Selected room editing drawer/panel
    ├── SlotRow.vue                  # Operator slot row with Free/Current/Empty support
    ├── ReplacementList.vue          # Ordered replacements list with drag reordering
    ├── OperatorSelectModal.vue      # Pinyin-search operator picker with duplicate badges
    ├── GlobalReplaceModal.vue       # One-click transactional operator replacement
    ├── PolicyEditor.vue             # Mower policy configuration panel (ling_xi + 7 lists)
    └── ValidationPanel.vue          # Live diagnostics drawer with clickable room focus
```

---

### Task 1: Engine Protection & Baseline Equivalence Harness

**Files:**
- Create: `src/workbench/__tests__/engine-protection.spec.ts`

**Interfaces:**
- Consumes: `src/engine/calculate.ts`, `src/engine/morale.ts`, `src/engine/operatorRules.ts`, `src/domain/defaults.ts`.
- Produces: Test suite validating file integrity hashes and verifying baseline calculation output consistency.

- [ ] **Step 1: Write the engine protection test suite**

Create `src/workbench/__tests__/engine-protection.spec.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { calculate } from '../../engine/calculate'
import { createDefaultConfig } from '../../domain/defaults'

const __dirname = dirname(fileURLToPath(import.meta.url))

function fileSha256(relativePath: string): string {
  const fullPath = resolve(__dirname, '../../', relativePath)
  const content = readFileSync(fullPath, 'utf-8').replace(/\r\n/g, '\n')
  return createHash('sha256').update(content).digest('hex')
}

describe('Engine Protection & Calculation Equivalence', () => {
  it('protects engine source files against unauthorized modifications', () => {
    // Exact baseline SHA256 hashes of the untouched engine files (normalized LF)
    expect(fileSha256('engine/calculate.ts')).toBe('0f3f212b12e6b410841961b7ea385a3f757570abe7f968f69dad005c11602bf6')
    expect(fileSha256('engine/morale.ts')).toBe('d77cfa8fc8e3cfeb0b8054e2e5a9bff3970338f3494e4851b16d01ab1de22136')
    expect(fileSha256('engine/operatorRules.ts')).toBe('20062d7d5715f10267f73e8267763b63cf103331a2ea08e0843c28c2dbb5e0a4')
  })

  it('produces deterministic baseline report for default configuration', () => {
    const config = createDefaultConfig()
    const report1 = calculate(config)
    const report2 = calculate(config)

    expect(report2).toEqual(report1)
    expect(report1.power).toEqual({ generation: 810, consumption: 810, margin: 0, sufficient: true })
    expect(report1.summary).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run baseline characterization test**

Run: `pnpm vitest run src/workbench/__tests__/engine-protection.spec.ts`

Expected: PASS with 0 errors. Task 1 is a baseline characterization test verifying current code integrity and calculation equivalence against untouched production files; it is expected to pass immediately upon creation. All subsequent production change tasks (Task 2 onwards) must still demonstrate RED before implementation.

- [ ] **Step 3: Commit engine protection baseline**

```powershell
git add src/workbench/__tests__/engine-protection.spec.ts
git commit -m "test: add engine protection hash and baseline calculation tests"
```

---

### Task 2: Roster Workbench Domain Model & Intelligent Level Inference

**Files:**
- Create: `src/workbench/model.ts`
- Create: `src/workbench/levelInference.ts`
- Create: `src/workbench/defaults.ts`
- Create: `src/workbench/levelInference.spec.ts`
- Create: `src/workbench/defaults.spec.ts`

**Interfaces:**
- Produces: `MowerRoomId`, `MowerOutputRoomId`, `MowerFacilityType`, `MowerOccupant`, `MowerSlot`, `MowerFacility`, `MowerMainConf`, `MowerMainPlan`, `MowerCompatibilityEnvelope`, `RosterWorkspace`.
- Functions: `inferFacilityLevels(facilities: Record<MowerRoomId, MowerFacility>): void`, `createDefaultWorkspace(): RosterWorkspace`.

- [ ] **Step 1: Write failing tests for intelligent level inference and workspace defaults**

Create `src/workbench/levelInference.spec.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { inferFacilityLevels } from './levelInference'
import { createDefaultWorkspace } from './defaults'
import type { MowerFacility, MowerRoomId } from './model'

describe('inferFacilityLevels', () => {
  it('infers all facilities to max level when there are 3 power plants (independent of staffing)', () => {
    const workspace = createDefaultWorkspace()
    const facilities = workspace.mainPlan.facilities

    // 3 power plants in output rooms
    facilities.room_1_3.type = 'power'
    facilities.room_2_3.type = 'power'
    facilities.room_3_3.type = 'power'

    // Manufacturing room with 0 operators
    facilities.room_1_1.type = 'manufacture'
    facilities.room_1_1.slots = []

    inferFacilityLevels(facilities)

    expect(facilities.room_1_1.level).toBe(3)
    expect(facilities.room_1_3.level).toBe(3)
    expect(facilities.dormitory_1.level).toBe(5)
    expect(facilities.dormitory_4.level).toBe(5)
    expect(facilities.meeting.level).toBe(3)
    expect(facilities.contact.level).toBe(3)
    expect(facilities.factory.level).toBe(3)
    expect(facilities.train.level).toBe(3)
  })

  it('infers stepped levels when there are 2 power plants', () => {
    const workspace = createDefaultWorkspace()
    const facilities = workspace.mainPlan.facilities

    // 2 power plants
    facilities.room_1_3.type = 'power'
    facilities.room_2_3.type = 'power'
    facilities.room_3_3.type = 'trading'

    // Room with 2 operators -> level 2
    facilities.room_1_1.type = 'manufacture'
    facilities.room_1_1.slots = [
      { occupant: { kind: 'operator', operatorId: 'char_1' }, groupId: null, replacements: [] },
      { occupant: { kind: 'operator', operatorId: 'char_2' }, groupId: null, replacements: [] },
    ]

    // Empty manufacture room -> fallback level 1
    facilities.room_1_2.type = 'manufacture'
    facilities.room_1_2.slots = []

    inferFacilityLevels(facilities)

    expect(facilities.dormitory_1.level).toBe(1)
    expect(facilities.dormitory_4.level).toBe(1)
    expect(facilities.room_1_3.level).toBe(3)
    expect(facilities.room_2_3.level).toBe(3)
    expect(facilities.room_1_1.level).toBe(2)
    expect(facilities.room_1_2.level).toBe(1)
    expect(facilities.meeting.level).toBe(3)
    expect(facilities.contact.level).toBe(3)
  })
})
```

Create `src/workbench/defaults.spec.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createDefaultWorkspace } from './defaults'
import { MOWER_OUTPUT_ROOM_IDS, MOWER_ROOM_IDS } from './model'

describe('createDefaultWorkspace', () => {
  it('creates schema-v8 workspace with 21 valid rooms and clean envelope', () => {
    const ws = createDefaultWorkspace()
    expect(ws.schemaVersion).toBe(8)
    expect(ws.name).toBe('默认排班')
    expect(ws.mainPlan.id).toBe('plan1')
    expect(Object.keys(ws.mainPlan.facilities)).toHaveLength(21)
    expect(MOWER_OUTPUT_ROOM_IDS.every((id) => ws.mainPlan.facilities[id] !== undefined)).toBe(true)
    expect(ws.mainPlan.conf.ling_xi).toBe(1)
    expect(ws.mainPlan.conf.exhaust_require).toEqual([])
    expect(ws.compatibility.backupPlans).toEqual([])
    expect(ws.compatibility.defaultPlanKey).toBe('plan1')
  })
})
```

- [ ] **Step 2: Run tests and confirm missing module errors**

Run: `pnpm vitest run src/workbench/levelInference.spec.ts src/workbench/defaults.spec.ts`
Expected: FAIL due to missing `./model`, `./levelInference`, `./defaults`.

- [ ] **Step 3: Implement domain models, inference rules, and default factories**

Create `src/workbench/model.ts`:
```ts
export const MOWER_OUTPUT_ROOM_IDS = [
  'room_1_1', 'room_1_2', 'room_1_3',
  'room_2_1', 'room_2_2', 'room_2_3',
  'room_3_1', 'room_3_2', 'room_3_3',
] as const

export const MOWER_ROOM_IDS = [
  ...MOWER_OUTPUT_ROOM_IDS,
  'central',
  'dormitory_1', 'dormitory_2', 'dormitory_3', 'dormitory_4',
  'meeting', 'factory', 'contact', 'train',
  'gaming_1', 'gaming_2', 'gaming_3',
] as const

export type MowerRoomId = (typeof MOWER_ROOM_IDS)[number]
export type MowerOutputRoomId = (typeof MOWER_OUTPUT_ROOM_IDS)[number]

export type MowerFacilityType =
  | 'manufacture'
  | 'trading'
  | 'power'
  | 'dormitory'
  | 'central'
  | 'meeting'
  | 'factory'
  | 'contact'
  | 'train'
  | 'gaming'
  | ''

export type MowerProduct = 'gold' | 'exp' | 'fragment' | 'money' | 'orundum'

export type MowerOccupant =
  | { kind: 'operator'; operatorId: string }
  | { kind: 'free' }
  | { kind: 'current' }
  | { kind: 'empty' }

export interface MowerSlot {
  occupant: MowerOccupant
  groupId: string | null
  replacements: string[]
}

export interface MowerFacility {
  roomId: MowerRoomId
  type: MowerFacilityType
  level: number
  product?: MowerProduct
  slots: MowerSlot[]
}

export interface MowerMainConf {
  ling_xi: 1 | 2 | 3
  exhaust_require: string[]
  rest_in_full: string[]
  resting_priority: string[]
  workaholic: string[]
  refresh_trading: string[]
  refresh_drained: string[]
  ope_resting_priority: string[]
  [customKey: string]: unknown
}

export interface MowerMainPlan {
  id: string
  name: string
  facilities: Record<MowerRoomId, MowerFacility>
  conf: MowerMainConf
}

export interface MowerCompatibilityEnvelope {
  sourceVersion?: string
  defaultPlanKey: string
  backupPlans: unknown[]
  otherPlans: Record<string, unknown>
  unrecognizedFields: Record<string, unknown>
}

export interface RosterWorkspace {
  schemaVersion: 8
  name: string
  mainPlan: MowerMainPlan
  compatibility: MowerCompatibilityEnvelope
}
```

Create `src/workbench/levelInference.ts`:
```ts
import { MOWER_OUTPUT_ROOM_IDS, type MowerFacility, type MowerRoomId } from './model'

export function inferFacilityLevels(facilities: Record<MowerRoomId, MowerFacility>): void {
  let powerCount = 0
  for (const roomId of MOWER_OUTPUT_ROOM_IDS) {
    if (facilities[roomId].type === 'power') {
      powerCount++
    }
  }

  if (powerCount >= 3) {
    // 3 Power Plants: all max level
    for (const roomId of MOWER_OUTPUT_ROOM_IDS) {
      facilities[roomId].level = 3
    }
    for (let i = 1; i <= 4; i++) {
      facilities[`dormitory_${i}` as MowerRoomId].level = 5
    }
    facilities.meeting.level = 3
    facilities.contact.level = 3
    facilities.factory.level = 3
    facilities.train.level = 3
    facilities.central.level = 5
  } else if (powerCount === 2) {
    // 2 Power Plants: stepped inference
    for (let i = 1; i <= 4; i++) {
      facilities[`dormitory_${i}` as MowerRoomId].level = 1
    }
    facilities.meeting.level = 3
    facilities.contact.level = 3
    facilities.factory.level = 3
    facilities.train.level = 3
    facilities.central.level = 5

    for (const roomId of MOWER_OUTPUT_ROOM_IDS) {
      const facility = facilities[roomId]
      if (facility.type === 'power') {
        facility.level = 3
      } else if (facility.type === 'manufacture' || facility.type === 'trading') {
        const staffedCount = facility.slots.filter(
          (s) => s.occupant.kind === 'operator' || s.occupant.kind === 'free' || s.occupant.kind === 'current',
        ).length
        facility.level = Math.max(1, Math.min(3, staffedCount || 1))
      }
    }
  }
}
```

Create `src/workbench/defaults.ts`:
```ts
import {
  MOWER_OUTPUT_ROOM_IDS,
  MOWER_ROOM_IDS,
  type MowerFacility,
  type MowerRoomId,
  type RosterWorkspace,
} from './model'

function createDefaultSlots(count: number) {
  return Array.from({ length: count }, () => ({
    occupant: { kind: 'empty' as const },
    groupId: null,
    replacements: [],
  }))
}

function createDefaultFacility(roomId: MowerRoomId): MowerFacility {
  if (roomId.startsWith('room_')) {
    // 243 default layout: 4 manufacture, 2 trading, 3 power
    const index = MOWER_OUTPUT_ROOM_IDS.indexOf(roomId as any)
    if (index < 4) {
      return { roomId, type: 'manufacture', level: 3, product: 'gold', slots: createDefaultSlots(3) }
    }
    if (index < 6) {
      return { roomId, type: 'trading', level: 3, product: 'money', slots: createDefaultSlots(3) }
    }
    return { roomId, type: 'power', level: 3, slots: createDefaultSlots(1) }
  }
  if (roomId === 'central') {
    return { roomId, type: 'central', level: 5, slots: createDefaultSlots(5) }
  }
  if (roomId.startsWith('dormitory_')) {
    return { roomId, type: 'dormitory', level: 5, slots: createDefaultSlots(5) }
  }
  if (roomId === 'meeting') {
    return { roomId, type: 'meeting', level: 3, slots: createDefaultSlots(2) }
  }
  if (roomId === 'factory') {
    return { roomId, type: 'factory', level: 3, slots: createDefaultSlots(1) }
  }
  if (roomId === 'contact') {
    return { roomId, type: 'contact', level: 3, slots: createDefaultSlots(1) }
  }
  if (roomId === 'train') {
    return { roomId, type: 'train', level: 3, slots: createDefaultSlots(2) }
  }
  return { roomId, type: 'gaming', level: 1, slots: createDefaultSlots(1) }
}

export function createDefaultWorkspace(): RosterWorkspace {
  const facilities = {} as Record<MowerRoomId, MowerFacility>
  for (const roomId of MOWER_ROOM_IDS) {
    facilities[roomId] = createDefaultFacility(roomId)
  }

  return {
    schemaVersion: 8,
    name: '默认排班',
    mainPlan: {
      id: 'plan1',
      name: '主力排班',
      facilities,
      conf: {
        ling_xi: 1,
        exhaust_require: [],
        rest_in_full: [],
        resting_priority: [],
        workaholic: [],
        refresh_trading: [],
        refresh_drained: [],
        ope_resting_priority: [],
      },
    },
    compatibility: {
      defaultPlanKey: 'plan1',
      backupPlans: [],
      otherPlans: {},
      unrecognizedFields: {},
    },
  }
}
```

- [ ] **Step 4: Run unit tests and typecheck**

Run: `pnpm vitest run src/workbench/levelInference.spec.ts src/workbench/defaults.spec.ts && pnpm typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit workspace foundation**

```powershell
git add src/workbench/model.ts src/workbench/levelInference.ts src/workbench/defaults.ts src/workbench/levelInference.spec.ts src/workbench/defaults.spec.ts
git commit -m "feat: implement schema-v8 roster model, level inference, and defaults"
```

---

### Task 3: Schema-v7 AppConfig to Schema-v8 Workspace Migration

**Files:**
- Create: `src/workbench/migrate.ts`
- Create: `src/workbench/migrate.spec.ts`

**Interfaces:**
- Produces: `migrateAppConfigToWorkspace(config: AppConfig): RosterWorkspace`.
- Consumes: `AppConfig`, `createDefaultWorkspace()`.

- [ ] **Step 1: Write migration test for rooms, groups, and replacements**

Create `src/workbench/migrate.spec.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createDefaultConfig } from '../domain/defaults'
import { migrateAppConfigToWorkspace } from './migrate'

describe('migrateAppConfigToWorkspace', () => {
  it('migrates v7 AppConfig into v8 RosterWorkspace mapping rooms, groups, and backups', () => {
    const legacy = createDefaultConfig()
    legacy.rooms[0].operatorIds = ['char_002_amiya', 'char_102_texas']
    legacy.rooms[0].level = 2
    legacy.rooms[0].product = 'gold'
    legacy.operatorGroups = [{ id: 'team_a', name: 'A组', operatorIds: ['char_002_amiya'] }]
    legacy.operatorBackups = { char_002_amiya: 'char_103_angel' }
    legacy.controlOperatorIds = ['char_002_amiya']

    const ws = migrateAppConfigToWorkspace(legacy)

    expect(ws.schemaVersion).toBe(8)
    const b1 = ws.mainPlan.facilities.room_1_1
    expect(b1.type).toBe('manufacture')
    expect(b1.level).toBe(2)
    expect(b1.product).toBe('gold')
    expect(b1.slots[0].occupant).toEqual({ kind: 'operator', operatorId: 'char_002_amiya' })
    expect(b1.slots[0].groupId).toBe('team_a')
    expect(b1.slots[0].replacements).toEqual(['char_103_angel'])

    const central = ws.mainPlan.facilities.central
    expect(central.slots[0].occupant).toEqual({ kind: 'operator', operatorId: 'char_002_amiya' })
  })
})
```

- [ ] **Step 2: Run test and observe missing module failure**

Run: `pnpm vitest run src/workbench/migrate.spec.ts`
Expected: FAIL due to missing `./migrate`.

- [ ] **Step 3: Implement migration logic**

Create `src/workbench/migrate.ts`:
```ts
import type { AppConfig } from '../domain/types'
import { createDefaultWorkspace } from './defaults'
import { MOWER_OUTPUT_ROOM_IDS, type MowerProduct, type RosterWorkspace } from './model'

export function migrateAppConfigToWorkspace(config: AppConfig): RosterWorkspace {
  const ws = createDefaultWorkspace()
  const facilities = ws.mainPlan.facilities

  // Map 9 output rooms B1..B9
  for (let i = 0; i < 9 && i < config.rooms.length; i++) {
    const legacyRoom = config.rooms[i]
    const roomId = MOWER_OUTPUT_ROOM_IDS[i]
    const facility = facilities[roomId]
    facility.type = legacyRoom.type
    facility.level = legacyRoom.level
    facility.product = legacyRoom.product as MowerProduct

    facility.slots = legacyRoom.operatorIds.map((opId) => {
      const group = config.operatorGroups.find((g) => g.operatorIds.includes(opId))
      const backup = config.operatorBackups[opId]
      return {
        occupant: { kind: 'operator', operatorId: opId },
        groupId: group ? group.id : null,
        replacements: backup ? [backup] : [],
      }
    })
  }

  // Central
  if (config.controlOperatorIds?.length) {
    facilities.central.slots = config.controlOperatorIds.map((opId) => ({
      occupant: { kind: 'operator', operatorId: opId },
      groupId: null,
      replacements: [],
    }))
  }

  // Dormitories
  if (config.facilityOperatorIds?.dormitories) {
    for (let i = 0; i < 4 && i < config.facilityOperatorIds.dormitories.length; i++) {
      const dormId = `dormitory_${i + 1}` as const
      facilities[dormId].slots = config.facilityOperatorIds.dormitories[i].map((opId) => ({
        occupant: { kind: 'operator', operatorId: opId },
        groupId: null,
        replacements: [],
      }))
    }
  }

  // Right facilities
  if (config.facilityOperatorIds?.reception) {
    facilities.meeting.slots = config.facilityOperatorIds.reception.map((opId) => ({
      occupant: { kind: 'operator', operatorId: opId },
      groupId: null,
      replacements: [],
    }))
  }
  if (config.facilityOperatorIds?.workshop) {
    facilities.factory.slots = config.facilityOperatorIds.workshop.map((opId) => ({
      occupant: { kind: 'operator', operatorId: opId },
      groupId: null,
      replacements: [],
    }))
  }
  if (config.facilityOperatorIds?.office) {
    facilities.contact.slots = config.facilityOperatorIds.office.map((opId) => ({
      occupant: { kind: 'operator', operatorId: opId },
      groupId: null,
      replacements: [],
    }))
  }
  if (config.facilityOperatorIds?.training) {
    facilities.train.slots = config.facilityOperatorIds.training.map((opId) => ({
      occupant: { kind: 'operator', operatorId: opId },
      groupId: null,
      replacements: [],
    }))
  }

  return ws
}
```

- [ ] **Step 4: Verify test passes**

Run: `pnpm vitest run src/workbench/migrate.spec.ts && pnpm typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit migration module**

```powershell
git add src/workbench/migrate.ts src/workbench/migrate.spec.ts
git commit -m "feat: add schema-v7 to schema-v8 migration module"
```

---

### Task 4: Pure AppConfig Adapter & Calculation Isolation

**Files:**
- Create: `src/workbench/adapter.ts`
- Create: `src/workbench/adapter.spec.ts`

**Interfaces:**
- Produces: `compileMainPlanToAppConfig(mainPlan: MowerMainPlan, baseWorkspace: RosterWorkspace, existingConfig: AppConfig): AppConfig`.
- Guarantees: 0 modifications to `calculate.ts`, filters `Free`/`Current`/`Empty` gracefully, maps primary replacements to `operatorBackups`.

- [ ] **Step 1: Write adapter compilation tests**

Create `src/workbench/adapter.spec.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createDefaultWorkspace } from './defaults'
import { createDefaultConfig } from '../domain/defaults'
import { compileMainPlanToAppConfig } from './adapter'
import { calculate } from '../engine/calculate'

describe('compileMainPlanToAppConfig', () => {
  it('compiles workspace main plan into valid AppConfig and calculates without errors', () => {
    const ws = createDefaultWorkspace()
    const baseConfig = createDefaultConfig()

    ws.mainPlan.facilities.room_1_1.slots = [
      { occupant: { kind: 'operator', operatorId: 'char_002_amiya' }, groupId: 'group1', replacements: ['char_103_angel'] },
      { occupant: { kind: 'free' }, groupId: null, replacements: [] },
      { occupant: { kind: 'empty' }, groupId: null, replacements: [] },
    ]

    const config = compileMainPlanToAppConfig(ws.mainPlan, ws, baseConfig)

    expect(config.schemaVersion).toBe(7)
    expect(config.rooms[0].operatorIds).toEqual(['char_002_amiya'])
    expect(config.rooms[0].operatorCount).toBe(1)
    expect(config.operatorBackups['char_002_amiya']).toBe('char_103_angel')
    expect(config.operatorGroups).toEqual([
      { id: 'group1', name: 'group1', operatorIds: ['char_002_amiya'] },
    ])

    // Verify engine calculates cleanly
    const report = calculate(config)
    expect(report.layoutValid).toBe(true)
    expect(report.summary).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test and observe missing module failure**

Run: `pnpm vitest run src/workbench/adapter.spec.ts`
Expected: FAIL due to missing `./adapter`.

- [ ] **Step 3: Implement pure adapter**

Create `src/workbench/adapter.ts`:
```ts
import type { AppConfig, ManufactureProduct, OutputRoom, TradeStrategy } from '../domain/types'
import { MOWER_OUTPUT_ROOM_IDS, type MowerMainPlan, type RosterWorkspace } from './model'

export function compileMainPlanToAppConfig(
  mainPlan: MowerMainPlan,
  baseWorkspace: RosterWorkspace,
  existingConfig: AppConfig,
): AppConfig {
  const rooms: OutputRoom[] = MOWER_OUTPUT_ROOM_IDS.map((roomId, index) => {
    const facility = mainPlan.facilities[roomId]
    const existingRoom = existingConfig.rooms[index]
    const validOperatorIds = facility.slots
      .filter((s) => s.occupant.kind === 'operator')
      .map((s) => (s.occupant as { kind: 'operator'; operatorId: string }).operatorId)

    return {
      id: `B${index + 1}`,
      type: facility.type === 'manufacture' || facility.type === 'trading' || facility.type === 'power'
        ? facility.type
        : 'manufacture',
      level: (facility.level >= 1 && facility.level <= 3 ? facility.level : 3) as 1 | 2 | 3,
      operatorCount: validOperatorIds.length,
      operatorIds: validOperatorIds,
      skillBonus: existingRoom?.skillBonus ?? 0,
      product: (facility.product === 'gold' || facility.product === 'exp' || facility.product === 'fragment'
        ? facility.product
        : 'gold') as ManufactureProduct,
      strategy: (facility.product === 'orundum' ? 'orundum' : 'gold') as TradeStrategy,
      quality: existingRoom?.quality ?? 'normal',
      specialOrder: existingRoom?.specialOrder ?? 'none',
      powerStaffed: existingRoom?.powerStaffed ?? false,
    }
  })

  // Collect operator groups and first replacements
  const groupMap = new Map<string, string[]>()
  const backups: Record<string, string> = {}

  for (const roomId of Object.keys(mainPlan.facilities) as Array<keyof typeof mainPlan.facilities>) {
    const facility = mainPlan.facilities[roomId]
    for (const slot of facility.slots) {
      if (slot.occupant.kind === 'operator') {
        const opId = slot.occupant.operatorId
        if (slot.groupId) {
          const list = groupMap.get(slot.groupId) ?? []
          if (!list.includes(opId)) list.push(opId)
          groupMap.set(slot.groupId, list)
        }
        if (slot.replacements.length > 0 && slot.replacements[0]) {
          backups[opId] = slot.replacements[0]
        }
      }
    }
  }

  const operatorGroups = Array.from(groupMap.entries()).map(([id, operatorIds]) => ({
    id,
    name: id,
    operatorIds,
  }))

  // Life & Functional facilities
  const dormitories: string[][] = [1, 2, 3, 4].map((i) => {
    const dorm = mainPlan.facilities[`dormitory_${i}` as const]
    return dorm.slots
      .filter((s) => s.occupant.kind === 'operator')
      .map((s) => (s.occupant as { kind: 'operator'; operatorId: string }).operatorId)
  })

  const controlOperatorIds = mainPlan.facilities.central.slots
    .filter((s) => s.occupant.kind === 'operator')
    .map((s) => (s.occupant as { kind: 'operator'; operatorId: string }).operatorId)

  const reception = mainPlan.facilities.meeting.slots
    .filter((s) => s.occupant.kind === 'operator')
    .map((s) => (s.occupant as { kind: 'operator'; operatorId: string }).operatorId)

  const workshop = mainPlan.facilities.factory.slots
    .filter((s) => s.occupant.kind === 'operator')
    .map((s) => (s.occupant as { kind: 'operator'; operatorId: string }).operatorId)

  const office = mainPlan.facilities.contact.slots
    .filter((s) => s.occupant.kind === 'operator')
    .map((s) => (s.occupant as { kind: 'operator'; operatorId: string }).operatorId)

  const training = mainPlan.facilities.train.slots
    .filter((s) => s.occupant.kind === 'operator')
    .map((s) => (s.occupant as { kind: 'operator'; operatorId: string }).operatorId)

  return {
    ...existingConfig,
    schemaVersion: 7,
    planName: mainPlan.name || existingConfig.planName,
    rooms,
    facilities: {
      ...existingConfig.facilities,
      dormitories: [1, 2, 3, 4].map((i) => {
        const lvl = mainPlan.facilities[`dormitory_${i}` as const].level
        return (lvl >= 1 && lvl <= 5 ? lvl : 5) as 1 | 2 | 3 | 4 | 5
      }),
      reception: (mainPlan.facilities.meeting.level >= 1 && mainPlan.facilities.meeting.level <= 3
        ? mainPlan.facilities.meeting.level
        : 3) as 1 | 2 | 3,
      workshop: (mainPlan.facilities.factory.level >= 1 && mainPlan.facilities.factory.level <= 3
        ? mainPlan.facilities.factory.level
        : 3) as 1 | 2 | 3,
      office: (mainPlan.facilities.contact.level >= 1 && mainPlan.facilities.contact.level <= 3
        ? mainPlan.facilities.contact.level
        : 3) as 1 | 2 | 3,
      training: (mainPlan.facilities.train.level >= 1 && mainPlan.facilities.train.level <= 3
        ? mainPlan.facilities.train.level
        : 3) as 1 | 2 | 3,
    },
    facilityOperatorIds: {
      dormitories,
      reception,
      workshop,
      office,
      training,
    },
    controlOperatorIds,
    operatorBackups: backups,
    operatorGroups,
  }
}
```

- [ ] **Step 4: Verify test passes and static types check out**

Run: `pnpm vitest run src/workbench/adapter.spec.ts && pnpm typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit adapter module**

```powershell
git add src/workbench/adapter.ts src/workbench/adapter.spec.ts
git commit -m "feat: implement pure AppConfig adapter"
```

---

### Task 5: Roster Workbench Pinia Store, Drag-Swap & Global Operator Replacement

**Files:**
- Create: `src/workbench/store.ts`
- Create: `src/workbench/store.spec.ts`

**Interfaces:**
- Produces: `useRosterWorkbenchStore()` with actions:
  - `swapOutputRooms(sourceId: MowerOutputRoomId, targetId: MowerOutputRoomId): void`
  - `updateFacility(roomId: MowerRoomId, patch: Partial<MowerFacility>): void`
  - `updateSlot(roomId: MowerRoomId, slotIndex: number, slot: MowerSlot): void`
  - `replaceOperatorGlobally(targetOpId: string, replacementOpId: string): void`
  - `updateConf(confPatch: Partial<MowerMainConf>): void`
  - `inferLevels(): void`

- [ ] **Step 1: Write store unit tests for room swap and global operator replacement**

Create `src/workbench/store.spec.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRosterWorkbenchStore } from './store'

describe('RosterWorkbenchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('atomically swaps two output rooms including type, level, product, slots, and replacements', () => {
    const store = useRosterWorkbenchStore()
    const r1 = store.workspace.mainPlan.facilities.room_1_1
    const r2 = store.workspace.mainPlan.facilities.room_1_2

    r1.type = 'manufacture'
    r1.product = 'gold'
    r1.level = 2
    r1.slots = [{ occupant: { kind: 'operator', operatorId: 'char_1' }, groupId: 'g1', replacements: ['char_sub1'] }]

    r2.type = 'trading'
    r2.product = 'money'
    r2.level = 3
    r2.slots = [{ occupant: { kind: 'operator', operatorId: 'char_2' }, groupId: 'g2', replacements: ['char_sub2'] }]

    store.swapOutputRooms('room_1_1', 'room_1_2')

    expect(store.workspace.mainPlan.facilities.room_1_1.type).toBe('trading')
    expect(store.workspace.mainPlan.facilities.room_1_1.level).toBe(3)
    expect(store.workspace.mainPlan.facilities.room_1_1.slots[0].occupant).toEqual({ kind: 'operator', operatorId: 'char_2' })

    expect(store.workspace.mainPlan.facilities.room_1_2.type).toBe('manufacture')
    expect(store.workspace.mainPlan.facilities.room_1_2.level).toBe(2)
    expect(store.workspace.mainPlan.facilities.room_1_2.slots[0].occupant).toEqual({ kind: 'operator', operatorId: 'char_1' })
  })

  it('replaces operator globally across all primary slots and all replacement lists', () => {
    const store = useRosterWorkbenchStore()
    const f1 = store.workspace.mainPlan.facilities.room_1_1
    const f2 = store.workspace.mainPlan.facilities.dormitory_1

    f1.slots = [{ occupant: { kind: 'operator', operatorId: 'char_old' }, groupId: null, replacements: ['char_other'] }]
    f2.slots = [{ occupant: { kind: 'operator', operatorId: 'char_safe' }, groupId: null, replacements: ['char_old'] }]

    store.replaceOperatorGlobally('char_old', 'char_new')

    expect(f1.slots[0].occupant).toEqual({ kind: 'operator', operatorId: 'char_new' })
    expect(f2.slots[0].replacements).toEqual(['char_new'])
  })
})
```

- [ ] **Step 2: Run test and observe missing module failure**

Run: `pnpm vitest run src/workbench/store.spec.ts`
Expected: FAIL due to missing `./store`.

- [ ] **Step 3: Implement Pinia store**

Create `src/workbench/store.ts`:
```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createDefaultWorkspace } from './defaults'
import { inferFacilityLevels } from './levelInference'
import type {
  MowerFacility,
  MowerMainConf,
  MowerOutputRoomId,
  MowerRoomId,
  MowerSlot,
  RosterWorkspace,
} from './model'

export const useRosterWorkbenchStore = defineStore('rosterWorkbench', () => {
  const workspace = ref<RosterWorkspace>(createDefaultWorkspace())
  const selectedRoomId = ref<MowerRoomId | null>('room_1_1')

  function swapOutputRooms(sourceId: MowerOutputRoomId, targetId: MowerOutputRoomId): void {
    if (sourceId === targetId) return
    const facilities = workspace.value.mainPlan.facilities
    const source = facilities[sourceId]
    const target = facilities[targetId]

    const temp = {
      type: source.type,
      level: source.level,
      product: source.product,
      slots: JSON.parse(JSON.stringify(source.slots)),
    }

    source.type = target.type
    source.level = target.level
    source.product = target.product
    source.slots = JSON.parse(JSON.stringify(target.slots))

    target.type = temp.type
    target.level = temp.level
    target.product = temp.product
    target.slots = temp.slots
  }

  function updateFacility(roomId: MowerRoomId, patch: Partial<MowerFacility>): void {
    const facility = workspace.value.mainPlan.facilities[roomId]
    if (!facility) return
    Object.assign(facility, patch)
  }

  function updateSlot(roomId: MowerRoomId, slotIndex: number, slot: MowerSlot): void {
    const facility = workspace.value.mainPlan.facilities[roomId]
    if (!facility || !facility.slots[slotIndex]) return
    facility.slots[slotIndex] = JSON.parse(JSON.stringify(slot))
  }

  function replaceOperatorGlobally(targetOpId: string, replacementOpId: string): void {
    if (!targetOpId || !replacementOpId || targetOpId === replacementOpId) return
    const facilities = workspace.value.mainPlan.facilities

    for (const roomId of Object.keys(facilities) as MowerRoomId[]) {
      const facility = facilities[roomId]
      for (const slot of facility.slots) {
        if (slot.occupant.kind === 'operator' && slot.occupant.operatorId === targetOpId) {
          slot.occupant.operatorId = replacementOpId
        }
        slot.replacements = slot.replacements.map((id) => (id === targetOpId ? replacementOpId : id))
      }
    }
  }

  function updateConf(confPatch: Partial<MowerMainConf>): void {
    Object.assign(workspace.value.mainPlan.conf, confPatch)
  }

  function inferLevels(): void {
    inferFacilityLevels(workspace.value.mainPlan.facilities)
  }

  return {
    workspace,
    selectedRoomId,
    swapOutputRooms,
    updateFacility,
    updateSlot,
    replaceOperatorGlobally,
    updateConf,
    inferLevels,
  }
})
```

- [ ] **Step 4: Verify test passes**

Run: `pnpm vitest run src/workbench/store.spec.ts && pnpm typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit store implementation**

```powershell
git add src/workbench/store.ts src/workbench/store.spec.ts
git commit -m "feat: implement roster workbench Pinia store"
```

---

### Task 6: Real-Time Roster Validation Engine

**Files:**
- Create: `src/workbench/validate.ts`
- Create: `src/workbench/validate.spec.ts`

**Interfaces:**
- Produces: `validateRosterWorkspace(workspace: RosterWorkspace): ValidationResult` with error/warning issues targeting `roomId` and `slotIndex`.

- [ ] **Step 1: Write validation unit tests**

Create `src/workbench/validate.spec.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createDefaultWorkspace } from './defaults'
import { validateRosterWorkspace } from './validate'

describe('validateRosterWorkspace', () => {
  it('detects duplicate primary operators and marks as critical', () => {
    const ws = createDefaultWorkspace()
    ws.mainPlan.facilities.room_1_1.slots[0] = {
      occupant: { kind: 'operator', operatorId: 'char_002_amiya' },
      groupId: null,
      replacements: [],
    }
    ws.mainPlan.facilities.room_1_2.slots[0] = {
      occupant: { kind: 'operator', operatorId: 'char_002_amiya' },
      groupId: null,
      replacements: [],
    }

    const res = validateRosterWorkspace(ws)
    expect(res.criticalErrors.length).toBeGreaterThan(0)
    expect(res.criticalErrors[0].code).toBe('DUPLICATE_OPERATOR')
    expect(res.criticalErrors[0].roomId).toBe('room_1_2')
  })

  it('detects power deficit when power consumption exceeds generation', () => {
    const ws = createDefaultWorkspace()
    // Set all output rooms to lv3 manufacture (no power plants)
    for (const id of ['room_1_1', 'room_1_2', 'room_1_3', 'room_2_1', 'room_2_2', 'room_2_3', 'room_3_1', 'room_3_2', 'room_3_3'] as const) {
      ws.mainPlan.facilities[id].type = 'manufacture'
      ws.mainPlan.facilities[id].level = 3
    }

    const res = validateRosterWorkspace(ws)
    const powerError = res.criticalErrors.find((e) => e.code === 'POWER_DEFICIT')
    expect(powerError).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test and observe missing module failure**

Run: `pnpm vitest run src/workbench/validate.spec.ts`
Expected: FAIL due to missing `./validate`.

- [ ] **Step 3: Implement validation engine**

Create `src/workbench/validate.ts`:
```ts
import { MOWER_OUTPUT_ROOM_IDS, type MowerRoomId, type RosterWorkspace } from './model'

export interface ValidationIssue {
  code: 'DUPLICATE_OPERATOR' | 'POWER_DEFICIT' | 'SLOT_OVERFLOW' | 'INVALID_CONFIG' | 'NO_REPLACEMENT' | 'PLACEHOLDER_SLOT'
  severity: 'critical' | 'warning' | 'info'
  roomId: MowerRoomId
  slotIndex?: number
  message: string
}

export interface ValidationResult {
  isValid: boolean
  criticalErrors: ValidationIssue[]
  warnings: ValidationIssue[]
  issues: ValidationIssue[]
}

const OUTPUT_POWER_USE = { 1: 10, 2: 30, 3: 60 } as const
const POWER_GENERATION = { 1: 60, 2: 130, 3: 270 } as const
const DORM_POWER_USE = { 1: 10, 2: 20, 3: 30, 4: 45, 5: 65 } as const
const RIGHT_POWER_USE = { 1: 10, 2: 30, 3: 60 } as const

export function validateRosterWorkspace(workspace: RosterWorkspace): ValidationResult {
  const criticalErrors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []
  const assignedOperators = new Map<string, { roomId: MowerRoomId; slotIndex: number }>()

  let totalPowerGen = 0
  let totalPowerUse = 0

  const facilities = workspace.mainPlan.facilities

  for (const roomId of Object.keys(facilities) as MowerRoomId[]) {
    const facility = facilities[roomId]

    // Calculate power
    if (facility.type === 'power') {
      const lvl = (facility.level >= 1 && facility.level <= 3 ? facility.level : 3) as 1 | 2 | 3
      totalPowerGen += POWER_GENERATION[lvl]
    } else if (facility.type === 'manufacture' || facility.type === 'trading') {
      const lvl = (facility.level >= 1 && facility.level <= 3 ? facility.level : 3) as 1 | 2 | 3
      totalPowerUse += OUTPUT_POWER_USE[lvl]
    } else if (facility.type === 'dormitory') {
      const lvl = (facility.level >= 1 && facility.level <= 5 ? facility.level : 5) as 1 | 2 | 3 | 4 | 5
      totalPowerUse += DORM_POWER_USE[lvl]
    } else if (['meeting', 'factory', 'contact', 'train'].includes(facility.type)) {
      const lvl = (facility.level >= 1 && facility.level <= 3 ? facility.level : 3) as 1 | 2 | 3
      totalPowerUse += RIGHT_POWER_USE[lvl]
    }

    // Check slots
    const capacity = facility.level
    const activeStaff = facility.slots.filter((s) => s.occupant.kind !== 'empty').length
    if (activeStaff > capacity && (facility.type === 'manufacture' || facility.type === 'trading')) {
      criticalErrors.push({
        code: 'SLOT_OVERFLOW',
        severity: 'critical',
        roomId,
        message: `${roomId} 的在岗人数 (${activeStaff}) 超过了设施等级容量 (${capacity})。`,
      })
    }

    facility.slots.forEach((slot, slotIndex) => {
      if (slot.occupant.kind === 'operator') {
        const opId = slot.occupant.operatorId
        const existing = assignedOperators.get(opId)
        if (existing) {
          criticalErrors.push({
            code: 'DUPLICATE_OPERATOR',
            severity: 'critical',
            roomId,
            slotIndex,
            message: `干员在 ${existing.roomId} 和 ${roomId} 同时在岗，不可重复指派主力。`,
          })
        } else {
          assignedOperators.set(opId, { roomId, slotIndex })
        }

        if (slot.replacements.length === 0) {
          warnings.push({
            code: 'NO_REPLACEMENT',
            severity: 'warning',
            roomId,
            slotIndex,
            message: `${roomId} 席位干员未配置替补。`,
          })
        }
      } else if (slot.occupant.kind === 'free' || slot.occupant.kind === 'current') {
        warnings.push({
          code: 'PLACEHOLDER_SLOT',
          severity: 'warning',
          roomId,
          slotIndex,
          message: `${roomId} 席位使用 ${slot.occupant.kind} 占位，在收益模拟中将视为空席。`,
        })
      }
    })
  }

  if (totalPowerUse > totalPowerGen) {
    criticalErrors.push({
      code: 'POWER_DEFICIT',
      severity: 'critical',
      roomId: 'room_1_3',
      message: `基建总耗电量 (${totalPowerUse}) 超过总发电量 (${totalPowerGen})，存在电力赤字。`,
    })
  }

  return {
    isValid: criticalErrors.length === 0,
    criticalErrors,
    warnings,
    issues: [...criticalErrors, ...warnings],
  }
}
```

- [ ] **Step 4: Verify test passes**

Run: `pnpm vitest run src/workbench/validate.spec.ts && pnpm typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit validation module**

```powershell
git add src/workbench/validate.ts src/workbench/validate.spec.ts
git commit -m "feat: implement real-time roster validation engine"
```

---

### Task 7: Lossless Mower JSON Codec & Sanitized External Fixtures

**Files:**
- Create: `src/workbench/compat/fixtures/mower-252-3gold.json`
- Create: `src/workbench/compat/fixtures/mower-342-pure-lmd.json`
- Create: `src/workbench/compat/fixtures/mower-342-orirock.json`
- Create: `src/workbench/compat/mowerJson.ts`
- Create: `src/workbench/compat/mowerJson.spec.ts`

**Interfaces:**
- Produces: `importMowerJson(jsonString: string): RosterWorkspace`, `exportMowerJson(workspace: RosterWorkspace): string`.
- Features: Real top-level sibling layout (`default`, `plan1`, `conf`, `backup_plans`), round-trip preservation of unknown fields in envelope, correct mapping for Mower product codenames (`exp3`, `orirock`, `lmd`, `gold`, `orundum`).

- [ ] **Step 1: Copy external samples into sanitized test fixtures and write round-trip tests**

Create fixture files copying raw content from `E:\OneDrive\Mower`:
- `src/workbench/compat/fixtures/mower-252-3gold.json` (from `E:\OneDrive\Mower\252三赤金.json`)
- `src/workbench/compat/fixtures/mower-342-pure-lmd.json` (from `E:\OneDrive\Mower\342纯钱.json`)
- `src/workbench/compat/fixtures/mower-342-orirock.json` (from `E:\OneDrive\Mower\342搓玉.json`)

Create `src/workbench/compat/mowerJson.spec.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { importMowerJson, exportMowerJson } from './mowerJson'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Mower JSON Codec', () => {
  it('parses real 252 sample with top-level conf and backup_plans', () => {
    const raw = readFileSync(resolve(__dirname, 'fixtures/mower-252-3gold.json'), 'utf-8')
    const ws = importMowerJson(raw)

    expect(ws.schemaVersion).toBe(8)
    expect(ws.compatibility.defaultPlanKey).toBe('plan1')
    expect(ws.mainPlan.conf.ling_xi).toBe(3)
    expect(ws.mainPlan.conf.exhaust_require).toContain('阿罗玛')
    expect(ws.mainPlan.facilities.room_1_1.type).toBe('manufacture')
    expect(ws.mainPlan.facilities.room_1_1.product).toBe('exp')
    expect(ws.mainPlan.facilities.room_1_1.slots[0].occupant).toMatchObject({
      kind: 'operator',
    })
  })

  it('preserves top-level siblings and unknown fields losslessly on export', () => {
    const raw = readFileSync(resolve(__dirname, 'fixtures/mower-252-3gold.json'), 'utf-8')
    const ws = importMowerJson(raw)
    const exported = exportMowerJson(ws)
    const parsed = JSON.parse(exported)

    expect(parsed.default).toBe('plan1')
    expect(parsed.plan1).toBeDefined()
    expect(parsed.conf).toBeDefined()
    expect(parsed.conf.ling_xi).toBe(3)
    expect(typeof parsed.conf.exhaust_require).toBe('string')
    expect(Array.isArray(parsed.backup_plans)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test and observe missing module failure**

Run: `pnpm vitest run src/workbench/compat/mowerJson.spec.ts`
Expected: FAIL due to missing `./mowerJson`.

- [ ] **Step 3: Implement Mower JSON parser and serializer**

Create `src/workbench/compat/mowerJson.ts`:
```ts
import { OPERATOR_MAP, OPERATORS } from '../../domain/operators'
import { createDefaultWorkspace } from '../defaults'
import {
  MOWER_OUTPUT_ROOM_IDS,
  MOWER_ROOM_IDS,
  type MowerFacility,
  type MowerFacilityType,
  type MowerProduct,
  type MowerRoomId,
  type MowerSlot,
  type RosterWorkspace,
} from '../model'

const OPERATOR_BY_NAME = new Map(OPERATORS.map((op) => [op.name, op]))

function parseProduct(product: string | undefined): MowerProduct | undefined {
  if (product === 'exp3' || product === 'exp') return 'exp'
  if (product === 'gold') return 'gold'
  if (product === 'orirock' || product === 'fragment') return 'fragment'
  if (product === 'lmd' || product === 'money') return 'money'
  if (product === 'orundum') return 'orundum'
  return undefined
}

function serializeProduct(facilityType: MowerFacilityType, product: MowerProduct | undefined): string | undefined {
  if (facilityType === 'manufacture') {
    if (product === 'exp') return 'exp3'
    if (product === 'fragment') return 'orirock'
    return 'gold'
  }
  if (facilityType === 'trading') {
    if (product === 'orundum') return 'orundum'
    return 'lmd'
  }
  return undefined
}

export function importMowerJson(text: string): RosterWorkspace {
  const parsed = JSON.parse(text)
  const ws = createDefaultWorkspace()
  const defaultKey = typeof parsed.default === 'string' ? parsed.default : 'plan1'
  ws.compatibility.defaultPlanKey = defaultKey

  const rawPlan = parsed[defaultKey] ?? {}
  for (const roomId of MOWER_ROOM_IDS) {
    const rawFacility = rawPlan[roomId]
    if (!rawFacility) continue
    const facility = ws.mainPlan.facilities[roomId]

    if (rawFacility.name === '制造站') facility.type = 'manufacture'
    else if (rawFacility.name === '贸易站') facility.type = 'trading'
    else if (rawFacility.name === '发电站') facility.type = 'power'

    facility.product = parseProduct(rawFacility.product)

    if (Array.isArray(rawFacility.plans)) {
      facility.slots = rawFacility.plans.map((p: any): MowerSlot => {
        let occupant: MowerSlot['occupant'] = { kind: 'empty' }
        if (p.agent === 'Free') occupant = { kind: 'free' }
        else if (p.agent === 'Current') occupant = { kind: 'current' }
        else if (p.agent) {
          const matched = OPERATOR_BY_NAME.get(p.agent)
          occupant = { kind: 'operator', operatorId: matched ? matched.charId : p.agent }
        }

        const replacements = Array.isArray(p.replacement)
          ? p.replacement.map((r: string) => {
              const m = OPERATOR_BY_NAME.get(r)
              return m ? m.charId : r
            })
          : []

        return {
          occupant,
          groupId: p.group || null,
          replacements,
        }
      })
    }
  }

  // Parse top-level conf
  if (parsed.conf && typeof parsed.conf === 'object') {
    const c = parsed.conf
    ws.mainPlan.conf.ling_xi = (c.ling_xi === 1 || c.ling_xi === 2 || c.ling_xi === 3) ? c.ling_xi : 1

    const listFields: Array<keyof typeof ws.mainPlan.conf> = [
      'exhaust_require', 'rest_in_full', 'resting_priority', 'workaholic',
      'refresh_trading', 'refresh_drained', 'ope_resting_priority',
    ]

    for (const key of listFields) {
      if (typeof c[key] === 'string') {
        (ws.mainPlan.conf as any)[key] = c[key]
          .split(/[,，]/)
          .map((s: string) => s.trim())
          .filter(Boolean)
      }
    }
  }

  // Retain backup_plans & unrecognized fields in envelope
  if (Array.isArray(parsed.backup_plans)) {
    ws.compatibility.backupPlans = parsed.backup_plans
  }

  const knownRootKeys = new Set(['default', defaultKey, 'conf', 'backup_plans'])
  for (const k of Object.keys(parsed)) {
    if (!knownRootKeys.has(k)) {
      ws.compatibility.unrecognizedFields[k] = parsed[k]
    }
  }

  return ws
}

export function exportMowerJson(workspace: RosterWorkspace): string {
  const planObj: Record<string, any> = {}
  const facilities = workspace.mainPlan.facilities

  for (const roomId of MOWER_ROOM_IDS) {
    const f = facilities[roomId]
    let name = ''
    if (f.type === 'manufacture') name = '制造站'
    else if (f.type === 'trading') name = '贸易站'
    else if (f.type === 'power') name = '发电站'

    const plans = f.slots.map((slot) => {
      let agent = ''
      if (slot.occupant.kind === 'free') agent = 'Free'
      else if (slot.occupant.kind === 'current') agent = 'Current'
      else if (slot.occupant.kind === 'operator') {
        agent = OPERATOR_MAP.get(slot.occupant.operatorId)?.name ?? slot.occupant.operatorId
      }

      const replacement = slot.replacements.map((id) => OPERATOR_MAP.get(id)?.name ?? id)
      return {
        agent,
        group: slot.groupId || '',
        replacement,
      }
    })

    const facilityData: any = { name, plans }
    const product = serializeProduct(f.type, f.product)
    if (product) facilityData.product = product

    planObj[roomId] = facilityData
  }

  const conf: Record<string, any> = {
    ling_xi: workspace.mainPlan.conf.ling_xi,
    exhaust_require: (workspace.mainPlan.conf.exhaust_require || []).join(','),
    rest_in_full: (workspace.mainPlan.conf.rest_in_full || []).join(','),
    resting_priority: (workspace.mainPlan.conf.resting_priority || []).join(','),
    workaholic: (workspace.mainPlan.conf.workaholic || []).join(','),
    refresh_trading: (workspace.mainPlan.conf.refresh_trading || []).join(','),
    refresh_drained: (workspace.mainPlan.conf.refresh_drained || []).join(','),
    ope_resting_priority: (workspace.mainPlan.conf.ope_resting_priority || []).join(','),
  }

  const output: Record<string, any> = {
    default: workspace.compatibility.defaultPlanKey || 'plan1',
    [workspace.compatibility.defaultPlanKey || 'plan1']: planObj,
    conf,
    backup_plans: workspace.compatibility.backupPlans || [],
    ...workspace.compatibility.otherPlans,
    ...workspace.compatibility.unrecognizedFields,
  }

  return JSON.stringify(output, null, 2)
}
```

- [ ] **Step 4: Verify test passes**

Run: `pnpm vitest run src/workbench/compat/mowerJson.spec.ts && pnpm typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit Mower JSON codec**

```powershell
git add src/workbench/compat/mowerJson.ts src/workbench/compat/mowerJson.spec.ts src/workbench/compat/fixtures/
git commit -m "feat: implement lossless Mower JSON codec and sanitized fixtures"
```

---

### Task 8: 16-QR JPG Codec (Strict qrcode.py Layout & Base45, Zero OCR)

**Files:**
- Create: `src/workbench/compat/base45.ts`
- Create: `src/workbench/compat/mowerQrConstants.ts`
- Create: `src/workbench/compat/mowerQrCodec.ts`
- Create: `src/workbench/compat/fixtures/mower-252-sample.jpg`
- Create: `src/workbench/compat/base45.spec.ts`
- Create: `src/workbench/compat/mowerQrCodec.spec.ts`

**Interfaces:**
- Produces: `encodeBase45(bytes: Uint8Array): string`, `decodeBase45(str: string): Uint8Array`.
- Constants: `QRCODE_SIZE = 215`, `GAP_SIZE = 16`, `TOP = 40`, `BOTTOM = 995`, `LEFT = 40`, `RIGHT_PAIR_X = 2520`.
- Functions: `exportRosterTo16Qr(canvas: HTMLCanvasElement, jsonText: string): Promise<Blob>`, `decode16QrFromCanvas(canvas: HTMLCanvasElement): Promise<string>`.

- [ ] **Step 1: Write Base45 RFC 9285 test and 16-QR coordinate layout tests**

Create `src/workbench/compat/base45.spec.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { encodeBase45, decodeBase45 } from './base45'

describe('RFC 9285 Base45', () => {
  it('encodes and decodes standard test vectors', () => {
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const text = 'Hello!!'
    const encoded = encodeBase45(encoder.encode(text))
    expect(encoded).toBe('%69 VD92EX0')

    const decoded = decodeBase45(encoded)
    expect(decoder.decode(decoded)).toBe(text)
  })
})
```

Create `src/workbench/compat/mowerQrCodec.spec.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { get16QrChunkCoordinates } from './mowerQrConstants'

describe('16-QR Geometric Layout', () => {
  it('computes exact 16 QR coordinates according to qrcode.py constants', () => {
    const coords = get16QrChunkCoordinates()
    expect(coords).toHaveLength(16)

    // Top 7 (0..6)
    for (let i = 0; i < 7; i++) {
      expect(coords[i].y).toBe(40)
      expect(coords[i].x).toBe(40 + i * 231)
    }

    // Bottom-Left 7 (7..13)
    for (let i = 7; i < 14; i++) {
      expect(coords[i].y).toBe(995)
      expect(coords[i].x).toBe(40 + (i - 7) * 231)
    }

    // Bottom-Right 2 (14..15)
    expect(coords[14].y).toBe(995)
    expect(coords[14].x).toBe(2520)
    expect(coords[15].y).toBe(995)
    expect(coords[15].x).toBe(2520 + 231)
  })
})
```

- [ ] **Step 2: Run tests and observe missing module failure**

Run: `pnpm vitest run src/workbench/compat/base45.spec.ts src/workbench/compat/mowerQrCodec.spec.ts`
Expected: FAIL due to missing `./base45` and `./mowerQrConstants`.

- [ ] **Step 3: Implement RFC 9285 Base45, layout constants, and 16-QR codec**

Create `src/workbench/compat/base45.ts`:
```ts
const B45_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'
const B45_REV = new Map<string, number>()
for (let i = 0; i < B45_CHARSET.length; i++) {
  B45_REV.set(B45_CHARSET[i], i)
}

export function encodeBase45(bytes: Uint8Array): string {
  let result = ''
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const val = (bytes[i] << 8) | bytes[i + 1]
      const c = val % 45
      const d = Math.floor(val / 45) % 45
      const e = Math.floor(Math.floor(val / 45) / 45)
      result += B45_CHARSET[c] + B45_CHARSET[d] + B45_CHARSET[e]
    } else {
      const val = bytes[i]
      const c = val % 45
      const d = Math.floor(val / 45)
      result += B45_CHARSET[c] + B45_CHARSET[d]
    }
  }
  return result
}

export function decodeBase45(str: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < str.length; i += 3) {
    if (i + 2 < str.length) {
      const c = B45_REV.get(str[i])
      const d = B45_REV.get(str[i + 1])
      const e = B45_REV.get(str[i + 2])
      if (c === undefined || d === undefined || e === undefined) {
        throw new Error(`Invalid Base45 character in chunk: ${str.slice(i, i + 3)}`)
      }
      const val = c + d * 45 + e * 45 * 45
      out.push((val >> 8) & 0xff, val & 0xff)
    } else {
      const c = B45_REV.get(str[i])
      const d = B45_REV.get(str[i + 1])
      if (c === undefined || d === undefined) {
        throw new Error(`Invalid Base45 character in tail: ${str.slice(i, i + 2)}`)
      }
      const val = c + d * 45
      out.push(val & 0xff)
    }
  }
  return new Uint8Array(out)
}
```

Create `src/workbench/compat/mowerQrConstants.ts`:
```ts
export const QRCODE_SIZE = 215
export const GAP_SIZE = 16
export const TOP = 40
export const BOTTOM = 995
export const LEFT = 40
export const RIGHT_PAIR_X = 2520

export interface QrChunkCoordinate {
  chunkIndex: number
  x: number
  y: number
  size: number
}

export function get16QrChunkCoordinates(): QrChunkCoordinate[] {
  const coords: QrChunkCoordinate[] = []
  const step = QRCODE_SIZE + GAP_SIZE // 231

  // Top 7 (0..6)
  for (let i = 0; i < 7; i++) {
    coords.push({ chunkIndex: i, x: LEFT + i * step, y: TOP, size: QRCODE_SIZE })
  }
  // Bottom-left 7 (7..13)
  for (let i = 7; i < 14; i++) {
    coords.push({ chunkIndex: i, x: LEFT + (i - 7) * step, y: BOTTOM, size: QRCODE_SIZE })
  }
  // Bottom-right 2 (14..15)
  for (let i = 14; i < 16; i++) {
    coords.push({ chunkIndex: i, x: RIGHT_PAIR_X + (i - 14) * step, y: BOTTOM, size: QRCODE_SIZE })
  }
  return coords
}
```

Create `src/workbench/compat/mowerQrCodec.ts`:
```ts
import jsQR from 'jsqr'
import { deflateSync, inflateSync } from 'node:zlib'
import { decodeBase45, encodeBase45 } from './base45'
import { get16QrChunkCoordinates, QRCODE_SIZE } from './mowerQrConstants'

export function splitInto16Chunks(base45Str: string): string[] {
  const total = base45Str.length
  const chunkSize = Math.ceil(total / 16)
  const chunks: string[] = []
  for (let i = 0; i < 16; i++) {
    const start = i * chunkSize
    chunks.push(base45Str.slice(start, Math.min(start + chunkSize, total)))
  }
  return chunks
}

export function encodeJsonTo16Chunks(jsonString: string): string[] {
  const bytes = new TextEncoder().encode(jsonString)
  const compressed = deflateSync(bytes, { level: 9 })
  const base45 = encodeBase45(compressed)
  return splitInto16Chunks(base45)
}

export function decode16ChunksToJson(chunks: string[]): string {
  if (chunks.length !== 16) {
    throw new Error(`Expected 16 chunks, got ${chunks.length}`)
  }
  const combined = chunks.join('')
  const compressed = decodeBase45(combined)
  const decompressed = inflateSync(compressed)
  return new TextDecoder().decode(decompressed)
}

export interface DetectedQr {
  data: string
  x: number
  y: number
  bounds: { x: number; y: number; width: number; height: number }
}

export function scanCanvasWithMasking(ctx: CanvasRenderingContext2D, width: number, height: number): DetectedQr[] {
  const detected: DetectedQr[] = []
  const maxIterations = 20

  for (let iter = 0; iter < maxIterations; iter++) {
    const imgData = ctx.getImageData(0, 0, width, height)
    const code = jsQR(imgData.data, width, height)
    if (!code) break

    const minX = Math.min(code.location.topLeftCorner.x, code.location.bottomLeftCorner.x)
    const maxX = Math.max(code.location.topRightCorner.x, code.location.bottomRightCorner.x)
    const minY = Math.min(code.location.topLeftCorner.y, code.location.topRightCorner.y)
    const maxY = Math.max(code.location.bottomLeftCorner.y, code.location.bottomRightCorner.y)
    const w = maxX - minX
    const h = maxY - minY

    detected.push({
      data: code.data,
      x: minX,
      y: minY,
      bounds: { x: minX, y: minY, width: w, height: h },
    })

    // Mask the detected QR code with pure white to avoid re-detection
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(Math.max(0, minX - 4), Math.max(0, minY - 4), w + 8, h + 8)
  }

  // Geometric Topological Sort: Top-half (y < 500) first, then Bottom-half (y >= 500); each sorted by x ascending
  const topHalf = detected.filter((d) => d.y < 500).sort((a, b) => a.x - b.x)
  const bottomHalf = detected.filter((d) => d.y >= 500).sort((a, b) => a.x - b.x)

  return [...topHalf, ...bottomHalf]
}
```

Copy sample JPG `E:\OneDrive\Mower\252三赤金.jpg` into `src/workbench/compat/fixtures/mower-252-sample.jpg`.

- [ ] **Step 4: Verify test passes**

Run: `pnpm vitest run src/workbench/compat/base45.spec.ts src/workbench/compat/mowerQrCodec.spec.ts && pnpm typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit 16-QR codec**

```powershell
git add src/workbench/compat/base45.ts src/workbench/compat/mowerQrConstants.ts src/workbench/compat/mowerQrCodec.ts src/workbench/compat/fixtures/mower-252-sample.jpg
git commit -m "feat: implement 16-QR Base45 codec adhering to qrcode.py without OCR"
```

---

### Task 9: Faithful Mower 980px Base Map & Drag-Swap UI Components

**Files:**
- Create: `src/workbench/styles.css`
- Create: `src/components/workbench/FacilityCard.vue`
- Create: `src/components/workbench/BaseMap.vue`
- Create: `src/components/workbench/BaseMap.spec.ts`

**Interfaces:**
- Produces:
  - `FacilityCard.vue`: Renders facility with Mower dark/light palette, product watermark, level badge, and staff avatars.
  - `BaseMap.vue`: Renders 980px 3-column layout (left 3x3 output, middle central + 4 dorms, right functional facilities) with HTML5 drag-and-drop atomic swapping between output rooms.

- [ ] **Step 1: Write unit tests for BaseMap drag-swap interaction**

Create `src/components/workbench/BaseMap.spec.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import BaseMap from './BaseMap.vue'
import { useRosterWorkbenchStore } from '../../workbench/store'

describe('BaseMap.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders 980px three-column structure with 21 facility cards', () => {
    const wrapper = mount(BaseMap)
    expect(wrapper.find('.base-map-container').exists()).toBe(true)
    const cards = wrapper.findAll('.facility-card')
    expect(cards.length).toBe(21)
  })

  it('dispatches atomic room swap when output facility is dropped on another', async () => {
    const store = useRosterWorkbenchStore()
    store.workspace.mainPlan.facilities.room_1_1.type = 'manufacture'
    store.workspace.mainPlan.facilities.room_1_2.type = 'trading'

    const wrapper = mount(BaseMap)
    const card1 = wrapper.find('[data-room-id="room_1_1"]')
    const card2 = wrapper.find('[data-room-id="room_1_2"]')

    await card1.trigger('dragstart', { dataTransfer: { setData: () => {} } })
    await card2.trigger('drop', { dataTransfer: { getData: () => 'room_1_1' } })

    expect(store.workspace.mainPlan.facilities.room_1_1.type).toBe('trading')
    expect(store.workspace.mainPlan.facilities.room_1_2.type).toBe('manufacture')
  })
})
```

- [ ] **Step 2: Run test and observe missing component failure**

Run: `pnpm vitest run src/components/workbench/BaseMap.spec.ts`
Expected: FAIL due to missing `./BaseMap.vue`.

- [ ] **Step 3: Implement Mower visual styles, FacilityCard.vue, and BaseMap.vue**

Create `src/workbench/styles.css`:
```css
/* Mower High-Fidelity Roster Colors & Dimensions */
:root {
  --mower-bg: #1e1e1e;
  --mower-card-bg: #2d2d2d;
  --mower-card-border: #444444;
  --mower-card-selected: #2d8cf0;
  --mower-manufacture: #e6a23c;
  --mower-trading: #409eff;
  --mower-power: #67c23a;
  --mower-dormitory: #909399;
  --mower-central: #e6a23c;
  --mower-meeting: #e6a23c;
}

.mower-workbench {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--mower-bg);
  color: #f0f0f0;
}

.base-map-viewport {
  width: 100%;
  overflow-x: auto;
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.base-map-container {
  width: 980px;
  min-width: 980px;
  display: grid;
  grid-template-columns: 360px 280px 340px;
  gap: 12px;
}

.map-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.output-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.facility-card {
  position: relative;
  background: var(--mower-card-bg);
  border: 1px solid var(--mower-card-border);
  border-radius: 4px;
  padding: 6px 8px;
  cursor: pointer;
  user-select: none;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.facility-card:hover {
  border-color: #666;
}

.facility-card.is-selected {
  border-color: var(--mower-card-selected);
  box-shadow: 0 0 6px rgba(45, 140, 240, 0.5);
}

.facility-card.type-manufacture { border-left: 4px solid var(--mower-manufacture); }
.facility-card.type-trading { border-left: 4px solid var(--mower-trading); }
.facility-card.type-power { border-left: 4px solid var(--mower-power); }
.facility-card.type-dormitory { border-left: 4px solid var(--mower-dormitory); }
.facility-card.type-central { border-left: 4px solid var(--mower-central); }

.watermark {
  position: absolute;
  right: -8px;
  bottom: -8px;
  font-size: 38px;
  opacity: 0.08;
  pointer-events: none;
  font-weight: 900;
}
```

Create `src/components/workbench/FacilityCard.vue`:
```vue
<template>
  <div
    class="facility-card"
    :class="[
      `type-${facility.type || 'empty'}`,
      { 'is-selected': isSelected, 'is-draggable': isOutputRoom }
    ]"
    :data-room-id="facility.roomId"
    :draggable="isOutputRoom"
    @click="$emit('select', facility.roomId)"
    @dragstart="onDragStart"
    @dragover.prevent
    @drop="onDrop"
  >
    <div class="card-header">
      <span class="room-title">{{ roomDisplayName }}</span>
      <span class="level-badge">Lv.{{ facility.level }}</span>
    </div>
    <div class="card-body">
      <div v-for="(slot, idx) in facility.slots" :key="idx" class="slot-mini">
        <span v-if="slot.occupant.kind === 'operator'" class="op-tag">
          {{ operatorName(slot.occupant.operatorId) }}
        </span>
        <span v-else-if="slot.occupant.kind === 'free'" class="placeholder-tag">Free</span>
        <span v-else-if="slot.occupant.kind === 'current'" class="placeholder-tag">Current</span>
        <span v-else class="empty-tag">-</span>
      </div>
    </div>
    <div v-if="facility.product" class="watermark">{{ facility.product.toUpperCase() }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { OPERATOR_MAP } from '../../domain/operators'
import { MOWER_OUTPUT_ROOM_IDS, type MowerFacility, type MowerRoomId } from '../../workbench/model'

const props = defineProps<{
  facility: MowerFacility
  isSelected: boolean
}>()

const emit = defineEmits<{
  (e: 'select', roomId: MowerRoomId): void
  (e: 'swap', from: string, to: string): void
}>()

const isOutputRoom = computed(() => (MOWER_OUTPUT_ROOM_IDS as readonly string[]).includes(props.facility.roomId))

const roomDisplayName = computed(() => {
  const map: Record<string, string> = {
    room_1_1: 'B101', room_1_2: 'B102', room_1_3: 'B103',
    room_2_1: 'B201', room_2_2: 'B202', room_2_3: 'B203',
    room_3_1: 'B301', room_3_2: 'B302', room_3_3: 'B303',
    central: '控制中枢', meeting: '会客室', factory: '加工站',
    contact: '办公室', train: '训练室',
    dormitory_1: '宿舍1', dormitory_2: '宿舍2', dormitory_3: '宿舍3', dormitory_4: '宿舍4',
  }
  return map[props.facility.roomId] || props.facility.roomId
})

function operatorName(id: string) {
  return OPERATOR_MAP.get(id)?.name || id
}

function onDragStart(e: DragEvent) {
  if (!isOutputRoom.value) return
  e.dataTransfer?.setData('text/plain', props.facility.roomId)
}

function onDrop(e: DragEvent) {
  if (!isOutputRoom.value) return
  const fromRoom = e.dataTransfer?.getData('text/plain')
  if (fromRoom && fromRoom !== props.facility.roomId) {
    emit('swap', fromRoom, props.facility.roomId)
  }
}
</script>
```

Create `src/components/workbench/BaseMap.vue`:
```vue
<template>
  <div class="base-map-viewport">
    <div class="base-map-container">
      <!-- Left Column: Output Rooms 3x3 -->
      <div class="map-column left-column">
        <div class="output-grid">
          <FacilityCard
            v-for="id in MOWER_OUTPUT_ROOM_IDS"
            :key="id"
            :facility="store.workspace.mainPlan.facilities[id]"
            :is-selected="store.selectedRoomId === id"
            @select="store.selectedRoomId = id"
            @swap="store.swapOutputRooms($event as any, id as any)"
          />
        </div>
      </div>

      <!-- Center Column: Central + 4 Dorms -->
      <div class="map-column center-column">
        <FacilityCard
          :facility="store.workspace.mainPlan.facilities.central"
          :is-selected="store.selectedRoomId === 'central'"
          @select="store.selectedRoomId = 'central'"
        />
        <FacilityCard
          v-for="i in 4"
          :key="`dormitory_${i}`"
          :facility="store.workspace.mainPlan.facilities[`dormitory_${i}` as MowerRoomId]"
          :is-selected="store.selectedRoomId === `dormitory_${i}`"
          @select="store.selectedRoomId = `dormitory_${i}` as MowerRoomId"
        />
      </div>

      <!-- Right Column: Functional Facilities -->
      <div class="map-column right-column">
        <FacilityCard
          v-for="id in rightFacilities"
          :key="id"
          :facility="store.workspace.mainPlan.facilities[id]"
          :is-selected="store.selectedRoomId === id"
          @select="store.selectedRoomId = id"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRosterWorkbenchStore } from '../../workbench/store'
import { MOWER_OUTPUT_ROOM_IDS, type MowerRoomId } from '../../workbench/model'
import FacilityCard from './FacilityCard.vue'

const store = useRosterWorkbenchStore()
const rightFacilities: MowerRoomId[] = ['meeting', 'factory', 'contact', 'train']
</script>
```

- [ ] **Step 4: Run BaseMap tests**

Run: `pnpm vitest run src/components/workbench/BaseMap.spec.ts && pnpm typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit BaseMap components**

```powershell
git add src/workbench/styles.css src/components/workbench/FacilityCard.vue src/components/workbench/BaseMap.vue src/components/workbench/BaseMap.spec.ts
git commit -m "feat: implement 980px BaseMap and atomic drag-swap FacilityCard"
```

---

### Task 10: Selected Facility Editor, Slot Row & Ordered Replacement List

**Files:**
- Create: `src/components/workbench/ReplacementList.vue`
- Create: `src/components/workbench/SlotRow.vue`
- Create: `src/components/workbench/FacilityEditor.vue`
- Create: `src/components/workbench/FacilityEditor.spec.ts`

**Interfaces:**
- Produces:
  - `ReplacementList.vue`: Ordered list of backup operator tags supporting removal and reordering.
  - `SlotRow.vue`: Single slot editor with operator picker button, Free/Current/Empty dropdown, group label input, and replacements expansion.
  - `FacilityEditor.vue`: Panel displaying type, level, product dropdowns and reactive slots list for the selected room.

- [ ] **Step 1: Write unit tests for FacilityEditor interactions**

Create `src/components/workbench/FacilityEditor.spec.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FacilityEditor from './FacilityEditor.vue'
import { useRosterWorkbenchStore } from '../../workbench/store'

describe('FacilityEditor.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('updates facility level and type reactively in store', async () => {
    const store = useRosterWorkbenchStore()
    store.selectedRoomId = 'room_1_1'
    const wrapper = mount(FacilityEditor)

    const levelSelect = wrapper.find('[data-test="level-select"]')
    await levelSelect.setValue('2')
    expect(store.workspace.mainPlan.facilities.room_1_1.level).toBe(2)
  })
})
```

- [ ] **Step 2: Run test and observe missing component failure**

Run: `pnpm vitest run src/components/workbench/FacilityEditor.spec.ts`
Expected: FAIL due to missing `./FacilityEditor.vue`.

- [ ] **Step 3: Implement ReplacementList, SlotRow, and FacilityEditor**

Create `src/components/workbench/ReplacementList.vue`:
```vue
<template>
  <div class="replacement-list">
    <div class="tags-container">
      <span v-for="(opId, idx) in replacements" :key="opId" class="replacement-tag">
        {{ idx + 1 }}. {{ opName(opId) }}
        <button type="button" class="remove-btn" @click="remove(idx)">×</button>
      </span>
    </div>
    <button type="button" class="add-btn" @click="$emit('add')">+ 添加替补</button>
  </div>
</template>

<script setup lang="ts">
import { OPERATOR_MAP } from '../../domain/operators'

const props = defineProps<{
  replacements: string[]
}>()

const emit = defineEmits<{
  (e: 'update:replacements', val: string[]): void
  (e: 'add'): void
}>()

function opName(id: string) {
  return OPERATOR_MAP.get(id)?.name || id
}

function remove(index: number) {
  const next = [...props.replacements]
  next.splice(index, 1)
  emit('update:replacements', next)
}
</script>
```

Create `src/components/workbench/SlotRow.vue`:
```vue
<template>
  <div class="slot-row">
    <span class="slot-index">#{{ index + 1 }}</span>

    <!-- Occupant Select -->
    <select :value="slot.occupant.kind" class="kind-select" @change="onKindChange($event)">
      <option value="operator">干员</option>
      <option value="free">Free</option>
      <option value="current">Current</option>
      <option value="empty">清空</option>
    </select>

    <!-- Operator Picker Button -->
    <button
      v-if="slot.occupant.kind === 'operator'"
      type="button"
      class="op-pick-btn"
      @click="$emit('pick-operator')"
    >
      {{ operatorDisplayName }}
    </button>

    <!-- Group Label -->
    <input
      :value="slot.groupId || ''"
      type="text"
      placeholder="分组标签"
      class="group-input"
      @input="onGroupInput($event)"
    />

    <!-- Replacements toggle -->
    <button type="button" class="toggle-rep-btn" @click="showReplacements = !showReplacements">
      替补 ({{ slot.replacements.length }})
    </button>

    <ReplacementList
      v-if="showReplacements"
      :replacements="slot.replacements"
      @update:replacements="onReplacementsUpdate"
      @add="$emit('pick-replacement')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { OPERATOR_MAP } from '../../domain/operators'
import type { MowerSlot } from '../../workbench/model'
import ReplacementList from './ReplacementList.vue'

const props = defineProps<{
  index: number
  slot: MowerSlot
}>()

const emit = defineEmits<{
  (e: 'update', val: MowerSlot): void
  (e: 'pick-operator'): void
  (e: 'pick-replacement'): void
}>()

const showReplacements = ref(false)

const operatorDisplayName = computed(() => {
  if (props.slot.occupant.kind !== 'operator') return '选择干员'
  return OPERATOR_MAP.get(props.slot.occupant.operatorId)?.name || props.slot.occupant.operatorId
})

function onKindChange(e: Event) {
  const kind = (e.target as HTMLSelectElement).value as MowerSlot['occupant']['kind']
  const next: MowerSlot = { ...props.slot }
  if (kind === 'empty') next.occupant = { kind: 'empty' }
  else if (kind === 'free') next.occupant = { kind: 'free' }
  else if (kind === 'current') next.occupant = { kind: 'current' }
  else next.occupant = { kind: 'operator', operatorId: '' }
  emit('update', next)
}

function onGroupInput(e: Event) {
  const val = (e.target as HTMLInputElement).value.trim() || null
  emit('update', { ...props.slot, groupId: val })
}

function onReplacementsUpdate(replacements: string[]) {
  emit('update', { ...props.slot, replacements })
}
</script>
```

Create `src/components/workbench/FacilityEditor.vue`:
```vue
<template>
  <div v-if="currentFacility" class="facility-editor-panel">
    <div class="panel-header">
      <h3>编辑设施: {{ currentFacility.roomId }}</h3>
      <div class="controls">
        <label>
          等级:
          <select
            :value="currentFacility.level"
            data-test="level-select"
            @change="updateLevel($event)"
          >
            <option v-for="lvl in maxLevel" :key="lvl" :value="lvl">Lv.{{ lvl }}</option>
          </select>
        </label>

        <label v-if="isOutput">
          类型:
          <select :value="currentFacility.type" @change="updateType($event)">
            <option value="manufacture">制造站</option>
            <option value="trading">贸易站</option>
            <option value="power">发电站</option>
          </select>
        </label>

        <label v-if="currentFacility.type === 'manufacture'">
          产物:
          <select :value="currentFacility.product" @change="updateProduct($event)">
            <option value="gold">赤金</option>
            <option value="exp">作战记录</option>
            <option value="fragment">源石碎片</option>
          </select>
        </label>

        <label v-if="currentFacility.type === 'trading'">
          产物:
          <select :value="currentFacility.product" @change="updateProduct($event)">
            <option value="money">龙门币订单</option>
            <option value="orundum">源石碎片订单</option>
          </select>
        </label>
      </div>
    </div>

    <div class="slots-list">
      <SlotRow
        v-for="(slot, idx) in currentFacility.slots"
        :key="idx"
        :index="idx"
        :slot="slot"
        @update="store.updateSlot(currentFacility.roomId, idx, $event)"
        @pick-operator="openPicker(idx, 'primary')"
        @pick-replacement="openPicker(idx, 'replacement')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRosterWorkbenchStore } from '../../workbench/store'
import SlotRow from './SlotRow.vue'

const store = useRosterWorkbenchStore()

const currentFacility = computed(() => {
  if (!store.selectedRoomId) return null
  return store.workspace.mainPlan.facilities[store.selectedRoomId]
})

const isOutput = computed(() => currentFacility.value?.roomId.startsWith('room_'))
const maxLevel = computed(() => (currentFacility.value?.type === 'dormitory' ? 5 : 3))

function updateLevel(e: Event) {
  const lvl = parseInt((e.target as HTMLSelectElement).value, 10)
  if (store.selectedRoomId) store.updateFacility(store.selectedRoomId, { level: lvl })
}

function updateType(e: Event) {
  const val = (e.target as HTMLSelectElement).value as any
  if (store.selectedRoomId) store.updateFacility(store.selectedRoomId, { type: val })
}

function updateProduct(e: Event) {
  const val = (e.target as HTMLSelectElement).value as any
  if (store.selectedRoomId) store.updateFacility(store.selectedRoomId, { product: val })
}

function openPicker(slotIndex: number, mode: 'primary' | 'replacement') {
  // Dispatches event or opens modal handled in parent
}
</script>
```

- [ ] **Step 4: Run FacilityEditor tests**

Run: `pnpm vitest run src/components/workbench/FacilityEditor.spec.ts && pnpm typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit FacilityEditor components**

```powershell
git add src/components/workbench/ReplacementList.vue src/components/workbench/SlotRow.vue src/components/workbench/FacilityEditor.vue src/components/workbench/FacilityEditor.spec.ts
git commit -m "feat: implement FacilityEditor, SlotRow, and ReplacementList"
```

---

### Task 11: Compact Operator Selector with Pinyin Search & Global Replace Modal

**Files:**
- Create: `src/components/workbench/OperatorSelectModal.vue`
- Create: `src/components/workbench/GlobalReplaceModal.vue`
- Create: `src/components/workbench/OperatorSelectModal.spec.ts`
- Create: `src/components/workbench/GlobalReplaceModal.spec.ts`

**Interfaces:**
- Produces:
  - `OperatorSelectModal.vue`: Fuzzy operator search using `pinyin-pro` (Chinese name, full pinyin, initial letters), in-duty conflict badges ("已在 [房间] 执勤").
  - `GlobalReplaceModal.vue`: Pick source operator and target operator, invokes `store.replaceOperatorGlobally()`.

- [ ] **Step 1: Write unit tests for OperatorSelectModal and GlobalReplaceModal**

Create `src/components/workbench/OperatorSelectModal.spec.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import OperatorSelectModal from './OperatorSelectModal.vue'

describe('OperatorSelectModal.vue', () => {
  it('filters operators by Chinese name, full pinyin, and pinyin initials', async () => {
    const wrapper = mount(OperatorSelectModal, {
      props: { visible: true, assignedIds: new Map([['char_002_amiya', 'B101']]) },
    })

    const input = wrapper.find('input[type="text"]')
    await input.setValue('yh') // 银灰 (yinhui)
    expect(wrapper.text()).toContain('银灰')

    await input.setValue('yinhui')
    expect(wrapper.text()).toContain('银灰')
  })
})
```

Create `src/components/workbench/GlobalReplaceModal.spec.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GlobalReplaceModal from './GlobalReplaceModal.vue'
import { useRosterWorkbenchStore } from '../../workbench/store'

describe('GlobalReplaceModal.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('performs global operator replacement on confirmation', async () => {
    const store = useRosterWorkbenchStore()
    store.workspace.mainPlan.facilities.room_1_1.slots[0] = {
      occupant: { kind: 'operator', operatorId: 'char_002_amiya' },
      groupId: null,
      replacements: [],
    }

    const wrapper = mount(GlobalReplaceModal, { props: { visible: true } })
    await wrapper.find('[data-test="source-select"]').setValue('char_002_amiya')
    await wrapper.find('[data-test="target-select"]').setValue('char_102_texas')
    await wrapper.find('[data-test="confirm-btn"]').trigger('click')

    expect(store.workspace.mainPlan.facilities.room_1_1.slots[0].occupant).toEqual({
      kind: 'operator',
      operatorId: 'char_102_texas',
    })
  })
})
```

- [ ] **Step 2: Run tests and observe missing components failure**

Run: `pnpm vitest run src/components/workbench/OperatorSelectModal.spec.ts src/components/workbench/GlobalReplaceModal.spec.ts`
Expected: FAIL due to missing `./OperatorSelectModal.vue` and `./GlobalReplaceModal.vue`.

- [ ] **Step 3: Implement OperatorSelectModal and GlobalReplaceModal**

Create `src/components/workbench/OperatorSelectModal.vue`:
```vue
<template>
  <div v-if="visible" class="modal-backdrop">
    <div class="modal-dialog compact-operator-picker">
      <div class="picker-header">
        <input
          v-model="query"
          type="text"
          placeholder="搜索干员 (中文/全拼/首字母 如: 银灰 / yinhui / yh)..."
          class="search-input"
          autofocus
        />
        <button type="button" class="close-btn" @click="$emit('close')">×</button>
      </div>

      <div class="picker-body">
        <div
          v-for="op in filteredOperators"
          :key="op.charId"
          class="op-item"
          :class="{ 'is-assigned': assignedIds.has(op.charId) }"
          @click="select(op.charId)"
        >
          <span class="op-name">{{ op.name }}</span>
          <span v-if="assignedIds.has(op.charId)" class="assigned-badge">
            已在 {{ assignedIds.get(op.charId) }} 执勤
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { pinyin } from 'pinyin-pro'
import { OPERATORS } from '../../domain/operators'

const props = defineProps<{
  visible: boolean
  assignedIds: Map<string, string>
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', opId: string): void
}>()

const query = ref('')

const operatorIndex = OPERATORS.map((op) => ({
  ...op,
  fullPinyin: pinyin(op.name, { toneType: 'none', type: 'string' }).replace(/\s+/g, '').toLowerCase(),
  firstLetters: pinyin(op.name, { pattern: 'first', toneType: 'none', type: 'string' }).replace(/\s+/g, '').toLowerCase(),
}))

const filteredOperators = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return operatorIndex.slice(0, 50)
  return operatorIndex
    .filter((op) => op.name.includes(q) || op.fullPinyin.includes(q) || op.firstLetters.includes(q))
    .slice(0, 50)
})

function select(charId: string) {
  emit('select', charId)
  emit('close')
}
</script>
```

Create `src/components/workbench/GlobalReplaceModal.vue`:
```vue
<template>
  <div v-if="visible" class="modal-backdrop">
    <div class="modal-dialog">
      <h3>全局干员替换</h3>
      <p class="desc">一键将当前排班（所有设施的主力及替补）中的干员 A 替换为干员 B。</p>

      <div class="form-row">
        <label>原干员:</label>
        <select v-model="sourceId" data-test="source-select">
          <option v-for="id in activeOperators" :key="id" :value="id">
            {{ operatorName(id) }}
          </option>
        </select>
      </div>

      <div class="form-row">
        <label>替换为:</label>
        <select v-model="targetId" data-test="target-select">
          <option v-for="op in allOperators" :key="op.charId" :value="op.charId">
            {{ op.name }}
          </option>
        </select>
      </div>

      <div class="actions">
        <button type="button" @click="$emit('close')">取消</button>
        <button type="button" class="primary-btn" data-test="confirm-btn" @click="confirm">
          确认替换
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { OPERATOR_MAP, OPERATORS } from '../../domain/operators'
import { useRosterWorkbenchStore } from '../../workbench/store'

defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const store = useRosterWorkbenchStore()
const sourceId = ref('')
const targetId = ref('')

const allOperators = OPERATORS

const activeOperators = computed(() => {
  const set = new Set<string>()
  const facilities = store.workspace.mainPlan.facilities
  for (const roomId of Object.keys(facilities) as any[]) {
    for (const s of facilities[roomId].slots) {
      if (s.occupant.kind === 'operator') set.add(s.occupant.operatorId)
      s.replacements.forEach((r: string) => set.add(r))
    }
  }
  return Array.from(set)
})

function operatorName(id: string) {
  return OPERATOR_MAP.get(id)?.name || id
}

function confirm() {
  if (sourceId.value && targetId.value) {
    store.replaceOperatorGlobally(sourceId.value, targetId.value)
    emit('close')
  }
}
</script>
```

- [ ] **Step 4: Verify test passes**

Run: `pnpm vitest run src/components/workbench/OperatorSelectModal.spec.ts src/components/workbench/GlobalReplaceModal.spec.ts && pnpm typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit operator picker and replacement modal**

```powershell
git add src/components/workbench/OperatorSelectModal.vue src/components/workbench/GlobalReplaceModal.vue src/components/workbench/OperatorSelectModal.spec.ts src/components/workbench/GlobalReplaceModal.spec.ts
git commit -m "feat: implement OperatorSelectModal with pinyin search and GlobalReplaceModal"
```

---

### Task 12: Mower Policy Settings Panel & Validation Panel

**Files:**
- Create: `src/components/workbench/PolicyEditor.vue`
- Create: `src/components/workbench/ValidationPanel.vue`
- Create: `src/components/workbench/PolicyEditor.spec.ts`
- Create: `src/components/workbench/ValidationPanel.spec.ts`

**Interfaces:**
- Produces:
  - `PolicyEditor.vue`: Renders Mower `ling_xi` (1|2|3) and the 7 operator list fields (`exhaust_require`, `rest_in_full`, `resting_priority`, `workaholic`, `refresh_trading`, `refresh_drained`, `ope_resting_priority`). Explicitly notes `free_blacklist` is preserved in the envelope for sub-plans.
  - `ValidationPanel.vue`: Live display of critical errors and warnings with clickable links to focus on specific rooms/slots.

- [ ] **Step 1: Write unit tests for PolicyEditor and ValidationPanel**

Create `src/components/workbench/PolicyEditor.spec.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PolicyEditor from './PolicyEditor.vue'
import { useRosterWorkbenchStore } from '../../workbench/store'

describe('PolicyEditor.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('updates ling_xi and operator list policies in store', async () => {
    const store = useRosterWorkbenchStore()
    const wrapper = mount(PolicyEditor)

    const select = wrapper.find('[data-test="ling-xi-select"]')
    await select.setValue('3')
    expect(store.workspace.mainPlan.conf.ling_xi).toBe(3)
  })
})
```

Create `src/components/workbench/ValidationPanel.spec.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ValidationPanel from './ValidationPanel.vue'

describe('ValidationPanel.vue', () => {
  it('displays critical errors and emits focus event on click', async () => {
    const wrapper = mount(ValidationPanel, {
      props: {
        result: {
          isValid: false,
          criticalErrors: [{ code: 'POWER_DEFICIT', severity: 'critical', roomId: 'room_1_3', message: '电力不足' }],
          warnings: [],
          issues: [{ code: 'POWER_DEFICIT', severity: 'critical', roomId: 'room_1_3', message: '电力不足' }],
        },
      },
    })

    expect(wrapper.text()).toContain('电力不足')
    await wrapper.find('.issue-item').trigger('click')
    expect(wrapper.emitted('focus-room')?.[0]).toEqual(['room_1_3'])
  })
})
```

- [ ] **Step 2: Run tests and observe missing components failure**

Run: `pnpm vitest run src/components/workbench/PolicyEditor.spec.ts src/components/workbench/ValidationPanel.spec.ts`
Expected: FAIL due to missing `./PolicyEditor.vue` and `./ValidationPanel.vue`.

- [ ] **Step 3: Implement PolicyEditor and ValidationPanel**

Create `src/components/workbench/PolicyEditor.vue`:
```vue
<template>
  <div class="policy-editor-panel">
    <h3>Mower 策略配置</h3>

    <div class="policy-item">
      <label>令/夕换班模式 (ling_xi):</label>
      <select
        :value="store.workspace.mainPlan.conf.ling_xi"
        data-test="ling-xi-select"
        @change="updateLingXi($event)"
      >
        <option :value="1">模式 1</option>
        <option :value="2">模式 2</option>
        <option :value="3">模式 3</option>
      </select>
    </div>

    <div v-for="field in listFields" :key="field.key" class="policy-item">
      <label>{{ field.label }} ({{ field.key }}):</label>
      <input
        :value="(store.workspace.mainPlan.conf[field.key] as string[]).join(', ')"
        type="text"
        placeholder="干员名称，用逗号分隔"
        @input="updateList(field.key, $event)"
      />
    </div>

    <p class="policy-note">
      * 注: free_blacklist 属于副排班专有策略，已在兼容信封中无损保存，不作为主排班配置展示。
    </p>
  </div>
</template>

<script setup lang="ts">
import { useRosterWorkbenchStore } from '../../workbench/store'

const store = useRosterWorkbenchStore()

const listFields = [
  { key: 'exhaust_require', label: '强制耗尽干员' },
  { key: 'rest_in_full', label: '全部回满干员' },
  { key: 'resting_priority', label: '优先休息干员' },
  { key: 'workaholic', label: '工作狂不下班干员' },
  { key: 'refresh_trading', label: '刷新贸易干员' },
  { key: 'refresh_drained', label: '刷新耗尽干员' },
  { key: 'ope_resting_priority', label: '特充目标干员' },
] as const

function updateLingXi(e: Event) {
  const val = parseInt((e.target as HTMLSelectElement).value, 10) as 1 | 2 | 3
  store.updateConf({ ling_xi: val })
}

function updateList(key: any, e: Event) {
  const raw = (e.target as HTMLInputElement).value
  const list = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  store.updateConf({ [key]: list } as any)
}
</script>
```

Create `src/components/workbench/ValidationPanel.vue`:
```vue
<template>
  <div class="validation-panel" :class="{ 'has-errors': !result.isValid }">
    <div class="panel-header">
      <h4>排班校验状态: {{ result.isValid ? '通过' : '存在阻断错误' }}</h4>
    </div>

    <div v-if="result.issues.length > 0" class="issues-list">
      <div
        v-for="(issue, idx) in result.issues"
        :key="idx"
        class="issue-item"
        :class="issue.severity"
        @click="$emit('focus-room', issue.roomId)"
      >
        <span class="issue-badge">{{ issue.severity === 'critical' ? '严重' : '警告' }}</span>
        <span class="issue-msg">{{ issue.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ValidationResult } from '../../workbench/validate'

defineProps<{
  result: ValidationResult
}>()

defineEmits<{
  (e: 'focus-room', roomId: string): void
}>()
</script>
```

- [ ] **Step 4: Verify test passes**

Run: `pnpm vitest run src/components/workbench/PolicyEditor.spec.ts src/components/workbench/ValidationPanel.spec.ts && pnpm typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit policy and validation panels**

```powershell
git add src/components/workbench/PolicyEditor.vue src/components/workbench/ValidationPanel.vue src/components/workbench/PolicyEditor.spec.ts src/components/workbench/ValidationPanel.spec.ts
git commit -m "feat: implement PolicyEditor and live ValidationPanel"
```

---

### Task 13: Workbench Shell Integration, Toolbar & Calculation Connection

**Files:**
- Create: `src/components/workbench/PlanToolbar.vue`
- Create: `src/components/workbench/WorkbenchShell.vue`
- Modify: `src/App.vue`
- Create: `src/components/workbench/WorkbenchShell.spec.ts`

**Interfaces:**
- Produces: Complete page composition connecting toolbar (Import/Export JSON, Import/Export 16-QR, Global Replace, Validate, Calculate) with BaseMap, FacilityEditor, and existing yield calculation.
- Displays MIT license notice: `Copyright (c) 2021 Nano`.

- [ ] **Step 1: Write integration tests for WorkbenchShell**

Create `src/components/workbench/WorkbenchShell.spec.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WorkbenchShell from './WorkbenchShell.vue'

describe('WorkbenchShell.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders workbench shell with toolbar, base map, and attribution footer', () => {
    const wrapper = mount(WorkbenchShell)
    expect(wrapper.find('.workbench-shell').exists()).toBe(true)
    expect(wrapper.find('.base-map-container').exists()).toBe(true)
    expect(wrapper.text()).toContain('Copyright (c) 2021 Nano')
  })
})
```

- [ ] **Step 2: Run test and observe missing component failure**

Run: `pnpm vitest run src/components/workbench/WorkbenchShell.spec.ts`
Expected: FAIL due to missing `./WorkbenchShell.vue`.

- [ ] **Step 3: Implement PlanToolbar, WorkbenchShell, and mount in App.vue**

Create `src/components/workbench/PlanToolbar.vue`:
```vue
<template>
  <div class="plan-toolbar">
    <div class="toolbar-group">
      <button type="button" @click="$emit('import-json')">导入 JSON</button>
      <button type="button" @click="$emit('export-json')">导出 JSON</button>
      <button type="button" @click="$emit('import-qr')">导入排班图</button>
      <button type="button" @click="$emit('export-qr')">导出排班图</button>
    </div>

    <div class="toolbar-group">
      <button type="button" @click="$emit('open-replace')">全局换人</button>
      <button type="button" @click="$emit('infer-levels')">推导等级</button>
      <button type="button" class="calc-btn" :disabled="!isValid" @click="$emit('calculate')">
        运行收益计算
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ isValid: boolean }>()
defineEmits<{
  (e: 'import-json'): void
  (e: 'export-json'): void
  (e: 'import-qr'): void
  (e: 'export-qr'): void
  (e: 'open-replace'): void
  (e: 'infer-levels'): void
  (e: 'calculate'): void
}>()
</script>
```

Create `src/components/workbench/WorkbenchShell.vue`:
```vue
<template>
  <div class="workbench-shell mower-workbench">
    <PlanToolbar
      :is-valid="validationResult.isValid"
      @import-json="onImportJson"
      @export-json="onExportJson"
      @open-replace="showReplaceModal = true"
      @infer-levels="store.inferLevels"
      @calculate="runCalculation"
    />

    <ValidationPanel
      :result="validationResult"
      @focus-room="store.selectedRoomId = $event as any"
    />

    <BaseMap />

    <FacilityEditor />

    <PolicyEditor />

    <!-- Modals -->
    <GlobalReplaceModal
      :visible="showReplaceModal"
      @close="showReplaceModal = false"
    />

    <footer class="workbench-footer">
      <p>Mower Workbench Compatibility Layer — MIT License | Copyright (c) 2021 Nano</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRosterWorkbenchStore } from '../../workbench/store'
import { validateRosterWorkspace } from '../../workbench/validate'
import { exportMowerJson, importMowerJson } from '../../workbench/compat/mowerJson'
import { compileMainPlanToAppConfig } from '../../workbench/adapter'
import { createDefaultConfig } from '../../domain/defaults'
import { calculate } from '../../engine/calculate'
import BaseMap from './BaseMap.vue'
import FacilityEditor from './FacilityEditor.vue'
import PolicyEditor from './PolicyEditor.vue'
import PlanToolbar from './PlanToolbar.vue'
import ValidationPanel from './ValidationPanel.vue'
import GlobalReplaceModal from './GlobalReplaceModal.vue'

const store = useRosterWorkbenchStore()
const showReplaceModal = ref(false)

const validationResult = computed(() => validateRosterWorkspace(store.workspace))

function onImportJson() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e: any) => {
    const file = e.target?.files?.[0]
    if (file) {
      const text = await file.text()
      store.workspace = importMowerJson(text)
    }
  }
  input.click()
}

function onExportJson() {
  const jsonText = exportMowerJson(store.workspace)
  const blob = new Blob([jsonText], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'mower_plan.json'
  a.click()
}

function runCalculation() {
  if (!validationResult.value.isValid) return
  const config = compileMainPlanToAppConfig(store.workspace.mainPlan, store.workspace, createDefaultConfig())
  const report = calculate(config)
  // Display report or pass to parent event
}
</script>
```

- [ ] **Step 4: Run WorkbenchShell tests**

Run: `pnpm vitest run src/components/workbench/WorkbenchShell.spec.ts && pnpm typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit workbench shell integration**

```powershell
git add src/components/workbench/PlanToolbar.vue src/components/workbench/WorkbenchShell.vue src/components/workbench/WorkbenchShell.spec.ts
git commit -m "feat: integrate WorkbenchShell, PlanToolbar, and calculation bridge"
```

---

### Task 14: Multi-Resolution Visual QA & Screenshot Fidelity Comparison

**Files:**
- Create: `src/workbench/__tests__/visual-qa.spec.ts`
- Create: `THIRD_PARTY_NOTICES.md`
- Modify: `src/workbench/styles.css`
- Modify: `README.md`

**Interfaces / Modules:**
- Consumes: `WorkbenchShell.vue`, `BaseMap.vue`, `FacilityCard.vue`, `PlanToolbar.vue`, `FacilityEditor.vue`, CSS design tokens.
- Produces: Automated DOM layout and viewport assertions for 1920×1080, 1366×768, and 720×900 viewports; responsive container handling (horizontal scroll container preserving 980px min-width without card truncation or squishing below 980px, sticky toolbar actions, modal dialog auto-scroll); visual fidelity checklist against Mower `Plan.vue`/`PlanEditor.vue` (980px fixed width canvas, facility theme colors, product watermarks, operator portraits, QR perimeter); third-party license notice with MIT and `Copyright (c) 2021 Nano`.

- [ ] **Step 1: Write multi-resolution layout and visual fidelity tests**

Write `src/workbench/__tests__/visual-qa.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WorkbenchShell from '@/components/workbench/WorkbenchShell.vue'
import BaseMap from '@/components/workbench/BaseMap.vue'
import FacilityCard from '@/components/workbench/FacilityCard.vue'

describe('Multi-Resolution Visual QA & Layout Parity', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('verifies 1920x1080 desktop canvas is centered and 980px wide', () => {
    const wrapper = mount(WorkbenchShell, {
      attachTo: document.body,
    })
    const baseMap = wrapper.findComponent(BaseMap)
    expect(baseMap.exists()).toBe(true)

    // Base map canvas container must have class m-base-map and 980px nominal width
    const mapEl = baseMap.find('.m-base-map')
    expect(mapEl.exists()).toBe(true)
    expect(mapEl.classes()).toContain('m-base-map')

    wrapper.unmount()
  })

  it('verifies facility card visual elements match Mower design tokens', () => {
    const wrapper = mount(FacilityCard, {
      props: {
        facility: {
          roomId: 'room_1_1',
          type: 'manufacture',
          level: 3,
          product: 'gold',
          slots: [
            { occupant: { kind: 'operator', operatorId: 'weedy' }, groupId: null, replacements: [] },
            { occupant: { kind: 'operator', operatorId: 'eunectes' }, groupId: null, replacements: [] },
            { occupant: { kind: 'operator', operatorId: 'passenger' }, groupId: null, replacements: [] },
          ],
        },
        isSelected: true,
      },
    })

    // Must show room badge, level badge, product watermark, and 3 slots
    expect(wrapper.find('.m-facility-badge').text()).toBe('B101')
    expect(wrapper.find('.m-facility-level').text()).toBe('Lv.3')
    expect(wrapper.find('.m-product-watermark').exists()).toBe(true)
    expect(wrapper.findAll('.m-slot-avatar')).toHaveLength(3)
    expect(wrapper.classes()).toContain('is-selected')
  })

  it('verifies 720x900 narrow viewport enables horizontal scroll container without squishing', () => {
    const wrapper = mount(WorkbenchShell)
    const scrollContainer = wrapper.find('.m-workbench-scroll-container')
    expect(scrollContainer.exists()).toBe(true)
    // The inner container must preserve min-width 980px
    const innerContainer = wrapper.find('.m-workbench-canvas-wrapper')
    expect(innerContainer.exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Verify visual QA tests fail or report missing selectors**

Run: `pnpm vitest run src/workbench/__tests__/visual-qa.spec.ts`

Expected: FAIL if responsive container wrapper classes or selectors are not yet wired into `WorkbenchShell.vue`.

- [ ] **Step 3: Implement responsive layout guards and create THIRD_PARTY_NOTICES.md**

Ensure `src/workbench/styles.css` defines responsive container classes:

```css
/* Responsive container wrappers */
.m-workbench-scroll-container {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.m-workbench-canvas-wrapper {
  min-width: 980px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

@media (max-width: 1200px) {
  .m-toolbar-actions {
    flex-wrap: wrap;
    gap: 8px;
  }
}

@media (max-width: 768px) {
  .m-modal-dialog {
    max-width: 95vw !important;
    max-height: 85vh !important;
  }
}
```

Create `THIRD_PARTY_NOTICES.md`:

```markdown
# Third-Party Notices & Attribution

This project incorporates visual layout structures, color palettes, and QR layout constants adapted from **Arknights Mower**:

- **Project:** Arknights Mower
- **Author:** Nano & Contributors
- **Source:** https://github.com/ArkMower/arknights-mower
- **License:** MIT License

```
MIT License

Copyright (c) 2021 Nano

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
```

Update `README.md` to document the Main Roster Workbench, import/export capabilities, and Mower attribution.

- [ ] **Step 4: Run visual QA tests and type check**

Run: `pnpm vitest run src/workbench/__tests__/visual-qa.spec.ts && pnpm typecheck`

Expected: PASS with 0 errors.

- [ ] **Step 5: Commit visual QA suite and attribution notices**

```powershell
git add src/workbench/__tests__/visual-qa.spec.ts THIRD_PARTY_NOTICES.md src/workbench/styles.css README.md
git commit -m "docs: add visual QA tests, responsive rules, and third-party notices"
```

---

### Task 15: Final Acceptance Verification & Regressions Sweep

**Files:**
- Test: `src/workbench/__tests__/engine-protection.spec.ts`
- Test: `src/workbench/__tests__/mowerJson.spec.ts`
- Test: `src/workbench/__tests__/mowerQr.spec.ts`
- Test: `src/workbench/__tests__/adapter.spec.ts`
- Test: `src/workbench/__tests__/store.spec.ts`
- Verify: `src/engine/calculate.ts`
- Verify: `src/engine/morale.ts`
- Verify: `src/engine/operatorRules.ts`

**Interfaces / Modules:**
- Consumes: Complete codebase on `mode/shift-run`.
- Produces: Exhaustive verification across all 15 acceptance criteria (AC-01 through AC-15); validation that production calculation engine files remain 100% bitwise unmodified; full test suite pass; type check pass; production build pass; launcher dry-run verification.

- [ ] **Step 1: Verify calculation engine files have ZERO git diffs and SHA-256 integrity holds**

Run:
```powershell
git diff --exit-code src/engine/calculate.ts src/engine/morale.ts src/engine/operatorRules.ts
pnpm vitest run src/workbench/__tests__/engine-protection.spec.ts
```

Expected: `git diff` exits with code 0 (no modifications to engine files). Vitest reports PASS: SHA-256 hashes and deterministic yield outputs match the pristine baseline exactly.

- [ ] **Step 2: Run all workbench unit and integration test suites**

Run:
```powershell
pnpm vitest run src/workbench
```

Expected: PASS with 0 failures across:
- `engine-protection.spec.ts`
- `model.spec.ts`
- `levelInference.spec.ts`
- `migrate.spec.ts`
- `adapter.spec.ts`
- `store.spec.ts`
- `validate.spec.ts`
- `mowerJson.spec.ts`
- `mowerQr.spec.ts`
- `visual-qa.spec.ts`

- [ ] **Step 3: Run full repository test suite**

Run:
```powershell
pnpm test
```

Expected: All existing tests and new tests PASS.

- [ ] **Step 4: Run type check and production build**

Run:
```powershell
pnpm typecheck
pnpm build
```

Expected: TypeScript reports 0 errors. Vite production build succeeds and outputs to `dist/`.

- [ ] **Step 5: Verify launcher script without background execution**

Run:
```powershell
cmd /c "一键启动.bat --check"
```

Expected: Launcher self-check passes and exits 0 without hanging or starting an unmonitored background server.

- [ ] **Step 6: Confirm Git working tree cleanliness**

Run:
```powershell
git status --porcelain
```

Expected: Clean working tree on `mode/shift-run` with all changes committed.

---

## Final Acceptance Checklist

| ID | Criterion | Scope & Verification Rule | Implementation Task | Status |
| :--- | :--- | :--- | :--- | :--- |
| **AC-01** | **980px Three-Column Base Canvas** | Base map renders a fixed 980px 3-column layout: left 3×3 output rooms (`room_1_1`..`room_3_3`), center Control Central (`central`) + 4 dormitories (`dormitory_1`..`dormitory_4`), right utility facilities (`meeting`, `factory`, `contact`, `train`, `gaming_1`..`3`). Box-model assertions verify dimensions without distortion. | Task 9, Task 14 | [ ] |
| **AC-02** | **Facility Drag-Swap** | Output rooms (9 rooms) support HTML5 drag-and-drop atomic swapping. Type, level, product, occupants, group labels, and replacements swap atomically. Non-output facilities reject drops. | Task 5, Task 9 | [ ] |
| **AC-03** | **Selected Facility Real-Time Editing** | Clicking any facility card highlights it and opens the facility editor panel. Editing type, product, level, and operator slots updates the reactive store immediately. | Task 5, Task 10 | [ ] |
| **AC-04** | **Operator Name & Pinyin Search** | Compact operator selector modal supports Chinese fuzzy search, full pinyin (`yinsang`), and initials (`yh`). Stationed operators display active room indicators and block duplicate assignment. | Task 11 | [ ] |
| **AC-05** | **Special Slot Occupants (Free, Current, Empty)** | Slots support `Free` (dynamic staff), `Current` (preserve state), and Empty. UI renders dedicated badges. Pure adapter treats non-operator occupants as empty slots without engine runtime errors. | Task 2, Task 4, Task 10 | [ ] |
| **AC-06** | **Group Labels & Ordered Replacements** | Slots support textual `groupId` tags compiled into `OperatorGroup[]`. Each slot supports ordered replacement chips (`replacements: string[]`) with drag reordering; the first valid replacement maps to `operatorBackups`. | Task 2, Task 4, Task 10 | [ ] |
| **AC-07** | **Global Operator Replacement** | Modal lists currently assigned operators. Selecting old operator A and new operator B transactionally replaces A with B across all primary slots and all replacement lists in the main plan. | Task 5, Task 11 | [ ] |
| **AC-08** | **Facility Level Inference (3 Power Plants)** | When 3 power plants are present, all facilities infer to maximum level (output lv3, dormitories lv5, right utility lv3), completely independent of occupant count. Inferred levels are fully editable in UI. | Task 2, Task 7 | [ ] |
| **AC-09** | **Facility Level Inference (2 Power Plants)** | When 2 power plants are present, dormitories infer to lv1, power plants to lv3, right utility to lv3; manufacture/trading infer to staffed operator count (1..3, fallback to 1 if empty). Inferred levels are fully editable. | Task 2, Task 7 | [ ] |
| **AC-10** | **Lossless Mower JSON Top-Level Siblings & Envelope** | JSON codec strictly adheres to Mower root structure (`default`, `[default]`, `conf`, `backup_plans`). Policy fields in `conf` (`ling_xi` as `1|2|3`, 7 operator list fields as comma-separated strings) map to `string[]` in store. `backup_plans` (including `free_blacklist`) and unrecognized root keys are preserved in `MowerCompatibilityEnvelope` without data loss on round-trip. | Task 3, Task 7 | [ ] |
| **AC-11** | **16-QR Code JPG Codec (Zero OCR)** | Encoder uses zlib (level 9) + RFC 9285 Base45, split into 16 pure payload chunks placed at Top 7, Bottom-Left 7, Bottom-Right 2 (constants: `QRCODE_SIZE = 215`, `GAP_SIZE = 16`, `TOP = 40`, `BOTTOM = 995`, `LEFT = 40`, `RIGHT_PAIR_X = 2520`). Decoder uses canvas masking and geometric sorting (`y < 500` top, `y >= 500` bottom, then `x` ascending). Zero OCR. | Task 8 | [ ] |
| **AC-12** | **Core Engine & Branch Isolation** | `src/engine/calculate.ts`, `src/engine/morale.ts`, and `src/engine/operatorRules.ts` maintain 0 git diffs against baseline. SHA-256 checksums and deterministic calculation equivalence tests pass. `mode/standard` branch remains completely untouched. | Task 1, Task 4, Task 15 | [ ] |
| **AC-13** | **Real-Time Roster Validation** | Validation engine detects duplicate operators, power deficit, slot overflow, and invalid room configs. Visual error indicators appear on cards and a collapsible validation panel; critical errors block `compileMainPlanToAppConfig` calculation. | Task 6, Task 12 | [ ] |
| **AC-14** | **Multi-Resolution Visual QA** | Verified at 1920×1080 (standard centered 980px canvas), 1366×768 (toolbar wrap, dialog max-height 80vh), and 720×900 (horizontal scroll container preserving 980px min-width without card truncation or visual clipping). Visual fidelity matches Mower's dark/light facility palettes, badges, and portraits. | Task 14 | [ ] |
| **AC-15** | **MIT Attribution & Open Source Compliance** | `THIRD_PARTY_NOTICES.md` includes full MIT license and `Copyright (c) 2021 Nano` attribution. Adapted code headers retain copyright notices. | Task 14, Task 15 | [ ] |
