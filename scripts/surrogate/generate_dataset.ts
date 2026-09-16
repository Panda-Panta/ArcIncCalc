import * as fs from 'fs'
import * as path from 'path'
import { OPERATORS } from '../../src/domain/operators'
import { buildIsolatedFeatureTable } from '../../src/surrogate/operatorIsolatedFeatures'
import { encodeScheduleToTensor, ENCODING_TENSOR_DIM } from '../../src/surrogate/scheduleEncoding'
import type { GlobalFacilityVector, RoomSpec } from '../../src/surrogate/globalFacilityFeatures'

// 1. 基础布局预设模板
const LAYOUT_TEMPLATES: GlobalFacilityVector[] = [
  // 252 经典四赤金 (右满: 会客3, 办公3, 训练3, 加工3, 宿舍1111)
  // 540供电: 贸3,1 (耗90) + 制3,3,2,2,3 (耗220) = 310 + 右侧190 + 宿舍40 = 540
  {
    meetingLevel: 3,
    officeLevel: 3,
    trainingLevel: 3,
    workshopLevel: 3,
    dormLevels: [1, 1, 1, 1],
    dormLevelSum: 4,
    powerGeneration: 540,
    powerConsumption: 540,
    powerMargin: 0,
    tradeCount: 2,
    mfgCount: 5,
    powerCount: 2,
    goldLineCount: 4,
    expLineCount: 1,
    rooms: [
      { roomId: 'room_1_1', type: 'manufacture', typeCode: 2, level: 3, product: 'gold', productCode: 1, slotCount: 3, isShiftRun: false },
      { roomId: 'room_1_2', type: 'manufacture', typeCode: 2, level: 3, product: 'gold', productCode: 1, slotCount: 3, isShiftRun: false },
      { roomId: 'room_1_3', type: 'power', typeCode: 3, level: 3, product: '', productCode: 0, slotCount: 1, isShiftRun: false },
      { roomId: 'room_2_1', type: 'manufacture', typeCode: 2, level: 2, product: 'gold', productCode: 1, slotCount: 2, isShiftRun: false },
      { roomId: 'room_2_2', type: 'manufacture', typeCode: 2, level: 2, product: 'gold', productCode: 1, slotCount: 2, isShiftRun: false },
      { roomId: 'room_2_3', type: 'power', typeCode: 3, level: 3, product: '', productCode: 0, slotCount: 1, isShiftRun: false },
      { roomId: 'room_3_1', type: 'trading', typeCode: 1, level: 3, product: 'gold', productCode: 1, slotCount: 3, isShiftRun: true },
      { roomId: 'room_3_2', type: 'trading', typeCode: 1, level: 1, product: 'gold', productCode: 1, slotCount: 1, isShiftRun: false },
      { roomId: 'room_3_3', type: 'manufacture', typeCode: 2, level: 3, product: 'exp', productCode: 2, slotCount: 3, isShiftRun: false },
    ],
  },
  // 252 经典三赤金 (右满: 贸2,1 + 制3,3,2,3,3)
  {
    meetingLevel: 3,
    officeLevel: 3,
    trainingLevel: 3,
    workshopLevel: 3,
    dormLevels: [1, 1, 1, 1],
    dormLevelSum: 4,
    powerGeneration: 540,
    powerConsumption: 540,
    powerMargin: 0,
    tradeCount: 2,
    mfgCount: 5,
    powerCount: 2,
    goldLineCount: 3,
    expLineCount: 2,
    rooms: [
      { roomId: 'room_1_1', type: 'manufacture', typeCode: 2, level: 3, product: 'gold', productCode: 1, slotCount: 3, isShiftRun: false },
      { roomId: 'room_1_2', type: 'manufacture', typeCode: 2, level: 3, product: 'gold', productCode: 1, slotCount: 3, isShiftRun: false },
      { roomId: 'room_1_3', type: 'power', typeCode: 3, level: 3, product: '', productCode: 0, slotCount: 1, isShiftRun: false },
      { roomId: 'room_2_1', type: 'manufacture', typeCode: 2, level: 2, product: 'gold', productCode: 1, slotCount: 2, isShiftRun: false },
      { roomId: 'room_2_2', type: 'manufacture', typeCode: 2, level: 3, product: 'exp', productCode: 2, slotCount: 3, isShiftRun: false },
      { roomId: 'room_2_3', type: 'power', typeCode: 3, level: 3, product: '', productCode: 0, slotCount: 1, isShiftRun: false },
      { roomId: 'room_3_1', type: 'trading', typeCode: 1, level: 2, product: 'gold', productCode: 1, slotCount: 2, isShiftRun: true },
      { roomId: 'room_3_2', type: 'trading', typeCode: 1, level: 1, product: 'gold', productCode: 1, slotCount: 1, isShiftRun: false },
      { roomId: 'room_3_3', type: 'manufacture', typeCode: 2, level: 3, product: 'exp', productCode: 2, slotCount: 3, isShiftRun: false },
    ],
  },
  // 243 经典全满均衡 (810供电: 贸3,3 + 制3,3,3,3 + 电3,3,3 + 宿舍5,5,5,5)
  {
    meetingLevel: 3,
    officeLevel: 3,
    trainingLevel: 3,
    workshopLevel: 3,
    dormLevels: [5, 5, 5, 5],
    dormLevelSum: 20,
    powerGeneration: 810,
    powerConsumption: 810,
    powerMargin: 0,
    tradeCount: 2,
    mfgCount: 4,
    powerCount: 3,
    goldLineCount: 2,
    expLineCount: 2,
    rooms: [
      { roomId: 'room_1_1', type: 'manufacture', typeCode: 2, level: 3, product: 'gold', productCode: 1, slotCount: 3, isShiftRun: false },
      { roomId: 'room_1_2', type: 'manufacture', typeCode: 2, level: 3, product: 'gold', productCode: 1, slotCount: 3, isShiftRun: false },
      { roomId: 'room_1_3', type: 'power', typeCode: 3, level: 3, product: '', productCode: 0, slotCount: 1, isShiftRun: false },
      { roomId: 'room_2_1', type: 'manufacture', typeCode: 2, level: 3, product: 'exp', productCode: 2, slotCount: 3, isShiftRun: false },
      { roomId: 'room_2_2', type: 'manufacture', typeCode: 2, level: 3, product: 'exp', productCode: 2, slotCount: 3, isShiftRun: false },
      { roomId: 'room_2_3', type: 'power', typeCode: 3, level: 3, product: '', productCode: 0, slotCount: 1, isShiftRun: false },
      { roomId: 'room_3_1', type: 'trading', typeCode: 1, level: 3, product: 'gold', productCode: 1, slotCount: 3, isShiftRun: true },
      { roomId: 'room_3_2', type: 'trading', typeCode: 1, level: 3, product: 'gold', productCode: 1, slotCount: 3, isShiftRun: true },
      { roomId: 'room_3_3', type: 'power', typeCode: 3, level: 3, product: '', productCode: 0, slotCount: 1, isShiftRun: false },
    ],
  },
  // 342 纯钱流 (540供电: 贸3,2,1 + 制3,3,2,3)
  {
    meetingLevel: 3,
    officeLevel: 3,
    trainingLevel: 3,
    workshopLevel: 3,
    dormLevels: [1, 1, 1, 1],
    dormLevelSum: 4,
    powerGeneration: 540,
    powerConsumption: 540,
    powerMargin: 0,
    tradeCount: 3,
    mfgCount: 4,
    powerCount: 2,
    goldLineCount: 4,
    expLineCount: 0,
    rooms: [
      { roomId: 'room_1_1', type: 'manufacture', typeCode: 2, level: 3, product: 'gold', productCode: 1, slotCount: 3, isShiftRun: false },
      { roomId: 'room_1_2', type: 'manufacture', typeCode: 2, level: 3, product: 'gold', productCode: 1, slotCount: 3, isShiftRun: false },
      { roomId: 'room_1_3', type: 'power', typeCode: 3, level: 3, product: '', productCode: 0, slotCount: 1, isShiftRun: false },
      { roomId: 'room_2_1', type: 'manufacture', typeCode: 2, level: 2, product: 'gold', productCode: 1, slotCount: 2, isShiftRun: false },
      { roomId: 'room_2_2', type: 'manufacture', typeCode: 2, level: 3, product: 'gold', productCode: 1, slotCount: 3, isShiftRun: false },
      { roomId: 'room_2_3', type: 'power', typeCode: 3, level: 3, product: '', productCode: 0, slotCount: 1, isShiftRun: false },
      { roomId: 'room_3_1', type: 'trading', typeCode: 1, level: 3, product: 'gold', productCode: 1, slotCount: 3, isShiftRun: true },
      { roomId: 'room_3_2', type: 'trading', typeCode: 1, level: 2, product: 'gold', productCode: 1, slotCount: 2, isShiftRun: true },
      { roomId: 'room_3_3', type: 'trading', typeCode: 1, level: 1, product: 'gold', productCode: 1, slotCount: 1, isShiftRun: false },
    ],
  },
  // 153 纯作战记录流 (810供电: 贸3 + 制3,3,3,3,3 + 宿舍5,5,5,5)
  {
    meetingLevel: 3,
    officeLevel: 3,
    trainingLevel: 3,
    workshopLevel: 3,
    dormLevels: [5, 5, 5, 5],
    dormLevelSum: 20,
    powerGeneration: 810,
    powerConsumption: 810,
    powerMargin: 0,
    tradeCount: 1,
    mfgCount: 5,
    powerCount: 3,
    goldLineCount: 1,
    expLineCount: 4,
    rooms: [
      { roomId: 'room_1_1', type: 'manufacture', typeCode: 2, level: 3, product: 'gold', productCode: 1, slotCount: 3, isShiftRun: false },
      { roomId: 'room_1_2', type: 'manufacture', typeCode: 2, level: 3, product: 'exp', productCode: 2, slotCount: 3, isShiftRun: false },
      { roomId: 'room_1_3', type: 'power', typeCode: 3, level: 3, product: '', productCode: 0, slotCount: 1, isShiftRun: false },
      { roomId: 'room_2_1', type: 'manufacture', typeCode: 2, level: 3, product: 'exp', productCode: 2, slotCount: 3, isShiftRun: false },
      { roomId: 'room_2_2', type: 'manufacture', typeCode: 2, level: 3, product: 'exp', productCode: 2, slotCount: 3, isShiftRun: false },
      { roomId: 'room_2_3', type: 'power', typeCode: 3, level: 3, product: '', productCode: 0, slotCount: 1, isShiftRun: false },
      { roomId: 'room_3_1', type: 'trading', typeCode: 1, level: 3, product: 'gold', productCode: 1, slotCount: 3, isShiftRun: true },
      { roomId: 'room_3_2', type: 'manufacture', typeCode: 2, level: 3, product: 'exp', productCode: 2, slotCount: 3, isShiftRun: false },
      { roomId: 'room_3_3', type: 'power', typeCode: 3, level: 3, product: '', productCode: 0, slotCount: 1, isShiftRun: false },
    ],
  },
]

