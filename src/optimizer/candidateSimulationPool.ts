import { simulateCandidate, type CandidateSimulationJob, type CandidateSimulationResult } from './candidateSimulation'

export interface CandidateWorker {
  onmessage: ((event: MessageEvent<CandidateSimulationResult>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  postMessage(job: CandidateSimulationJob): void
  terminate(): void
}

export function candidateConcurrency(cores?: number): number {
  // Reserve capacity for the UI/other apps and bound per-worker engine memory.
  return Number.isFinite(cores) ? Math.max(1, Math.min(4, Math.floor(cores!) - 2)) : 1
}

export interface CandidateBatchOptions {
  concurrency?: number
  createWorker?: () => CandidateWorker
  onComplete?: (result: CandidateSimulationResult, index: number) => void
}

export async function runCandidateBatch(jobs: CandidateSimulationJob[], options: CandidateBatchOptions = {}): Promise<CandidateSimulationResult[]> {
  if (!jobs.length) return []
  const requested = options.concurrency ?? candidateConcurrency(globalThis.navigator?.hardwareConcurrency)
  const count = Math.min(jobs.length, Number.isFinite(requested) ? Math.max(1, Math.min(4, Math.floor(requested))) : 1)
  const serial = () => jobs.map((job, index) => {
    const result = simulateCandidate(job)
    options.onComplete?.(result, index)
    return result
  })
  if (count === 1 || (!options.createWorker && typeof Worker === 'undefined')) return serial()
  const workers: CandidateWorker[] = []
  const dispose = () => workers.forEach(w => {
    w.onmessage = null; w.onerror = null; w.onmessageerror = null; w.terminate()
  })
  try {
    // Construct the entire pool before dispatch so startup fallback runs each job only once.
    for (let i = 0; i < count; i++) workers.push(options.createWorker
      ? options.createWorker()
      : new Worker(new URL('./candidateSimulationWorker.ts', import.meta.url), { type: 'module' }))
  } catch {
    dispose()
    return serial()
  }
  return new Promise((resolve, reject) => {
    const results = new Array<CandidateSimulationResult>(jobs.length)
    let next = 0, completed = 0, stopped = false
    const fail = (error: unknown) => {
      if (stopped) return
      stopped = true; dispose(); reject(error)
    }
    const dispatch = (worker: CandidateWorker) => {
      if (stopped || next >= jobs.length) return
      const index = next++
      worker.onmessage = event => {
        if (stopped) return
        try {
          results[index] = event.data
          options.onComplete?.(event.data, index)
          if (++completed === jobs.length) {
            stopped = true; dispose(); resolve(results)
          } else dispatch(worker)
        } catch (error) { fail(error) }
      }
      worker.onerror = event => fail(new Error(event.message || '候选仿真线程运行失败'))
      worker.onmessageerror = () => fail(new Error('候选仿真线程返回数据无法读取'))
      try { worker.postMessage(jobs[index]!) } catch (error) { fail(error) }
    }
    workers.forEach(dispatch)
  })
}
