import { describe, it, expect } from 'vitest'
import { createDefaultWorkspace } from '../workbench/defaults'
import { applySmartDormitoryPolicy, isAoeDormKeeper, isSingleDormKeeper } from './smartDormitoryPolicy'
import { OPERATOR_MAP, OPERATORS } from '../domain/operators'

const id = (n: string) => OPERATORS.find((o) => o.name === n)!.charId

describe('smartDormitoryPolicy', () => {
  it('correctly classifies AOE and single dormitory recovery keepers', () => {
    const durn = OPERATOR_MAP.get(id('杜林'))!
    const shining = OPERATOR_MAP.get(id('闪灵'))!

    expect(isAoeDormKeeper(durn)).toBe(true)
    expect(isSingleDormKeeper(shining)).toBe(true)
  })

  it('assigns 2 keepers (1 AOE + 1 single) to each of the 4 dormitories by default', () => {
    const ws = createDefaultWorkspace()
    const report = applySmartDormitoryPolicy(ws)

    expect(report.applied).toBe(true)
    for (let i = 1; i <= 4; i++) {
      const dormKey = `dormitory_${i}` as 'dormitory_1' | 'dormitory_2' | 'dormitory_3' | 'dormitory_4'
      const dorm = ws.mainPlan.facilities[dormKey]
      expect(report.dormitoryKeepers[dormKey]?.aoe).toBeDefined()
      expect(report.dormitoryKeepers[dormKey]?.single).toBeDefined()

      // Slot 0 has an AOE keeper, Slot 1 has a single keeper
      expect(dorm?.slots[0]?.occupant.kind).toBe('operator')
      expect(dorm?.slots[1]?.occupant.kind).toBe('operator')
    }
  })

  it('places Fiammetta into the slowest recovery dormitory and avoids conflict', () => {
    const ws = createDefaultWorkspace()
    // Give Fiammetta as an assigned working operator
    if (ws.mainPlan.facilities.room_1_1.slots[0]) {
      ws.mainPlan.facilities.room_1_1.slots[0].occupant = {
        kind: 'operator',
        operatorId: 'char_300_phenxi',
      }
    }
    // Set dormitory_4 to level 1 and others to level 5
    ws.mainPlan.facilities.dormitory_1.level = 5
    ws.mainPlan.facilities.dormitory_2.level = 5
    ws.mainPlan.facilities.dormitory_3.level = 5
    ws.mainPlan.facilities.dormitory_4.level = 1

    const report = applySmartDormitoryPolicy(ws)
    expect(report.fiammettaRoomId).toBe('dormitory_4')
    expect(ws.mainPlan.facilities.dormitory_4.slots[0]?.occupant).toEqual({
      kind: 'operator',
      operatorId: 'char_300_phenxi',
    })
  })

  it('skips auto assignment when disable_auto_dorm_keeper is true', () => {
    const ws = createDefaultWorkspace()
    ws.mainPlan.conf.disable_auto_dorm_keeper = true

    const report = applySmartDormitoryPolicy(ws)
    expect(report.applied).toBe(false)
  })
})
