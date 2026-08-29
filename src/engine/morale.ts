import { OPERATOR_MAP, type OperatorRecord, type OperatorSkill } from '../domain/operators'
import type { AppConfig, OperatorMoraleResult, OutputRoom, RoomType } from '../domain/types'
import { evaluateOperators } from './operatorRules'
import { createOperatorGroupSchedule } from './operatorGroups'

interface Assignment {
  operator: OperatorRecord
  roomId: string
  roomType: RoomType | 'control'
  room?: OutputRoom
  peers: OperatorRecord[]
}

interface ResourceValues {
  enthusiasm: number
  fireworks: number
}

interface RateSnapshot {
  rates: Map<string, number>
  details: Map<string, string[]>
  resources: ResourceValues
}

export interface MoraleSimulation {
  averageEfficiencyPercent: Record<string, number>
  averagePowerBonusPercent: number
  operators: OperatorMoraleResult[]
}

const MLYNAR_EXTENDED_SKILLS = new Set([
  '左膀右臂', 'S.W.E.E.P.', '零食网络', '清理协议', '替身', '必要责任', '护卫',
  '小小的领袖', '独善其身', '笑靥如春', '金盏花诗会', '捍卫之道', '博识生手',
  '点滴关照', '总工程师',
])

const CUSTOM_MOOD_SKILLS = new Set([
  '德才兼备', '异格者', '彩虹小队', '幕后指挥', '学生会会长', '坚毅随和',
  '潮汐守望', '公事公办', '巴别塔之帜', '孤光共照', '知我为我',
  '演技的怪物', '互为半身', '生活的重压', '万里传书', '团队精神', '杯莫停',
  '“未完的故事”', '羁绊相生', '成效优先', '英雄的骄傲·β',
])

function selected(ids: string[]) {
  return ids.map((id) => OPERATOR_MAP.get(id)).filter((item): item is OperatorRecord => Boolean(item))
}

function assignments(config: AppConfig): Assignment[] {
  const result: Assignment[] = []
  const controlPeers = selected(config.controlOperatorIds)
  for (const operator of controlPeers) {
    result.push({ operator, roomId: '控制中枢', roomType: 'control', peers: controlPeers })
  }
  for (const room of config.rooms) {
    const peers = selected(room.operatorIds)
    for (const operator of peers) {
      result.push({ operator, roomId: room.id, roomType: room.type, room, peers })
    }
  }
  return result
}

function relevantRoomType(roomType: Assignment['roomType']) {
  return roomType === 'control' ? 'CONTROL' : roomType.toUpperCase()
}

function activeAssignments(all: Assignment[], activeIds: Set<string>) {
  return all.filter((assignment) => activeIds.has(assignment.operator.charId))
}

function isFaction(operator: OperatorRecord, ...ids: string[]) {
  return ids.some((id) =>
    operator.groupId === id || operator.teamId === id || operator.nationId === id,
  )
}

function isAlter(operator: OperatorRecord) {
  return /^char_10\d{2}_/.test(operator.charId)
}

function conditionMatches(skill: OperatorSkill, assignment: Assignment, activeIds: Set<string>) {
  const description = skill.description
  if (description.includes('生产作战记录类配方时') && assignment.room?.product !== 'exp') return false
  const sameRoom = description.match(/当与(.+?)在同一个(?:制造站|贸易站)时/)
  if (sameRoom) {
    return assignment.peers.some((peer) => peer.name === sameRoom[1] && activeIds.has(peer.charId))
  }
  const controlTogether = description.match(/当与(.+?)进驻控制中枢一起工作时/)
  if (controlTogether) {
    return assignment.peers.some((peer) => peer.name === controlTogether[1] && activeIds.has(peer.charId))
  }
  return true
}

function consumptionDelta(description: string): number | null {
  const consume = description.match(/心情每小时消耗([+-])([\d.]+)/)
  if (consume) return (consume[1] === '+' ? 1 : -1) * Number(consume[2])
  const recover = description.match(/心情每小时恢复\+([\d.]+)/)
  return recover ? -Number(recover[1]) : null
}

