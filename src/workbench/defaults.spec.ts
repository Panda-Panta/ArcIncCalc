import { describe, it, expect } from 'vitest'
import { createDefaultWorkspace } from './defaults'
import { MOWER_OUTPUT_ROOM_IDS } from './model'

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
    expect(ws.mainPlan.conf.rest_in_full).toEqual([])
    expect(ws.mainPlan.conf.resting_priority).toEqual([])
    expect(ws.mainPlan.conf.workaholic).toEqual([])
    expect(ws.mainPlan.conf.refresh_trading).toEqual([])
    expect(ws.mainPlan.conf.refresh_drained).toEqual([])
    expect(ws.mainPlan.conf.ope_resting_priority).toEqual([])
    expect(ws.compatibility.backupPlans).toEqual([])
    expect(ws.compatibility.defaultPlanKey).toBe('plan1')
  })

  it('asserts all 7 Mower main policy list defaults are empty arrays', () => {
    const ws = createDefaultWorkspace()
    const { conf } = ws.mainPlan
    expect(conf.exhaust_require).toEqual([])
    expect(conf.rest_in_full).toEqual([])
    expect(conf.resting_priority).toEqual([])
    expect(conf.workaholic).toEqual([])
    expect(conf.refresh_trading).toEqual([])
    expect(conf.refresh_drained).toEqual([])
    expect(conf.ope_resting_priority).toEqual([])
  })
})
