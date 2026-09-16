import * as path from 'path'
import { createDefaultWorkspace } from '../src/workbench/defaults'
import { OPERATORS } from '../src/domain/operators'
import type { OwnedOperatorInput } from '../src/domain/operatorInventory'
import { runSmartRoster, type SmartRosterResult } from '../src/optimizer/smartRoster'
import { runSurrogatePhase0 } from '../src/optimizer/surrogateOptimizerBridge'
import riicSkillsDb from '../src/data/riic-skills-database.json'

const allOwned: OwnedOperatorInput[] = OPERATORS.map((o) => ({
  operator: o.name,
  elitePhase: o.rarity < 3 ? 0 : o.rarity === 3 ? 1 : 2,
  level: o.rarity < 3 ? 30 : o.rarity === 3 ? 55 : o.rarity === 4 ? 70 : o.rarity === 5 ? 80 : 90,
}))

function getOpSkillsSummary(charId: string): string {
  const opData = (riicSkillsDb as any)[charId]
  if (!opData || !opData.skills) return '无技能记录'
  return opData.skills.map((s: any) => `[${s.roomType || s.room}] ${s.name || s.skillName}: ${(s.desc || s.description || '').slice(0, 30)}...`).join('; ')
}

function inspectRoster(title: string, result: SmartRosterResult) {
  console.log('\n======================================================================')
  console.log(` 🔍 分析结果: ${title}`)
  console.log(` 最终状态: ${result.status} | 评分: ${result.score?.toFixed(1) ?? 'N/A'}`)
  console.log('======================================================================')

  if (!result.workspace) {
    console.log('❌ 未生成 workspace!')
    return
  }

  const ws = result.workspace
  const facilities = ws.mainPlan.facilities

  for (const [roomId, room] of Object.entries(facilities)) {
    if (!room.slots || room.slots.length === 0) continue

    console.log(`\n🏠 【${roomId}】 (类型: ${room.type}, 等级: ${room.level}${room.product ? ', 产出: ' + room.product : ''}):`)
    room.slots.forEach((slot, idx) => {
      const occ = slot.occupant
      if (occ.kind === 'empty') {
        console.log(`  工位 #${idx + 1}: [空位 EMPTY]`)
      } else if (occ.kind === 'free') {
        console.log(`  工位 #${idx + 1}: [Free 自由床位]`)
      } else {
        const op = OPERATORS.find(o => o.charId === occ.operatorId || o.name === occ.operatorId)
        const opName = op ? op.name : occ.operatorId
        const charId = op ? op.charId : occ.operatorId
        const grp = slot.groupId ? `组:${slot.groupId}` : '无分组 ⚠️'
        const repCount = slot.replacements?.length || 0
        const repStr = repCount > 0
          ? `候补(${repCount}): ` + slot.replacements.map(repId => {
              const rOp = OPERATORS.find(o => o.charId === repId || o.name === repId)
              return rOp ? rOp.name : repId
            }).join(', ')
          : '无候补 ⚠️'

        console.log(`  工位 #${idx + 1}: 正选: 【${opName}】 (${charId}) | [${grp}] | [${repStr}]`)
      }
    })
  }

  // 检查宿舍
  console.log('\n🛏️ 【宿舍入驻情况】:')
  for (let i = 1; i <= 4; i++) {
    const dId = `dormitory_${i}` as keyof typeof facilities
    const dorm = facilities[dId]
    if (dorm) {
      const occupants = dorm.slots.map(s => {
        if (s.occupant.kind === 'operator') {
          const op = OPERATORS.find(o => o.charId === s.occupant.operatorId || o.name === s.occupant.operatorId)
          return op ? op.name : s.occupant.operatorId
        }
        return '空床'
      }).join(', ')
      console.log(`  ${dId} (Lv${dorm.level}): ${occupants}`)
    }
  }
}

async function main() {
  const defaultWs = createDefaultWorkspace()
  const modelPath = path.resolve('public/models/surrogate_unified.onnx')

  console.log('>>> [1/2] 正在运行测试 1: 启用 Phase 0 代理模型...')
  let surrogateCandidates: any[] = []
  try {
    surrogateCandidates = await runSurrogatePhase0(defaultWs, {
      trials: 5000,
      topK: 8,
      modelUrl: modelPath,
    })
    console.log(`Phase 0 初筛出 ${surrogateCandidates.length} 个候选`)
  } catch (err) {
    console.error('Phase 0 运行出错:', err)
  }

  const resultWithSurrogate = runSmartRoster(defaultWs, allOwned, {
    trials: 3,
    simulationTopK: 3,
    simulationWarmupHours: 6,
    simulationSampleHours: 18,
    enableDeepSearch: false,
    surrogateCandidates,
    seed: 42,
  })

  inspectRoster('包含 Phase 0 代理模型', resultWithSurrogate)

  console.log('\n\n>>> [2/2] 正在运行测试 2: 纯贪心启发式 (禁用 Phase 0)...')
  const resultWithoutSurrogate = runSmartRoster(defaultWs, allOwned, {
    trials: 3,
    simulationTopK: 3,
    simulationWarmupHours: 6,
    simulationSampleHours: 18,
    enableDeepSearch: false,
    seed: 42,
  })

  inspectRoster('纯贪心启发式 (无 Phase 0)', resultWithoutSurrogate)
}

main().catch(console.error)
