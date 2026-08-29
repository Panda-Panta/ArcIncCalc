import type { AppConfig, OutputRoom, QualityRule, SpecialOrder } from '../domain/types'
import { OPERATOR_MAP, type OperatorRecord, type OperatorSkill } from '../domain/operators'

export interface OperatorEfficiencyResult {
  efficiencyPercent: number
  staffBonus: number
  skillBonus: number
  operatorNames: string[]
  details: string[]
  unquantifiedSkills: string[]
  quality: QualityRule
  specialOrder: SpecialOrder
}

const GAME_ROOM_TYPES = {
  manufacture: 'MANUFACTURE',
  trading: 'TRADING',
  power: 'POWER',
} as const

type SkillClassCounts = Record<string, number>

function selectedOperators(ids: string[]): OperatorRecord[] {
  return ids.map((id) => OPERATOR_MAP.get(id)).filter((item): item is OperatorRecord => Boolean(item))
}

function activeInContext(id: string, config: AppConfig, activeOperatorIds?: Set<string>): boolean {
  return activeOperatorIds ? activeOperatorIds.has(id) : !config.zeroMoraleOperatorIds.includes(id)
}

function skillClass(skill: OperatorSkill): string | null {
  const match = skill.name.match(/^(.+?)·[αβγ]$/)
  return match?.[1] ?? null
}

function roomClassCounts(operators: OperatorRecord[]): SkillClassCounts {
  const counts: SkillClassCounts = {}
  const skills = operators.flatMap((operator) =>
    operator.skills.filter((skill) => skill.roomType === 'MANUFACTURE'),
  )
  for (const skill of skills) {
    const type = skillClass(skill)
    if (type) counts[type] = (counts[type] ?? 0) + 1
  }
  const convertsToStandard = skills.some(
    (skill) =>
      skill.description.includes('莱茵科技类') &&
      skill.description.includes('红松骑士团类') &&
      skill.description.includes('视作标准化类'),
  )
  if (convertsToStandard) {
    counts.标准化 = (counts.标准化 ?? 0) + (counts.莱茵科技 ?? 0) + (counts.红松骑士团 ?? 0)
  }
  return counts
}

function directManufactureBonus(skill: OperatorSkill, room: OutputRoom): number | null {
  const description = skill.description
  const categoryMatch = description.match(
    /^进驻制造站时，(?:当前制造站)?(贵金属|作战记录|源石)类配方的生产力\+([\d.]+)%/,
  )
  if (categoryMatch) {
    const productMatches =
      (categoryMatch[1] === '贵金属' && room.product === 'gold') ||
      (categoryMatch[1] === '作战记录' && room.product === 'exp') ||
      (categoryMatch[1] === '源石' && room.product === 'fragment')
    return productMatches ? Number(categoryMatch[2]) : 0
  }
  const commonMatch = description.match(
    /^进驻制造站时，(?:当前制造站)?生产力\+([\d.]+)%/,
  )
  return commonMatch ? Number(commonMatch[1]) : null
}

function directTradingBonus(skill: OperatorSkill): number | null {
  const match = skill.description.match(/^进驻贸易站时，订单获取效率\+([\d.]+)%/)
  return match ? Number(match[1]) : null
}

function directPowerBonus(skill: OperatorSkill): number | null {
  const match = skill.description.match(/^进驻发电站时，无人机充能速度\+([\d.]+)%/)
  return match ? Number(match[1]) : null
}

