import type { RosterWorkspace } from '../workbench/model'
import { buildIsolatedFeatureTable } from './operatorIsolatedFeatures'
import { extractFacilityFeaturesFromWorkspace } from './globalFacilityFeatures'
import { generateCandidateBatch, candidateToWorkspace } from './hierarchicalScheduleSampler'
import { createSurrogateSession, type SurrogateSession } from './surrogateSession'

let session: SurrogateSession | null = null
let opTable: ReturnType<typeof buildIsolatedFeatureTable> | null = null

export interface SurrogateWorkerRequest {
  type: 'init' | 'screen'
  modelUrl?: string
  workspace?: RosterWorkspace
  count?: number
  topK?: number
}

export interface SurrogateWorkerResponse {
  type: 'ready' | 'result' | 'error'
  backend?: 'webgpu' | 'wasm'
  topCandidates?: Array<{
    score: number
    workspace: RosterWorkspace
  }>
  error?: string
  timeMs?: number
}

/**
 * 在 TypedArray 中快速选出前 K 个最大值的索引与分数
 */
function argTopK(scores: Float32Array, k: number): Array<{ index: number; score: number }> {
  const n = scores.length
  const top: Array<{ index: number; score: number }> = []

  // 简单的维护前 K 大列表 (k=50 极小，遍历一次非常快)
  for (let i = 0; i < n; i++) {
    const s = scores[i]!
    if (top.length < k) {
      top.push({ index: i, score: s })
      if (top.length === k) {
        top.sort((a, b) => a.score - b.score) // 升序，top[0] 为最小值
      }
    } else if (s > top[0]!.score) {
      top[0] = { index: i, score: s }
      // 维持升序
      for (let j = 0; j < k - 1; j++) {
        if (top[j]!.score > top[j + 1]!.score) {
          const tmp = top[j]!
          top[j] = top[j + 1]!
          top[j + 1] = tmp
        } else {
          break
        }
      }
    }
  }

  // 最终按降序返回
  return top.sort((a, b) => b.score - a.score)
}

self.onmessage = async (e: MessageEvent<SurrogateWorkerRequest>) => {
  const req = e.data

  try {
    if (req.type === 'init') {
      if (!opTable) {
        opTable = buildIsolatedFeatureTable()
      }
      if (!session) {
        session = await createSurrogateSession({ modelUrl: req.modelUrl })
      }
      if (!session) {
        self.postMessage({ type: 'error', error: '无法加载 Surrogate 模型' } satisfies SurrogateWorkerResponse)
        return
      }
      self.postMessage({
        type: 'ready',
        backend: session.backend,
      } satisfies SurrogateWorkerResponse)
      return
    }

    if (req.type === 'screen') {
      const t0 = performance.now()
      if (!req.workspace) {
        self.postMessage({ type: 'error', error: '缺少 workspace 参数' } satisfies SurrogateWorkerResponse)
        return
      }

      if (!opTable) {
        opTable = buildIsolatedFeatureTable()
      }
      if (!session) {
        session = await createSurrogateSession({ modelUrl: req.modelUrl })
      }
      if (!session) {
        self.postMessage({ type: 'error', error: 'Surrogate 会话不可用' } satisfies SurrogateWorkerResponse)
        return
      }

      const totalCount = req.count ?? 100000
      const topK = req.topK ?? 50
      const facility = extractFacilityFeaturesFromWorkspace(req.workspace)

      // 1. 生成 100,000 组候选并张量化
      const { tensorBuffer, candidates } = generateCandidateBatch(facility, opTable, {
        count: totalCount,
        baselineWorkspace: req.workspace,
      })

      // 2. WebGPU / WASM 批量推理打分
      const scores = await session.batchScore(tensorBuffer, totalCount)

      // 3. 选拔 Top-K
      const topIndices = argTopK(scores, topK)

      // 4. 将 Top-K 还原为 RosterWorkspace
      const topCandidates = topIndices.map((item) => {
        const candidate = candidates[item.index]!
        const ws = candidateToWorkspace(candidate, req.workspace!)
        return {
          score: item.score,
          workspace: ws,
        }
      })

      const timeMs = performance.now() - t0

      self.postMessage({
        type: 'result',
        topCandidates,
        backend: session.backend,
        timeMs,
      } satisfies SurrogateWorkerResponse)
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      error: String(err),
    } satisfies SurrogateWorkerResponse)
  }
}
