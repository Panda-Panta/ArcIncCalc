import { OPERATORS } from '../domain/operators'
import { evaluateOperators } from '../engine/operatorRules'
import { matchesRiicIdentity } from '../domain/riicIdentity'
import { hasRiicTag } from '../domain/riicTags'
import type { OutputRoom } from '../domain/types'

export const FACTION_KEYS = [
  'abyssal',
  'rhine',
  'blacksteel',
  'lgd',
  'pinus',
  'glasgow',
  'karlan',
  'sui',
  'sees',
  'student',
] as const

export type FactionKey = (typeof FACTION_KEYS)[number]

export const SYNERGY_TAG_KEYS = [
  'warehouseCapacity',
  'perception',
  'durin',
  'monsterHunter',
  'knight',
  'workPlatform',
  'automation',
  'facilityDependent',
] as const

export type SynergyTagKey = (typeof SYNERGY_TAG_KEYS)[number]

export interface OperatorIsolatedFeature {
  charId: string
  name: string
  vocabIndex: number

  // 基础效率加成比率 (例如 +30% 记录为 0.30)
  mfgGoldEff: number
  mfgExpEff: number
  tradeBaseEff: number
  powerBaseEff: number
  controlMfgEff: number
  controlTradeEff: number

  // 心情与工休属性
  moraleRate: number         // 默认工作心情消耗速率 (/h，通常 -1.0)
  dutyCycleRatio: number     // 估计工休比 T_work / (T_work + T_rest)
  isWorkaholic: boolean      // 是否 0 心情常驻生效 (Lancet-2 等)

  // 派系标签 (严格遵循异格隔离)
  factions: number[]         // 10 维 0/1 数组
  synergyTags: number[]      // 8 维 0/1 数组
}

import { createDefaultConfig } from '../domain/defaults'

function createDummyRoom(type: 'manufacture' | 'trading' | 'power', opId: string, product: 'gold' | 'exp' = 'gold'): OutputRoom {
  return {
    id: 'room_1_1',
    type,
    level: 3,
    operatorCount: 1,
    operatorIds: [opId],
    skillBonus: 0,
    product,
    strategy: 'gold',
    quality: 'normal',
    specialOrder: 'none',
    powerStaffed: type === 'power',
  }
}

/** 预计算全量 429 名干员的独立基建特征表 */
export function buildIsolatedFeatureTable(): Map<string, OperatorIsolatedFeature> {
  const table = new Map<string, OperatorIsolatedFeature>()
  const dummyConfig = createDefaultConfig()

  OPERATORS.forEach((op, index) => {
    // 1. 独立单人制造站 (赤金)
    const mfgGoldRoom = createDummyRoom('manufacture', op.charId, 'gold')
    const mfgGoldRes = evaluateOperators(mfgGoldRoom, dummyConfig)
    const mfgGoldEff = (mfgGoldRes.skillBonus || 0) / 100

    // 2. 独立单人制造站 (作战记录)
    const mfgExpRoom = createDummyRoom('manufacture', op.charId, 'exp')
    const mfgExpRes = evaluateOperators(mfgExpRoom, dummyConfig)
    const mfgExpEff = (mfgExpRes.skillBonus || 0) / 100

    // 3. 独立单人贸易站
    const tradeRoom = createDummyRoom('trading', op.charId, 'gold')
    const tradeRes = evaluateOperators(tradeRoom, dummyConfig)
    const tradeBaseEff = (tradeRes.skillBonus || 0) / 100

    // 4. 独立单人发电站
    const powerRoom = createDummyRoom('power', op.charId, 'gold')
    const powerRes = evaluateOperators(powerRoom, dummyConfig)
    const powerBaseEff = (powerRes.skillBonus || 0) / 100

    // 5. 中枢加成扫描
    let controlMfgEff = 0
    let controlTradeEff = 0
    for (const skill of op.skills) {
      if (skill.roomType === 'CONTROL') {
        const mfgMatch = skill.description.match(/所有制造站生产力\+([\d.]+)%/)
        if (mfgMatch) controlMfgEff = Math.max(controlMfgEff, Number(mfgMatch[1]) / 100)
        const tradeMatch = skill.description.match(/所有贸易站.*效率\+([\d.]+)%/)
        if (tradeMatch) controlTradeEff = Math.max(controlTradeEff, Number(tradeMatch[1]) / 100)
      }
    }
    if (op.charId === 'char_003_kalts' || op.charId === 'char_4179_monstr') {
      controlMfgEff = Math.max(controlMfgEff, 0.02)
    }

    // 6. 心情与工休比
    let moraleRate = -1.0
    for (const skill of op.skills) {
      const selfDrainMatch = skill.description.match(/自身心情每小时消耗([+-][\d.]+)/)
      if (selfDrainMatch) {
        moraleRate += Number(selfDrainMatch[1])
      }
    }
    // 特殊高消耗/低消耗干员微调 (如铅踝)
    if (op.charId === 'char_4062_totter') {
      moraleRate = -2.0 // 剧烈消耗
    }
    const isWorkaholic = op.charId === 'char_285_medic2' // Lancet-2 等

    // 估计工休比: T_work = 24 / |moraleRate|, T_rest = 24 / 3.0 (平均每小时恢复 3 点心情)
    const workHours = Math.max(4, 24 / Math.max(0.1, Math.abs(moraleRate)))
    const restHours = 24 / 3.0 // 8 小时
    const dutyCycleRatio = isWorkaholic ? 1.0 : workHours / (workHours + restHours)

    // 7. 派系向量 (严格遵守 matchesRiicIdentity)
    const factions = FACTION_KEYS.map((faction) => {
      if (faction === 'sees') {
        return hasRiicTag(op, 'sees') ? 1 : 0
      }
      if (faction === 'student') {
        return matchesRiicIdentity(op, 'teamId', 'student') ? 1 : 0
      }
      return matchesRiicIdentity(op, 'groupId', faction) ? 1 : 0
    })

    // 8. 协同标签
    const desc = op.skills.map((s) => s.description).join(' ')
    const hasWarehouse = desc.includes('仓库容量') || desc.includes('上限')
    const hasPerception = desc.includes('感知信息') || desc.includes('无声共鸣') || desc.includes('思维链环') || desc.includes('记忆碎片')
    const isDurin = hasRiicTag(op, 'durin')
    const isMH = hasRiicTag(op, 'monsterHunter')
    const isKnight = hasRiicTag(op, 'knight')
    const isWorkPlatform = hasRiicTag(op, 'workPlatform')
    const isAutomation = desc.includes('生产力全部归零') || op.charId === 'char_400_weedy' || op.charId === 'char_416_zumama'
    const isFacilityDep = desc.includes('宿舍') || desc.includes('发电站') || desc.includes('贸易站') || desc.includes('办公室') || desc.includes('训练室')

    const synergyTags = [
      hasWarehouse ? 1 : 0,
      hasPerception ? 1 : 0,
      isDurin ? 1 : 0,
      isMH ? 1 : 0,
      isKnight ? 1 : 0,
      isWorkPlatform ? 1 : 0,
      isAutomation ? 1 : 0,
      isFacilityDep ? 1 : 0,
    ]

    table.set(op.charId, {
      charId: op.charId,
      name: op.name,
      vocabIndex: index,
      mfgGoldEff,
      mfgExpEff,
      tradeBaseEff,
      powerBaseEff,
      controlMfgEff,
      controlTradeEff,
      moraleRate,
      dutyCycleRatio,
      isWorkaholic,
      factions,
      synergyTags,
    })
  })

  return table
}
