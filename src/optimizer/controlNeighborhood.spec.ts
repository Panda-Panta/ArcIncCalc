import {describe,it,expect} from 'vitest'
import {OPERATORS,OPERATOR_MAP} from '../domain/operators'
import {compileOperatorInventory,type OwnedOperatorInput} from '../domain/operatorInventory'
import {createDefaultWorkspace} from '../workbench/defaults'
import {resolveOperatorCharId as id} from '../workbench/compat/mowerJson'
import {validatePhysicalRoster} from './rosterDraft'
import {generateControlMainNeighbors} from './controlNeighborhood'

const owned=(names:string[]):OwnedOperatorInput[]=>names.map(operator=>{
 const o=OPERATOR_MAP.get(id(operator))!
 return {operator,elitePhase:o.rarity<3?0:o.rarity===3?1:2,level:o.rarity<3?30:o.rarity===3?55:o.rarity===4?70:o.rarity===5?80:90}
})
const allOwned=owned(OPERATORS.map(o=>o.name))
function fixture(){
 const w=createDefaultWorkspace()
 w.name='保留导入名称';w.compatibility.sourceVersion='source-v1'
 w.mainPlan.facilities.central.slots[0]={occupant:{kind:'operator',operatorId:'阿米娅'},groupId:'联合组',replacements:['杜宾']}
 w.mainPlan.facilities.central.slots[1]={occupant:{kind:'operator',operatorId:id('陈')},groupId:'第二组',replacements:[]}
 return w
}
describe('protected control main neighborhood',()=>{
 it('changes exactly one occupied central main and preserves source, groups, backups and other raw text',()=>{
  const w=fixture(),before=structuredClone(w),results=generateControlMainNeighbors(w,owned(['诗怀雅','凯尔希']),4)
  expect(results).toHaveLength(4)
  expect(results.map(n=>n.move.positions)).toEqual([['central_0'],['central_1'],['central_0'],['central_1']])
  expect(results.map(n=>n.workspace.mainPlan.facilities.central.slots[Number(n.move.positions[0]!.split('_')[1])]!.occupant))
   .toEqual(['凯尔希','凯尔希','诗怀雅','诗怀雅'].map(operator=>({kind:'operator',operatorId:id(operator)})))
  for(const n of results){
   expect(n.move.kind).toBe('control-main')
   expect(validatePhysicalRoster(n.workspace)).toEqual([])
   const copy=structuredClone(n.workspace),index=Number(n.move.positions[0]!.split('_')[1])
   copy.mainPlan.facilities.central.slots[index]!.occupant=structuredClone(before.mainPlan.facilities.central.slots[index]!.occupant)
   expect(copy).toEqual(before)
  }
  expect(w).toEqual(before)
 })
 it('requires owned maximum skills with an actual CONTROL skill',()=>{
  const w=fixture(),entries=[...owned(['砾','诗怀雅']),{operator:'凯尔希',elitePhase:0,level:1}]
  expect(compileOperatorInventory(entries).operators.find(o=>o.name==='凯尔希')!.matchesMaximumSkills).toBe(false)
  const results=generateControlMainNeighbors(w,entries)
  expect(results).toHaveLength(2)
  for(const n of results){
   const index=Number(n.move.positions[0]!.split('_')[1]),occupant=n.workspace.mainPlan.facilities.central.slots[index]!.occupant
   expect(occupant).toEqual({kind:'operator',operatorId:id('诗怀雅')})
   expect(OPERATOR_MAP.get(id('诗怀雅'))!.skills.some(s=>s.roomType==='CONTROL')).toBe(true)
  }
 })
 it('reserves existing mains and backups across every facility using names and IDs',()=>{
  const w=fixture()
  w.mainPlan.facilities.meeting.slots[0]!.occupant={kind:'operator',operatorId:'诗怀雅'}
  w.mainPlan.facilities.factory.slots[0]!.replacements=[id('凯尔希')]
  expect(generateControlMainNeighbors(w,owned(['阿米娅','陈','杜宾','诗怀雅','凯尔希']))).toEqual([])
 })
 it.each(['conf','conf-comma','fia','slot-metadata','metadata-reference','backup-plan','compatibility-key','explicit','special-backup'])('protects referenced mains and policy slots: %s',kind=>{
  const w=fixture(),slot=w.mainPlan.facilities.central.slots[0]!
  if(kind==='conf')w.mainPlan.conf.custom={target:id('阿米娅')}
  if(kind==='conf-comma')w.mainPlan.conf.custom='陈, 阿米娅'
  if(kind==='fia'){const f=w.mainPlan.facilities.dormitory_1.slots[0]!;f.occupant={kind:'operator',operatorId:id('菲亚梅塔')};f.replacements=['阿米娅']}
  if(kind==='slot-metadata')slot.metadata={unknown:true}
  if(kind==='metadata-reference')w.mainPlan.facilities.factory.slots[0]!.metadata={target:'阿米娅'}
  if(kind==='backup-plan')w.compatibility.backupPlans=[{trigger:'op("阿米娅") == 0'}]
  if(kind==='compatibility-key')w.compatibility.unrecognizedFields={linked:{[id('阿米娅')]:true}}
  if(kind==='special-backup')slot.replacements=['杜宾','但书']
  const results=generateControlMainNeighbors(w,owned(['诗怀雅']),20,kind==='explicit'?[id('阿米娅')]:[])
  expect(results.every(n=>n.move.positions[0]!=='central_0')).toBe(true)
  for(const n of results)expect(n.workspace.mainPlan.facilities.central.slots[0]).toEqual(slot)
  if(kind!=='conf-comma')expect(results).toHaveLength(1)
 })
 it.each(['policy','fia','metadata','backup-plan','explicit'])('does not recruit staff already referenced outside regular assignments: %s',kind=>{
  const w=fixture()
  if(kind==='policy')w.mainPlan.conf.custom='凯尔希,诗怀雅'
  if(kind==='fia'){const f=w.mainPlan.facilities.dormitory_1.slots[0]!;f.occupant={kind:'operator',operatorId:'菲亚梅塔'};f.replacements=['诗怀雅']}
  if(kind==='metadata')w.compatibility.facilityMetadata={central:{operator:'诗怀雅'}}
  if(kind==='backup-plan')w.compatibility.backupPlans=[{plan:{central:[{agent:id('诗怀雅')}]}}]
  expect(generateControlMainNeighbors(w,owned(['诗怀雅']),20,kind==='explicit'?['诗怀雅']:[])).toEqual([])
 })
 it('keeps a slot fixed when its ordinary backup is referenced by policy',()=>{
  const w=fixture();w.mainPlan.conf.rest_in_full=[id('杜宾')]
  const results=generateControlMainNeighbors(w,owned(['诗怀雅']))
  expect(results.map(n=>n.move.positions)).toEqual([['central_1']])
 })
 it('does not populate empty slots or reinterpret unresolved Current slots',()=>{
  const w=createDefaultWorkspace()
  expect(generateControlMainNeighbors(w,allOwned)).toEqual([])
  w.mainPlan.facilities.central.slots[0]!.occupant={kind:'current'}
  expect(generateControlMainNeighbors(w,allOwned)).toEqual([])
 })
 it('rejects physical duplicate aliases, invalid inventories and invalid budgets',()=>{
  const w=fixture();w.mainPlan.facilities.meeting.slots[0]!.occupant={kind:'operator',operatorId:id('阿米娅')}
  expect(generateControlMainNeighbors(w,allOwned)).toEqual([])
  for(const limit of [-1,22,NaN,1.5])expect(()=>generateControlMainNeighbors(fixture(),allOwned,limit)).toThrow()
  expect(()=>generateControlMainNeighbors(fixture(),owned(['诗怀雅',id('诗怀雅')]))).toThrow('无效的干员库')
  expect(()=>generateControlMainNeighbors(fixture(),[{operator:'未知',elitePhase:2,level:90}])).toThrow('无效的干员库')
 })
 it('is bounded, deterministic and unique without mutating the input inventory',()=>{
  const w=fixture(),before=structuredClone(allOwned),a=generateControlMainNeighbors(w,allOwned,21)
  expect(a).toHaveLength(21)
  expect(a).toEqual(generateControlMainNeighbors(w,allOwned,21))
  expect(new Set(a.map(n=>JSON.stringify(n.workspace))).size).toBe(21)
  expect(generateControlMainNeighbors(w,allOwned,0)).toEqual([])
  expect(allOwned).toEqual(before)
 })
})
