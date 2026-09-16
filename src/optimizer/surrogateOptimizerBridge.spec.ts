import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { createDefaultWorkspace } from '../workbench/defaults'
import { runSurrogatePhase0 } from './surrogateOptimizerBridge'
import { runSmartRoster } from './smartRoster'
import { OPERATORS } from '../domain/operators'
import type { OwnedOperatorInput } from '../domain/operatorInventory'

const allOwned: OwnedOperatorInput[] = OPERATORS.map((o) => ({
  operator: o.name,
  elitePhase: o.rarity < 3 ? 0 : o.rarity === 3 ? 1 : 2,
  level: o.rarity < 3 ? 30 : o.rarity === 3 ? 55 : o.rarity === 4 ? 70 : o.rarity === 5 ? 80 : 90,
}))

describe('Surrogate Optimizer Bridge & Phase 0 Integration', () => {
  it('runs Phase 0 screening on default workspace and outputs verified high-score candidates', async () => {
    const ws = createDefaultWorkspace()
    const modelPath = path.resolve('public/models/surrogate_unified.onnx')
    expect(fs.existsSync(modelPath)).toBe(true)

    // 在 Node.js / Vitest 环境中直接传入路径
    const t0 = performance.now()
    const candidates = await runSurrogatePhase0(ws, {
      trials: 1000, // 测试运行 1000 次推断
      topK: 8,
      modelUrl: modelPath,
    })
    const elapsed = performance.now() - t0

    console.log(`[SurrogateBridge Test] Phase 0 生成耗时: ${elapsed.toFixed(1)} ms, 筛选出候选数: ${candidates.length}`)
    expect(candidates.length).toBeGreaterThan(0)

    for (const c of candidates) {
      expect(c.staticScore).toBeGreaterThan(30000)
      expect(c.workspace).toBeDefined()
    }

    // 验证合并入 runSmartRoster
    const result = runSmartRoster(ws, allOwned, {
      trials: 1,
      simulationTopK: 1,
      simulationWarmupHours: 6,
      simulationSampleHours: 18,
      enableDeepSearch: false,
      surrogateCandidates: candidates,
    })

    expect(result.status).toBe('draft')
    expect(result.workspace).not.toBeNull()
    expect(result.score).toBeGreaterThan(35000)
  }, 20000)
})