function effectivePowerStationCount(config: AppConfig, activeOperatorIds?: Set<string>): {
  count: number
  physical: number
  greyBonus: number
  eunectesBonus: number
} {
  const powerRooms = config.rooms.filter((room) => room.type === 'power')
  const powerOperators = powerRooms.flatMap((room) => selectedOperators(room.operatorIds))
  const activeIds = new Set(
    powerRooms.flatMap((room) => room.operatorIds).filter((id) => activeInContext(id, config, activeOperatorIds)),
  )
  const workPlatforms = new Set([
    'char_285_medic2',
    'char_286_cast3',
    'char_376_therex',
    'char_4000_jnight',
    'char_4093_frston',
    'char_4136_phonor',
    'char_4188_confes',
    'char_4227_gallus',
  ])
  const physical = powerRooms.length
  const greyRoom = powerRooms.find((room) => room.operatorIds.includes('char_1027_greyy2'))
  const activePlatformInOtherRoom = powerRooms.some(
    (room) =>
      room.id !== greyRoom?.id &&
      room.operatorIds.some((id) => activeIds.has(id) && workPlatforms.has(id)),
  )
  const greyBonus =
    greyRoom && activeIds.has('char_1027_greyy2') && !activePlatformInOtherRoom ? 1 : 0
  const eunectesBonus =
    config.controlOperatorIds.includes('char_416_zumama') &&
    activeInContext('char_416_zumama', config, activeOperatorIds) &&
    powerOperators.some((operator) => operator.name === 'Lancet-2')
      ? 2
      : 0
  return { count: physical + greyBonus + eunectesBonus, physical, greyBonus, eunectesBonus }
}

function facilityCountManufactureBonus(
  skill: OperatorSkill,
  room: OutputRoom,
  config: AppConfig,
  activeOperatorIds?: Set<string>,
): { value: number; detail: string } | null {
  const powerMatch = skill.description.match(/每个发电站为当前制造站\+([\d.]+)%的生产力/)
  if (powerMatch) {
    const stations = effectivePowerStationCount(config, activeOperatorIds)
    return {
      value: stations.count * Number(powerMatch[1]),
      detail: `有效发电站 ${stations.count}（实体 ${stations.physical}、承曦格雷伊 +${stations.greyBonus}、森蚺/Lancet-2 +${stations.eunectesBonus}）`,
    }
  }
  const tradeMatch = skill.description.match(/每个贸易站为当前制造站(?:贵金属类配方的生产力)?\+([\d.]+)%/)
  if (tradeMatch) {
    if (skill.description.includes('贵金属类配方') && room.product !== 'gold') {
      return { value: 0, detail: '仅对贵金属配方生效' }
    }
    const count = config.rooms.filter((item) => item.type === 'trading').length
    return { value: count * Number(tradeMatch[1]), detail: `按 ${count} 个贸易站计算` }
  }
  return null
}

function isAutomationSkill(skill: OperatorSkill): boolean {
  return skill.roomType === 'MANUFACTURE' && skill.description.includes('其他干员提供的生产力全部归零')
}

function sameRoomTargetBonus(
  skill: OperatorSkill,
  operatorNames: Set<string>,
  roomType: OutputRoom['type'],
): number | null {
  const roomName = roomType === 'trading' ? '贸易站' : '制造站'
  const match = skill.description.match(
    new RegExp(`当与(.+?)在同一个${roomName}时，.*?(?:生产力|订单获取效率)\\+([\\d.]+)%`),
  )
  if (!match) return null
  return operatorNames.has(match[1]!) ? Number(match[2]) : 0
}

function classLinkBonus(skill: OperatorSkill, counts: SkillClassCounts): number | null {
  const match = skill.description.match(
    /每个(.+?)类技能为自身\+([\d.]+)%的生产力/,
  )
  if (!match) return null
  return (counts[match[1]!] ?? 0) * Number(match[2])
}

function inferQuality(operators: OperatorRecord[], fallback: QualityRule): QualityRule {
  const names = operators.flatMap((operator) => operator.skills.map((skill) => skill.name))
  if (names.some((name) => /裁缝·β|手工艺品·β|鉴定师的手段/.test(name))) return 'beta'
  if (names.some((name) => /裁缝·α|手工艺品·α|鉴定师的眼光|懂行|千金的眼光/.test(name))) {
    return 'alpha'
  }
  return fallback
}

function inferSpecialOrder(operators: OperatorRecord[], fallback: SpecialOrder): SpecialOrder {
  if (fallback === 'shiftRun') return fallback
  const names = new Set(operators.map((operator) => operator.name))
  if (names.has('佩佩')) return 'pepe'
  if (names.has('可露希尔')) return 'closure'
  if (names.has('U-Official')) return 'uofficial'
  if (names.has('但书')) return 'provisoBeta'
  if (names.has('龙舌兰')) return 'tequilaBeta'
  return fallback
}