function moodScope(description: string): 'room' | 'others' | 'self' {
  if (/除自身以外|其余干员/.test(description)) return 'others'
  if (/当前制造站内所有干员|贸易站内(?:全体)?干员|全体心情|控制中枢内所有干员/.test(description)) {
    return 'room'
  }
  return 'self'
}

function resources(
  config: AppConfig,
  all: Assignment[],
  activeIds: Set<string>,
  morale: Map<string, number>,
): ResourceValues {
  const activeControlIds = new Set(
    activeAssignments(all, activeIds)
      .filter((item) => item.roomType === 'control')
      .map((item) => item.operator.charId),
  )
  let enthusiasm = 0
  if (activeControlIds.has('char_4186_tmoris')) enthusiasm += 10
  if (activeControlIds.has('char_4183_mortis')) enthusiasm += 20
  if (activeControlIds.has('char_4185_amoris')) enthusiasm += 10
  if (activeControlIds.has('char_4184_dolris')) {
    enthusiasm += Math.max(
      0,
      Math.min(config.facilities.dormitories.length * 5, config.dormitoryOccupantCount),
    )
  }

  let fireworks = 0
  if (activeControlIds.has('char_2023_ling') && (morale.get('char_2023_ling') ?? 0) > 12) fireworks += 15
  if (activeControlIds.has('char_2015_dusk') && (morale.get('char_2015_dusk') ?? 0) <= 12) fireworks += 15
  if (activeControlIds.has('char_2024_chyue')) {
    const activeSui = activeAssignments(all, activeIds).filter((item) => isFaction(item.operator, 'sui')).length
    fireworks += Math.min(5, activeSui) * 5
  }

  return { enthusiasm, fireworks }
}

function targetsForScope(
  source: Assignment,
  all: Assignment[],
  activeIds: Set<string>,
  scope: ReturnType<typeof moodScope>,
) {
  if (scope === 'self') return [source]
  return source.peers
    .filter((peer) => activeIds.has(peer.charId))
    .filter((peer) => scope !== 'others' || peer.charId !== source.operator.charId)
    .map((peer) => all.find((item) => item.operator.charId === peer.charId))
    .filter((item): item is Assignment => Boolean(item))
}

