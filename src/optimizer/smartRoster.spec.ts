import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { OPERATORS } from '../domain/operators'
import type { OwnedOperatorInput } from '../domain/operatorInventory'
import { createDefaultWorkspace } from '../workbench/defaults'
import { importMowerJson, resolveOperatorCharId as id } from '../workbench/compat/mowerJson'
import { validateRosterWorkspace } from '../workbench/validate'
import { runSmartRoster, type SmartRosterProgress } from './smartRoster'
import { validatePhysicalRoster } from './rosterDraft'
import { MOWER_OUTPUT_ROOM_IDS, type MowerRoomId } from '../workbench/model'

const allOwned: OwnedOperatorInput[] = OPERATORS.map((o) => ({
  operator: o.name,
  elitePhase: o.rarity < 3 ? 0 : o.rarity === 3 ? 1 : 2,
  level: o.rarity < 3 ? 30 : o.rarity === 3 ? 55 : o.rarity === 4 ? 70 : o.rarity === 5 ? 80 : 90,
}))

const mains = (w: ReturnType<typeof createDefaultWorkspace>) =>
  Object.values(w.mainPlan.facilities).flatMap((r) =>
    r.slots.flatMap((s) => (s.occupant.kind === 'operator' ? [id(s.occupant.operatorId)] : []))
  )

