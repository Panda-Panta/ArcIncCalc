import type { RosterWorkspace } from '../workbench/model'
import type { SmartRosterCandidate } from './smartRoster'
import { buildIsolatedFeatureTable } from '../surrogate/operatorIsolatedFeatures'
import { extractFacilityFeaturesFromWorkspace } from '../surrogate/globalFacilityFeatures'
import { generateCandidateBatch, candidateToWorkspace } from '../surrogate/hierarchicalScheduleSampler'
import { createSurrogateSession, type SurrogateSession } from '../surrogate/surrogateSession'
import { projectRosterOutput } from './rosterProjection'
import { validatePhysicalRoster } from './rosterDraft'

let cachedSession: SurrogateSession | null = null
let cachedOpTable: ReturnType<typeof buildIsolatedFeatureTable> | null = null

export interface SurrogateBridgeOptions {
  modelUrl?: string
  trials?: number      // 默认 20,000 ~ 50,000
  topK?: number        // 默认 16
  preferWebGPU?: boolean
}

/**
 * 运行 Phase 0: Surrogate 快速初筛
 * 在 WebGPU / WASM 上快速推断海量排班，并返回经过物理校验的高分候选
 */
export async function runSurrogatePhase0(
  base: RosterWorkspace,
  options?: SurrogateBridgeOptions,
): Promise<SmartRosterCandidate[]> {
  const trials = options?.trials ?? 25000
  const topK = options?.topK ?? 16

  if (!cachedOpTable) {
    cachedOpTable = buildIsolatedFeatureTable()
  }

  if (!cachedSession) {
    cachedSession = await createSurrogateSession({
      modelUrl: options?.modelUrl,
      preferWebGPU: options?.preferWebGPU ?? true,
    })
  }

  if (!cachedSession) {
    console.warn('[SurrogateBridge] 未能加载 ONNX 代理模型，跳过 Phase 0')
    return []
  }

  const facility = extractFacilityFeaturesFromWorkspace(base)

  // 1. 批量生成候选
  const { tensorBuffer, candidates } = generateCandidateBatch(facility, cachedOpTable, {
    count: trials,
    baselineWorkspace: base,
  })

  // 2. 批量推断打分
  const scores = await cachedSession.batchScore(tensorBuffer, trials)

  // 3. 选出 Top-K 索引
  const indexedScores = new Array<{ index: number; score: number }>(trials)
  for (let i = 0; i < trials; i++) {
    indexedScores[i] = { index: i, score: scores[i]! }
  }
  indexedScores.sort((a, b) => b.score - a.score)

  const topCandidates: SmartRosterCandidate[] = []
  const maxToInspect = Math.min(trials, topK * 3)

  // 4. 将高潜力的候选进行还原和 CPU 精确验证
  for (let rank = 0; rank < maxToInspect; rank++) {
    if (topCandidates.length >= topK) break

    const item = indexedScores[rank]!
    const candidateAssignment = candidates[item.index]!
    const candidateWs = candidateToWorkspace(candidateAssignment, base)

    const physErrors = validatePhysicalRoster(candidateWs)
    if (physErrors.length > 0) continue

    const evalRes = projectRosterOutput(candidateWs)
    if (evalRes && evalRes.complete) {
      topCandidates.push({
        id: `surrogate_top_${topCandidates.length + 1}`,
        workspace: candidateWs,
        staticScore: evalRes.daily.score,
        simScore: null,
        diagnostics: [],
      })
    }
  }

  return topCandidates
}