// 2. 核心联动组专家模板 (使用确切 charId)
const SYNERGY_GROUPS = {
  // 仓储流 (红云 + 火神 + 泡泡)
  storage: ['char_190_clour', 'char_163_hpsts', 'char_381_bubble'],
  // 深海猎人 (歌蕾蒂娅 + 幽灵鲨 + 安哲拉)
  abyssal: ['char_474_glady', 'char_143_ghost', 'char_218_cuttle'],
  // 莱茵科技 (多萝西 + 赫默 + 梅尔)
  rhine: ['char_4048_doroth', 'char_108_silent', 'char_242_otter'],
  // S.E.E.S. (结城理 + 埃癸斯 + 岳羽由加莉)
  sees: ['char_4217_makoto', 'char_4218_aigis', 'char_4219_yukari'],
  // 杜林金线 (鸿雪 + 绮良 + 图耶)
  durinLine: ['char_4055_bgsnow', 'char_478_kirara', 'char_402_tuye'],
  // 跑单巫恋组 (巫恋 + 龙舌兰 + 但书)
  shamare: ['char_254_vodfox', 'char_486_takila', 'char_4032_provs'],
  // 中枢五人核心
  centralCore: ['char_003_kalts', 'char_1044_hsgma2', 'char_1029_yato2', 'char_2023_ling', 'char_2015_dusk'],
}

