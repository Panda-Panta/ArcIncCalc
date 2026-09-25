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

  it('correctly quantifies composite skills across E0 and E2 stages', () => {
    // 1. Archetto (空弦) E0 (+1% per dorm level) vs E2 (+2% per dorm level)
    const archLow = config([owned('空弦', 0)]), archHigh = config([owned('空弦', 2)])
    for (const c of [archLow, archHigh]) {
      c.facilities.dormitories = [5, 5, 5, 5]
      const trade = c.rooms.find(r => r.type === 'trading')!
      trade.operatorIds = [id('空弦')]; trade.operatorCount = 1
    }
    expect(evaluateOperators(archLow.rooms.find(r => r.type === 'trading')!, archLow).skillBonus).toBe(20)
    expect(evaluateOperators(archHigh.rooms.find(r => r.type === 'trading')!, archHigh).skillBonus).toBe(40)

    // 2. Rosmontis (迷迭香) E0 (+1% per 2 thought chain) vs E2 (+1% per 1 thought chain)
    const rosLow = config([owned('迷迭香', 0)]), rosHigh = config([owned('迷迭香', 2)])
    for (const c of [rosLow, rosHigh]) {
      c.facilityOperatorIds.dormitories = [[id('杜林'), id('黑角'), id('夜刀'), id('巡林者'), id('12F')]]
      c.dormitoryOccupantCount = 5
      const manu = c.rooms.find(r => r.type === 'manufacture')!
      manu.operatorIds = [id('迷迭香')]; manu.operatorCount = 1; manu.product = 'gold'
    }
    expect(evaluateOperators(rosLow.rooms.find(r => r.type === 'manufacture')!, rosLow).skillBonus).toBe(2) // floor(5 / 2) = 2
    expect(evaluateOperators(rosHigh.rooms.find(r => r.type === 'manufacture')!, rosHigh).skillBonus).toBe(5) // floor(5 / 1) = 5

    // 3. Minimalist (至简) E0 (5% per 16 robots) vs E2 (5% per 8 robots)
    const minLow = config([owned('至简', 0)]), minHigh = config([owned('至简', 2)])
    for (const c of [minLow, minHigh]) {
      const manu = c.rooms.find(r => r.type === 'manufacture')!
      manu.operatorIds = [id('至简')]; manu.operatorCount = 1; manu.product = 'gold'
    }
    const lowRobots = evaluateOperators(minLow.rooms.find(r => r.type === 'manufacture')!, minLow)
    const highRobots = evaluateOperators(minHigh.rooms.find(r => r.type === 'manufacture')!, minHigh)
    expect(highRobots.skillBonus).toBeGreaterThanOrEqual(lowRobots.skillBonus)

    // 4. Jixing (吉星) E0 (+10% per other colleague) vs E2 (+20% per other colleague)
    const jixLow = config([owned('吉星', 0), owned('德克萨斯', 2), owned('能天使', 2)])
    const jixHigh = config([owned('吉星', 2), owned('德克萨斯', 2), owned('能天使', 2)])
    for (const c of [jixLow, jixHigh]) {
      const trade = c.rooms.find(r => r.type === 'trading')!
      trade.operatorIds = [id('吉星'), id('德克萨斯'), id('能天使')]; trade.operatorCount = 3
    }
    // 2 colleagues * 10% = 20% vs 2 * 20% = 40% (ignoring other operator skill additions)
    const jixLowBonus = evaluateOperators(jixLow.rooms.find(r => r.type === 'trading')!, jixLow).operatorContributions.find(b => b.operatorId === id('吉星'))!.skillBonus
    const jixHighBonus = evaluateOperators(jixHigh.rooms.find(r => r.type === 'trading')!, jixHigh).operatorContributions.find(b => b.operatorId === id('吉星'))!.skillBonus
    expect(jixLowBonus).toBe(20)
    expect(jixHighBonus).toBe(40)

    // 5. Alanna (阿兰娜) E0 (+5% per platform in power) vs E2 (+10% per platform in power)
    const alaLow = config([owned('阿兰娜', 0), owned('Lancet-2', 0)])
    const alaHigh = config([owned('阿兰娜', 2), owned('Lancet-2', 0)])
    for (const c of [alaLow, alaHigh]) {
      const power = c.rooms.find(r => r.type === 'power')!
      power.operatorIds = [id('Lancet-2')]; power.operatorCount = 1
      const manu = c.rooms.find(r => r.type === 'manufacture')!
      manu.operatorIds = [id('阿兰娜')]; manu.operatorCount = 1; manu.product = 'gold'
    }
    expect(evaluateOperators(alaLow.rooms.find(r => r.type === 'manufacture')!, alaLow).skillBonus).toBe(5)
    expect(evaluateOperators(alaHigh.rooms.find(r => r.type === 'manufacture')!, alaHigh).skillBonus).toBe(10)
  })
})

