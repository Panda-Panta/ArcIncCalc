import { expect, it } from 'vitest'
import { createDefaultWorkspace } from '../workbench/defaults'
import { simulateCandidate } from './candidateSimulation'
import { generateMolecularCandidates } from './molecularSynthesis'
import { compileOperatorInventory } from '../domain/operatorInventory'
import { OPERATORS } from '../domain/operators'

it('rejects an automatic scoring job carrying backup plans', () => {
  const workspace = createDefaultWorkspace()
  workspace.compatibility.backupPlans = [{ name: 'must not execute', trigger: 'True' }]
  const result = simulateCandidate({ workspace, options: {}, assumptions: {} })
  expect(result.completed).toBe(false)
  expect(result.diagnostics).toContain('AUTOMATIC_BACKUP_PLANS_FORBIDDEN')
})

it('generates only main-plan candidates without mutating the source', () => {
  const workspace = createDefaultWorkspace()
  workspace.compatibility.backupPlans = [{ name: 'retained in source', trigger: 'True' }]
  const before = structuredClone(workspace)
  const entries = OPERATORS.map(o => ({ operator: o.name, elitePhase: (o.rarity < 3 ? 0 : o.rarity === 3 ? 1 : 2) as 0 | 1 | 2, level: o.rarity < 3 ? 30 : o.rarity === 3 ? 55 : o.rarity === 4 ? 70 : o.rarity === 5 ? 80 : 90 }))
  const candidates = generateMolecularCandidates(workspace, entries, compileOperatorInventory(entries), { branchCount: 1 })
  expect(candidates.length).toBeGreaterThan(0)
  for (const c of candidates) expect(c.workspace.compatibility.backupPlans).toEqual([])
  expect(workspace).toEqual(before)
}, 120000)
