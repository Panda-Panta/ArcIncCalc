import { simulationReportToCalculationReport } from '../workbench/calculationBridge'
import { describe, it, expect } from 'vitest'
import { createDefaultConfig } from '../domain/defaults'
import { OPERATOR_MAP } from '../domain/operators'
import { compileOperatorInventory, type OwnedOperatorInput } from '../domain/operatorInventory'
import { inventoryOperatorRecords } from '../domain/operatorContext'
import { evaluateOperators } from '../engine/operatorRules'
import { evaluateDormitoryRecovery } from '../engine/dormitoryRecovery'
import { buildRiicGlobalContext } from '../engine/globalContext'
import { createDefaultWorkspace } from '../workbench/defaults'
import { compileRosterSchedule } from '../scheduler/compileRosterSchedule'
import { resolveOperatorCharId as id } from '../workbench/compat/mowerJson'
import { simulateSchedule } from './scheduleSimulation'

function config(entries: OwnedOperatorInput[]) {
  const c = createDefaultConfig()
  c.operatorRecords = inventoryOperatorRecords(compileOperatorInventory(entries))
  return c
}
const owned = (operator: string, elitePhase: number): OwnedOperatorInput => ({ operator, elitePhase, level: 1 })

describe('actual unlocked skills per calculation', () => {
  it('keeps Haze metalworking while excluding her locked trading skill, without mutating the catalog', () => {
    const original = JSON.stringify(OPERATOR_MAP.get(id('夜烟')))
    const low = config([owned('夜烟', 0)]), high = config([owned('夜烟', 1)])
    const trade = low.rooms.find(r => r.type === 'trading')!
    trade.operatorIds = [id('夜烟')]; trade.operatorCount = 1; trade.specialOrder = 'none'
    expect(evaluateOperators(trade, high).skillBonus - evaluateOperators(trade, low).skillBonus).toBe(30)
    const manu = low.rooms.find(r => r.type === 'manufacture')!
    manu.operatorIds = [id('夜烟')]; manu.operatorCount = 1; manu.product = 'gold'
    expect(evaluateOperators(manu, low).skillBonus).toBe(30)
    expect(JSON.stringify(OPERATOR_MAP.get(id('夜烟')))).toBe(original)
  })

  it('does not grant Penance dorm recovery before elite 2', () => {
    const low = config([owned('斥罪', 0)]), high = config([owned('斥罪', 2)])
    for (const c of [low, high]) {
      c.facilities.dormitories = [1]; c.facilities.office = 3
      c.facilityOperatorIds.dormitories = [[id('斥罪')]]
    }
    const recovery = (c: typeof low) => evaluateDormitoryRecovery(c, 0, new Map([[id('斥罪'), 10]]), 1000).rates.get(id('斥罪'))!
    expect(recovery(low)).toBeCloseTo(2)
    expect(recovery(high) - recovery(low)).toBeCloseTo(.25)
  })

  it('does not grant Eunectes virtual power stations or Whisperain perception before elite 2', () => {
    const low = config([owned('森蚺', 0), owned('絮雨', 0)]), high = config([owned('森蚺', 2), owned('絮雨', 2)])
    for (const c of [low, high]) {
      c.controlOperatorIds = [id('森蚺')]
      c.rooms.find(r => r.type === 'power')!.operatorIds = [id('Lancet-2')]
      c.facilityOperatorIds.office = [id('絮雨')]; c.facilities.office = 3
    }
    expect(buildRiicGlobalContext(low).effectivePowerStations.eunectesBonus).toBe(0)
    expect(buildRiicGlobalContext(high).effectivePowerStations.eunectesBonus).toBe(2)
    expect(buildRiicGlobalContext(low).perceptionInformation.derived).toBe(0)
    expect(buildRiicGlobalContext(high).perceptionInformation.derived).toBe(20)
  })

  it('uses elite 0 Proviso and Tequila rewards in ideal run orders', () => {
    const ws = createDefaultWorkspace()
    ws.mainPlan.facilities.room_3_1.level = 3
    ws.mainPlan.facilities.room_3_1.slots = ['芬', '克洛丝', '空爆'].map((name, i) => ({ occupant: { kind: 'operator' as const, operatorId: id(name) }, groupId: null, replacements: i < 2 ? [id(['但书', '龙舌兰'][i]!)] : [] }))
    const s = compileRosterSchedule(ws); s.rooms = s.rooms.filter(r => r.roomId === 'room_3_1'); s.restPools = []
    const r = simulateSchedule(s, { sampleHours: 30, consumptionOverrides: Object.fromEntries(['芬', '克洛丝', '空爆'].map(n => [id(n), 0])), operatorInventory: ['芬', '克洛丝', '空爆', '但书', '龙舌兰'].map(n => owned(n, 0)), production: { outputMode: 'potential', runOrderMode: 'ideal', droneTarget: 'none', seed: 42 } })
    expect(r.success).toBe(true)
    const orders = r.production!.events.filter(e => e.type === 'order-completed').map(e => e.order!)
    expect(orders.some(o => o.kind === 'tequila')).toBe(true)
    expect(orders.some(o => o.kind === 'proviso')).toBe(true)
    const display = simulationReportToCalculationReport(ws, r)
    expect(display.summary!.virtualGoldCount).toBeCloseTo(orders.filter(o => o.kind === 'tequila').length * .5 / (30 / 24))
    expect(orders.every(o => o.kind === 'tequila' ? o.lmdReward === 2250 : o.lmdReward === o.goldCost * 500 && [3, 4].includes(o.goldCost))).toBe(true)
  })
})
