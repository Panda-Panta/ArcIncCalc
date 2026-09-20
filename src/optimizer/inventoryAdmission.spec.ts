import { describe, expect, it } from 'vitest'
import { compileOperatorInventory } from '../domain/operatorInventory'
import { compileRosterSchedule } from '../scheduler/compileRosterSchedule'
import { createDefaultWorkspace } from '../workbench/defaults'
import { simulateSchedule } from '../simulator/scheduleSimulation'
import { admitCombinationCandidates, validateScheduleInventory } from './inventoryAdmission'

describe('inventory admission before scoring', () => {
  it('separates missing ownership from a locked required buff', () => {
    const inventory = compileOperatorInventory([{operator:'温蒂',elitePhase:0,level:1},{operator:'清流',elitePhase:1,level:1}])
    const candidate = admitCombinationCandidates(inventory).find(c => c.candidate.id === 'manu-gold-weedy-purestream')!
    expect(candidate.status).toBe('skills-locked')
    expect(candidate.lockedSkills.map(s => s.buffId)).toContain('manu_prod_spd&power[020]')
    expect(candidate.candidate.isFullyOwned).toBe(true)
    expect(admitCombinationCandidates(compileOperatorInventory([])).every(c => c.status === 'missing-operators')).toBe(true)
  })
  it('never labels an owned maximum-stage combination as a feasible optimal roster', () => {
    const inv = compileOperatorInventory([{operator:'温蒂',elitePhase:2,level:1},{operator:'清流',elitePhase:1,level:1}])
    expect(admitCombinationCandidates(inv).find(c => c.candidate.id === 'manu-gold-weedy-purestream')!.status).toBe('needs-context')
  })
  it('checks ordinary substitutes, dedicated run candidates, Fiammetta targets and idle operators', () => {
    const ws=createDefaultWorkspace()
    ws.mainPlan.facilities.room_1_1.slots=[{occupant:{kind:'operator',operatorId:'砾'},groupId:null,replacements:['清流']}]
    ws.mainPlan.facilities.room_3_1.slots=[{occupant:{kind:'operator',operatorId:'芬'},groupId:null,replacements:['但书']}]
    ws.mainPlan.facilities.dormitory_1.slots=[{occupant:{kind:'operator',operatorId:'菲亚梅塔'},groupId:null,replacements:['温蒂']}]
    const schedule=compileRosterSchedule(ws,{idleOperators:['Lancet-2']})
    const admission=validateScheduleInventory(schedule,compileOperatorInventory([]))
    expect(admission.diagnostics.map(d=>d.operatorName).sort()).toEqual(['砾','清流','芬','但书','菲亚梅塔','温蒂','Lancet-2'].sort())
  })
  it('uses unlocked low-stage skills and retains maximum behavior when inventory is omitted', () => {
    const ws=createDefaultWorkspace()
    ws.mainPlan.facilities.room_1_1.slots=[{occupant:{kind:'operator',operatorId:'砾'},groupId:null,replacements:[]}]
    const schedule=compileRosterSchedule(ws)
    const low=simulateSchedule(schedule,{sampleHours:1,operatorInventory:[{operator:'砾',elitePhase:0,level:1}],production:{}})
    expect(low.success).toBe(true)
    expect(low.elapsedHours).toBe(1)
    expect(low.production).toBeDefined()
    expect(low.diagnostics.some(d=>d.code==='INVENTORY_SKILL_STAGE_UNSUPPORTED')).toBe(false)
    const high=simulateSchedule(schedule,{sampleHours:1,operatorInventory:[{operator:'砾',elitePhase:1,level:1}]})
    expect(high.success).toBe(true)
    expect(high.rooms).toEqual(simulateSchedule(schedule,{sampleHours:1}).rooms)
  })
})

it('checks personnel override inputs and ignores unrelated morale metadata', () => {
  const schedule=compileRosterSchedule(createDefaultWorkspace(),{operatorMorale:{unrelated:12}})
  const empty=compileOperatorInventory([])
  expect(validateScheduleInventory(schedule,empty).valid).toBe(true)
  const gravel=compileOperatorInventory([{operator:'砾',elitePhase:1,level:1}]).operators[0]!.charId
  const low=simulateSchedule(schedule,{sampleHours:1,operatorInventory:[],efficiencyResources:{extraWorkplaceOperatorIds:[gravel],trainingOperatorIds:[gravel]}})
  expect(low.success).toBe(false)
  expect(low.diagnostics.filter(d=>d.code==='INVENTORY_OPERATOR_NOT_OWNED')).toHaveLength(1)
})

it.each(['但书','杜林'])('simulates low-stage %s with their actual unlocked skills',name=>{
 const ws=createDefaultWorkspace()
 ws.mainPlan.facilities.room_3_1.slots=[{occupant:{kind:'operator',operatorId:'芬'},groupId:null,replacements:name==='但书'?['但书']:[]}]
 const schedule=compileRosterSchedule(ws,name==='杜林'?{idleOperators:['杜林']}:{})
 const r=simulateSchedule(schedule,{sampleHours:1,operatorInventory:[{operator:'芬',elitePhase:1,level:1},{operator:name,elitePhase:0,level:29}],production:{}})
 expect(r.success).toBe(true)
 expect(r.elapsedHours).toBe(1)
 expect(r.diagnostics.some(d=>d.code==='INVENTORY_SKILL_STAGE_UNSUPPORTED')).toBe(false)
})
