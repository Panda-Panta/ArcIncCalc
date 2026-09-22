import { it, expect } from 'vitest'
import entries from './fixtures/mixed-level-inventory.json'
import { createDefaultWorkspace } from '../workbench/defaults'
import { runSmartRoster } from './smartRoster'

it('validates mixed actual levels through 24h warmup and 72h dynamic roster simulation', async ({annotate}) => {
  await annotate('实际练度完整模拟回归')
  const result=runSmartRoster(createDefaultWorkspace(),entries,{branchCount:1,enableDeepSearch:false})
  expect(result.status).toBe('draft')
  expect(result.score).toBeGreaterThan(0)
},120000)
