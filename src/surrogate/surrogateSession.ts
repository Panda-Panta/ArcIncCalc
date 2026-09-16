import * as ort from 'onnxruntime-web'

export interface SurrogateSessionConfig {
  modelUrl?: string
  preferWebGPU?: boolean
  chunkSize?: number
}

export interface SurrogateSession {
  readonly backend: 'webgpu' | 'wasm'
  readonly featureDim: number
  batchScore(features: Float32Array, totalCount: number): Promise<Float32Array>
  dispose(): void
}

const DEFAULT_CHUNK_SIZE = 50000

/**
 * 创建全布局通用 Surrogate 会话
 */
export async function createSurrogateSession(
  config?: SurrogateSessionConfig,
): Promise<SurrogateSession | null> {
  const modelUrl = config?.modelUrl ?? '/models/surrogate_unified.onnx'
  const preferWebGPU = config?.preferWebGPU ?? true
  const chunkSize = config?.chunkSize ?? DEFAULT_CHUNK_SIZE

  // 1. 设置 ONNX Runtime Web 全局选项
  ort.env.wasm.numThreads = Math.min(4, typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4)
  ort.env.wasm.simd = true

  let session: ort.InferenceSession | null = null
  let backend: 'webgpu' | 'wasm' = 'wasm'

  // 2. 尝试优先使用 WebGPU
  if (preferWebGPU && typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ['webgpu'],
        graphOptimizationLevel: 'all',
      })
      backend = 'webgpu'
      console.log('[Surrogate] WebGPU EP 初始化成功')
    } catch (err) {
      console.warn('[Surrogate] WebGPU 初始化失败，自动降级至 WASM:', err)
      session = null
    }
  }

  // 3. 降级使用 WASM
  if (!session) {
    try {
      session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      })
      backend = 'wasm'
      console.log('[Surrogate] WASM EP 初始化成功')
    } catch (err) {
      console.error('[Surrogate] 模型加载失败:', err)
      return null
    }
  }

  const featureDim = 480

  return {
    backend,
    featureDim,
    async batchScore(features: Float32Array, totalCount: number): Promise<Float32Array> {
      if (!session) throw new Error('Surrogate 会话未初始化')

      const scores = new Float32Array(totalCount)

      // 分块推理，避免显存/Buffer 溢出 (默认 50,000 组/块)
      for (let offset = 0; offset < totalCount; offset += chunkSize) {
        const batchN = Math.min(chunkSize, totalCount - offset)
        const slice = features.subarray(offset * featureDim, (offset + batchN) * featureDim)

        const inputTensor = new ort.Tensor('float32', slice, [batchN, featureDim])
        const results = await session.run({ input: inputTensor })
        const scoreTensor = results.score || results[session.outputNames[0] ?? 'score']
        if (scoreTensor) {
          scores.set(scoreTensor.data as Float32Array, offset)
        }
        inputTensor.dispose()
      }

      return scores
    },
    dispose() {
      session?.release()
      session = null
    },
  }
}
