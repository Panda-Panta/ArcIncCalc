import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../domain/defaults'
import { calculate } from './calculate'
import { simulateMorale } from './morale'

describe('morale timeline', () => {
  it('applies room staffing and control-center consumption reductions', () => {
    const config = createDefaultConfig()
    config.rooms[0]!.operatorIds = ['char_4106_bryota', 'char_237_gravel', 'char_385_finlpp']
    config.controlOperatorIds = ['char_002_amiya']
    const result = simulateMorale(config)
    const bryota = result.operators.find((item) => item.operatorId === 'char_4106_bryota')!
    expect(bryota.initialConsumptionPerHour).toBeCloseTo(0.85)
    expect(bryota.ending).toBeCloseTo(3.6)
  })

  it('applies room-wide and personal skill consumption modifiers', () => {
    const factory = createDefaultConfig()
    factory.rooms[0]!.operatorIds = ['char_2025_shu', 'char_4106_bryota', 'char_237_gravel']
    const factoryResult = simulateMorale(factory)
    expect(
      factoryResult.operators.find((item) => item.operatorId === 'char_4106_bryota')!
        .initialConsumptionPerHour,
    ).toBeCloseTo(0.8)

    const trade = createDefaultConfig()
    trade.rooms[4]!.operatorIds = ['char_196_sunbr']
    const tradeResult = simulateMorale(trade)
    expect(
      tradeResult.operators.find((item) => item.operatorId === 'char_196_sunbr')!
        .initialConsumptionPerHour,
    ).toBeCloseTo(0.75)
  })

  it('recalculates average output when an operator reaches zero morale', () => {
    const config = createDefaultConfig()
    const room = config.rooms[0]!
    room.operatorIds = ['char_4106_bryota']
    config.operatorMorale['char_4106_bryota'] = 12
    const report = calculate(config)
    const production = report.manufacture.find((item) => item.roomId === room.id)!
    const morale = report.morale.find((item) => item.operatorId === 'char_4106_bryota')!
    expect(morale.exhaustedAt).toBeCloseTo(12)
    expect(production.efficiency).toBeCloseTo(1.18)
    expect(production.count).toBeCloseTo(23.6)
  })

  it('synchronously removes a group whose members work in different facilities', () => {
    const config = createDefaultConfig()
    const firstRoom = config.rooms[0]!
    const secondRoom = config.rooms[1]!
    firstRoom.operatorIds = ['char_4106_bryota']
    secondRoom.operatorIds = ['char_502_nblade']
    config.operatorMorale['char_4106_bryota'] = 12
    config.operatorMorale['char_502_nblade'] = 24
    config.operatorGroups = [{
      id: 'cross-room-group',
      name: '跨设施测试组',
      operatorIds: ['char_4106_bryota', 'char_502_nblade'],
    }]

    const result = simulateMorale(config)
    const bryota = result.operators.find((item) => item.operatorId === 'char_4106_bryota')!
    const yato = result.operators.find((item) => item.operatorId === 'char_502_nblade')!

    expect(bryota.exhaustedAt).toBeCloseTo(12)
    expect(bryota.leaveReason).toBe('morale-exhausted')
    expect(yato.exhaustedAt).toBeNull()
    expect(yato.leftAt).toBeCloseTo(12)
    expect(yato.leaveReason).toBe('group-sync')
    expect(yato.ending).toBeCloseTo(12)
    expect(result.averageEfficiencyPercent[secondRoom.id]).toBeCloseTo(108)
    expect(yato.details[0]).toContain('跨设施测试组')
  })

  it('keeps an entire group out when one member starts at zero morale', () => {
    const config = createDefaultConfig()
    const firstRoom = config.rooms[0]!
    const secondRoom = config.rooms[1]!
    firstRoom.operatorIds = ['char_4106_bryota']
    secondRoom.operatorIds = ['char_502_nblade']
    config.operatorMorale['char_4106_bryota'] = 0
    config.operatorMorale['char_502_nblade'] = 24
    config.operatorGroups = [{
      id: 'zero-start-group',
      name: '零心情测试组',
      operatorIds: ['char_4106_bryota', 'char_502_nblade'],
    }]

    const result = simulateMorale(config)
    const bryota = result.operators.find((item) => item.operatorId === 'char_4106_bryota')!
    const yato = result.operators.find((item) => item.operatorId === 'char_502_nblade')!

    expect(bryota.exhaustedAt).toBe(0)
    expect(yato.leftAt).toBe(0)
    expect(yato.leaveReason).toBe('group-sync')
    expect(yato.ending).toBe(24)
    expect(result.averageEfficiencyPercent[firstRoom.id]).toBeCloseTo(100)
    expect(result.averageEfficiencyPercent[secondRoom.id]).toBeCloseTo(100)
  })

  it('multiplies control-center faction recovery by matching operators', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = ['char_010_chen', 'char_136_hsguma', 'char_308_swire']
    const result = simulateMorale(config)
    const chen = result.operators.find((item) => item.operatorId === 'char_010_chen')!
    expect(chen.initialConsumptionPerHour).toBeCloseTo(0.7)
    expect(chen.details).toContain('陈·德才兼备：3 人，-0.15/h')
  })

  it('stacks every Rainbow Squad operator faction skill', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = ['char_456_ash', 'char_457_blitz', 'char_458_rfrost', 'char_459_tachak']
    const result = simulateMorale(config)
    for (const id of config.controlOperatorIds) {
      const operator = result.operators.find((item) => item.operatorId === id)!
      expect(operator.initialConsumptionPerHour).toBeCloseTo(0)
      expect(operator.ending).toBeCloseTo(24)
    }
  })

  it('lets Waai Fu remove teammates personal consumption penalties', () => {
    const config = createDefaultConfig()
    config.rooms[0]!.operatorIds = ['char_243_waaifu', 'char_281_popka']
    const result = simulateMorale(config)
    const popukar = result.operators.find((item) => item.operatorId === 'char_281_popka')!
    expect(popukar.initialConsumptionPerHour).toBeCloseTo(0.95)
    expect(popukar.details.some((detail) => detail.includes('槐琥·团队精神'))).toBe(true)
  })

  it('extends eligible control skills with Mlynar and adds the power-room recovery', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = ['char_4064_mlynar', 'char_144_red']
    config.rooms[0]!.operatorIds = ['char_4106_bryota']
    config.rooms[6]!.operatorIds = ['char_376_therex']
    const result = simulateMorale(config)
    const bryota = result.operators.find((item) => item.operatorId === 'char_4106_bryota')!
    const thermal = result.operators.find((item) => item.operatorId === 'char_376_therex')!
    expect(bryota.initialConsumptionPerHour).toBeCloseTo(0.8)
    expect(thermal.initialConsumptionPerHour).toBeCloseTo(0.18)
    expect(thermal.details.some((detail) => detail.includes('发电站 -0.1/h'))).toBe(true)
  })

  it('recalculates Totter production at every four-point morale gap', () => {
    const config = createDefaultConfig()
    config.rooms[0]!.operatorIds = ['char_4062_totter']
    const result = simulateMorale(config)
    expect(result.averageEfficiencyPercent[config.rooms[0]!.id]).toBeCloseTo(123.5, 4)
  })

  it('recalculates Fireworks links when Ling crosses twelve morale', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = ['char_2023_ling', 'char_2024_chyue']
    config.rooms[4]!.operatorIds = ['char_4083_chimes']
    const result = simulateMorale(config)
    const chimes = result.operators.find((item) => item.operatorId === 'char_4083_chimes')!
    expect(chimes.initialConsumptionPerHour).toBeCloseTo(0.66)
    expect(chimes.ending).toBeCloseTo(7.4133, 3)
    expect(chimes.details.some((detail) => detail.includes('人间烟火 25'))).toBe(true)
  })

  it('derives Enthusiasm from control operators and configured dorm occupants', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = [
      'char_4182_oblvns',
      'char_4183_mortis',
      'char_4186_tmoris',
      'char_4185_amoris',
      'char_4184_dolris',
    ]
    config.dormitoryOccupantCount = 20
    const result = simulateMorale(config)
    const sakiko = result.operators.find((item) => item.operatorId === 'char_4182_oblvns')!
    const mutsumi = result.operators.find((item) => item.operatorId === 'char_4183_mortis')!
    expect(sakiko.initialConsumptionPerHour).toBeCloseTo(0.75)
    expect(sakiko.details.some((detail) => detail.includes('热情值 60'))).toBe(true)
    expect(mutsumi.initialConsumptionPerHour).toBeCloseTo(0.75)
    expect(mutsumi.details.some((detail) => detail.includes('互为半身'))).toBe(true)
  })

  it('does not redirect dormitory-only recovery to the control skill owner', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = ['char_4195_radian']
    const result = simulateMorale(config)
    const radian = result.operators.find((item) => item.operatorId === 'char_4195_radian')!
    expect(radian.initialConsumptionPerHour).toBeCloseTo(0.9)
  })

  it('keeps unconditional morale costs when a production bonus product does not match', () => {
    const config = createDefaultConfig()
    config.rooms[0]!.product = 'exp'
    config.rooms[0]!.operatorIds = ['char_446_aroma']
    const result = simulateMorale(config)
    const aroma = result.operators.find((item) => item.operatorId === 'char_446_aroma')!
    expect(aroma.initialConsumptionPerHour).toBeCloseTo(1.25)
  })
})