function computeRates(
  config: AppConfig,
  all: Assignment[],
  activeIds: Set<string>,
  morale: Map<string, number>,
): RateSnapshot {
  const rates = new Map<string, number>()
  const details = new Map<string, string[]>()
  const active = activeAssignments(all, activeIds)
  const activeControl = active.filter((item) => item.roomType === 'control')
  const activeControlCount = activeControl.length
  const resourceValues = resources(config, all, activeIds, morale)

  const add = (target: Assignment, delta: number, detail: string) => {
    rates.set(target.operator.charId, (rates.get(target.operator.charId) ?? 0) + delta)
    const targetDetails = details.get(target.operator.charId) ?? []
    if (!targetDetails.includes(detail)) targetDetails.push(detail)
    details.set(target.operator.charId, targetDetails)
  }
  const addAll = (targets: Assignment[], delta: number, detail: string) => {
    for (const target of targets) add(target, delta, detail)
  }

  for (const assignment of active) {
    let rate = 1 - activeControlCount * 0.05
    const baseDetails = [
      '基础消耗 1/h',
      `控制中枢 ${activeControlCount} 人：-${(activeControlCount * 0.05).toFixed(2)}/h`,
    ]
    if (assignment.roomType === 'manufacture' || assignment.roomType === 'trading') {
      const count = assignment.room?.operatorIds.length ?? 0
      const reduction = count >= 3 ? 0.1 : count >= 2 ? 0.05 : 0
      rate -= reduction
      if (reduction) baseDetails.push(`${count} 人进驻减免：-${reduction.toFixed(2)}/h`)
    }
    rates.set(assignment.operator.charId, rate)
    details.set(assignment.operator.charId, baseDetails)
  }

  const waaiFuRooms = new Set(
    active
      .filter((item) => item.operator.charId === 'char_243_waaifu' && item.roomType === 'manufacture')
      .map((item) => item.roomId),
  )
  const shouldCancelPositiveSelf = (
    source: Assignment,
    delta: number,
    scope: ReturnType<typeof moodScope>,
  ) => delta > 0 && scope === 'self' && (
    waaiFuRooms.has(source.roomId) ||
    (source.roomType === 'control' && activeControl.some((item) => item.operator.charId === 'char_2023_ling') && isFaction(source.operator, 'sui'))
  )

  for (const source of active) {
    for (const skill of source.operator.skills.filter((item) => item.roomType === relevantRoomType(source.roomType))) {
      if (CUSTOM_MOOD_SKILLS.has(skill.name) || !conditionMatches(skill, source, activeIds)) continue
      if (skill.description.includes('宿舍')) continue
      const delta = consumptionDelta(skill.description)
      if (delta === null) continue
      const scope = moodScope(skill.description)
      if (shouldCancelPositiveSelf(source, delta, scope)) {
        add(source, 0, `${waaiFuRooms.has(source.roomId) ? '槐琥·团队精神' : '令·杯莫停'}：消除 ${source.operator.name}·${skill.name} 的自身消耗`)
        continue
      }
      addAll(
        targetsForScope(source, all, activeIds, scope),
        delta,
        `${source.operator.name}·${skill.name}：${delta > 0 ? '+' : ''}${delta}/h`,
      )
    }
  }

  const applyCountRecovery = (
    sourceId: string,
    predicate: (operator: OperatorRecord) => boolean,
    amount: number,
    label: string,
  ) => {
    if (!activeIds.has(sourceId)) return
    const count = activeControl.filter((item) => predicate(item.operator)).length
    if (count) addAll(activeControl, -count * amount, `${label}：${count} 人，-${(count * amount).toFixed(2)}/h`)
  }

  applyCountRecovery('char_010_chen', (operator) => isFaction(operator, 'lgd'), 0.05, '陈·德才兼备')
  for (const id of ['char_1021_kroos2', 'char_1011_lava2', 'char_1024_hbisc2']) {
    applyCountRecovery(id, isAlter, 0.05, `${OPERATOR_MAP.get(id)?.name ?? id}·异格者`)
  }
  for (const id of ['char_456_ash', 'char_457_blitz', 'char_458_rfrost', 'char_459_tachak']) {
    applyCountRecovery(id, (operator) => isFaction(operator, 'rainbow'), 0.05, `${OPERATOR_MAP.get(id)?.name ?? id}·彩虹小队`)
  }
  applyCountRecovery('char_206_gnosis', (operator) => isFaction(operator, 'kjerag', 'karlan'), 0.05, '灵知·幕后指挥')
  applyCountRecovery('char_197_poca', (operator) => isFaction(operator, 'student'), 0.05, '早露·学生会会长')

  if (activeIds.has('char_226_hmau')) {
    const leeOperators = activeControl.filter((item) => isFaction(item.operator, 'lee'))
    if (leeOperators.length) {
      addAll(activeControl, -leeOperators.length * 0.05, `吽·坚毅随和：全员 -${(leeOperators.length * 0.05).toFixed(2)}/h`)
      addAll(leeOperators, -leeOperators.length * 0.2, `吽·坚毅随和：鲤氏额外 -${(leeOperators.length * 0.2).toFixed(2)}/h`)
    }
  }

  const varkis = activeControl.find((item) => item.operator.charId === 'char_4166_varkis')
  if (varkis && activeControl.some((item) =>
    item.operator.charId !== varkis.operator.charId && isFaction(item.operator, 'sargon'),
  )) {
    add(varkis, 0.02, '摆渡人·英雄的骄傲·β：与萨尔贡干员同驻，+0.02/h')
  }

  const theresa = activeControl.find((item) => item.operator.charId === 'char_4134_cetsyr')
  const amiya = activeControl.find((item) => item.operator.name === '阿米娅')
  if (theresa && amiya) {
    add(theresa, -0.1, '魔王·“未完的故事”：与阿米娅同驻，-0.1/h')
    add(amiya, -0.1, '魔王·“未完的故事”：与魔王同驻，-0.1/h')
  }

  const chongyue = activeControl.find((item) => item.operator.charId === 'char_2024_chyue')
  if (chongyue) {
    if (activeControl.some((item) => item.operator.charId === 'char_2023_ling')) {
      add(chongyue, 0, '令·杯莫停：消除重岳·知我为我的自身消耗')
    } else {
      add(chongyue, 0.5, '重岳·知我为我：+0.5/h')
    }
  }

  const sakiko = activeControl.find((item) => item.operator.charId === 'char_4182_oblvns')
  if (sakiko && resourceValues.enthusiasm >= 40) {
    add(sakiko, 0.05, `丰川祥子·生活的重压：热情值 ${resourceValues.enthusiasm}，+0.05/h`)
  }
  const mutsumi = activeControl.find((item) => item.operator.charId === 'char_4183_mortis')
  if (mutsumi) {
    if (sakiko) {
      add(mutsumi, 0, '若叶睦·互为半身：与丰川祥子同驻，消除自身技能消耗')
    } else {
      const delta = Math.floor(resourceValues.enthusiasm / 8) * 0.01
      if (delta) add(mutsumi, delta, `若叶睦·演技的怪物：热情值 ${resourceValues.enthusiasm}，+${delta.toFixed(2)}/h`)
    }
  }
  if (sakiko && activeControl.some((item) => item.operator.charId === 'char_4184_dolris')) {
    add(sakiko, -0.1, '三角初华·羁绊相生：丰川祥子 -0.1/h')
  }
  if (sakiko && activeControl.some((item) => item.operator.charId === 'char_4185_amoris')) {
    add(sakiko, 0.05, '祐天寺若麦·成效优先：丰川祥子 +0.05/h')
  }

  const gladiia = activeControl.find((item) => item.operator.charId === 'char_474_glady')
  if (gladiia) {
    const abyssalOutsideDorm = active.filter((item) => isFaction(item.operator, 'abyssal')).length
    add(gladiia, abyssalOutsideDorm * 0.5, `歌蕾蒂娅·潮汐守望：宿舍外深海猎人 ${abyssalOutsideDorm} 人，+${(abyssalOutsideDorm * 0.5).toFixed(2)}/h`)
  }

  const chimes = active.find((item) => item.operator.charId === 'char_4083_chimes' && item.roomType === 'trading')
  if (chimes) {
    const delta = -0.1 - Math.floor(resourceValues.fireworks / 10) * 0.02
    addAll(
      active.filter((item) => item.roomId === chimes.roomId),
      delta,
      `铎铃·万里传书：人间烟火 ${resourceValues.fireworks}，${delta.toFixed(2)}/h`,
    )
  }

  if (activeControl.some((item) => item.operator.charId === 'char_4064_mlynar')) {
    addAll(active.filter((item) => item.roomType === 'power'), -0.1, '玛恩纳·公事公办：发电站 -0.1/h')
    const extendCount = activeControl.reduce((count, item) => count + item.operator.skills.filter(
      (skill) => skill.roomType === 'CONTROL' && MLYNAR_EXTENDED_SKILLS.has(skill.name),
    ).length, 0)
    if (extendCount) {
      addAll(
        active.filter((item) => item.roomType !== 'control'),
        -extendCount * 0.05,
        `玛恩纳·公事公办：中枢可扩散技能 ${extendCount} 个，-${(extendCount * 0.05).toFixed(2)}/h`,
      )
    }
  }

  let otherFacilityRecovery = 0
  let otherFacilityLabel = ''
  if (activeControl.some((item) => item.operator.charId === 'char_1035_wisdel')) {
    const value = activeControl.some((item) => item.operator.charId === 'char_4134_cetsyr') ? 0.2 : 0.1
    if (value > otherFacilityRecovery) {
      otherFacilityRecovery = value
      otherFacilityLabel = `维什戴尔·巴别塔之帜${value === 0.2 ? '（魔王联动）' : ''}`
    }
  }
  if (activeControl.some((item) => item.operator.charId === 'char_2024_chyue')) {
    const value = 0.05 + Math.floor(resourceValues.fireworks / 20) * 0.05
    if (value > otherFacilityRecovery) {
      otherFacilityRecovery = value
      otherFacilityLabel = `重岳·孤光共照（人间烟火 ${resourceValues.fireworks}）`
    }
  }
  if (otherFacilityRecovery) {
    addAll(
      active.filter((item) => item.roomType !== 'control'),
      -otherFacilityRecovery,
      `${otherFacilityLabel}：其他设施 -${otherFacilityRecovery.toFixed(2)}/h（同类取最高）`,
    )
  }

  return { rates, details, resources: resourceValues }
}