// 3. 高精度真值打分函数 (Ground-Truth Score)
function computeScheduleGroundTruthScore(
  prodAssignments: (string | null)[],
  centralAssignments: (string | null)[],
  facility: GlobalFacilityVector,
  opTable: ReturnType<typeof buildIsolatedFeatureTable>,
): number {
  let dailyExp = 0
  let dailyGoldValue = 0
  let dailyTradeLmd = 0

  // 1. 中枢全局加成
  let centralMfgBonus = 0
  let centralTradeBonus = 0
  for (const cId of centralAssignments) {
    if (!cId) continue
    const op = opTable.get(cId)
    if (op) {
      centralMfgBonus = Math.max(centralMfgBonus, op.controlMfgEff)
      centralTradeBonus = Math.max(centralTradeBonus, op.controlTradeEff)
    }
  }

  // 2. 检查全局联动共振
  const allProdOps = prodAssignments
    .filter((id): id is string => Boolean(id) && opTable.has(id))
    .map((id) => opTable.get(id)!)
  const rosmontisInMfg = allProdOps.some((op) => op.charId === 'char_391_rosmon')
  const ebenholzInTrade = allProdOps.some((op) => op.charId === 'char_4046_ebnhlz')
  const durinCount = allProdOps.filter((op) => op.synergyTags[2] === 1).length // durin tag

  // 3. 逐房间产出计算
  for (let r = 0; r < 9; r++) {
    const room = facility.rooms[r]
    if (!room || room.type === 'power' || room.type === '') continue

    const slotBase = r * 3
    const roomOps: typeof allProdOps = []
    for (let s = 0; s < room.slotCount; s++) {
      const opId = prodAssignments[slotBase + s]
      if (opId) {
        const op = opTable.get(opId)
        if (op) roomOps.push(op)
      }
    }

    if (roomOps.length === 0) continue

    // 平均工休比加权
    const avgDutyCycle = roomOps.reduce((sum, o) => sum + o.dutyCycleRatio, 0) / roomOps.length
    // 工位进驻基础: 每人 +1%
    const staffBonus = roomOps.length * 0.01

    if (room.type === 'manufacture') {
      const isExp = room.product === 'exp'
      let skillEff = roomOps.reduce((sum, o) => sum + (isExp ? o.mfgExpEff : o.mfgGoldEff), 0)

      // 联动加成 A: 仓储流 (红云 + 火神 + 泡泡)
      const opIds = roomOps.map((o) => o.charId)
      if (opIds.includes('char_190_clour') && (opIds.includes('char_130_vulcan') || opIds.includes('char_163_hpai'))) {
        skillEff += 0.65 // 仓储联动爆发
      }
      // 联动加成 B: 迷迭香感知信息流
      if (opIds.includes('char_391_rosmon') && facility.officeLevel >= 3) {
        skillEff += 0.45 // 絮雨记忆碎片转思维链环
      }
      // 联动加成 C: 深海猎人制造
      if (opIds.includes('char_411_gladi') && opIds.some((id) => id === 'char_143_ghost' || id === 'char_219_meteo')) {
        skillEff += 0.50
      }
      // 联动加成 D: 维伊训练室等级
      if (opIds.includes('char_4130_weiyi')) {
        skillEff += Math.min(0.30, facility.trainingLevel * 0.10)
      }

      // 总有效效率
      const totalEff = 1.0 + staffBonus + skillEff + centralMfgBonus

      if (isExp) {
        // 中级作战记录: 180 min, 1000 EXP
        const dailyRecordCount = (1440 / 180) * totalEff * avgDutyCycle
        dailyExp += dailyRecordCount * 1000
      } else {
        // 赤金: 72 min, 500 价值
        const dailyGoldCount = (1440 / 72) * totalEff * avgDutyCycle
        dailyGoldValue += dailyGoldCount * 500
      }
    } else if (room.type === 'trading') {
      let skillEff = roomOps.reduce((sum, o) => sum + o.tradeBaseEff, 0)

      // 联动加成 A: 空弦宿舍加成
      const opIds = roomOps.map((o) => o.charId)
      if (opIds.includes('char_340_shining')) { // 空弦
        skillEff += facility.dormLevelSum * 0.02
      }
      // 联动加成 B: 黑键无声共鸣
      if (opIds.includes('char_4046_ebnhlz') && rosmontisInMfg) {
        skillEff += 0.35
      }
      // 联动加成 C: 杜林金线 (鸿雪 + 图耶 + 杜林干员)
      if (opIds.includes('char_4055_bgsnow')) {
        skillEff += (facility.goldLineCount + durinCount) * 0.05
      }

      const totalEff = 1.0 + staffBonus + skillEff + centralTradeBonus

      if (room.isShiftRun) {
        // 跑单期望: 4.5金 / 2350龙门币 / 203.4 min
        const ordersPerDay = (1440 / 203.4) * totalEff * avgDutyCycle
        dailyTradeLmd += ordersPerDay * 2350
      } else {
        // 常规普通订单: 期望 ~1500 龙门币 / 203.4 min
        const ordersPerDay = (1440 / 203.4) * totalEff * avgDutyCycle
        dailyTradeLmd += ordersPerDay * 1500
      }
    }
  }

  // 82 分常规收益公式: EXP + 0.8 * GoldValue + 0.2 * OrderLMD
  return dailyExp + 0.8 * dailyGoldValue + 0.2 * dailyTradeLmd
}

