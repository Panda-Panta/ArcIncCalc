import type { OperatorIsolatedFeature } from './operatorIsolatedFeatures'
import type { GlobalFacilityVector } from './globalFacilityFeatures'

export const ENCODING_TENSOR_DIM = 480

/**
 * 将干员分配矩阵编码为 480D Float32Array
 *
 * @param productionAssignments 27个产出槽位的干员 charId (9房间 × 3槽位，空槽位为 null 或 '')
 * @param centralAssignments 5个中枢槽位的干员 charId
 * @param facility 设施全局特征
 * @param operatorTable 干员特征表
 * @param outTarget 可选复用的 Float32Array 目标缓冲区
 */
export function encodeScheduleToTensor(
  productionAssignments: (string | null)[],
  centralAssignments: (string | null)[],
  facility: GlobalFacilityVector,
  operatorTable: Map<string, OperatorIsolatedFeature>,
  outTarget?: Float32Array,
): Float32Array {
  const tensor = outTarget ?? new Float32Array(ENCODING_TENSOR_DIM)
  tensor.fill(0)

  let offset = 0

  // 1. 产出设施槽位: 27 槽位 × 14 维 = 378 维
  let totalBaseMfg = 0
  let totalBaseTrade = 0
  let totalBasePower = 0
  let sameRoomPairs = 0
  let durinCount = 0
  let rosmontisInMfg = false
  let ebenholzInTrade = false
  let whisperainInOffice = facility.officeLevel >= 3 // 假设高阶办公室生效
  let automationInMfg = false
  let totterInRoom = false

  for (let roomIdx = 0; roomIdx < 9; roomIdx++) {
    const room = facility.rooms[roomIdx]
    if (!room) continue
    const roomSlotBase = roomIdx * 3
    const roomOpIds: string[] = []

    for (let slotInRoom = 0; slotInRoom < 3; slotInRoom++) {
      const slotIdx = roomSlotBase + slotInRoom
      const opId = productionAssignments[slotIdx]
      const isActiveSlot = slotInRoom < room.slotCount
      const op = opId ? operatorTable.get(opId) : undefined

      const slotOffset = offset + slotIdx * 14

      if (isActiveSlot) {
        tensor[slotOffset + 0] = 1.0 // isSlotActive
      }

      if (op && isActiveSlot) {
        roomOpIds.push(op.charId)
        const isExp = room.type === 'manufacture' && room.product === 'exp'
        const mfgEff = isExp ? op.mfgExpEff : op.mfgGoldEff

        tensor[slotOffset + 1] = mfgEff
        tensor[slotOffset + 2] = op.tradeBaseEff
        tensor[slotOffset + 3] = op.powerBaseEff
        tensor[slotOffset + 4] = op.moraleRate / 2.0
        tensor[slotOffset + 5] = op.dutyCycleRatio

        // 6 维关键派系: abyssal, rhine, blacksteel, lgd, pinus, sui
        tensor[slotOffset + 6] = op.factions[0] ?? 0 // abyssal
        tensor[slotOffset + 7] = op.factions[1] ?? 0 // rhine
        tensor[slotOffset + 8] = op.factions[2] ?? 0 // blacksteel
        tensor[slotOffset + 9] = op.factions[3] ?? 0 // lgd
        tensor[slotOffset + 10] = op.factions[4] ?? 0 // pinus
        tensor[slotOffset + 11] = op.factions[7] ?? 0 // sui

        // 2 维关键协同: warehouse, perception
        tensor[slotOffset + 12] = op.synergyTags[0] ?? 0 // warehouse
        tensor[slotOffset + 13] = op.synergyTags[1] ?? 0 // perception

        // 累计宏观统计
        if (room.type === 'manufacture') totalBaseMfg += mfgEff
        if (room.type === 'trading') totalBaseTrade += op.tradeBaseEff
        if (room.type === 'power') totalBasePower += op.powerBaseEff
        if (op.synergyTags[2]) durinCount++ // durin
        if (op.charId === 'char_391_rosmon') rosmontisInMfg = true
        if (op.charId === 'char_4046_ebnhlz') ebenholzInTrade = true
        if (op.synergyTags[6]) automationInMfg = true // automation
        if (op.charId === 'char_4062_totter') totterInRoom = true
      }
    }

    // 统计房间内同派系/同羁绊配对
    if (roomOpIds.length >= 2) {
      for (let i = 0; i < roomOpIds.length; i++) {
        for (let j = i + 1; j < roomOpIds.length; j++) {
          const opA = operatorTable.get(roomOpIds[i]!)
          const opB = operatorTable.get(roomOpIds[j]!)
          if (opA && opB) {
            const hasCommonFaction = opA.factions.some((f, idx) => f === 1 && opB.factions[idx] === 1)
            if (hasCommonFaction) sameRoomPairs++
          }
        }
      }
    }
  }

  offset += 378 // 27 * 14

  // 2. 控制中枢槽位: 5 槽位 × 8 维 = 40 维
  let centralMfgMax = 0
  let centralTradeMax = 0

  for (let cIdx = 0; cIdx < 5; cIdx++) {
    const opId = centralAssignments[cIdx]
    const op = opId ? operatorTable.get(opId) : undefined
    const cOffset = offset + cIdx * 8

    tensor[cOffset + 0] = 1.0 // isSlotActive (中枢固定 5 工位)

    if (op) {
      tensor[cOffset + 1] = op.controlMfgEff
      tensor[cOffset + 2] = op.controlTradeEff
      tensor[cOffset + 3] = op.factions[3] ?? 0 // lgd
      tensor[cOffset + 4] = op.synergyTags[3] ?? 0 // monsterHunter
      tensor[cOffset + 5] = op.factions[7] ?? 0 // sui
      tensor[cOffset + 6] = op.moraleRate / 2.0
      tensor[cOffset + 7] = 1.0 // isAssigned

      centralMfgMax = Math.max(centralMfgMax, op.controlMfgEff)
      centralTradeMax = Math.max(centralTradeMax, op.controlTradeEff)
    }
  }

  offset += 40

  // 3. 显式非线性项: 30 维
  tensor[offset + 0] = centralMfgMax
  tensor[offset + 1] = centralTradeMax
  tensor[offset + 2] = totalBaseMfg / 10.0
  tensor[offset + 3] = totalBaseTrade / 5.0
  tensor[offset + 4] = totalBasePower / 3.0
  tensor[offset + 5] = sameRoomPairs / 5.0
  tensor[offset + 6] = durinCount / 4.0
  tensor[offset + 7] = rosmontisInMfg ? 1.0 : 0.0
  tensor[offset + 8] = ebenholzInTrade ? 1.0 : 0.0
  tensor[offset + 9] = rosmontisInMfg && ebenholzInTrade ? 1.0 : 0.0
  tensor[offset + 10] = whisperainInOffice && (rosmontisInMfg || ebenholzInTrade) ? 1.0 : 0.0
  tensor[offset + 11] = automationInMfg ? 1.0 : 0.0
  tensor[offset + 12] = totterInRoom ? 1.0 : 0.0
  // [offset + 13..29] 保留为 0，用于未来扩展

  offset += 30

  // 4. 全局设施与电力环境向量: 32 维
  tensor[offset + 0] = facility.meetingLevel / 3.0
  tensor[offset + 1] = facility.officeLevel / 3.0
  tensor[offset + 2] = facility.trainingLevel / 3.0
  tensor[offset + 3] = facility.workshopLevel / 3.0
  tensor[offset + 4] = facility.dormLevels[0] / 5.0
  tensor[offset + 5] = facility.dormLevels[1] / 5.0
  tensor[offset + 6] = facility.dormLevels[2] / 5.0
  tensor[offset + 7] = facility.dormLevels[3] / 5.0
  tensor[offset + 8] = facility.dormLevelSum / 20.0
  tensor[offset + 9] = facility.powerGeneration / 810.0
  tensor[offset + 10] = facility.powerConsumption / 810.0
  tensor[offset + 11] = Math.max(-1.0, Math.min(1.0, facility.powerMargin / 500.0))
  tensor[offset + 12] = facility.tradeCount / 4.0
  tensor[offset + 13] = facility.mfgCount / 5.0
  tensor[offset + 14] = facility.powerCount / 3.0
  tensor[offset + 15] = facility.goldLineCount / 5.0
  tensor[offset + 16] = facility.expLineCount / 5.0

  // 9 房间属性
  for (let r = 0; r < 9; r++) {
    const room = facility.rooms[r]
    tensor[offset + 17 + r] = room ? room.typeCode / 3.0 : 0
  }
  // 6 房间等级样本 (其余作为辅助)
  for (let r = 0; r < 6; r++) {
    const room = facility.rooms[r]
    tensor[offset + 26 + r] = room ? room.level / 3.0 : 0
  }

  return tensor
}
