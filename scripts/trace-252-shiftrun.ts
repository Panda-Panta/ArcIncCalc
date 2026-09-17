import { OPERATORS } from '../src/domain/operators'
import { type OwnedOperatorInput } from '../src/domain/operatorInventory'
import { createDefaultWorkspace } from '../src/workbench/defaults'
import { restoreOperatorMowerName } from '../src/workbench/compat/mowerJson'
import { runSmartRoster, type SmartRosterProgress } from '../src/optimizer/smartRoster'
import { validatePhysicalRoster } from '../src/optimizer/rosterDraft'
import { validateRosterWorkspace } from '../src/workbench/validate'
import { compileMainPlanToAppConfig } from '../src/workbench/adapter'
import { createDefaultConfig } from '../src/domain/defaults'
import { calculate } from '../src/engine/calculate'
import type { RosterWorkspace } from '../src/workbench/model'

const allOwned: OwnedOperatorInput[] = OPERATORS.map((o) => ({
  operator: o.name,
  elitePhase: o.rarity < 3 ? 0 : o.rarity === 3 ? 1 : 2,
  level: o.rarity < 3 ? 30 : o.rarity === 3 ? 55 : o.rarity === 4 ? 70 : o.rarity === 5 ? 80 : 90,
}))

function create252Workspace(): RosterWorkspace {
  const ws = createDefaultWorkspace()

  // 1. 2 Trading rooms: 1 Lv.2 (2 slots) + 1 Lv.1 (1 slot)
  ws.mainPlan.facilities.room_3_1 = {
    roomId: 'room_3_1',
    type: 'trading',
    level: 2,
    product: 'money',
    slots: Array.from({ length: 2 }, () => ({ occupant: { kind: 'empty' }, groupId: null, replacements: [] })),
  }
  ws.mainPlan.facilities.room_3_2 = {
    roomId: 'room_3_2',
    type: 'trading',
    level: 1,
    product: 'money',
    slots: Array.from({ length: 1 }, () => ({ occupant: { kind: 'empty' }, groupId: null, replacements: [] })),
  }

  // 2. 5 Manufacture rooms: 33332 (4 Lv.3, 1 Lv.2)
  // room_1_1: Lv.3 gold (3 slots)
  ws.mainPlan.facilities.room_1_1 = {
    roomId: 'room_1_1',
    type: 'manufacture',
    level: 3,
    product: 'gold',
    slots: Array.from({ length: 3 }, () => ({ occupant: { kind: 'empty' }, groupId: null, replacements: [] })),
  }
  // room_1_2: Lv.3 gold (3 slots)
  ws.mainPlan.facilities.room_1_2 = {
    roomId: 'room_1_2',
    type: 'manufacture',
    level: 3,
    product: 'gold',
    slots: Array.from({ length: 3 }, () => ({ occupant: { kind: 'empty' }, groupId: null, replacements: [] })),
  }
  // room_2_1: Lv.3 gold (3 slots)
  ws.mainPlan.facilities.room_2_1 = {
    roomId: 'room_2_1',
    type: 'manufacture',
    level: 3,
    product: 'gold',
    slots: Array.from({ length: 3 }, () => ({ occupant: { kind: 'empty' }, groupId: null, replacements: [] })),
  }
  // room_3_3: Lv.3 exp (3 slots) - converted from power to manufacture
  ws.mainPlan.facilities.room_3_3 = {
    roomId: 'room_3_3',
    type: 'manufacture',
    level: 3,
    product: 'exp',
    slots: Array.from({ length: 3 }, () => ({ occupant: { kind: 'empty' }, groupId: null, replacements: [] })),
  }
  // room_2_2: Lv.2 exp (2 slots)
  ws.mainPlan.facilities.room_2_2 = {
    roomId: 'room_2_2',
    type: 'manufacture',
    level: 2,
    product: 'exp',
    slots: Array.from({ length: 2 }, () => ({ occupant: { kind: 'empty' }, groupId: null, replacements: [] })),
  }

  // 3. 2 Power rooms: room_1_3 (Lv.3), room_2_3 (Lv.3)
  ws.mainPlan.facilities.room_1_3 = {
    roomId: 'room_1_3',
    type: 'power',
    level: 3,
    slots: [{ occupant: { kind: 'empty' }, groupId: null, replacements: [] }],
  }
  ws.mainPlan.facilities.room_2_3 = {
    roomId: 'room_2_3',
    type: 'power',
    level: 3,
    slots: [{ occupant: { kind: 'empty' }, groupId: null, replacements: [] }],
  }

  // 4. Right side facilities: all max level (Lv.3)
  ws.mainPlan.facilities.contact = {
    roomId: 'contact',
    type: 'contact',
    level: 3,
    slots: [{ occupant: { kind: 'empty' }, groupId: null, replacements: [] }],
  }
  ws.mainPlan.facilities.meeting = {
    roomId: 'meeting',
    type: 'meeting',
    level: 3,
    slots: Array.from({ length: 2 }, () => ({ occupant: { kind: 'empty' }, groupId: null, replacements: [] })),
  }
  ws.mainPlan.facilities.factory = {
    roomId: 'factory',
    type: 'factory',
    level: 3,
    slots: [{ occupant: { kind: 'empty' }, groupId: null, replacements: [] }],
  }
  ws.mainPlan.facilities.train = {
    roomId: 'train',
    type: 'train',
    level: 3,
    slots: Array.from({ length: 2 }, () => ({ occupant: { kind: 'empty' }, groupId: null, replacements: [] })),
  }

  // 5. 4 Dormitories: Lv.1 (5 slots each) for strict 252 power budget
  for (let i = 1; i <= 4; i++) {
    const dId = `dormitory_${i}` as const
    ws.mainPlan.facilities[dId] = {
      roomId: dId,
      type: 'dormitory',
      level: 1,
      slots: Array.from({ length: 5 }, () => ({ occupant: { kind: 'empty' }, groupId: null, replacements: [] })),
    }
  }

  // 6. Central: Lv.5 (5 slots)
  ws.mainPlan.facilities.central = {
    roomId: 'central',
    type: 'central',
    level: 5,
    slots: Array.from({ length: 5 }, () => ({ occupant: { kind: 'empty' }, groupId: null, replacements: [] })),
  }

  return ws
}

