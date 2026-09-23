import { describe, expect, it } from 'vitest'
import { runCandidateBatch, candidateConcurrency } from './candidateSimulationPool'
import type { CandidateSimulationJob, CandidateSimulationResult } from './candidateSimulation'
import { simulateCandidate } from './candidateSimulation'
import { createDefaultWorkspace } from '../workbench/defaults'

class TestWorker {
  onmessage: ((event: MessageEvent<CandidateSimulationResult>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  jobs: CandidateSimulationJob[] = []
  terminated = false
  postMessage(job: CandidateSimulationJob) { this.jobs.push(job) }
  terminate() { this.terminated = true }
  finish(score: number) { this.onmessage?.(new MessageEvent('message', { data: { completed: true, simScore: score, diagnostics: [] } })) }
}
const jobs = [0, 1, 2, 3, 4].map(i => ({ workspace: { name: String(i) } })) as CandidateSimulationJob[]

describe('bounded candidate CPU workers', () => {
  it('limits active jobs, reuses workers, and returns input order despite reverse completion', async () => {
    const workers: TestWorker[] = [], completed: number[] = []
    const result = runCandidateBatch(jobs, { concurrency: 2, createWorker: () => {
      const w = new TestWorker(); workers.push(w); return w
    }, onComplete: (_result, index) => completed.push(index) })
    expect(workers).toHaveLength(2)
    workers[1]!.finish(10) // index 1; receives index 2
    workers[1]!.finish(20) // receives index 3
    workers[0]!.finish(0) // receives index 4
    workers[0]!.finish(40)
    workers[1]!.finish(30)
    expect((await result).map(r => r.simScore)).toEqual([0, 10, 20, 30, 40])
    expect(completed).toEqual([1, 2, 0, 4, 3])
    expect(workers.every(w => w.terminated)).toBe(true)
  })
  it('terminates every worker and rejects on runtime or deserialization errors', async () => {
    for (const kind of ['runtime', 'message'] as const) {
      const workers: TestWorker[] = []
      const result = runCandidateBatch(jobs, { concurrency: 2, createWorker: () => {
        const w = new TestWorker(); workers.push(w); return w
      } })
      const assertion = expect(result).rejects.toThrow()
      if (kind === 'runtime') workers[0]!.onerror?.({ message: 'worker crashed' } as ErrorEvent)
      else workers[0]!.onmessageerror?.(new MessageEvent('messageerror'))
      await assertion
      expect(workers.every(w => w.terminated)).toBe(true)
    }
  })
  it('cleans up partially created pools and falls back to the same serial calculation', async () => {
    const job = { workspace: createDefaultWorkspace(), options: { sampleHours: 1 }, assumptions: {} }
    const first = new TestWorker()
    let creates = 0
    const result = await runCandidateBatch([job, job], { concurrency: 2, createWorker: () => {
      if (++creates > 1) throw new Error('workers unavailable')
      return first
    } })
    expect(first.terminated).toBe(true)
    expect(first.jobs).toHaveLength(0)
    expect(result).toEqual([simulateCandidate(job), simulateCandidate(job)])
  })
  it('releases the pool when posting input throws', async () => {
    const worker = new TestWorker()
    worker.postMessage = () => { throw new Error('input could not be cloned') }
    await expect(runCandidateBatch(jobs, { concurrency: 2, createWorker: () => worker })).rejects.toThrow('input could not be cloned')
    expect(worker.terminated).toBe(true)
  })
  it('uses a conservative core budget and never creates workers for an empty batch', async () => {
    expect([1, 2, 4, 8, 20].map(n => candidateConcurrency(n))).toEqual([1, 1, 2, 4, 4])
    expect(candidateConcurrency(undefined)).toBe(1)
    expect(candidateConcurrency(NaN)).toBe(1)
    expect(await runCandidateBatch([], { createWorker: () => { throw Error('unexpected') } })).toEqual([])
  })
})
