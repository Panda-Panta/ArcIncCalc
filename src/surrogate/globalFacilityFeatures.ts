import type { RosterWorkspace, MowerOutputRoomId } from '../workbench/model'
import { MOWER_OUTPUT_ROOM_IDS } from '../workbench/model'

const OUTPUT_POWER_USE = { 1: 10, 2: 30, 3: 60 } as const
const POWER_GENERATION = { 1: 60, 2: 130, 3: 270 } as const
const STANDARD_POWER_USE = { 1: 10, 2: 30, 3: 60 } as const
const DORM_POWER_USE = { 1: 10, 2: 20, 3: 30, 4: 45, 5: 65 } as const

export interface RoomSpec {
  roomId: MowerOutputRoomId
  type: 'trading' | 'manufacture' | 'power' | ''
  typeCode: number      // 0: none, 1: trading, 2: manufacture, 3: power
  level: number         // 1-3
  product: 'gold' | 'exp' | ''
  productCode: number   // 0: none, 1: gold, 2: exp
  slotCount: number     // 1 for power, level for mfg/trading
  isShiftRun: boolean   // 是否跑单模式
}

export interface GlobalFacilityVector {
  meetingLevel: number        // 会客室 1-3
  officeLevel: number         // 办公室 1-3
  trainingLevel: number       // 训练室 1-3
  workshopLevel: number       // 加工站 1-3
  dormLevels: [number, number, number, number] // 宿舍 1-5
  dormLevelSum: number        // 宿舍等级总和 (4-20)
  powerGeneration: number     // 供电总量
  powerConsumption: number    // 耗电总量
  powerMargin: number         // 剩余电量
  tradeCount: number          // 贸易站数量
  mfgCount: number            // 制造站数量
  powerCount: number          // 发电站数量
  goldLineCount: number       // 赤金制造站数量
  expLineCount: number        // 作战记录制造站数量
  rooms: RoomSpec[]           // 9 个产出设施规格
}

/** 从 RosterWorkspace 提取设施配置与电力向量 */
export function extractFacilityFeaturesFromWorkspace(workspace: RosterWorkspace): GlobalFacilityVector {
  const facilities = workspace.mainPlan.facilities

  // 1. 右侧设施等级
  const meetingLevel = Math.max(1, Math.min(3, facilities.meeting?.level ?? 3))
  const officeLevel = Math.max(1, Math.min(3, facilities.contact?.level ?? 3))
  const trainingLevel = Math.max(1, Math.min(3, facilities.train?.level ?? 3))
  const workshopLevel = Math.max(1, Math.min(3, facilities.factory?.level ?? 3))

  // 2. 宿舍等级
  const dormLevels: [number, number, number, number] = [
    Math.max(1, Math.min(5, facilities.dormitory_1?.level ?? 1)),
    Math.max(1, Math.min(5, facilities.dormitory_2?.level ?? 1)),
    Math.max(1, Math.min(5, facilities.dormitory_3?.level ?? 1)),
    Math.max(1, Math.min(5, facilities.dormitory_4?.level ?? 1)),
  ]
  const dormLevelSum = dormLevels.reduce((a, b) => a + b, 0)

  // 3. 9 个产出设施
  let tradeCount = 0
  let mfgCount = 0
  let powerCount = 0
  let goldLineCount = 0
  let expLineCount = 0
  let powerGeneration = 0
  let outputConsumption = 0

  const rooms: RoomSpec[] = MOWER_OUTPUT_ROOM_IDS.map((roomId) => {
    const facility = facilities[roomId]
    const type = (facility?.type ?? '') as 'trading' | 'manufacture' | 'power' | ''
    const level = Math.max(1, Math.min(3, facility?.level ?? 1))
    let product: 'gold' | 'exp' | '' = ''
    if (type === 'manufacture') {
      product = facility.product === 'exp' ? 'exp' : 'gold' // 常规排班限定为 gold 或 exp
    }

    let typeCode = 0
    let productCode = 0
    let slotCount = 0

    if (type === 'trading') {
      typeCode = 1
      tradeCount++
      slotCount = level
      outputConsumption += OUTPUT_POWER_USE[level as 1 | 2 | 3]
    } else if (type === 'manufacture') {
      typeCode = 2
      mfgCount++
      slotCount = level
      productCode = product === 'exp' ? 2 : 1
      if (product === 'exp') expLineCount++
      else goldLineCount++
      outputConsumption += OUTPUT_POWER_USE[level as 1 | 2 | 3]
    } else if (type === 'power') {
      typeCode = 3
      powerCount++
      slotCount = 1 // 发电站固定 1 工位
      powerGeneration += POWER_GENERATION[level as 1 | 2 | 3]
    }

    // 检查是否包含跑单候选 (但书/龙舌兰)
    const hasRunOrderCandidate = facility?.slots?.some((slot) =>
      slot.replacements?.some((r) => r.includes('provis') || r.includes('tequila') || r.includes('但书') || r.includes('龙舌兰')),
    ) ?? false

    return {
      roomId,
      type,
      typeCode,
      level,
      product,
      productCode,
      slotCount,
      isShiftRun: type === 'trading' && hasRunOrderCandidate,
    }
  })

  // 4. 计算总电量
  const functionConsumption =
    STANDARD_POWER_USE[meetingLevel as 1 | 2 | 3] +
    STANDARD_POWER_USE[officeLevel as 1 | 2 | 3] +
    STANDARD_POWER_USE[trainingLevel as 1 | 2 | 3] +
    10 + // 加工站固定耗电 10
    dormLevels.reduce((sum, lvl) => sum + DORM_POWER_USE[lvl as 1 | 2 | 3 | 4 | 5], 0)

  const powerConsumption = outputConsumption + functionConsumption
  const powerMargin = powerGeneration - powerConsumption

  return {
    meetingLevel,
    officeLevel,
    trainingLevel,
    workshopLevel,
    dormLevels,
    dormLevelSum,
    powerGeneration,
    powerConsumption,
    powerMargin,
    tradeCount,
    mfgCount,
    powerCount,
    goldLineCount,
    expLineCount,
    rooms,
  }
}