describe('smartRoster generation with 3-phase optimization', () => {
  it('builds complete 243 mains with backups and simulation validation', () => {
    const base = createDefaultWorkspace()
    base.compatibility.importedPresentRooms = [...MOWER_OUTPUT_ROOM_IDS, 'central']
    const progressLogs: SmartRosterProgress[] = []

    const result = runSmartRoster(
      base,
      allOwned,
      {
        trials: 2,
        simulationTopK: 1,
        simulationWarmupHours: 6,
        simulationSampleHours: 18,
        enableDeepSearch: false,
        seed: 42,
      },
      (p) => progressLogs.push({ ...p })
    )

    expect(result.status).toBe('draft')
    expect(result.workspace).not.toBeNull()
    const workspace = result.workspace!

    // Verify all production rooms and central are fully staffed with backups
    for (const room of Object.values(workspace.mainPlan.facilities)) {
      if (['manufacture', 'trading', 'power', 'central'].includes(room.type)) {
        const cap = room.type === 'central' ? 5 : room.type === 'power' ? 1 : room.level
        expect(room.slots.slice(0, cap).every((s) => s.occupant.kind === 'operator')).toBe(true)
        expect(room.slots.slice(0, cap).every((s) => s.replacements.length === 1)).toBe(true)
      }
    }

    // Check backups are unique and do not overlap with mains
    const backups = Object.values(workspace.mainPlan.facilities).flatMap((r) =>
      r.slots.flatMap((s) => s.replacements.map(id))
    )
    expect(new Set(backups).size).toBe(backups.length)
    const mainList = mains(workspace)
    expect(backups.every((b) => !mainList.includes(b))).toBe(true)

    // Verify physical validity
    expect(validatePhysicalRoster(workspace)).toEqual([])

    // Verify simulation score was computed
    expect(result.score).toBeGreaterThan(0)
    expect(result.phases.simulation).not.toBeNull()
    expect(result.phases.simulation!.candidates.length).toBeGreaterThanOrEqual(1)

    // Progress logs should have recorded phases
    expect(progressLogs.some((p) => p.phase === 'building')).toBe(true)
    expect(progressLogs.some((p) => p.phase === 'simulating')).toBe(true)
    expect(progressLogs.some((p) => p.phase === 'done')).toBe(true)
  }, 60000)

  it('preserves user-locked operators when starting from a partial layout', () => {
    const base = createDefaultWorkspace()
    // Pre-place Texas and Lappland in room_1_1 (trading)
    base.mainPlan.facilities.room_1_1.slots[0]!.occupant = { kind: 'operator', operatorId: id('德克萨斯') }
    base.mainPlan.facilities.room_1_1.slots[1]!.occupant = { kind: 'operator', operatorId: id('拉普兰德') }

    const result = runSmartRoster(base, allOwned, {
      trials: 1,
      simulationTopK: 1,
      simulationWarmupHours: 6,
      simulationSampleHours: 18,
      enableDeepSearch: false,
      seed: 123,
    })

    expect(result.status).toBe('draft')
    const workspace = result.workspace!

    // Verify Texas and Lappland remain in room_1_1 slot 0 and 1
    expect(workspace.mainPlan.facilities.room_1_1.slots[0]!.occupant).toEqual({
      kind: 'operator',
      operatorId: id('德克萨斯'),
    })
    expect(workspace.mainPlan.facilities.room_1_1.slots[1]!.occupant).toEqual({
      kind: 'operator',
      operatorId: id('拉普兰德'),
    })

    // Verify all other production rooms are staffed
    expect(workspace.mainPlan.facilities.room_1_2.slots.every((s) => s.occupant.kind === 'operator')).toBe(true)
  }, 60000)

  it('adapts to 252 layout with two-seat trading room', () => {
    const base = createDefaultWorkspace()
    // Standard 252 layout: 2 trading, 5 manufacture, 2 power; dormitories and auxiliary rooms level 1 to balance power
    base.mainPlan.facilities.room_3_3 = {
      roomId: 'room_3_3',
      type: 'manufacture',
      level: 3,
      product: 'exp',
      slots: Array.from({ length: 3 }, () => ({ occupant: { kind: 'empty' }, groupId: null, replacements: [] })),
    }
    base.mainPlan.facilities.room_3_1.level = 2
    for (const room of Object.values(base.mainPlan.facilities)) {
      if (room.type === 'dormitory' || room.type === 'contact' || room.type === 'factory' || room.type === 'train') {
        room.level = 1
      }
    }

    const result = runSmartRoster(base, allOwned, {
      trials: 1,
      simulationTopK: 1,
      simulationWarmupHours: 6,
      simulationSampleHours: 18,
      enableDeepSearch: false,
      seed: 777,
    })

    expect(result.status).toBe('draft')
    const workspace = result.workspace!
    expect(workspace.mainPlan.facilities.room_3_1.slots.slice(0, 2).every((s) => s.occupant.kind === 'operator')).toBe(true)
    expect(workspace.mainPlan.facilities.room_3_3.slots.slice(0, 3).every((s) => s.occupant.kind === 'operator')).toBe(true)
  }, 60000)

  it('reproduces 252二赤金.json automatic roster issue', () => {
    const jsonPath = 'C:/Users/Panda-Panta/Downloads/252二赤金.json'
    if (!existsSync(jsonPath)) return
    const content = readFileSync(jsonPath, 'utf8')
    const base = importMowerJson(content)
    console.log('=== 1. 252 初始宿舍等级 ===')
    console.log(
      Object.keys(base.mainPlan.facilities).filter(k => k.startsWith('dormitory')).map(k => `${k}: Lv${base.mainPlan.facilities[k as MowerRoomId].level}`)
    )
    const result = runSmartRoster(base, allOwned, {
      trials: 1,
      simulationTopK: 1,
      simulationWarmupHours: 6,
      simulationSampleHours: 18,
      enableDeepSearch: false,
      seed: 42,
    })
    console.log('\n=== 2. 自动排班执行状态 ===')
    console.log('Result status:', result.status, result.diagnostics)
    expect(result.status).toBe('draft')
    expect(result.workspace).toBeDefined()

    const ws = result.workspace!
    console.log('\n=== 3. 自动排班设施分配详情 ===')
    for (const [roomId, fac] of Object.entries(ws.mainPlan.facilities) as [MowerRoomId, any][]) {
      const details = fac.slots.map((s: any, idx: number) => {
        let name = s.occupant.kind
        if (s.occupant.kind === 'operator') {
          const op = OPERATORS.find(o => o.charId === s.occupant.operatorId)
          name = op ? op.name : s.occupant.operatorId
        }
        const grp = s.groupId ? ` [组:${s.groupId}]` : ''
        const rep = s.replacements && s.replacements.length > 0 ? ` (候补${s.replacements.length})` : ''
        return `#${idx + 1}:${name}${grp}${rep}`
      }).join(' | ')
      console.log(`[${roomId}] (${fac.type}, Lv${fac.level}${fac.product ? ', ' + fac.product : ''}): ${details}`)
    }

    console.log('\n=== 4. 宿舍分配详情 ===')
    for (const dId of ['dormitory_1', 'dormitory_2', 'dormitory_3', 'dormitory_4'] as const) {
      const dFac = ws.mainPlan.facilities[dId]
      const slots = dFac.slots.map((s: any, idx: number) => {
        let name = s.occupant.kind
        if (s.occupant.kind === 'operator') {
          const op = OPERATORS.find(o => o.charId === s.occupant.operatorId)
          name = op ? op.name : s.occupant.operatorId
        }
        return `#${idx + 1}:${name}`
      }).join(' ')
      console.log(`  - ${dId} (Lv${dFac.level}): ${slots}`)
    }

    const validation = validateRosterWorkspace(ws)
    console.log('\n=== 5. 排班校验结果 ===')
    console.log('Critical errors count:', validation.criticalErrors.length)
    for (const err of validation.criticalErrors) {
      console.log('  ❌ Critical error:', err.roomId, err.slotIndex, err.message)
    }
    console.log('Warnings count:', validation.warnings.length)
    for (const w of validation.warnings) {
      console.log('  ⚠️ Warning:', w.roomId, w.message)
    }
    expect(validation.criticalErrors).toEqual([])

    // Assert strict group compliance
    for (const [rId, fac] of Object.entries(ws.mainPlan.facilities) as [MowerRoomId, any][]) {
      if (fac.type === 'manufacture') {
        expect(fac.slots.every((s: any) => s.groupId === `组合_${rId}`)).toBe(true)
      } else if (fac.type === 'trading') {
        expect(fac.slots.every((s: any) => s.groupId === `自动_${rId}`)).toBe(true)
      } else if (fac.type === 'central') {
        expect(fac.slots.every((s: any) => s.groupId === '自动_central' || s.groupId === '深海队')).toBe(true)
      } else {
        expect(fac.slots.every((s: any) => s.groupId === null)).toBe(true)
      }
    }
  }, 120000)

  it('binds Central slots to combinations and assigns groups', () => {
    const base = createDefaultWorkspace()
    const result = runSmartRoster(base, allOwned, {
      trials: 1,
      simulationTopK: 1,
      simulationWarmupHours: 6,
      simulationSampleHours: 18,
      enableDeepSearch: false,
      seed: 42,
    })
    expect(result.status).toBe('draft')
    const ws = result.workspace!
    const central = ws.mainPlan.facilities.central
    expect(central.slots.every((s) => s.occupant.kind === 'operator')).toBe(true)
    expect(central.slots.every((s) => typeof s.groupId === 'string' && s.groupId.length > 0)).toBe(true)
  }, 120000)

  it('runs on mower_plan.json and checks grouping consistency', () => {
    const jsonPath = 'C:/Users/Panda-Panta/Downloads/mower_plan.json'
    if (!existsSync(jsonPath)) return
    const content = readFileSync(jsonPath, 'utf8')
    const base = importMowerJson(content)
    console.log('=== Initial mower_plan.json groups ===')
    for (const [rId, fac] of Object.entries(base.mainPlan.facilities) as [MowerRoomId, any][]) {
      const grps = fac.slots.map((s: any) => s.groupId)
      console.log(`${rId}: [${grps.join(', ')}]`)
    }

    const result = runSmartRoster(base, allOwned, {
      trials: 1,
      simulationTopK: 1,
      simulationWarmupHours: 6,
      simulationSampleHours: 18,
      enableDeepSearch: false,
      seed: 42,
    })
    expect(result.status).toBe('draft')
    expect(result.workspace).toBeDefined()
    const ws = result.workspace!

    console.log('=== Result groups after runSmartRoster ===')
    for (const [rId, fac] of Object.entries(ws.mainPlan.facilities) as [MowerRoomId, any][]) {
      const ops = fac.slots.map((s: any) => {
        const name = s.occupant.kind === 'operator' ? (OPERATORS.find(o => o.charId === s.occupant.operatorId)?.name || s.occupant.operatorId) : s.occupant.kind
        return `${name}[${s.groupId || ''}]`
      })
      console.log(`${rId}: ${ops.join(', ')}`)

      // Group consistency checks
      if (fac.type === 'manufacture') {
        expect(fac.slots.every((s: any) => s.groupId === `组合_${rId}`)).toBe(true)
      } else if (fac.type === 'trading') {
        expect(fac.slots.every((s: any) => s.groupId === `自动_${rId}`)).toBe(true)
      } else if (fac.type === 'central') {
        expect(fac.slots.every((s: any) => s.groupId === '自动_central' || s.groupId === '深海队')).toBe(true)
      } else {
        expect(fac.slots.every((s: any) => s.groupId === null)).toBe(true)
      }
    }

    // Verify synergy integrity: Abyssal Hunters are deployed across two rooms in 2+2 (never 3+1)
    const hunterIds = ['乌尔比安', '斯卡蒂', '幽灵鲨', '安哲拉'].map(id)
    const manuRooms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'manufacture')
    const hunterRooms = manuRooms.filter(r => r.slots.some(s => s.occupant.kind === 'operator' && hunterIds.includes(s.occupant.operatorId)))
    expect(hunterRooms.length).toBe(2)
    for (const hr of hunterRooms) {
      const count = hr.slots.filter(s => s.occupant.kind === 'operator' && hunterIds.includes(s.occupant.operatorId)).length
      expect(count).toBe(2)
    }

    // Gladiia in central must be '深海队'
    const gladiiaSlot = ws.mainPlan.facilities.central.slots.find(s => s.occupant.kind === 'operator' && s.occupant.operatorId === id('歌蕾蒂娅'))
    expect(gladiiaSlot).toBeDefined()
    expect(gladiiaSlot!.groupId).toBe('深海队')

    // Deepflow in trading
    const tradeRooms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'trading')
    const deepflowSlot = tradeRooms.flatMap(r => r.slots).find(s => s.occupant.kind === 'operator' && s.occupant.operatorId === id('深巡'))
    expect(deepflowSlot).toBeDefined()
  }, 120000)

  it('deploys 2+2 Abyssal Hunters, Blacksteel, SEES, and Pozyomka 4 Durin in default 243 workspace', () => {
    const base = createDefaultWorkspace()
    const result = runSmartRoster(base, allOwned, {
      trials: 1,
      simulationTopK: 1,
      simulationWarmupHours: 6,
      simulationSampleHours: 18,
      enableDeepSearch: false,
      seed: 42,
    })
    expect(result.status).toBe('draft')
    const ws = result.workspace!

    // 1. Abyssal 2+2 check
    const hunterIds = ['乌尔比安', '斯卡蒂', '幽灵鲨', '安哲拉'].map(id)
    const manuRooms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'manufacture')
    const hunterRooms = manuRooms.filter(r => r.slots.some(s => s.occupant.kind === 'operator' && hunterIds.includes(s.occupant.operatorId)))
    expect(hunterRooms.length).toBe(2)
    for (const hr of hunterRooms) {
      const count = hr.slots.filter(s => s.occupant.kind === 'operator' && hunterIds.includes(s.occupant.operatorId)).length
      expect(count).toBe(2)
    }

    // Central Gladiia
    const gladiia = ws.mainPlan.facilities.central.slots.find(s => s.occupant.kind === 'operator' && s.occupant.operatorId === id('歌蕾蒂娅'))
    expect(gladiia?.groupId).toBe('深海队')

    // 2. Blacksteel check: Jessica the Liberated in central, Mizuki+Vanilla+Jessica in same manufacture room
    const jessica2 = ws.mainPlan.facilities.central.slots.find(s => s.occupant.kind === 'operator' && s.occupant.operatorId === id('涤火杰西卡'))
    expect(jessica2?.groupId).toBe('自动_central')

    const bsIds = ['水月', '香草', '杰西卡'].map(id)
    const bsRoom = manuRooms.find(r => bsIds.every(bId => r.slots.some(s => s.occupant.kind === 'operator' && s.occupant.operatorId === bId)))
    expect(bsRoom).toBeDefined()

    // 3. SEES check: Aegis in power, Yukari in train, Koromaru in meeting
    const aegis = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'power')
      .flatMap(r => r.slots).find(s => s.occupant.kind === 'operator' && s.occupant.operatorId === id('埃癸斯'))
    expect(aegis).toBeDefined()
    expect(aegis!.groupId).toBeNull()

    // 4. Pozyomka 4 Durin check
    const tradeRooms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'trading')
    const pozIds = ['鸿雪', '图耶', '绮良'].map(id)
    const pozRoom = tradeRooms.find(r => pozIds.every(pId => r.slots.some(s => s.occupant.kind === 'operator' && s.occupant.operatorId === pId)))
    expect(pozRoom).toBeDefined()
  }, 120000)
})


