import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createDefaultConfig } from '../domain/defaults'
import { OPERATORS } from '../domain/operators'
import { evaluateOperators, formatStructuredContributions } from './operatorRules'
import { buildRiicGlobalContext } from './globalContext'
import { importMowerJson } from '../workbench/compat/mowerJson'
import { compileMainPlanToAppConfig } from '../workbench/adapter'

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

    expect(evaluateOperators(rosmontisRoom, config).efficiencyPercent).toBe(153)
    expect(evaluateOperators(ebenholzRoom, config).efficiencyPercent).toBe(127)
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
    expect(evaluateOperators(tuyeRoom, config).efficiencyPercent).toBe(151)

    config.rooms[2]!.product = 'gold'
    expect(evaluateOperators(pozemkaRoom, config).efficiencyPercent).toBe(136)
    expect(evaluateOperators(tuyeRoom, config).efficiencyPercent).toBe(151)
  })

  it('shares virtual gold production lines across trading rooms without recursive Kirara growth', () => {
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
    expect(evaluateOperators(separateTuyeRoom, config).skillBonus).toBe(95)
  })

  it('uses the configured drone capacity for Greyy the Lightningbearer', () => {
    const config = createDefaultConfig()
    const room = config.rooms.find((item) => item.type === 'power')!
    room.operatorIds = ['char_1027_greyy2']
    expect(evaluateOperators(room, config).skillBonus).toBe(23)
    expect(evaluateOperators(room, config).efficiencyPercent).toBe(128)

    config.efficiencyResources.droneCapacity = 250
    expect(evaluateOperators(room, config).skillBonus).toBe(25)
    expect(evaluateOperators(room, config).efficiencyPercent).toBe(130)
  })

  it('keeps fixed right-side resource providers active during a dynamic work-roster snapshot', () => {
    const config = createDefaultConfig()
    config.dormitoryOccupantCount = 11
    config.facilityOperatorIds.dormitories = [['char_338_iris'], ['char_4047_pianst'], [], []]
    config.facilityOperatorIds.office = ['char_436_whispr']
    const room = config.rooms[0]!
    room.product = 'exp'
    room.operatorIds = ['char_391_rosmon']

    const result = evaluateOperators(room, config, new Set(room.operatorIds))

    expect(result.skillBonus).toBe(41)
    expect(result.efficiencyPercent).toBe(142)
  })

  it('derives Fireworks from the current control roster for Shu production', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = ['char_2023_ling']
    config.operatorMorale.char_2023_ling = 24
    const room = config.rooms[0]!
    room.operatorIds = ['char_2025_shu']

    expect(evaluateOperators(room, config).skillBonus).toBe(5)
  })

  it('derives monster cuisine from the dormitory and Sui-facility count from occupied rooms', () => {
    const config = createDefaultConfig()
    config.facilities.dormitories = [5, 5, 5, 5]
    config.facilityOperatorIds.dormitories = [['char_4143_sensi', 'char_2014_nian'], [], [], []]
    config.controlOperatorIds = ['char_2023_ling']
    const factory = config.rooms[0]!
    factory.operatorIds = ['char_4058_pepe', 'char_4141_marcil']
    const trading = config.rooms[4]!
    trading.operatorIds = ['char_4222_taraxa']

    expect(evaluateOperators(factory, config).details.some((detail) => detail.includes('monster cuisine 5'))).toBe(true)
    expect(evaluateOperators(trading, config).skillBonus).toBe(28)
  })

  it('applies Bellone base-presence and Vigil reception-level trading bonuses', () => {
    const config = createDefaultConfig()
    config.facilities.reception = 3
    const belloneRoom = config.rooms[4]!
    belloneRoom.operatorIds = ['char_4037_demetr']
    const vigilRoom = config.rooms[5]!
    vigilRoom.operatorIds = ['char_427_vigil']

    expect(evaluateOperators(belloneRoom, config).skillBonus).toBe(40)
    expect(evaluateOperators(vigilRoom, config).skillBonus).toBe(40)
  })

  it('applies Hachiman Kairin global trading support to each Siracusa operator', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = ['char_4186_tmoris']
    const room = config.rooms[4]!
    room.operatorIds = ['char_4037_demetr', 'char_427_vigil']

    expect(evaluateOperators(room, config).skillBonus).toBe(90)
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

  it('keeps warehouse and order-limit counters local to their current room', () => {
    const config = createDefaultConfig()
    const manufactureRoom = config.rooms[0]!
    const otherManufactureRoom = config.rooms[1]!
    manufactureRoom.operatorIds = ['char_190_clour']
    otherManufactureRoom.operatorIds = ['char_122_beagle']
    const manufactureWithOtherRoomOccupied = evaluateOperators(manufactureRoom, config).efficiencyPercent
    otherManufactureRoom.operatorIds = []
    expect(evaluateOperators(manufactureRoom, config).efficiencyPercent)
      .toBe(manufactureWithOtherRoomOccupied)

    const tradingRoom = config.rooms[4]!
    const otherTradingRoom = config.rooms[5]!
    tradingRoom.operatorIds = ['char_4116_blkkgt']
    otherTradingRoom.operatorIds = ['char_210_stward']
    const tradingWithOtherRoomOccupied = evaluateOperators(tradingRoom, config).efficiencyPercent
    otherTradingRoom.operatorIds = []
    expect(evaluateOperators(tradingRoom, config).efficiencyPercent)
      .toBe(tradingWithOtherRoomOccupied)
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

  it('applies Gladiia per-beneficiary bonus based on global Abyssal Hunter count', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = ['char_474_glady']
    const room1 = config.rooms[0]!
    const room2 = config.rooms[1]!
    room1.operatorIds = ['char_263_skadi', 'char_4145_ulpia']
    room2.operatorIds = ['char_218_cuttle', 'char_143_ghost']

    // 1. With 4 Abyssal Hunters in base: each gets +40%, room1 gets +80% (skillBonus = 80)
    let res = evaluateOperators(room1, config)
    expect(res.skillBonus).toBe(80)
    expect(res.details).toContain('歌蕾蒂娅·集群狩猎：深海猎人制造联动 2 人，+80%（每人 +40%）')

    // 2. Remove 1 Abyssal Hunter from room2: globalCount becomes 3 -> perBeneficiaryValue = 30%, room1 gets +60%
    room2.operatorIds = ['char_143_ghost']
    res = evaluateOperators(room1, config)
    expect(res.skillBonus).toBe(60)
    expect(res.details).toContain('歌蕾蒂娅·集群狩猎：深海猎人制造联动 2 人，+60%（每人 +30%）')

    // 3. Gladiia leaves control central: bonus becomes 0
    config.controlOperatorIds = []
    res = evaluateOperators(room1, config)
    expect(res.skillBonus).toBe(0)
    expect(res.details.some((d) => d.includes('歌蕾蒂娅·集群狩猎'))).toBe(false)
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

  // 1. 泡泡+火神 skillBonus=62
  it('evaluates Bubble + Vulcan to skillBonus=62', () => {
    const config = createDefaultConfig()
    const room = config.rooms[0]!
    room.operatorIds = ['char_381_bubble', 'char_163_hpsts']
    const result = evaluateOperators(room, config)
    expect(result.skillBonus).toBe(62)
  })

  // 2. 断罪者+斯卡蒂+乌尔比安在全局4深海且歌蕾蒂娅中枢时 skillBonus=115、staffBonus=3、再含中枢制造2后总额外120
  it('evaluates Conviction + Skadi + Ulpian in 4-abyssal context with Gladiia in central to skillBonus=115, staffBonus=3, and 120% total extra with central manufacture 2', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = ['char_474_glady']
    const room1 = config.rooms[0]!
    const room2 = config.rooms[1]!
    room1.product = 'exp'
    room1.operatorIds = ['char_159_peacok', 'char_263_skadi', 'char_4145_ulpia']
    // Global 4 abyssal hunters: Skadi + Ulpian in room1, Andreana + Specter in room2
    room2.operatorIds = ['char_218_cuttle', 'char_143_ghost']

    const resultWithoutCentral = evaluateOperators(room1, config)
    expect(resultWithoutCentral.skillBonus).toBe(115)
    expect(resultWithoutCentral.staffBonus).toBe(3)

    config.controlOperatorIds = ['char_474_glady', 'char_003_kalts']
    const resultWithCentral = evaluateOperators(room1, config)
    expect(resultWithCentral.staffBonus).toBe(3)
    expect(resultWithCentral.efficiencyPercent).toBe(220)
    expect((resultWithCentral.efficiencyPercent - 100) / 100).toBe(1.2)
  })

  // 3. 伺夜+八幡海铃 skillBonus=45
  it('proves Vigil + Hachiman Kairin evaluates to skillBonus=45', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = ['char_4186_tmoris']
    config.facilities.reception = 3
    const room = config.rooms.find((r) => r.type === 'trading')!
    room.operatorIds = ['char_427_vigil']
    const result = evaluateOperators(room, config)
    expect(result.skillBonus).toBe(45)
  })

  // 4. 二赤+4杜林上下文6线且鸿雪30图耶50
  it('proves 2 gold + 4 durin context gives 6 lines, Pozyomka 30%, and Tuye 50%', () => {
    const raw = readFileSync('src/workbench/compat/fixtures/mower-252-2gold.json', 'utf-8')
    const ws = importMowerJson(raw)
    const baseConfig = createDefaultConfig()
    const config = compileMainPlanToAppConfig(ws.mainPlan, ws, baseConfig)
    const globalContext = buildRiicGlobalContext(config)
    expect(globalContext.goldProductionLines.effective).toBe(6)

    const pozyRoom = config.rooms.find((r) => r.operatorIds.includes('char_4055_bgsnow'))!
    const pozyResult = evaluateOperators(pozyRoom, config, undefined, undefined, globalContext)
    expect(pozyResult.details.some((d) => d.includes('鸿雪·销路宣发：+30%'))).toBe(true)

    const tuyeRoom = config.rooms.find((r) => r.operatorIds.includes('char_402_tuye'))!
    const tuyeResult = evaluateOperators(tuyeRoom, config, undefined, undefined, globalContext)
    expect(tuyeResult.details.some((d) => d.includes('图耶·物流规划·β：+50%'))).toBe(true)
  })

  describe('Control Central Global Manufacture Bonuses', () => {
    // 1. 凯尔希/Mon3tr无条件制造+2同类最高
    it('applies unconditional manufacture +2 from Kaltsit or Mon3tr taking same-category max', () => {
      const config = createDefaultConfig()
      const room = config.rooms[0]!
      room.operatorIds = []

      config.controlOperatorIds = ['char_003_kalts']
      const resKal = evaluateOperators(room, config)
      expect(resKal.skillBonus).toBe(2)
      expect(resKal.details).toContain('控制中枢：全局制造 +2%（同类取最高）')

      config.controlOperatorIds = ['char_4179_monstr']
      const resMon = evaluateOperators(room, config)
      expect(resMon.skillBonus).toBe(2)
      expect(resMon.details).toContain('控制中枢：全局制造 +2%（同类取最高）')

      config.controlOperatorIds = ['char_003_kalts', 'char_4179_monstr']
      const resBoth = evaluateOperators(room, config)
      expect(resBoth.skillBonus).toBe(2)
      expect(resBoth.details).toContain('控制中枢：全局制造 +2%（同类取最高）')
    })

    // 2. 斩业星熊须同中枢另有LGD才+3
    it('requires another LGD operator in central for Zanye Hoshiguma +3', () => {
      const config = createDefaultConfig()
      const room = config.rooms[0]!
      room.operatorIds = []

      // Negative: alone in central -> 0
      config.controlOperatorIds = ['char_1044_hsgma2']
      expect(evaluateOperators(room, config).skillBonus).toBe(0)

      // Negative: with non-LGD in central -> 0
      config.controlOperatorIds = ['char_1044_hsgma2', 'char_340_shwaz']
      expect(evaluateOperators(room, config).skillBonus).toBe(0)

      // Positive: with Swire (LGD) in central -> +3
      config.controlOperatorIds = ['char_1044_hsgma2', 'char_308_swire']
      const res = evaluateOperators(room, config)
      expect(res.skillBonus).toBe(3)
      expect(res.details).toContain('控制中枢：全局制造 +3%（同类取最高）')
    })

    // 3. 麒麟R夜刀须同中枢怪猎搭档才+2
    it('requires another Monster Hunter partner in central for Kirin R Yato +2', () => {
      const config = createDefaultConfig()
      const room = config.rooms[0]!
      room.operatorIds = []

      // Negative: alone in central -> 0
      config.controlOperatorIds = ['char_1029_yato2']
      expect(evaluateOperators(room, config).skillBonus).toBe(0)

      // Negative: with non-MH partner in central -> 0
      config.controlOperatorIds = ['char_1029_yato2', 'char_340_shwaz']
      expect(evaluateOperators(room, config).skillBonus).toBe(0)

      // Positive: with Rathalos S Noir Corne (MH partner) in central -> +2
      config.controlOperatorIds = ['char_1029_yato2', 'char_1030_noirc2']
      const res = evaluateOperators(room, config)
      expect(res.skillBonus).toBe(2)
      expect(res.details).toContain('控制中枢：全局制造 +2%（同类取最高）')
    })

    // 4. 布丁须至少2个有效作业平台才+2，0心情失效平台的计数边界按skill
    it('requires at least 2 active working platforms in power stations for Pudding +2, excluding 0-morale platforms', () => {
      const config = createDefaultConfig()
      const room = config.rooms[0]!
      room.operatorIds = []
      config.controlOperatorIds = ['char_4004_pudd']

      // Negative: only 1 platform in power station -> 0
      config.rooms[6]!.operatorIds = ['char_285_medic2'] // Lancet-2 in power station
      expect(evaluateOperators(room, config).skillBonus).toBe(0)

      // Negative: 2 platforms in power stations, BUT 1 is 0-morale -> active platform count is 1 -> 0
      config.rooms[7]!.operatorIds = ['char_286_cast3'] // Castle-3 in power station
      config.zeroMoraleOperatorIds = ['char_285_medic2']
      expect(evaluateOperators(room, config).skillBonus).toBe(0)

      // Positive: 2 active platforms in power stations -> +2
      config.zeroMoraleOperatorIds = []
      const res = evaluateOperators(room, config)
      expect(res.skillBonus).toBe(2)
      expect(res.details).toContain('控制中枢：全局制造 +2%（同类取最高）')
    })

    // 5. 涤火杰西卡对当前制造站每名黑钢+5且不影响其他站
    it('gives +5 per active Blacksteel operator only to current room and does not affect rooms without Blacksteel', () => {
      const config = createDefaultConfig()
      config.controlOperatorIds = ['char_1034_jesca2']

      const roomWithBlacksteel = config.rooms[0]!
      roomWithBlacksteel.operatorIds = ['char_4105_almond'] // Almond (Blacksteel)
      const res1 = evaluateOperators(roomWithBlacksteel, config)
      expect(res1.details.some((d) => d.includes('涤火杰西卡·老友相聚：黑钢干员 1 人，+5%'))).toBe(true)

      roomWithBlacksteel.operatorIds = ['char_4105_almond', 'char_107_liskam'] // Almond + Liskarm (2 Blacksteel)
      const res2 = evaluateOperators(roomWithBlacksteel, config)
      expect(res2.details.some((d) => d.includes('涤火杰西卡·老友相聚：黑钢干员 2 人，+10%'))).toBe(true)

      const roomWithoutBlacksteel = config.rooms[1]!
      roomWithoutBlacksteel.operatorIds = ['char_237_gravel'] // Gravel (Kazimierz, not Blacksteel)
      const resOther = evaluateOperators(roomWithoutBlacksteel, config)
      expect(resOther.details.some((d) => d.includes('涤火杰西卡'))).toBe(false)
    })

    // 6. 丰川祥子只对贵金属按1+floor(热情/20)
    it('applies Sakiko bonus only to gold product according to 1+floor(passion/20)', () => {
      const config = createDefaultConfig()
      config.dormitoryOccupantCount = 0

      const goldRoom = config.rooms[0]!
      goldRoom.product = 'gold'
      goldRoom.operatorIds = []

      const expRoom = config.rooms[1]!
      expRoom.product = 'exp'
      expRoom.operatorIds = []

      // 0 enthusiasm: 1 + floor(0/20) = +1%
      config.controlOperatorIds = ['char_4182_oblvns']
      expect(evaluateOperators(goldRoom, config).skillBonus).toBe(1)
      expect(evaluateOperators(expRoom, config).skillBonus).toBe(0)

      // 30 enthusiasm (八幡海铃 +10, 若叶睦 +20): 1 + floor(30/20) = +2%
      config.controlOperatorIds = ['char_4182_oblvns', 'char_4186_tmoris', 'char_4183_mortis']
      expect(evaluateOperators(goldRoom, config).skillBonus).toBe(2)
      expect(evaluateOperators(expRoom, config).skillBonus).toBe(0)

      // 40 enthusiasm (+祐天寺若麦 +10): 1 + floor(40/20) = +3%
      config.controlOperatorIds = ['char_4182_oblvns', 'char_4186_tmoris', 'char_4183_mortis', 'char_4185_amoris']
      const resGold40 = evaluateOperators(goldRoom, config)
      expect(resGold40.skillBonus).toBe(3)
      expect(resGold40.details.some((d) => d.includes('丰川祥子·丰富工作经验：贵金属生产力 +3%（热情值 40）'))).toBe(true)
      expect(evaluateOperators(expRoom, config).skillBonus).toBe(0)
    })

    // 7. 同类最高不可重复叠加
    it('takes the highest among same-category control manufacture bonuses without stacking', () => {
      const config = createDefaultConfig()
      const room = config.rooms[0]!
      room.operatorIds = []

      // 2 active platforms in power stations (Pudding candidate: 2)
      config.rooms[6]!.operatorIds = ['char_285_medic2']
      config.rooms[7]!.operatorIds = ['char_286_cast3']

      // Central has:
      // Kal'tsit (2)
      // Zanye Hoshiguma + Swire (3)
      // Kirin R Yato + MH Noir Corne (2)
      // Pudding (2)
      config.controlOperatorIds = [
        'char_003_kalts',
        'char_1044_hsgma2',
        'char_308_swire',
        'char_1029_yato2',
        'char_1030_noirc2',
      ]
      const res = evaluateOperators(room, config)
      expect(res.skillBonus).toBe(3)
      expect(res.details.filter((d) => d.includes('控制中枢：全局制造')).length).toBe(1)
      expect(res.details).toContain('控制中枢：全局制造 +3%（同类取最高）')
    })

    // 8. 望的条件若skill/catalog无法无歧义确定，保留未量化并写coverage，不猜
    it('leaves Wang condition unquantified without guessing', () => {
      const config = createDefaultConfig()
      const room = config.rooms[0]!
      room.operatorIds = []

      config.controlOperatorIds = ['char_2027_wang']
      const res = evaluateOperators(room, config)
      expect(res.skillBonus).toBe(0)
      expect(res.unquantifiedSkills).toContain('望·权变')
    })
  })

  describe('Structured Operator Contributions and Global Context Central Integration', () => {
    it('partitions room efficiency into operatorContributions and roomContributions summing to efficiencyPercent - 100', () => {
      const config = createDefaultConfig()
      config.controlOperatorIds = ['char_474_glady', 'char_003_kalts'] // Gladiia + Kaltsit (+2 central manufacture)
      const room1 = config.rooms[0]!
      room1.product = 'exp'
      room1.operatorIds = ['char_159_peacok', 'char_263_skadi', 'char_4145_ulpia']
      // Andreana + Specter in room 2 to make 4 global abyssal hunters
      config.rooms[1]!.operatorIds = ['char_218_cuttle', 'char_143_ghost']

      const res = evaluateOperators(room1, config)
      expect(res.efficiencyPercent).toBe(220) // 100 base + 120 extra

      // Verify each operator's structure
      const peacok = res.operatorContributions.find((o) => o.operatorName === '断罪者')!
      expect(peacok.staffBonus).toBe(1)
      expect(peacok.skillBonus).toBe(35)
      expect(peacok.totalBonus).toBe(36)
      expect(peacok.items).toEqual([
        { name: '进驻基础', value: 1 },
        { name: '断罪者·拳术指导录像', value: 35 },
      ])

      const skadi = res.operatorContributions.find((o) => o.operatorName === '斯卡蒂')!
      expect(skadi.staffBonus).toBe(1)
      expect(skadi.skillBonus).toBe(40)
      expect(skadi.totalBonus).toBe(41)

      const ulpian = res.operatorContributions.find((o) => o.operatorName === '乌尔比安')!
      expect(ulpian.staffBonus).toBe(1)
      expect(ulpian.skillBonus).toBe(40)
      expect(ulpian.totalBonus).toBe(41)

      // Verify roomContributions
      expect(res.roomContributions).toHaveLength(1)
      expect(res.roomContributions[0]!.value).toBe(2)
      expect(res.roomContributions[0]!.source).toContain('控制中枢：全局制造 +2%')

      // Strictly addable: opTotalSum + roomTotalSum === efficiencyPercent - 100
      const opSum = res.operatorContributions.reduce((sum, o) => sum + o.totalBonus, 0)
      const roomSum = res.roomContributions.reduce((sum, r) => sum + r.value, 0)
      expect(opSum + roomSum).toBe(res.efficiencyPercent - 100)
      expect(opSum + roomSum).toBe(120)

      // Test formatStructuredContributions
      const formatted = formatStructuredContributions(res)
      expect(formatted).toContain('[断罪者] +36% (进驻基础+1%, 断罪者·拳术指导录像+35%)')
      expect(formatted).toContain('[斯卡蒂] +41% (进驻基础+1%, 歌蕾蒂娅·集群狩猎+40%)')
      expect(formatted).toContain('[乌尔比安] +41% (进驻基础+1%, 歌蕾蒂娅·集群狩猎+40%)')
      expect(formatted).toContain('[房间/全局] +2% (控制中枢：全局制造 +2%（同类取最高）)')
    })

    it('handles Bubble + Vulcan net 62 skill bonus and negative item breakdown correctly', () => {
      const config = createDefaultConfig()
      const room = config.rooms[0]!
      room.operatorIds = ['char_381_bubble', 'char_163_hpsts']

      const res = evaluateOperators(room, config)
      expect(res.skillBonus).toBe(62)
      expect(res.staffBonus).toBe(2)
      expect(res.efficiencyPercent).toBe(164)

      const bubble = res.operatorContributions.find((o) => o.operatorName === '泡泡')!
      expect(bubble.skillBonus).toBe(67)
      expect(bubble.totalBonus).toBe(68)

      const vulcan = res.operatorContributions.find((o) => o.operatorName === '火神')!
      expect(vulcan.skillBonus).toBe(-5)
      expect(vulcan.totalBonus).toBe(-4) // 1 staff + (-5) skill = -4%

      const opSum = res.operatorContributions.reduce((sum, o) => sum + o.totalBonus, 0)
      const roomSum = res.roomContributions.reduce((sum, r) => sum + r.value, 0)
      expect(opSum + roomSum).toBe(64)
      expect(opSum + roomSum).toBe(res.efficiencyPercent - 100)
    })

    it('marks 0-morale exhausted operators as 0 total bonus in operatorContributions', () => {
      const config = createDefaultConfig()
      const room = config.rooms[0]!
      room.operatorIds = ['char_285_medic2']
      config.zeroMoraleOperatorIds = ['char_285_medic2']

      const res = evaluateOperators(room, config)
      expect(res.efficiencyPercent).toBe(100)

      const lancet = res.operatorContributions.find((o) => o.operatorName === 'Lancet-2')!
      expect(lancet.staffBonus).toBe(0)
      expect(lancet.skillBonus).toBe(0)
      expect(lancet.totalBonus).toBe(0)
      expect(lancet.items).toEqual([{ name: '0 心情失效', value: 0 }])
    })

    it('derives centralManufactureBonus into RiicGlobalContext snapshot and reuses it in evaluateOperators', () => {
      const config = createDefaultConfig()
      config.controlOperatorIds = ['char_1044_hsgma2', 'char_308_swire'] // Zanye Hoshiguma + Swire -> 3

      const globalContext = buildRiicGlobalContext(config)
      expect(globalContext.centralManufactureBonus).toBe(3)
      expect(globalContext.centralManufactureDetails).toContain('控制中枢：全局制造 +3%（同类取最高）')

      const room = config.rooms[0]!
      room.operatorIds = []
      const res = evaluateOperators(room, config, undefined, undefined, globalContext)
      expect(res.skillBonus).toBe(3)
      expect(res.roomContributions[0]!.value).toBe(3)
    })

    it('strictly triggers Totter skill only when morale gap > 12 (morale <= 11), not at gap == 12', () => {
      const config = createDefaultConfig()
      const room = config.rooms[0]!
      room.product = 'gold'
      room.operatorIds = ['char_4062_totter'] // Totter (铅踝)

      // Case 1: morale = 12 -> gap = 12 -> NOT > 12 -> 模糊视线+15%, 窗外雪啸0%
      config.operatorMorale['char_4062_totter'] = 12
      const res12 = evaluateOperators(room, config)
      expect(res12.skillBonus).toBe(15)
      expect(res12.details.some((d) => d.includes('窗外雪啸'))).toBe(false)

      // Case 2: morale = 11 -> gap = 13 -> strictly > 12 -> 模糊视线+15% + 窗外雪啸+10% = 25%
      config.operatorMorale['char_4062_totter'] = 11
      const res11 = evaluateOperators(room, config)
      expect(res11.skillBonus).toBe(25)
      expect(res11.details.some((d) => d.includes('铅踝·窗外雪啸：+10%'))).toBe(true)
    })

    it('isolates recipe-specific warehouse capacity for Click and Executor', () => {
      const config = createDefaultConfig()
      const goldRoom = config.rooms[0]!
      goldRoom.product = 'gold'
      goldRoom.operatorIds = ['char_190_clour', 'char_328_cammou'] // Vermeil (红云, own +8 cap = 16%) + Click (卡达)

      const resGold = evaluateOperators(goldRoom, config)
      // In gold room, Click's manu_formula_limit[010] gives 0 warehouse capacity
      // Vermeil only gets 8 * 2 = 16% from her own 8 capacity
      const vermeilGold = resGold.operatorContributions.find((o) => o.operatorName === '红云')!
      expect(vermeilGold.skillBonus).toBe(16)

      const expRoom = config.rooms[1]!
      expRoom.product = 'exp'
      expRoom.operatorIds = ['char_190_clour', 'char_328_cammou']
      const resExp = evaluateOperators(expRoom, config)
      // In exp room, Click gives +15 capacity, total = 8 + 15 = 23 -> Vermeil gets 23 * 2 = 46%
      const vermeilExp = resExp.operatorContributions.find((o) => o.operatorName === '红云')!
      expect(vermeilExp.skillBonus).toBe(46)
    })

    it('handles Gnosis in control: gives -15% to Kjerag operators like Degenbrecher', () => {
      const config = createDefaultConfig()
      config.controlOperatorIds = ['char_206_gnosis'] // Gnosis in control

      const tradeRoom = config.rooms.find((r) => r.type === 'trading')!
      tradeRoom.operatorIds = ['char_4116_blkkgt', 'char_102_texas'] // Degenbrecher (Kjerag) + Texas (Siracusa)

      const res = evaluateOperators(tradeRoom, config)
      // Gnosis in control applies -15% to Kjerag (Degenbrecher) in trading
      expect(res.details.some((d) => d.includes('灵知·精密计算：锏 -15%（订单上限 +6）'))).toBe(true)
      const degen = res.operatorContributions.find((o) => o.operatorName === '锏')!
      expect(degen.items.some((it) => it.name === '灵知·精密计算' && it.value === -15)).toBe(true)
      const texas = res.operatorContributions.find((o) => o.operatorName === '德克萨斯')!
      expect(texas.items.some((it) => it.name === '灵知·精密计算')).toBe(false)
    })

    it('preserves Eunectes +2 power station bonus even with Lancet-2 at 0 morale', () => {
      const config = createDefaultConfig()
      config.controlOperatorIds = ['char_416_zumama'] // Eunectes
      const powerRoom = config.rooms.find((r) => r.type === 'power')!
      powerRoom.operatorIds = ['char_285_medic2'] // Lancet-2
      config.zeroMoraleOperatorIds = ['char_285_medic2'] // 0 morale

      const globalCtx = buildRiicGlobalContext(config)
      expect(globalCtx.effectivePowerStations.count).toBe(globalCtx.effectivePowerStations.physical + 2)
      expect(globalCtx.effectivePowerStations.eunectesBonus).toBe(2)
    })
  })
})