function controlGlobalBonus(
  room: OutputRoom,
  config: AppConfig,
  roomOperators: OperatorRecord[],
  activeOperatorIds?: Set<string>,
): { bonus: number; details: string[] } {
  const controlOperators = selectedOperators(
    config.controlOperatorIds.filter((id) => activeInContext(id, config, activeOperatorIds)),
  )
  let bonus = 0
  const details: string[] = []

  if (room.type === 'manufacture') {
    let staticMax = 0
    for (const operator of controlOperators) {
      for (const skill of operator.skills.filter((item) => item.roomType === 'CONTROL')) {
        const match = skill.description.match(/所有制造站生产力\+([\d.]+)%/)
        if (match && Number(match[1]) > staticMax) {
          staticMax = Number(match[1])
        }
      }
    }
    if (staticMax) {
      bonus += staticMax
      details.push(`控制中枢：全局制造 +${staticMax}%（同类取最高）`)
    }

    if (controlOperators.some((operator) => operator.name === '歌蕾蒂娅')) {
      const abyssalInFactories = config.rooms
        .filter((item) => item.type === 'manufacture')
        .flatMap((item) =>
          selectedOperators(item.operatorIds.filter((id) => activeInContext(id, config, activeOperatorIds))),
        )
        .filter((operator) => operator.groupId === 'abyssal').length
      if (roomOperators.some((operator) => operator.groupId === 'abyssal') && abyssalInFactories > 0) {
        const value = Math.min(90, abyssalInFactories * 10)
        bonus += value
        details.push(`歌蕾蒂娅·集群狩猎：深海猎人制造联动 +${value}%`)
      }
    }

    if (controlOperators.some((operator) => operator.name === '焰尾')) {
      const pinusCount = roomOperators.filter((operator) => operator.groupId === 'pinus').length
      if (pinusCount) {
        const value = room.product === 'exp' ? pinusCount * 10 : room.product === 'gold' ? -pinusCount * 10 : 0
        bonus += value
        if (value) details.push(`焰尾·红松的骑士：${value > 0 ? '+' : ''}${value}%`)
      }
    }
  }

  if (room.type === 'trading') {
    let staticMax = 0
    for (const operator of controlOperators) {
      for (const skill of operator.skills.filter((item) => item.roomType === 'CONTROL')) {
        const match = skill.description.match(/所有贸易站订单效率\+([\d.]+)%/)
        if (match) staticMax = Math.max(staticMax, Number(match[1]))
      }
    }
    if (staticMax) {
      bonus += staticMax
      details.push(`控制中枢：全局贸易 +${staticMax}%（同类取最高）`)
    }
  }

  return { bonus, details }
}

