import { afterEach, describe, expect, it } from 'vitest'
import { setTimeout as yieldToRunner } from 'node:timers/promises'
import { OPERATORS } from '../domain/operators'
import { compileOperatorInventory } from '../domain/operatorInventory'
import { createDefaultWorkspace } from '../workbench/defaults'
import { resolveOperatorCharId as id } from '../workbench/compat/mowerJson'
import { rankStaffingCandidates } from './staffingQuality'
import { generateMolecularCandidates } from './molecularSynthesis'
import { validatePhysicalRoster } from './rosterDraft'
import { runSmartRosterParallel } from './smartRoster'
import { buildSingletonFallback } from './singletonFallback'
import { simulateCandidate } from './candidateSimulation'

const low = OPERATORS.map(o => ({ operator: o.name, elitePhase: 0, level: 1 }))
afterEach(() => yieldToRunner(5))
describe('actual-level singleton fallback', () => {
  it('ranks unlocked low-level production skills without assuming promoted skills', () => {
    const inventory = compileOperatorInventory([{operator:'白面鸮',elitePhase:0,level:1}])
    expect(inventory.operators[0]!.matchesMaximumSkills).toBe(false)
    expect(rankStaffingCandidates(createDefaultWorkspace(), inventory, {roomId:'room_1_1',slotIndex:0}, [id('白面鸮')], 'main')).toEqual([id('白面鸮')])
  })
  it('builds complete mains and unique backups from an entirely E0 level 1 pool', async ({annotate}) => {
    await annotate('低练度候选生成')
    const branches = generateMolecularCandidates(createDefaultWorkspace(), low, compileOperatorInventory(low), {branchCount:1})
    expect(branches.length).toBeGreaterThan(0)
    const ws = branches[0]!.workspace
    expect(validatePhysicalRoster(ws)).toEqual([])
    for (const room of Object.values(ws.mainPlan.facilities).filter(r=>['manufacture','trading','power','central'].includes(r.type))) {
      expect(room.slots.every(s=>s.occupant.kind==='operator')).toBe(true)
      expect(room.slots.every(s=>s.replacements.length>0)).toBe(true)
    }
  },120000)
  it('admits ordinary rosters without owning either runner and accepts fewer distinct branches', async ({annotate}) => {
    await annotate('缺少跑单干员的完整准入')
    let count = 0
    const entries = low.filter(o=>!['但书','龙舌兰'].includes(o.operator))
    await runSmartRosterParallel(createDefaultWorkspace(), entries, {branchCount:10}, async jobs=>{
      count=jobs.length
      throw new Error('admission reached')
    }).catch(e=>expect(e.message).toBe('admission reached'))
    expect(count).toBeGreaterThan(0)
  },120000)
  it.each([0,2])('reports a pool of %i operators without inventing or duplicating staff', async count => {
    const result = await runSmartRosterParallel(createDefaultWorkspace(), low.slice(0,count), {}, async()=>{throw new Error('must not simulate')})
    expect(result.status).toBe('blocked')
    expect(result.diagnostics.some(d=>d.code==='INSUFFICIENT_STAFF')).toBe(true)
  },120000)
  it('simulates a low-level fallback without runners and preserves locked staff', async ({annotate}) => {
    await annotate('低练度实际动态模拟')
    const entries=low.filter(o=>!['但书','龙舌兰'].includes(o.operator))
    const base=createDefaultWorkspace()
    base.mainPlan.facilities.central.slots[0]!.occupant={kind:'operator',operatorId:id('阿米娅')}
    const ws=buildSingletonFallback(base,compileOperatorInventory(entries),new Set(['central:0']))!
    expect(ws).not.toBeNull()
    expect(ws.mainPlan.facilities.central.slots[0]).toEqual(base.mainPlan.facilities.central.slots[0])
    const participants=Object.values(ws.mainPlan.facilities).filter(r=>r.type!=='dormitory').flatMap(r=>r.slots.flatMap(s=>[...(s.occupant.kind==='operator'?[id(s.occupant.operatorId)]:[]),...s.replacements.map(id)]))
    expect(new Set(participants).size).toBe(participants.length)
    const result=simulateCandidate({workspace:ws,options:{warmupHours:24,sampleHours:72,operatorInventory:entries,production:{runOrderMode:'ideal',outputMode:'potential',droneTarget:'gold'}},assumptions:{restingThreshold:0.65,operationDurationHours:0}})
    expect(result.completed,JSON.stringify(result.diagnostics)).toBe(true)
    expect(result.simScore).toBeGreaterThan(0)
  },120000)
})
