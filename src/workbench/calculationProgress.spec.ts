import { expect, it } from 'vitest'
import { createDefaultWorkspace } from './defaults'
import { runCalculationBridge } from './calculationBridge'

it('reports actual warmup and sampling progress without changing simulation output', () => {
  const options = { engine: 'simulation' as const, simulationOptions: {
    warmupHours: 1, sampleHours: 2, production: { outputMode: 'potential' as const, droneTarget: 'none' as const, seed: 42 },
  } }
  const progress: { phase: string; elapsedHours: number; totalHours: number }[] = []
  const result = runCalculationBridge(createDefaultWorkspace(), options, p => progress.push(p))
  expect(result.success).toBe(true)
  expect(progress.some(p => p.phase === 'warmup')).toBe(true)
  expect(progress.some(p => p.phase === 'sampling')).toBe(true)
  expect(progress[progress.length - 1]).toMatchObject({ elapsedHours: 3, totalHours: 3 })
  expect(progress.every((p, i) => i === 0 || p.elapsedHours >= progress[i - 1]!.elapsedHours)).toBe(true)
  expect(result).toEqual(runCalculationBridge(createDefaultWorkspace(), options))
})
