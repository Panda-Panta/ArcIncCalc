import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../domain/defaults'
import { OPERATORS } from '../domain/operators'
import { evaluateOperators } from './operatorRules'

describe('operator combination rules', () => {
  it('derives perception information from a 252 roster with level-one dormitories', () => {
    const config = createDefaultConfig()
    const operatorId = (name: string) => OPERATORS.find((operator) => operator.name === name)!.charId
    config.dormitoryOccupantCount = 20
    config.facilities.office = 2
    config.facilities.dormitories = [1, 1, 1, 1]
    ;(config as unknown as {
      facilityOperatorIds: {
        dormitories: string[][]
        reception: string[]
        workshop: string[]
        office: string[]
        training: string[]
      }
    }).facilityOperatorIds = {
      dormitories: [[operatorId('爱丽丝')], [operatorId('车尔尼')], [], []],
      reception: [],
      workshop: [],
      office: [operatorId('絮雨')],
      training: [],
    }

    const rosmontisRoom = config.rooms[0]!
    rosmontisRoom.product = 'exp'
    rosmontisRoom.operatorIds = [operatorId('迷迭香')]
    const ebenholzRoom = config.rooms[4]!
    ebenholzRoom.operatorIds = [operatorId('黑键')]

    expect(evaluateOperators(rosmontisRoom, config).efficiencyPercent).toBe(163)
    expect(evaluateOperators(ebenholzRoom, config).efficiencyPercent).toBe(132)
  })

  it('turns Dusk perception information into Rosmontis thought chain above 12 morale', () => {
    const config = createDefaultConfig()
    const room = config.rooms[0]!
    room.product = 'exp'
    room.operatorIds = ['char_391_rosmon']
    config.controlOperatorIds = ['char_2015_dusk']
    config.operatorMorale.char_2015_dusk = 24

    expect(evaluateOperators(room, config).efficiencyPercent).toBe(111)
  })

  it('turns Ling perception information into Rosmontis thought chain at 12 morale', () => {
    const config = createDefaultConfig()
    const room = config.rooms[0]!
    room.product = 'exp'
    room.operatorIds = ['char_391_rosmon']
    config.controlOperatorIds = ['char_2023_ling']
    config.operatorMorale.char_2023_ling = 12

    expect(evaluateOperators(room, config).efficiencyPercent).toBe(111)
  })

  it('excludes zero-morale global resource providers', () => {
    const config = createDefaultConfig()
    const room = config.rooms[0]!
    room.product = 'exp'
    room.operatorIds = ['char_391_rosmon']
    config.controlOperatorIds = ['char_2015_dusk']
    config.operatorMorale.char_2015_dusk = 24
    config.zeroMoraleOperatorIds = ['char_2015_dusk']

    expect(evaluateOperators(room, config).efficiencyPercent).toBe(101)
  })

  it('derives two-gold and three-gold production lines from Pozemka and Durin assignments', () => {
    const config = createDefaultConfig()
    const operatorId = (name: string) => OPERATORS.find((operator) => operator.name === name)!.charId
    config.rooms[0]!.product = 'gold'
    config.rooms[1]!.product = 'gold'
    config.rooms[2]!.product = 'exp'
    config.rooms[3]!.product = 'exp'
    config.facilityOperatorIds.dormitories = [[
      operatorId('至简'),
      operatorId('桃金娘'),
      operatorId('褐果'),
      operatorId('杜林'),
    ], [], [], []]

    const pozemkaRoom = config.rooms[4]!
    pozemkaRoom.operatorIds = [operatorId('鸿雪')]
    const tuyeRoom = config.rooms[5]!
    tuyeRoom.operatorIds = [operatorId('图耶')]

    expect(evaluateOperators(pozemkaRoom, config).efficiencyPercent).toBe(131)
    expect(evaluateOperators(tuyeRoom, config).efficiencyPercent).toBe(121)

    config.rooms[2]!.product = 'gold'
    expect(evaluateOperators(pozemkaRoom, config).efficiencyPercent).toBe(136)
    expect(evaluateOperators(tuyeRoom, config).efficiencyPercent).toBe(121)
  })

  it('keeps virtual gold production lines local to the trading room', () => {
    const config = createDefaultConfig()
    const operatorId = (name: string) => OPERATORS.find((operator) => operator.name === name)!.charId
    for (const room of config.rooms.filter((room) => room.type === 'manufacture')) room.product = 'gold'
    config.facilityOperatorIds.dormitories = [[
      operatorId('至简'), operatorId('桃金娘'), operatorId('褐果'), operatorId('杜林'),
    ], [], [], []]
    const combinedRoom = config.rooms[4]!
    combinedRoom.operatorIds = [operatorId('鸿雪'), operatorId('图耶'), operatorId('绮良')]
    const separateTuyeRoom = config.rooms[5]!
    separateTuyeRoom.operatorIds = [operatorId('图耶')]

    expect(evaluateOperators(combinedRoom, config).skillBonus).toBe(160)
    expect(evaluateOperators(combinedRoom, config).efficiencyPercent).toBe(263)
    expect(evaluateOperators(separateTuyeRoom, config).skillBonus).toBe(35)
  })

  it('uses the fixed 235 drone capacity for Greyy the Lightningbearer', () => {
    const config = createDefaultConfig()
    const room = config.rooms.find((item) => item.type === 'power')!
    room.operatorIds = ['char_1027_greyy2']
    expect(evaluateOperators(room, config).skillBonus).toBe(23)
    expect(evaluateOperators(room, config).efficiencyPercent).toBe(128)
  })

  it('reads training-room operator links from the facility roster', () => {
    const config = createDefaultConfig()
    const operatorId = (name: string) => OPERATORS.find((operator) => operator.name === name)!.charId
    const linkedPowerOperator = OPERATORS.find((operator) =>
      operator.skills.some((skill) => skill.buffId === 'power_rec_spd_P[001]'),
    )!
    const powerRoom = config.rooms.find((room) => room.type === 'power')!
    powerRoom.operatorIds = [linkedPowerOperator.charId]
    const withoutLogos = evaluateOperators(powerRoom, config).efficiencyPercent
    config.facilityOperatorIds.training = [operatorId('逻各斯')]

    expect(evaluateOperators(powerRoom, config).efficiencyPercent - withoutLogos).toBe(5)
  })

  it('converts the whole room warehouse capacity for the Vermeil Scene Ceobe team', () => {
    const config = createDefaultConfig()
    const room = config.rooms[0]!
    room.product = 'exp'
    room.operatorIds = ['char_190_clour', 'char_336_folivo', 'char_2013_cerber']

    const result = evaluateOperators(room, config)

    expect(result.skillBonus).toBe(106)
    expect(result.efficiencyPercent).toBe(209)
    expect(result.unquantifiedSkills).toEqual([])
  })

  it('applies Viviana knight support before Waai Fu copies other operators', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = ['char_4098_vvana', 'char_4179_monstr']
    const room = config.rooms[0]!
    room.product = 'gold'
    room.operatorIds = ['char_237_gravel', 'char_446_aroma', 'char_243_waaifu']

    const result = evaluateOperators(room, config)

    expect(result.skillBonus).toBe(129)
    expect(result.efficiencyPercent).toBe(232)
    expect(result.unquantifiedSkills).toEqual([])
  })

  it('builds perception information and gold-line resource chains for Mower teams', () => {
    const config = createDefaultConfig()
    config.dormitoryOccupantCount = 20
    config.efficiencyResources.manufacturePerceptionInformation = 60
    config.efficiencyResources.tradingPerceptionInformation = 62
    config.efficiencyResources.additionalGoldProductionLines = 4
    config.rooms[3]!.product = 'exp'

    const rosmontisRoom = config.rooms[0]!
    rosmontisRoom.product = 'exp'
    rosmontisRoom.operatorIds = ['char_391_rosmon']
    const tradingRoom = config.rooms[4]!
    tradingRoom.operatorIds = ['char_4055_bgsnow', 'char_4046_ebnhlz']
    const tuyeRoom = config.rooms[5]!
    tuyeRoom.operatorIds = ['char_402_tuye']

    expect(evaluateOperators(rosmontisRoom, config).efficiencyPercent).toBe(161)
    expect(evaluateOperators(tradingRoom, config).efficiencyPercent).toBe(163)
    expect(evaluateOperators(tuyeRoom, config).efficiencyPercent).toBe(151)
  })

  it('uses positive and negative warehouse capacity from compound manufacturing skills', () => {
    const config = createDefaultConfig()
    const room = config.rooms[0]!
    room.operatorIds = ['char_190_clour', 'char_122_beagle', 'char_281_popka']

    const result = evaluateOperators(room, config)

    expect(result.skillBonus).toBe(39)
    expect(result.efficiencyPercent).toBe(142)
    expect(result.unquantifiedSkills).toEqual([])
  })

  it('lets Bubble override Vermeil without counting negative warehouse capacity', () => {
    const config = createDefaultConfig()
    const room = config.rooms[0]!
    room.operatorIds = ['char_381_bubble', 'char_190_clour', 'char_281_popka']

    const result = evaluateOperators(room, config)

    expect(result.skillBonus).toBe(43)
    expect(result.efficiencyPercent).toBe(146)
  })

  it('uses the stable cap for generic ramp-up manufacturing skills', () => {
    const config = createDefaultConfig()
    const room = config.rooms[0]!
    room.product = 'exp'
    room.operatorIds = ['char_124_kroos']

    expect(evaluateOperators(room, config).efficiencyPercent).toBe(126)
  })

  it('quantifies every output-room skill that explicitly changes efficiency', () => {
    const missing: string[] = []
    const roomTypes = [
      ['manufacture', 'MANUFACTURE'],
      ['trading', 'TRADING'],
      ['power', 'POWER'],
    ] as const

    for (const operator of OPERATORS) {
      for (const [roomType, gameRoomType] of roomTypes) {
        const relevant = operator.skills.filter(
          (skill) =>
            skill.roomType === gameRoomType &&
            /\u751f\u4ea7\u529b|\u8ba2\u5355(?:\u83b7\u53d6)?\u6548\u7387|\u65e0\u4eba\u673a\u5145\u80fd\u901f\u5ea6/.test(
              skill.description,
            ),
        )
        if (!relevant.length) continue
        const config = createDefaultConfig()
        const room = config.rooms.find((item) => item.type === roomType)!
        room.operatorIds = [operator.charId]
        const result = evaluateOperators(room, config)
        for (const skill of relevant) {
          const label = `${operator.name}${String.fromCharCode(183)}${skill.name}`
          if (result.unquantifiedSkills.includes(label)) {
            missing.push(`${operator.name}: ${skill.name} [${skill.buffId}]`)
          }
        }
      }
    }

    expect(missing).toEqual([])
  })

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