function boundaryValues(assignment: Assignment) {
  if (assignment.operator.charId === 'char_4062_totter') return [20, 16, 12, 8, 4]
  if (assignment.operator.charId === 'char_2023_ling' || assignment.operator.charId === 'char_2015_dusk') return [12]
  return []
}

function nextBoundaryDuration(
  all: Assignment[],
  activeIds: Set<string>,
  morale: Map<string, number>,
  rates: Map<string, number>,
) {
  let duration = Number.POSITIVE_INFINITY
  for (const assignment of all) {
    const id = assignment.operator.charId
    if (!activeIds.has(id)) continue
    const value = morale.get(id) ?? 0
    const rate = rates.get(id) ?? 1
    for (const boundary of boundaryValues(assignment)) {
      if (rate > 0 && value > boundary + 1e-7) duration = Math.min(duration, (value - boundary) / rate)
      if (rate < 0 && value < boundary - 1e-7) duration = Math.min(duration, (boundary - value) / -rate)
    }
  }
  return duration
}

function nudgeBoundaryCrossings(
  all: Assignment[],
  activeIds: Set<string>,
  morale: Map<string, number>,
  rates: Map<string, number>,
) {
  let changed = false
  for (const assignment of all) {
    const id = assignment.operator.charId
    if (!activeIds.has(id)) continue
    const value = morale.get(id) ?? 0
    const rate = rates.get(id) ?? 1
    for (const boundary of boundaryValues(assignment)) {
      if (Math.abs(value - boundary) <= 1e-8 && rate !== 0) {
        morale.set(id, boundary + (rate > 0 ? -1e-7 : 1e-7))
        changed = true
      }
    }
  }
  return changed
}

