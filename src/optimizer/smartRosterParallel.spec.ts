import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultWorkspace } from '../workbench/defaults'
import { runSmartRoster, runSmartRosterParallel, type SmartRosterProgress } from './smartRoster'
import { simulateCandidate } from './candidateSimulation'
import * as synthesis from './molecularSynthesis'
import * as bridge from '../workbench/scheduleSimulationBridge'
import * as replacement from './globalPerCapitaReplacement'

afterEach(() => vi.restoreAllMocks())
const entries = [{ operator: '砾', elitePhase: 1, level: 60 }, { operator: '芬', elitePhase: 1, level: 55 }]
const options = { branchCount: 2, simulationWarmupHours: 0, simulationSampleHours: 1, enableDeepSearch: false, seed: 42 }
function baseWorkspace() {
  const workspace = createDefaultWorkspace()
  for (const room of Object.values(workspace.mainPlan.facilities)) if (room.type === 'trading') room.product = 'orundum'
  return workspace
}
function candidates() {
  return ['砾', '芬'].map((name, i) => {
    const workspace = baseWorkspace()
    workspace.mainPlan.facilities.room_1_1.level = 1
    workspace.mainPlan.facilities.room_1_1.slots = [{ occupant: { kind: 'operator', operatorId: name }, groupId: null, replacements: [] }]
    workspace.mainPlan.conf.workaholic = [name]
    return { id: `branch-${i}`, name, workspace, diagnostics: [], appliedAtoms: [], staticScore: 0, simScore: null, confPolicy: {} }
  })
}

describe('parallel smart roster preserves serial semantics', () => {
  it('reuses the winning completed simulation when the final input is unchanged', () => {
    vi.spyOn(synthesis, 'generateMolecularCandidates').mockImplementation(candidates)
    const simulate = vi.spyOn(bridge, 'runScheduleSimulationBridge')
    const result = runSmartRoster(baseWorkspace(), entries, options)
    expect(result.status).toBe('draft')
    expect(simulate).toHaveBeenCalledTimes(2)
  })
  it('simulates the final input again when replacement changes an unevaluated field', () => {
    vi.spyOn(synthesis, 'generateMolecularCandidates').mockImplementation(candidates)
    vi.spyOn(replacement, 'runGlobalPerCapitaReplacement').mockImplementation(workspace => {
      const changed = structuredClone(workspace)
      changed.mainPlan.conf.restInFull = ['砾']
      return { workspace: changed, swappedCount: 1, score: 1e9, logs: [] }
    })
    const simulate = vi.spyOn(bridge, 'runScheduleSimulationBridge')
    const result = runSmartRoster(baseWorkspace(), entries, options)
    expect(result.status).toBe('draft')
    expect(simulate).toHaveBeenCalledTimes(3)
    expect(simulate.mock.calls[2]![0].mainPlan.conf.restInFull).toEqual(['砾'])
  })
  it('reuses repeated replacement evaluations and the final verified replacement', () => {
    vi.spyOn(synthesis, 'generateMolecularCandidates').mockImplementation(candidates)
    vi.spyOn(replacement, 'runGlobalPerCapitaReplacement').mockImplementation((workspace, _inventory, opts) => {
      const changed = structuredClone(workspace)
      changed.mainPlan.conf.restInFull = ['砾']
      const first = opts!.evaluator!(changed)
      expect(opts!.evaluator!(changed)).toBe(first)
      return { workspace: changed, swappedCount: 1, score: 1e9, logs: [] }
    })
    const simulate = vi.spyOn(bridge, 'runScheduleSimulationBridge')
    const result = runSmartRoster(baseWorkspace(), entries, options)
    expect(result.status).toBe('draft')
    expect(simulate).toHaveBeenCalledTimes(3)
    expect(result.score).not.toBe(1e9)
  })
  it('produces the identical full result with out-of-order completions and real simulations', async () => {
    vi.spyOn(synthesis, 'generateMolecularCandidates').mockImplementation(candidates)
    const base = baseWorkspace(), original = structuredClone(base)
    const serial = runSmartRoster(base, entries, options)
    const progress: SmartRosterProgress[] = []
    const parallel = await runSmartRosterParallel(base, entries, options, async (jobs, done) => {
      const results = jobs.map(simulateCandidate)
      for (let i = results.length - 1; i >= 0; i--) done(results[i]!, i)
      return results
    }, p => progress.push(p))
    expect(serial.status).toBe('draft')
    expect(parallel).toEqual(serial)
    expect(base).toEqual(original)
    expect(progress.filter(p => p.phase === 'simulating').map(p => p.phaseProgress)).toEqual([0, 0.5, 1])
  })
  it('never dispatches an incomplete candidate set', async () => {
    vi.spyOn(synthesis, 'generateMolecularCandidates').mockReturnValue([])
    const executor = vi.fn()
    const result = await runSmartRosterParallel(baseWorkspace(), entries, options, executor)
    expect(result.status).toBe('blocked')
    expect(result.diagnostics.some(d => d.code === 'INSUFFICIENT_UNIQUE_BRANCHES')).toBe(true)
    expect(executor).not.toHaveBeenCalled()
  })
  it('rejects a missing result instead of ranking a partial batch', async () => {
    vi.spyOn(synthesis, 'generateMolecularCandidates').mockImplementation(candidates)
    await expect(runSmartRosterParallel(baseWorkspace(), entries, options, async () => [])).rejects.toThrow('数量不完整')
  })
})
