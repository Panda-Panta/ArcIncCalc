import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../domain/defaults'
import { evaluateOperators } from './operatorRules'

describe('operator combination rules', () => {
  it('counts Rhine and standardization skills for Dorothy and Mizuki', () => {
    const config = createDefaultConfig()
    const room = config.rooms[0]!
    room.operatorIds = ['char_4048_doroth', 'char_437_mizuki']
    expect(evaluateOperators(room, config).efficiencyPercent).toBe(162)
  })

  it('lets Highmore convert Rhine skills into standardization skills', () => {
    const config = createDefaultConfig()
    const room = config.rooms[0]!
    room.operatorIds = ['char_4048_doroth', 'char_437_mizuki', 'char_4066_highmo']
    const result = evaluateOperators(room, config)
    expect(result.efficiencyPercent).toBe(198)
    expect(result.details).toContain('海沫·意识兼容：莱茵/红松技能计入标准化')
  })

  it('applies Gladiia global Abyssal Hunter manufacturing links', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = ['char_474_glady']
    const room = config.rooms[0]!
    room.operatorIds = ['char_143_ghost', 'char_1023_ghost2']
    const result = evaluateOperators(room, config)
    expect(result.efficiencyPercent).toBe(122)
    expect(result.details).toContain('歌蕾蒂娅·集群狩猎：深海猎人制造联动 +20%')
  })

  it('detects Cangtai metalworking skills as a dynamic skill class', () => {
    const config = createDefaultConfig()
    const room = config.rooms[0]!
    room.operatorIds = ['char_4106_bryota', 'char_237_gravel']
    const result = evaluateOperators(room, config)
    expect(result.efficiencyPercent).toBe(177)
    expect(result.unquantifiedSkills).not.toContain('苍苔·打工心得')
  })

  it('keeps facility-count bonuses when automation clears other operators', () => {
    const config = createDefaultConfig()
    const room = config.rooms[0]!
    room.operatorIds = ['char_400_weedy', 'char_385_finlpp']
    const result = evaluateOperators(room, config)
    expect(result.efficiencyPercent).toBe(187)
    expect(result.details.some((detail) => detail.includes('清流·再生能源：+40%'))).toBe(true)
  })

  it('stacks Grey +1 with Eunectes and zero-morale Lancet-2 +2 for automation', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = ['char_416_zumama']
    config.rooms[6]!.operatorIds = ['char_1027_greyy2']
    config.rooms[7]!.operatorIds = ['char_285_medic2']
    config.zeroMoraleOperatorIds = ['char_285_medic2']
    const room = config.rooms[0]!
    room.operatorIds = ['char_400_weedy', 'char_385_finlpp']
    const result = evaluateOperators(room, config)
    expect(result.efficiencyPercent).toBe(232)
    expect(result.details.some((detail) => detail.includes('有效发电站 6'))).toBe(true)
  })

  it('keeps all three staffing bonuses in the Weedy Eunectes Clearstream automation team', () => {
    const config = createDefaultConfig()
    const room = config.rooms[0]!
    room.operatorIds = ['char_400_weedy', 'char_416_zumama', 'char_385_finlpp']
    const result = evaluateOperators(room, config)
    expect(result.staffBonus).toBe(3)
    expect(result.efficiencyPercent).toBe(218)
  })
})