export function simulateMorale(config: AppConfig): MoraleSimulation {
  const all = assignments(config)
  const morale = new Map(all.map((assignment) => {
    const configured = config.operatorMorale[assignment.operator.charId]
    const initial = config.zeroMoraleOperatorIds.includes(assignment.operator.charId)
      ? 0
      : Math.max(0, Math.min(24,
          typeof configured === 'number' && Number.isFinite(configured) ? configured : 24,
        ))
    return [assignment.operator.charId, initial] as const
  }))
  const initialMorale = new Map(morale)
  const activeIds = new Set([...morale].filter(([, value]) => value > 0).map(([id]) => id))
  const assignedIds = new Set(all.map((assignment) => assignment.operator.charId))
  const groupSchedule = createOperatorGroupSchedule(config.operatorGroups, assignedIds)
  const exhaustedAt = new Map<string, number>()
  const leftAt = new Map<string, number>()
  const leaveReason = new Map<string, OperatorMoraleResult['leaveReason']>()

  const applyDepartures = (triggerIds: Set<string>, time: number) => {
    const departures = groupSchedule.expandDepartures(triggerIds)
    for (const id of departures) {
      if (triggerIds.has(id)) exhaustedAt.set(id, time)
      if (!activeIds.has(id) && !triggerIds.has(id)) continue
      activeIds.delete(id)
      leftAt.set(id, time)
      leaveReason.set(id, triggerIds.has(id) ? 'morale-exhausted' : 'group-sync')
    }
  }

  const initiallyExhausted = new Set(
    [...morale].filter(([, value]) => value <= 0).map(([id]) => id),
  )
  if (initiallyExhausted.size) applyDepartures(initiallyExhausted, 0)
  const initialSnapshot = computeRates(config, all, activeIds, morale)
  const efficiencyTotals: Record<string, number> = Object.fromEntries(config.rooms.map((room) => [room.id, 0]))
  let powerBonusTotal = 0
  let elapsed = 0

  while (elapsed < config.hours - 1e-9) {
    let snapshot = computeRates(config, all, activeIds, morale)
    if (nudgeBoundaryCrossings(all, activeIds, morale, snapshot.rates)) {
      snapshot = computeRates(config, all, activeIds, morale)
    }
    const rates = snapshot.rates
    let duration = Math.min(config.hours - elapsed, nextBoundaryDuration(all, activeIds, morale, rates))
    for (const id of activeIds) {
      const rate = rates.get(id) ?? 1
      if (rate > 0) duration = Math.min(duration, (morale.get(id) ?? 0) / rate)
    }
    if (!Number.isFinite(duration)) duration = config.hours - elapsed
    if (duration <= 1e-9) {
      const triggers = new Set([...activeIds].filter((id) => (morale.get(id) ?? 0) <= 1e-9))
      applyDepartures(triggers, elapsed)
      continue
    }

    for (const room of config.rooms) {
      efficiencyTotals[room.id] = (efficiencyTotals[room.id] ?? 0) +
        evaluateOperators(room, config, activeIds, morale).efficiencyPercent * duration
    }
    powerBonusTotal += config.rooms
      .filter((room) => room.type === 'power')
      .reduce((sum, room) =>
        sum + evaluateOperators(room, config, activeIds, morale).efficiencyPercent - 100,
      0) * duration

    for (const id of activeIds) {
      const rate = rates.get(id) ?? 1
      morale.set(id, Math.max(0, Math.min(24, (morale.get(id) ?? 0) - rate * duration)))
    }
    elapsed += duration
    const triggers = new Set([...activeIds].filter((id) => (morale.get(id) ?? 0) <= 1e-8))
    if (triggers.size) applyDepartures(triggers, elapsed)
  }

  return {
    averageEfficiencyPercent: Object.fromEntries(
      Object.entries(efficiencyTotals).map(([roomId, total]) => [roomId, total / config.hours]),
    ),
    averagePowerBonusPercent: powerBonusTotal / config.hours,
    operators: all.map((assignment) => {
      const id = assignment.operator.charId
      const group = groupSchedule.groupByOperator.get(id)
      const details = [...(initialSnapshot.details.get(id) ?? [])]
      if (group) details.unshift(`组合「${group.name}」：预测起点同步进驻，任一成员耗尽时全组离开`)
      return {
        operatorId: id,
        operatorName: assignment.operator.name,
        roomId: assignment.roomId,
        initial: initialMorale.get(id) ?? 24,
        ending: morale.get(id) ?? 0,
        initialConsumptionPerHour: initialSnapshot.rates.get(id) ?? 0,
        exhaustedAt: exhaustedAt.get(id) ?? null,
        leftAt: leftAt.get(id) ?? null,
        leaveReason: leaveReason.get(id) ?? null,
        groupName: group?.name ?? null,
        details,
      }
    }),
  }
}