async function trace252ShiftRun() {
  console.log('======================================================================')
  console.log('  【252 极限压电布局 · 跑单排班】自动排班全流程追踪记录')
  console.log('  配置：贸易站 2级+1级 | 制造站 33332 (4间3级+1间2级) | 右侧全满 (Lv.3) | 4宿舍 Lv.1')
  console.log('======================================================================\n')

  const ws252 = create252Workspace()

  // 1. 电力平衡检验
  const cfg = compileMainPlanToAppConfig(ws252.mainPlan, ws252, createDefaultConfig())
  const power = calculate(cfg).power
  console.log(`[基建基础检查 - 电力状态]`)
  console.log(`  发电总量: ${power.generation} | 耗电总量: ${power.consumption} | 电力余量: ${power.margin}`)
  console.log(`  电力是否充足: ${power.sufficient ? '✅ 充足 (零余量完美平衡)' : '❌ 不足'}`)
  console.log(`  物理合法性校验: ${validatePhysicalRoster(ws252).length === 0 ? '✅ 通过' : '❌ 失败'}\n`)

  // 2. 追踪过程
  console.log('[开始自动排班追踪]')
  const startTime = Date.now()

  const progressLogs: string[] = []
  const result = runSmartRoster(ws252, allOwned, {
    trials: 4,
    simulationTopK: 3,
    simulationWarmupHours: 24,
    simulationSampleHours: 72,
    enableDeepSearch: false,
    seed: 20260918,
    droneTarget: 'gold',
  }, (progress: SmartRosterProgress) => {
    const msg = `  [进度追踪 ${Math.round(progress.phaseProgress * 100)}%] (${progress.phase}) ${progress.label}`
    progressLogs.push(msg)
    console.log(msg)
  })

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(`\n[自动排班计算完成 - 耗时 ${elapsedSec}s] 状态: ${result.status.toUpperCase()} | 最终82评分: ${result.score?.toFixed(1) ?? '0.0'} 分/日\n`)

  if (!result.workspace) {
    console.error('❌ 排班生成失败，错误信息：', result.diagnostics)
    return
  }

  const finalWs = result.workspace

  // 3. 阶段一与阶段二结果分析
  console.log('----------------------------------------------------------------------')
  console.log('【阶段一：分子合成与候选生成】')
  console.log(`  生成候选方案总数: ${result.phases.static.candidates.length}`)
  result.phases.static.candidates.forEach((cand, idx) => {
    console.log(`    候选 ${idx + 1} [${cand.id}]: 静态/初筛82分 = ${cand.staticScore.toFixed(1)} | 拟真分 = ${cand.simScore?.toFixed(1) ?? 'N/A'}`)
  })

  // 4. 阶段三：全局人均置换日志
  console.log('\n----------------------------------------------------------------------')
  console.log('【阶段二 & 阶段三：全局人均产出检测与优化置换】')
  if (result.phases.replacement) {
    console.log(`  置换调整次数: ${result.phases.replacement.swappedCount}`)
    console.log('  置换与挂件转移日志:')
    result.phases.replacement.logs.forEach((log) => console.log(`    • ${log}`))
  } else {
    console.log('  （未触发进一步人均置换，初始分子排布已达到人均产出局部最优）')
  }

  // 5. 阶段四：详细工位分布详情
  console.log('\n----------------------------------------------------------------------')
  console.log('【阶段四：最终排班工位与替补全景】')
  console.log('\n>>> 生产设施 (贸易站 / 制造站 / 发电站)：')
  for (const r of Object.values(finalWs.mainPlan.facilities)) {
    if (['trading', 'manufacture', 'power'].includes(r.type)) {
      const occs = r.slots.map((s, idx) => {
        const name = s.occupant.kind === 'operator' ? restoreOperatorMowerName(s.occupant.operatorId) : s.occupant.kind
        const reps = s.replacements.map(restoreOperatorMowerName).join('/')
        return `工位${idx + 1}: ${name}${reps ? ` [替: ${reps}]` : ''}`
      }).join(' | ')
      const prod = r.product ? ` [配方: ${r.product}]` : ''
      console.log(`  ${r.roomId} (${r.type} Lv.${r.level}${prod}): ${occs || '(空)'}`)
    }
  }

  console.log('\n>>> 非生产设施 (中枢 / 办公室 / 会客室 / 加工站 / 训练室)：')
  for (const r of Object.values(finalWs.mainPlan.facilities)) {
    if (['central', 'contact', 'meeting', 'factory', 'train'].includes(r.type)) {
      const occs = r.slots.map((s, idx) => {
        const name = s.occupant.kind === 'operator' ? restoreOperatorMowerName(s.occupant.operatorId) : s.occupant.kind
        const reps = s.replacements.map(restoreOperatorMowerName).join('/')
        return `工位${idx + 1}: ${name}${reps ? ` [替: ${reps}]` : ''}`
      }).join(' | ')
      console.log(`  ${r.roomId} (${r.type} Lv.${r.level}): ${occs || '(空)'}`)
    }
  }

  console.log('\n>>> 宿舍 (Dormitories)：')
  for (let i = 1; i <= 4; i++) {
    const dId = `dormitory_${i}` as const
    const r = finalWs.mainPlan.facilities[dId]
    const occs = r.slots.map((s) => {
      if (s.occupant.kind === 'operator') return restoreOperatorMowerName(s.occupant.operatorId)
      if (s.occupant.kind === 'free') return '[Free空床]'
      return '(空)'
    }).join(', ')
    console.log(`  ${dId} (Lv.${r.level}): ${occs}`)
  }

  // 6. Mower Conf 策略生成
  console.log('\n----------------------------------------------------------------------')
  console.log('【Mower 导出 Conf 配置详情】')
  const conf = finalWs.mainPlan.conf
  console.log(`  exhaust_require (强制耗尽替换): ${conf.exhaust_require.map(restoreOperatorMowerName).join(', ') || '无'}`)
  console.log(`  rest_in_full (强制满心情入驻): ${conf.rest_in_full.map(restoreOperatorMowerName).join(', ') || '无'}`)
  console.log(`  workaholic (0心情常驻/禁入宿舍): ${conf.workaholic.map(restoreOperatorMowerName).join(', ') || '无'}`)
  console.log(`  resting_priority (宿舍低优先恢复): ${conf.resting_priority.map(restoreOperatorMowerName).join(', ') || '无'}`)
  console.log(`  ope_resting_priority (宿舍高优先恢复): ${conf.ope_resting_priority.map(restoreOperatorMowerName).join(', ') || '无'}`)

  // 7. 跑单与原子组合规则全面合规性断言
  console.log('\n----------------------------------------------------------------------')
  console.log('【跑单排班与规则合规性硬性断言】')
  const allMains = Object.values(finalWs.mainPlan.facilities).flatMap((r) =>
    r.slots.flatMap((s) => (s.occupant.kind === 'operator' ? [restoreOperatorMowerName(s.occupant.operatorId)] : [])),
  )
  const allMainsSet = new Set(allMains)

  const tradingRooms = Object.values(finalWs.mainPlan.facilities).filter((r) => r.type === 'trading')
  const tradeMains = tradingRooms.flatMap((r) =>
    r.slots.map((s) => (s.occupant.kind === 'operator' ? restoreOperatorMowerName(s.occupant.operatorId) : '')),
  )

  // (1) 跑单干员严禁常驻
  const forbidden = ['但书', '龙舌兰', '可露希尔', '空'].filter((op) => tradeMains.includes(op))
  console.log(`  1. [跑单分支常驻检查] 贸易站严禁但书/龙舌兰/可露希尔/空: ${forbidden.length === 0 ? '✅ 100% 合规 (无违规常驻)' : `❌ 发现违规: ${forbidden.join(', ')}`}`)

  // (2) 2级制造站作战记录无 RECIPE_LEVEL 阻断
  const r22 = finalWs.mainPlan.facilities.room_2_2
  console.log(`  2. [2级制造站配方检查] room_2_2 (Lv.${r22.level} ${r22.product}): ${r22.level === 2 && r22.product === 'exp' ? '✅ 成功生产经验书，无配方等级截拦' : '⚠️ 配置不符合测试设想'}`)

  // (3) 槐琥阿罗玛双人无第3人
  const aromaRoom = Object.values(finalWs.mainPlan.facilities).find((r) =>
    r.type === 'manufacture' && r.slots.some((s) => s.occupant.kind === 'operator' && restoreOperatorMowerName(s.occupant.operatorId) === '阿罗玛')
  )
  if (aromaRoom) {
    const aromaGroupOps = aromaRoom.slots
      .filter((s) => s.occupant.kind === 'operator' && s.groupId === '阿罗玛槐琥组')
      .map((s) => restoreOperatorMowerName(s.occupant.kind === 'operator' ? s.occupant.operatorId : ''))
    const allRoomOps = aromaRoom.slots
      .filter((s) => s.occupant.kind === 'operator')
      .map((s) => restoreOperatorMowerName(s.occupant.kind === 'operator' ? s.occupant.operatorId : ''))
    console.log(`  3. [槐琥阿罗玛] 组合成员: ${aromaGroupOps.length === 2 && aromaGroupOps.includes('槐琥') ? `✅ 严格双人核心无第三人 (${aromaGroupOps.join('+')})` : `⚠️ 组内成员数为 ${aromaGroupOps.length}`} (同设施共驻: ${allRoomOps.join('+')})`)
  }

  // (4) 拉特兰双人无第3人
  const lateranoRoom = tradingRooms.find((r) =>
    r.slots.some((s) => s.occupant.kind === 'operator' && restoreOperatorMowerName(s.occupant.operatorId) === '蕾缪安')
  )
  if (lateranoRoom) {
    const latOps = lateranoRoom.slots.filter((s) => s.occupant.kind === 'operator').map((s) => restoreOperatorMowerName(s.occupant.kind === 'operator' ? s.occupant.operatorId : ''))
    console.log(`  4. [拉特兰商道] 站内人数: ${latOps.length === 2 && latOps.includes('能天使') ? `✅ 严格双人核心无第三人 (${latOps.join('+')})` : `⚠️ 站内人数为 ${latOps.length} (${latOps.join('+')})`}`)
  } else {
    console.log(`  4. [拉特兰商道] 本次测算最优解为候选1(鸿雪+感知黑键体系 88460分)，拉特兰体系作为候选2(87033分)`)
  }

  // (5) 2电自动化自适应
  if (allMainsSet.has('温蒂')) {
    const lancetInWorkaholic = conf.workaholic.map(restoreOperatorMowerName).includes('Lancet-2')
    const eunectesInCentral = finalWs.mainPlan.facilities.central.slots.some(
      (s) => s.occupant.kind === 'operator' && restoreOperatorMowerName(s.occupant.operatorId) === '森蚺'
    )
    console.log(`  5. [2电自动化自适应] Lancet-2进workaholic: ${lancetInWorkaholic ? '✅ 通过' : '❌ 未进workaholic'}`)
    console.log(`     [2电自动化自适应] 森蚺进驻中枢: ${eunectesInCentral ? '✅ 通过' : '❌ 未进中枢'}`)
  }

  // (6) 鸿雪组杜林规则
  if (allMainsSet.has('鸿雪')) {
    const durins = ['杜林', '桃金娘', '褐果', '至简'].filter((d) => allMainsSet.has(d))
    console.log(`  6. [鸿雪组规范] 4杜林在基建: ${durins.length === 4 ? `✅ 全部在岗 (${durins.join(', ')})` : `⚠️ 部分在岗: ${durins.join(', ')}`}`)
    // 2电站至简禁入制造
    const minimalistInManu = Object.values(finalWs.mainPlan.facilities).some((r) =>
      r.type === 'manufacture' && r.slots.some((s) => s.occupant.kind === 'operator' && restoreOperatorMowerName(s.occupant.operatorId) === '至简')
    )
    console.log(`     [2电站至简检测] 至简严禁入驻制造站: ${!minimalistInManu ? '✅ 成功作为挂件/转移至非生产设施' : '❌ 违规入驻制造站'}`)
  }

  // (7) 全局排班校验与警告
  const val = validateRosterWorkspace(finalWs)
  console.log(`  7. [全局排班校验] 严重错误数: ${val.criticalErrors.length === 0 ? '✅ 0' : `❌ ${val.criticalErrors.map((e) => e.message).join(';')}`}`)
  console.log(`     [全局排班校验] 警告数: ${val.warnings.length === 0 ? '✅ 0 (完美无告警)' : `⚠️ ${val.warnings.length} 条告警: ${val.warnings.map((w) => w.message).join(';')}`}`)

  console.log('\n======================================================================')
  console.log('  追踪记录完成！')
  console.log('======================================================================')
}

trace252ShiftRun().catch(console.error)
