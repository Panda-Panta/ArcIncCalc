import { describe, expect, it } from 'vitest'
import { OPERATORS } from '../domain/operators'
import { compileOperatorInventory, type OwnedOperatorInput } from '../domain/operatorInventory'
import { createDefaultWorkspace } from '../workbench/defaults'
import { resolveOperatorCharId as id } from '../workbench/compat/mowerJson'
import { runGlobalPerCapitaReplacement } from './globalPerCapitaReplacement'

const allOwned: OwnedOperatorInput[] = OPERATORS.map((o) => ({
  operator: o.name,
  elitePhase: o.rarity < 3 ? 0 : o.rarity === 3 ? 1 : 2,
  level: o.rarity < 3 ? 30 : o.rarity === 3 ? 55 : o.rarity === 4 ? 70 : o.rarity === 5 ? 80 : 90,
}))
const inventory = compileOperatorInventory(allOwned)

describe('Global Per-Capita Replacement (Rule 6)', () => {
  it('relocates Minimalist from manufacture when powerCount is 2', () => {
    const ws = createDefaultWorkspace()
    // Place Minimalist in manufacture room_1_1
    ws.mainPlan.facilities.room_1_1.slots[0]!.occupant = {
      kind: 'operator',
      operatorId: id('至简'),
    }
    ws.mainPlan.facilities.room_1_1.slots[0]!.groupId = '感知信息+鸿雪组'

    const result = runGlobalPerCapitaReplacement(ws, inventory, { powerCount: 2 })
    expect(result.swappedCount, result.logs.join("\n")).toBeGreaterThan(0)
    const slot0 = result.workspace.mainPlan.facilities.room_1_1.slots[0]!
    expect(slot0.occupant.kind).toBe('operator')
    if (slot0.occupant.kind === 'operator') {
      expect(slot0.occupant.operatorId).not.toBe(id('至简'))
    }

    // Minimalist should be placed into auxiliary (factory / train / lowest recovery dorm)
    const allFacs = Object.values(result.workspace.mainPlan.facilities)
    const inAuxiliary = allFacs.some((f) =>
      f.type !== 'manufacture' &&
      f.slots.some((s) => s.occupant.kind === 'operator' && s.occupant.operatorId === id('至简')),
    )
    expect(inAuxiliary).toBe(true)
  })

  it('swaps lower per-capita unit with available higher per-capita atomic unit', () => {
    const ws = createDefaultWorkspace()
    // Set room_2_1 to gold manufacture with standard low efficiency singletons (~30%)
    ws.mainPlan.facilities.room_2_1.product = 'gold'
    ws.mainPlan.facilities.room_2_1.slots[0]!.occupant = { kind: 'operator', operatorId: id('清流') }
    ws.mainPlan.facilities.room_2_1.slots[1]!.occupant = { kind: 'operator', operatorId: id('砾') }
    ws.mainPlan.facilities.room_2_1.slots[2]!.occupant = { kind: 'operator', operatorId: id('斑点') }

    const result = runGlobalPerCapitaReplacement(ws, inventory, { powerCount: 3 })
    expect(result.swappedCount, result.logs.join("\n")).toBeGreaterThan(0)

    // Verify room_2_1 has been upgraded to a higher per-capita unit (e.g. aroma_waaifu 65% or vermeil_dionysus)
    const upgradedOps = result.workspace.mainPlan.facilities.room_2_1.slots.map((s) =>
      s.occupant.kind === 'operator' ? id(s.occupant.operatorId) : '',
    )
    const hasAromaOrVermeil =
      upgradedOps.includes(id('阿罗玛')) ||
      upgradedOps.includes(id('红云')) ||
      upgradedOps.includes(id('温蒂'))
    expect(hasAromaOrVermeil).toBe(true)
  })
})
