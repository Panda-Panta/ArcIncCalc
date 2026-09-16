import type { RosterWorkspace } from '../workbench/model'
import { MOWER_OUTPUT_ROOM_IDS } from '../workbench/model'
import type { OperatorIsolatedFeature } from './operatorIsolatedFeatures'
import type { GlobalFacilityVector } from './globalFacilityFeatures'
import { encodeScheduleToTensor, ENCODING_TENSOR_DIM } from './scheduleEncoding'

export interface SampledCandidate {
  prodAssignments: (string | null)[]    // 27 槽位
  centralAssignments: (string | null)[] // 5 槽位
}

// 核心联动组专家组合 (使用正式 charId)
const CORE_SYNERGY_TEMPLATES = [
  // 仓储流 (红云 + 火神 + 泡泡)
  ['char_190_clour', 'char_163_hpsts', 'char_381_bubble'],
  // 深海猎人 (歌蕾蒂娅 + 幽灵鲨 + 安哲拉)
  ['char_474_glady', 'char_143_ghost', 'char_218_cuttle'],
  // 莱茵科技 (多萝西 + 赫默 + 梅尔)
  ['char_4048_doroth', 'char_108_silent', 'char_242_otter'],
  // S.E.E.S. (结城理 + 埃癸斯 + 岳羽由加莉)
  ['char_4217_makoto', 'char_4218_aigis', 'char_4219_yukari'],
  // 杜林金线 (鸿雪 + 绮良 + 图耶)
  ['char_4055_bgsnow', 'char_478_kirara', 'char_402_tuye'],
  // 跑单巫恋组 (巫恋 + 龙舌兰 + 但书)
  ['char_254_vodfox', 'char_486_takila', 'char_4032_provs'],
]

const CENTRAL_CORE_TEMPLATE = [
  'char_003_kalts', 'char_1044_hsgma2', 'char_1029_yato2', 'char_2023_ling', 'char_2015_dusk',
]

/**
 * 批量生成 candidate 组合并编码为连续 Float32Array 张量矩阵
 */