export function evaluateOperators(
  room: OutputRoom,
  config: AppConfig,
  activeOperatorIds?: Set<string>,
  moraleValues?: Map<string, number>,
): OperatorEfficiencyResult {
  const operators = selectedOperators(room.operatorIds)
  const activeOperators = operators.filter(
    (operator) => activeInContext(operator.charId, config, activeOperatorIds),
  )
  const operatorNames = new Set(activeOperators.map((operator) => operator.name))
  const details: string[] = []
  const unquantifiedSkills: string[] = []
  const automationOperators = new Set(
    activeOperators
      .filter((operator) => operator.skills.some(isAutomationSkill))
      .map((operator) => operator.charId),
  )
  const staffCount = activeOperators.length
  const staffBonus = staffCount * (room.type === 'power' ? 5 : 1)
  let skillBonus = room.skillBonus
  const classCounts = room.type === 'manufacture' ? roomClassCounts(activeOperators) : null

  if (operators.length) {
    details.push(`进驻基础：${operators.length} 人，+${staffBonus}%`)
    const exhausted = operators.filter((operator) => !activeOperators.includes(operator))
    if (exhausted.length) details.push(`0 心情失效：${exhausted.map((operator) => operator.name).join('、')}`)
    if (automationOperators.size > 0) {
      details.push('自动化：仅清零其他干员的技能生产力，不影响每人 1% 进驻基础')
    }
  }
  if (room.skillBonus) details.push(`手动修正：${room.skillBonus > 0 ? '+' : ''}${room.skillBonus}%`)

  for (const operator of activeOperators) {
    const skills = operator.skills.filter((skill) => skill.roomType === GAME_ROOM_TYPES[room.type])
    for (const skill of skills) {
      let applied: number | null = null
      let facilityBased = false
      let facilityDetail = ''
      if (room.type === 'manufacture') {
        const morale = moraleValues?.get(operator.charId) ?? config.operatorMorale[operator.charId] ?? 24
        const moraleGap = Math.max(0, 24 - morale)
        if (operator.charId === 'char_4062_totter' && skill.name === '模糊视线') {
          applied = 30 - Math.floor(moraleGap / 4) * 5
          facilityDetail = `当前心情 ${morale.toFixed(1)}，落差 ${moraleGap.toFixed(1)}`
        } else if (operator.charId === 'char_4062_totter' && skill.name === '窗外雪啸') {
          applied = moraleGap >= 12 ? 10 : 0
          facilityDetail = `当前心情 ${morale.toFixed(1)}，落差 ${moraleGap.toFixed(1)}`
        }
        const facility = applied === null
          ? facilityCountManufactureBonus(skill, room, config, activeOperatorIds)
          : null
        if (facility) {
          applied = facility.value
          facilityBased = true
          facilityDetail = facility.detail
        } else if (applied === null) {
          applied = directManufactureBonus(skill, room)
        }
        const link = classCounts ? classLinkBonus(skill, classCounts) : null
        if (link !== null) applied = (applied ?? 0) + link
        const target = sameRoomTargetBonus(skill, operatorNames, room.type)
        if (target !== null) applied = (applied ?? 0) + target
        if (
          skill.description.includes('莱茵科技类') &&
          skill.description.includes('红松骑士团类') &&
          skill.description.includes('视作标准化类')
        ) {
          applied = applied ?? 0
          details.push(`${operator.name}·${skill.name}：莱茵/红松技能计入标准化`)
        }
      } else if (room.type === 'trading') {
        applied = directTradingBonus(skill)
        const target = sameRoomTargetBonus(skill, operatorNames, room.type)
        if (target !== null) applied = (applied ?? 0) + target
        if (/高品质|特别订单|独占订单|违约订单|赤金交付数/.test(skill.description)) {
          applied = applied ?? 0
        }
      } else {
        applied = directPowerBonus(skill)
      }

      if (
        room.type === 'manufacture' &&
        automationOperators.size > 0 &&
        !automationOperators.has(operator.charId) &&
        !facilityBased &&
        applied !== null
      ) {
        if (applied !== 0) details.push(`${operator.name}·${skill.name}：被自动化清零`)
        applied = 0
      }

      if (applied !== null) {
        skillBonus += applied
        if (applied !== 0) {
          details.push(
            `${operator.name}·${skill.name}：${applied > 0 ? '+' : ''}${applied}%${facilityDetail ? `（${facilityDetail}）` : ''}`,
          )
        }
      } else {
        unquantifiedSkills.push(`${operator.name}·${skill.name}`)
      }
    }
  }

  const global = controlGlobalBonus(room, config, activeOperators, activeOperatorIds)
  skillBonus += global.bonus
  details.push(...global.details)
  const quality = room.type === 'trading' ? inferQuality(activeOperators, room.quality) : room.quality
  const specialOrder =
    room.type === 'trading' ? inferSpecialOrder(activeOperators, room.specialOrder) : room.specialOrder
  if (room.type === 'trading' && quality !== room.quality) {
    details.push(`订单品质：由干员技能自动切换为 ${quality === 'beta' ? 'β' : 'α'} 分布`)
  }
  if (room.type === 'trading' && specialOrder !== room.specialOrder) {
    details.push('特殊订单：已按进驻干员与订单优先级自动应用')
  }
  if (room.type === 'trading' && specialOrder === 'shiftRun') {
    details.push(
      room.level >= 3
        ? '跑单：订单生成前换入但书·β与龙舌兰·β，生成后恢复原班组'
        : '跑单：订单生成前换入但书·β，生成后恢复原班组',
    )
  }

  return {
    efficiencyPercent: 100 + staffBonus + skillBonus,
    staffBonus,
    skillBonus,
    operatorNames: operators.map((operator) => operator.name),
    details,
    unquantifiedSkills,
    quality,
    specialOrder,
  }
}
