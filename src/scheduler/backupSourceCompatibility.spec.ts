import { describe, expect, it } from 'vitest'
import { createDefaultWorkspace } from '../workbench/defaults'
import { compileRosterSchedule } from './compileRosterSchedule'
import { compiledScheduleToRuntimeConfig } from './scheduleAdapter'
import { createRosterRuntime } from './rosterRuntime'
import { backupParticipants, createBackupPlanController, evaluateBackupExpression } from './backupPlans'
import { resolveOperatorCharId as id, exportMowerJson } from '../workbench/compat/mowerJson'
import { simulateSchedule } from '../simulator/scheduleSimulation'
import { runScheduleSimulationBridge } from '../workbench/scheduleSimulationBridge'
import { createProductionTimeline } from '../simulator/productionTimeline'
import { runRosterIncomeSearch } from '../optimizer/rosterIncomeSearch'

function setup(trigger: unknown, overrides: Record<string, unknown> = {}) {
  const workspace = createDefaultWorkspace()
  workspace.mainPlan.facilities.room_1_1.slots = [{ occupant: { kind: 'operator', operatorId: id('砾') }, groupId: null, replacements: [id('芬')] }]
  workspace.compatibility.backupPlans = [{ name: '源码兼容', trigger, plan: {}, conf: {}, ...overrides }]
  const schedule = compileRosterSchedule(workspace)
  const state = createRosterRuntime(compiledScheduleToRuntimeConfig(schedule))
  return { workspace, schedule, state }
}

describe('local Mower expression and backup contracts', () => {
  it.each([
    [{left:"op_data.operators['砾'].current_mood()",operator:'>4',right:''}, true],
    [{left:'',operator:'',right:''}, false],
    [{left:"not op_data.operators['砾'].is_resting()",operator:'',right:''}, true],
    [{left:"op_data.operators['砾'].current_room",operator:'==',right:"'room_1_1'"}, true],
    [{left:'4',operator:'<',right:"op_data.operators['砾'].current_mood() < 25"}, true],
    [{left:'2 + 3 * 4',operator:'==',right:'14'}, true],
    [{left:'False and (1 / 0)',operator:'or',right:'True'}, true],
    [{left:'False',operator:'==',right:'(not True)'}, true],
  ])('evaluates serialized Mower expression %j', (trigger, expected) => {
    const {state} = setup(trigger)
    expect(evaluateBackupExpression(trigger, state)).toBe(expected)
  })
  it('skips the whole external-condition plan, including mixed OR, and preserves its raw export', () => {
    const {workspace,schedule,state} = setup({left:'op_data.party_time is None',operator:'or',right:'True'}, {plan:{room_1_1:{plans:[{agent:'不存在的干员',replacement:[]}]}}})
    const before=exportMowerJson(workspace)
    expect(backupParticipants(workspace)).toEqual([])
    const controller=createBackupPlanController(schedule,state)
    controller.evaluate('END')
    expect(controller.active).toEqual([false])
    expect(controller.diagnostics).toContainEqual(expect.objectContaining({code:'BACKUP_EXTERNAL_CONDITION_SKIPPED'}))
    expect(exportMowerJson(workspace)).toBe(before)
  })
  it('does not treat unknown production conditions or executable text as ignorable', () => {
    for(const expression of ["op_data.operators['砾'].unknown()",'globalThis.process.exit()',"__import__('os').system('echo unsafe')"]){
      const {schedule,state}=setup(expression)
      expect(()=>createBackupPlanController(schedule,state)).toThrow()
    }
  })
  it('does not mistake a quoted external name for an external condition', () => {
    const {state}=setup('False')
    expect(evaluateBackupExpression("'op_data.party_time' == 'op_data.party_time'",state)).toBe(true)
  })
  it('rejects deep or oversized expressions without executing imported code', () => {
    const {state}=setup('False')
    expect(()=>evaluateBackupExpression('('.repeat(100)+'True'+')'.repeat(100),state)).toThrow(/限制/)
    expect(()=>evaluateBackupExpression('True '.repeat(5000),state)).toThrow(/限制/)
    expect(()=>evaluateBackupExpression('1 / 0',state)).toThrow(/有限数/)
  })
  it('exposes skipped plans in the actual simulation report', () => {
    const {schedule}=setup({left:'op_data.party_time',operator:'is',right:'None'})
    const report=simulateSchedule(schedule,{sampleHours:.1})
    expect(report.success).toBe(true)
    expect(report.diagnostics).toContainEqual(expect.objectContaining({code:'BACKUP_EXTERNAL_CONDITION_SKIPPED'}))
  })
  it('skipping an external plan leaves the same physical simulation as omitting it', () => {
    const {workspace,schedule}=setup({left:'op_data.party_time',operator:'is',right:'None'}, {task:{room_1_1:['不存在的干员']}})
    const options={sampleHours:2,recordSegments:true,production:{outputMode:'potential' as const,runOrderMode:'ideal' as const,droneTarget:'none' as const}}
    const skipped=simulateSchedule(schedule,options)
    workspace.compatibility.backupPlans=[]
    const baseline=simulateSchedule(compileRosterSchedule(workspace),options)
    expect(skipped.success&&baseline.success).toBe(true)
    expect(skipped.events).toEqual(baseline.events)
    expect(skipped.operators).toEqual(baseline.operators)
    expect(skipped.segments).toEqual(baseline.segments)
    expect(skipped.production).toEqual(baseline.production)
  })
  it('blocks legacy natural run-order requests through both engine and bridge', () => {
    const {workspace,schedule,state}=setup('False')
    const options=JSON.parse('{"sampleHours":1,"production":{"runOrderMode":"natural"}}')
    expect(()=>simulateSchedule(schedule,options)).toThrow(/自然跑单.*禁用/)
    const result=runScheduleSimulationBridge(workspace,options)
    expect(result.report).toBeNull()
    expect(result.error).toMatch(/自然跑单.*禁用/)
    expect(()=>createProductionTimeline(schedule,state,options.production,0,()=>{},()=>{})).toThrow(/自然跑单.*禁用/)
    expect(()=>runRosterIncomeSearch({baseline:workspace,inventory:[],options})).toThrow(/自然跑单.*禁用/)
  })
})