export function generateCandidateBatch(
  facility: GlobalFacilityVector,
  opTable: Map<string, OperatorIsolatedFeature>,
  options?: {
    count?: number
    baselineWorkspace?: RosterWorkspace
    anchorRatio?: number // 默认 0.20
    synergyRatio?: number // 默认 0.40
    lockedProductionSlots?: Map<number, string> // slotIdx -> charId
    lockedCentralSlots?: Map<number, string>    // cIdx -> charId
  },
): {
  tensorBuffer: Float32Array
  candidates: SampledCandidate[]
} {
  const count = options?.count ?? 100000
  const anchorRatio = options?.anchorRatio ?? 0.20
  const synergyRatio = options?.synergyRatio ?? 0.40
  const lockedProd = options?.lockedProductionSlots ?? new Map()
  const lockedCentral = options?.lockedCentralSlots ?? new Map()

  const allOps = Array.from(opTable.values())
  const mfgPool = allOps.filter((o) => o.mfgGoldEff > 0 || o.mfgExpEff > 0 || o.synergyTags[0] || o.synergyTags[1] || o.synergyTags[4] || o.synergyTags[6])
  const tradePool = allOps.filter((o) => o.tradeBaseEff > 0 || o.charId.includes('provis') || o.charId.includes('tequila') || o.synergyTags[1] || o.synergyTags[2])
  const powerPool = allOps.filter((o) => o.powerBaseEff > 0 || o.synergyTags[5])
  const centralPool = allOps.filter((o) => o.controlMfgEff > 0 || o.controlTradeEff > 0 || o.factions[3] || o.synergyTags[3] || o.factions[7])

  // 从 baseline 提取种子分配
  const baselineProd = new Array<string | null>(27).fill(null)
  const baselineCentral = new Array<string | null>(5).fill(null)

  if (options?.baselineWorkspace) {
    const facilities = options.baselineWorkspace.mainPlan.facilities
    MOWER_OUTPUT_ROOM_IDS.forEach((roomId, rIdx) => {
      const room = facilities[roomId]
      room?.slots?.forEach((slot, sIdx) => {
        if (sIdx < 3 && slot.occupant.kind === 'operator') {
          baselineProd[rIdx * 3 + sIdx] = slot.occupant.operatorId
        }
      })
    })
    facilities.central?.slots?.forEach((slot, cIdx) => {
      if (cIdx < 5 && slot.occupant.kind === 'operator') {
        baselineCentral[cIdx] = slot.occupant.operatorId
      }
    })
  }

  const tensorBuffer = new Float32Array(count * ENCODING_TENSOR_DIM)
  const candidates: SampledCandidate[] = new Array(count)
  const tempTensor = new Float32Array(ENCODING_TENSOR_DIM)

  for (let i = 0; i < count; i++) {
    const prod: (string | null)[] = new Array(27).fill(null)
    const central: (string | null)[] = new Array(5).fill(null)
    const usedOps = new Set<string>()

    // 1. 应用显式锁定工位
    lockedProd.forEach((id, slot) => {
      prod[slot] = id
      usedOps.add(id)
    })
    lockedCentral.forEach((id, c) => {
      central[c] = id
      usedOps.add(id)
    })

    const rand = Math.random()

    if (rand < anchorRatio && options?.baselineWorkspace) {
      // 模式 A: 基于现有排班 Anchor 邻域微调 (1~2 人突变)
      for (let s = 0; s < 27; s++) {
        const id = baselineProd[s]
        if (id && !usedOps.has(id)) {
          prod[s] = id
          usedOps.add(id)
        }
      }
      for (let c = 0; c < 5; c++) {
        const id = baselineCentral[c]
        if (id && !usedOps.has(id)) {
          central[c] = id
          usedOps.add(id)
        }
      }

      // 随机扰动 1~2 个槽位
      const mutateCount = 1 + Math.floor(Math.random() * 2)
      for (let m = 0; m < mutateCount; m++) {
        const mutateSlot = Math.floor(Math.random() * 27)
        if (!lockedProd.has(mutateSlot)) {
          const roomIdx = Math.floor(mutateSlot / 3)
          const room = facility.rooms[roomIdx]
          if (room && room.slotCount > (mutateSlot % 3)) {
            const oldOp = prod[mutateSlot]
            if (oldOp) usedOps.delete(oldOp)

            let pool = mfgPool
            if (room.type === 'trading') pool = tradePool
            else if (room.type === 'power') pool = powerPool

            const pick = pool[Math.floor(Math.random() * pool.length)]
            if (pick && !usedOps.has(pick.charId)) {
              prod[mutateSlot] = pick.charId
              usedOps.add(pick.charId)
            }
          }
        }
      }
    } else if (rand < anchorRatio + synergyRatio) {
      // 模式 B: 结构化联动组注入
      const chosenTemplate = CORE_SYNERGY_TEMPLATES[Math.floor(Math.random() * CORE_SYNERGY_TEMPLATES.length)]!

      // 寻找可容纳 3 人的同类房间注入
      for (let r = 0; r < 9; r++) {
        const room = facility.rooms[r]
        if (room && room.level === 3 && (room.type === 'manufacture' || room.type === 'trading')) {
          const canFit = [0, 1, 2].every((s) => !lockedProd.has(r * 3 + s))
          if (canFit) {
            for (let s = 0; s < 3; s++) {
              const op = chosenTemplate[s]
              if (op && !usedOps.has(op)) {
                prod[r * 3 + s] = op
                usedOps.add(op)
              }
            }
            break
          }
        }
      }

      // 50% 概率注入中枢核心
      if (Math.random() < 0.5) {
        for (let c = 0; c < 5; c++) {
          const op = CENTRAL_CORE_TEMPLATE[c]
          if (op && !lockedCentral.has(c) && !usedOps.has(op)) {
            central[c] = op
            usedOps.add(op)
          }
        }
      }
    }

    // 填充剩余未分配产出工位
    for (let r = 0; r < 9; r++) {
      const room = facility.rooms[r]
      if (!room || room.type === '') continue

      let pool = mfgPool
      if (room.type === 'trading') pool = tradePool
      else if (room.type === 'power') pool = powerPool

      for (let s = 0; s < room.slotCount; s++) {
        const slotIdx = r * 3 + s
        if (!prod[slotIdx]) {
          for (let retry = 0; retry < 10; retry++) {
            const pick = pool[Math.floor(Math.random() * pool.length)]
            if (pick && !usedOps.has(pick.charId)) {
              prod[slotIdx] = pick.charId
              usedOps.add(pick.charId)
              break
            }
          }
        }
      }
    }

    // 填充中枢剩余工位
    for (let c = 0; c < 5; c++) {
      if (!central[c]) {
        for (let retry = 0; retry < 10; retry++) {
          const pick = centralPool[Math.floor(Math.random() * centralPool.length)]
          if (pick && !usedOps.has(pick.charId)) {
            central[c] = pick.charId
            usedOps.add(pick.charId)
            break
          }
        }
      }
    }

    // 编码到连续张量矩阵中
    encodeScheduleToTensor(prod, central, facility, opTable, tempTensor)
    tensorBuffer.set(tempTensor, i * ENCODING_TENSOR_DIM)

    candidates[i] = {
      prodAssignments: prod,
      centralAssignments: central,
    }
  }

  return { tensorBuffer, candidates }
}

/**
 * 将候选排班还原构建为一个完整合法的 RosterWorkspace
 */
export function candidateToWorkspace(
  candidate: SampledCandidate,
  baseWorkspace: RosterWorkspace,
): RosterWorkspace {
  const ws = structuredClone(baseWorkspace)
  const facilities = ws.mainPlan.facilities

  // 1. 还原 9 个产出设施工位
  MOWER_OUTPUT_ROOM_IDS.forEach((roomId, rIdx) => {
    const room = facilities[roomId]
    if (room && room.slots) {
      room.slots.forEach((slot, sIdx) => {
        const opId = candidate.prodAssignments[rIdx * 3 + sIdx]
        if (opId) {
          slot.occupant = { kind: 'operator', operatorId: opId }
        } else {
          slot.occupant = { kind: 'empty' }
        }
      })
    }
  })

  // 2. 还原控制中枢工位
  if (facilities.central && facilities.central.slots) {
    facilities.central.slots.forEach((slot, cIdx) => {
      const opId = candidate.centralAssignments[cIdx]
      if (opId) {
        slot.occupant = { kind: 'operator', operatorId: opId }
      } else {
        slot.occupant = { kind: 'empty' }
      }
    })
  }

  return ws
}
