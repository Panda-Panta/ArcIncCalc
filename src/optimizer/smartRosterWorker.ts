import { runSmartRoster, type SmartRosterOptions } from './smartRoster'
import type { RosterWorkspace } from '../workbench/model'
import type { OwnedOperatorInput } from '../domain/operatorInventory'
import { runSurrogatePhase0 } from './surrogateOptimizerBridge'

export interface SmartRosterWorkerMessage {
  base: RosterWorkspace
  entries: OwnedOperatorInput[]
  options?: SmartRosterOptions
}

self.onmessage = async (event: MessageEvent<SmartRosterWorkerMessage>) => {
  try {
    const { base, entries, options } = event.data
    const mergedOptions: SmartRosterOptions = { ...options }

    // Phase 0: 神经网络代理模型 (Surrogate Model) 初筛
    if (mergedOptions.enableSurrogate !== false) {
      self.postMessage({
        type: 'progress',
        progress: {
          phase: 'building',
          phaseProgress: 0,
          label: '阶段 0/3: 神经网络代理模型 (WebGPU/WASM) 正在进行海量排班初筛...',
        },
      })
      try {
        const surrogateCandidates = await runSurrogatePhase0(base, {
          trials: mergedOptions.surrogateSampleCount ?? 25000,
          topK: mergedOptions.surrogateTopK ?? 16,
        })
        if (surrogateCandidates.length > 0) {
          mergedOptions.surrogateCandidates = surrogateCandidates
        }
      } catch (err) {
        console.warn('[SmartRosterWorker] Surrogate Phase 0 跳过:', err)
      }
    }

    const report = runSmartRoster(base, entries, mergedOptions, (progress) => {
      self.postMessage({ type: 'progress', progress })
    })
    self.postMessage({ type: 'complete', report })
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