// 4. 离线数据生成主逻辑
export function generateDataset(sampleCount: number, outDir: string) {
  const opTable = buildIsolatedFeatureTable()
  const allOps = Array.from(opTable.values())

  // 分设施干员池
  const mfgPool = allOps.filter((o) => o.mfgGoldEff > 0 || o.mfgExpEff > 0 || o.synergyTags[0] || o.synergyTags[1] || o.synergyTags[4] || o.synergyTags[6])
  const tradePool = allOps.filter((o) => o.tradeBaseEff > 0 || o.charId.includes('provis') || o.charId.includes('tequila') || o.synergyTags[1] || o.synergyTags[2])
  const powerPool = allOps.filter((o) => o.powerBaseEff > 0 || o.synergyTags[5])
  const centralPool = allOps.filter((o) => o.controlMfgEff > 0 || o.controlTradeEff > 0 || o.factions[3] || o.synergyTags[3] || o.factions[7])

  console.log(`[DatasetGenerator] 准备生成 ${sampleCount} 条数据...`)
  console.log(`[Pools] 制造干员: ${mfgPool.length}, 贸易干员: ${tradePool.length}, 发电干员: ${powerPool.length}, 中枢干员: ${centralPool.length}`)

  const featuresFlat = new Float32Array(sampleCount * ENCODING_TENSOR_DIM)
  const labelsFlat = new Float32Array(sampleCount)

  const tempTensor = new Float32Array(ENCODING_TENSOR_DIM)

  for (let i = 0; i < sampleCount; i++) {
    // 轮换挑选布局模板
    const facility = LAYOUT_TEMPLATES[i % LAYOUT_TEMPLATES.length]!

    const prodAssignments = new Array<string | null>(27).fill(null)
    const centralAssignments = new Array<string | null>(5).fill(null)
    const usedOps = new Set<string>()

    const rand = Math.random()

    if (rand < 0.25) {
      // 梯队 A: 专家先验扰动 (25%)
      // 注入仓储/杜林/跑单/深海中的 2 个组
      const groups = [SYNERGY_GROUPS.storage, SYNERGY_GROUPS.abyssal, SYNERGY_GROUPS.rhine, SYNERGY_GROUPS.durinLine, SYNERGY_GROUPS.shamare]
      const chosen = groups[Math.floor(Math.random() * groups.length)]!

      // 找一个等级匹配的制造或贸易站填入
      for (let r = 0; r < 9; r++) {
        const room = facility.rooms[r]
        if (room.level === 3 && (room.type === 'manufacture' || room.type === 'trading')) {
          for (let s = 0; s < 3; s++) {
            const op = chosen[s]
            if (op && !usedOps.has(op)) {
              prodAssignments[r * 3 + s] = op
              usedOps.add(op)
            }
          }
          break
        }
      }
    } else if (rand < 0.60) {
      // 梯队 B: 局部模块重组 (35%)
      // 随机注入 S.E.E.S. 或中枢核心
      if (Math.random() < 0.5) {
        const cCore = SYNERGY_GROUPS.centralCore
        for (let c = 0; c < 5; c++) {
          if (cCore[c]) {
            centralAssignments[c] = cCore[c]
            usedOps.add(cCore[c])
          }
        }
      }
    }

    // 填充剩余槽位
    for (let r = 0; r < 9; r++) {
      const room = facility.rooms[r]
      if (!room || room.type === '') continue

      let pool = mfgPool
      if (room.type === 'trading') pool = tradePool
      else if (room.type === 'power') pool = powerPool

      for (let s = 0; s < room.slotCount; s++) {
        const slotIdx = r * 3 + s
        if (!prodAssignments[slotIdx]) {
          // 10% 概率故意留空 (梯队 D: 下界样本)
          if (rand > 0.90 && Math.random() < 0.2) continue

          let candidate: OperatorIsolatedFeature | undefined
          for (let retry = 0; retry < 10; retry++) {
            const pick = pool[Math.floor(Math.random() * pool.length)]
            if (pick && !usedOps.has(pick.charId)) {
              candidate = pick
              break
            }
          }
          if (candidate) {
            prodAssignments[slotIdx] = candidate.charId
            usedOps.add(candidate.charId)
          }
        }
      }
    }

    // 填充中枢
    for (let c = 0; c < 5; c++) {
      if (!centralAssignments[c]) {
        for (let retry = 0; retry < 10; retry++) {
          const pick = centralPool[Math.floor(Math.random() * centralPool.length)]
          if (pick && !usedOps.has(pick.charId)) {
            centralAssignments[c] = pick.charId
            usedOps.add(pick.charId)
            break
          }
        }
      }
    }

    // 编码为张量
    encodeScheduleToTensor(prodAssignments, centralAssignments, facility, opTable, tempTensor)
    featuresFlat.set(tempTensor, i * ENCODING_TENSOR_DIM)

    // 计算真值打分
    const score = computeScheduleGroundTruthScore(prodAssignments, centralAssignments, facility, opTable)
    labelsFlat[i] = score
  }

  // 写入二进制文件
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  const featPath = path.join(outDir, 'features.bin')
  const labelPath = path.join(outDir, 'labels.bin')

  fs.writeFileSync(featPath, Buffer.from(featuresFlat.buffer))
  fs.writeFileSync(labelPath, Buffer.from(labelsFlat.buffer))

  console.log(`[DatasetGenerator] 成功生成数据:`)
  console.log(`  -> 特征文件: ${featPath} (${(featuresFlat.byteLength / 1024 / 1024).toFixed(2)} MB)`)
  console.log(`  -> 标签文件: ${labelPath} (${(labelsFlat.byteLength / 1024 / 1024).toFixed(2)} MB)`)
}

// CLI 执行入口
if (process.argv[1] && process.argv[1].endsWith('generate_dataset.ts')) {
  let count = 120000
  if (process.argv[2]) {
    const parsed = parseInt(process.argv[2], 10)
    if (!isNaN(parsed) && parsed > 0) {
      count = parsed
    }
  }
  const outDir = path.resolve('training_data')
  console.log(`[DatasetGenerator] 启动数据集生成，目标样本量: ${count.toLocaleString()}...`)
  const t0 = Date.now()
  generateDataset(count, outDir)
  console.log(`[DatasetGenerator] 全部完成! 总耗时: ${((Date.now() - t0) / 1000).toFixed(2)} 秒`)
}
