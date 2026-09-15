import {describe,expect,it} from 'vitest'
import {OPERATORS} from '../domain/operators'
import {createDefaultWorkspace} from '../workbench/defaults'
import {exportMowerJson,importMowerJson,resolveOperatorCharId as id} from '../workbench/compat/mowerJson'
import {compileRosterSchedule} from '../scheduler/compileRosterSchedule'
import {applyCrossRoomTemplate,CROSS_ROOM_TEMPLATES,crossRoomTemplateIssues,type CrossRoomTemplate} from './crossRoomTemplates'
import {buildBackupSnapshot,optimizeBackupEfficiency} from './backupEfficiency'
const owned=OPERATORS.map(o=>({operator:o.name,elitePhase:o.rarity<3?0:o.rarity===3?1:2,level:o.rarity<3?30:o.rarity===3?55:o.rarity===4?70:o.rarity===5?80:90}))
const ordinary=()=>CROSS_ROOM_TEMPLATES.find(t=>t.name==='自动化'&&!crossRoomTemplateIssues(t).length)!
describe('source-defined cross-room shift groups',()=>{
 it('keeps original members, products and synchronization across relocated rooms and Mower roundtrip',()=>{
  const template=ordinary(),base=createDefaultWorkspace(),before=JSON.stringify(base)
  expect(template).toBeDefined()
  const result=applyCrossRoomTemplate(base,owned,template)
  expect(result.workspace,JSON.stringify(result.diagnostics)).not.toBeNull()
  expect(result.selection!.members.map(m=>m.operatorId)).toEqual(template.members.map(m=>id(m.operatorName)))
  expect(new Set(result.selection!.members.map(m=>m.roomId)).size).toBe(2)
  expect(result.selection!.members.map(m=>m.selectedCandidate)).toEqual(template.members.map(m=>id(m.orderedCandidates[0]!)))
  const restored=importMowerJson(exportMowerJson(result.workspace!))
  const group=compileRosterSchedule(restored).rooms.flatMap(r=>r.slots).filter(s=>s.groupId===result.selection!.groupId)
  expect(group).toHaveLength(template.members.length)
  expect(new Set(group.map(m=>m.roomId)).size).toBe(2)
  const backup=buildBackupSnapshot(result.workspace!)
  for(const m of result.selection!.members)expect(backup.mainPlan.facilities[m.roomId].slots[m.slotIndex]!.occupant).toEqual({kind:'operator',operatorId:m.selectedCandidate})
  expect(JSON.stringify(base)).toBe(before)
 })
 it('finds a feasible distinct assignment from ordered shared pools, skipping trade run-order operators',()=>{
  const t=structuredClone(ordinary())
  t.members[0]!.orderedCandidates=['但书','澄闪','炎熔']
  t.members[1]!.orderedCandidates=['火神','泡泡']
  t.members[2]!.orderedCandidates=['火神']
  const result=applyCrossRoomTemplate(createDefaultWorkspace(),owned,t)
  expect(result.selection!.members.map(m=>m.selectedCandidate)).toEqual(['澄闪','泡泡','火神'].map(id))
  expect(result.selection!.members[0]!.orderedCandidates).toEqual(['但书','澄闪','炎熔'].map(id))
  t.members[1]!.orderedCandidates=['火神']
  expect(applyCrossRoomTemplate(createDefaultWorkspace(),owned,t).workspace).toBeNull()
 })
 it('blocks unknown conditional or policy semantics without silently dropping the settings',()=>{
  for(const change of [(t:CrossRoomTemplate)=>t.relatedBackupPlans.push({trigger:'arbitrary()'}),(t:CrossRoomTemplate)=>t.relevantConf={workaholic:['温蒂']},(t:CrossRoomTemplate)=>t.members[0]!.operatorName='Current',(t:CrossRoomTemplate)=>t.members[0]!.orderedCandidates.push('不存在的干员XYZ')]){
   const t=structuredClone(ordinary());change(t)
   const before=JSON.stringify(t)
   expect(applyCrossRoomTemplate(createDefaultWorkspace(),owned,t).workspace).toBeNull()
   expect(JSON.stringify(t)).toBe(before)
  }
  expect(CROSS_ROOM_TEMPLATES.some(t=>t.relatedBackupPlans.length>0)).toBe(true)
 })
 it('requires owned maximum-stage members and backups, compatible rooms and a complete placement budget',()=>{
  const base=createDefaultWorkspace(),t=ordinary()
  expect(applyCrossRoomTemplate(base,owned.filter(o=>o.operator!=='温蒂'),t).workspace).toBeNull()
  expect(applyCrossRoomTemplate(base,owned.map(o=>o.operator==='温蒂'?{...o,elitePhase:0,level:1}:o),t).workspace).toBeNull()
  expect(applyCrossRoomTemplate(base,owned.filter(o=>o.operator!=='澄闪'),t).workspace).toBeNull()
  expect(applyCrossRoomTemplate(base,owned,t,1).workspace).toBeNull()
  for(const room of Object.values(base.mainPlan.facilities))if(room.type==='manufacture')room.product='exp'
  expect(applyCrossRoomTemplate(base,owned,t).workspace).toBeNull()
 })
 it('reserves source-selected cross-room backups throughout efficiency optimization',()=>{
  const result=applyCrossRoomTemplate(createDefaultWorkspace(),owned,ordinary())
  const locks=result.selection!.members.map(m=>`${m.roomId}:${m.slotIndex}`)
  const optimized=optimizeBackupEfficiency(result.workspace!,owned,{maxEvaluations:80,lockedPositions:locks})
  expect(optimized.afterScore).not.toBeNull()
  for(const m of result.selection!.members)expect(optimized.workspace.mainPlan.facilities[m.roomId].slots[m.slotIndex]).toEqual(result.workspace!.mainPlan.facilities[m.roomId].slots[m.slotIndex])
 })
})
