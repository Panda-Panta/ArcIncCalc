import {describe,it,expect} from 'vitest'
import {OPERATOR_MAP} from '../domain/operators'
import type {OwnedOperatorInput} from '../domain/operatorInventory'
import {createDefaultWorkspace} from '../workbench/defaults'
import {resolveOperatorCharId as id} from '../workbench/compat/mowerJson'
import {repairInventorySeed} from './inventorySeed'

const owned=(names:string[]):OwnedOperatorInput[]=>names.map(operator=>{
 const o=OPERATOR_MAP.get(id(operator))!
 return {operator,elitePhase:o.rarity<3?0:o.rarity===3?1:2,level:o.rarity<3?30:o.rarity===3?55:o.rarity===4?70:o.rarity===5?80:90}
})
function fixture(){
 const w=createDefaultWorkspace()
 w.mainPlan.facilities.room_1_1.slots[0]={occupant:{kind:'operator',operatorId:'砾'},groupId:'制造组',replacements:['白雪']}
 w.mainPlan.facilities.dormitory_1.slots[0]!.occupant={kind:'free'}
 return w
}
describe('ordinary inventory seed repair',()=>{
 it('preserves valid source, layout and aliases without mutation',()=>{
  const w=fixture(),before=structuredClone(w),r=repairInventorySeed(w,owned(['砾','白雪']))
  expect(r.status).toBe('unchanged');expect(r.workspace).toEqual(before);expect(r.changes).toEqual([])
  expect(w).toEqual(before);expect(r.workspace).not.toBe(w)
 })
 it('replaces unavailable ordinary main and backup with distinct owned workers',()=>{
  const w=fixture(),before=structuredClone(w),r=repairInventorySeed(w,owned(['斑点','克洛丝']))
  expect(r.status).toBe('repaired');expect(r.changes).toHaveLength(2)
  const slot=r.workspace!.mainPlan.facilities.room_1_1.slots[0]!
  expect(slot.occupant).toEqual({kind:'operator',operatorId:id('斑点')});expect(slot.replacements).toEqual([id('克洛丝')])
  expect(slot.groupId).toBe('制造组');expect(w).toEqual(before)
  expect(r.workspace!.mainPlan.facilities.dormitory_1.slots[0]!.occupant).toEqual({kind:'free'})
 })
 it('repairs unsupported stages without granting new skills',()=>{
  const r=repairInventorySeed(fixture(),[{operator:'砾',elitePhase:0,level:1},...owned(['白雪','斑点'])])
  expect(r.status).toBe('repaired');expect(r.changes.map(c=>c.from)).toEqual(['砾'])
  expect(r.changes[0]!.to).toBe('斑点')
 })
 it('keeps shared backup identity and ordered positions',()=>{
  const w=fixture();w.mainPlan.facilities.room_1_2.slots[0]={occupant:{kind:'operator',operatorId:'芬'},groupId:null,replacements:[id('白雪')]}
  const r=repairInventorySeed(w,owned(['砾','芬','斑点']))
  expect(r.status).toBe('repaired');expect(r.changes).toHaveLength(1);expect(r.changes[0]!.positions).toHaveLength(2)
  expect(r.workspace!.mainPlan.facilities.room_1_2.slots[0]!.replacements).toEqual([id('斑点')])
 })
 it('uses augmenting matching when the first candidate is needed by a second room type',()=>{
  const w=createDefaultWorkspace()
  w.mainPlan.facilities.central.slots[0]!.occupant={kind:'operator',operatorId:'阿米娅'}
  w.mainPlan.facilities.room_1_1.slots[0]!.occupant={kind:'operator',operatorId:'砾'}
  // Manufacture is visited first; move Eunectes to control through an augmenting path.
  const r=repairInventorySeed(w,owned(['森蚺','斑点']))
  expect(r.status).toBe('repaired')
  expect(r.workspace!.mainPlan.facilities.central.slots[0]!.occupant).toEqual({kind:'operator',operatorId:id('森蚺')})
  expect(r.workspace!.mainPlan.facilities.room_1_1.slots[0]!.occupant).toEqual({kind:'operator',operatorId:id('斑点')})
 })
 it('blocks atomically when inventory cannot cover every missing identity',()=>{
  const w=fixture(),before=structuredClone(w),r=repairInventorySeed(w,owned(['斑点']))
  expect(r.status).toBe('blocked');expect(r.workspace).toBeNull();expect(r.changes).toEqual([]);expect(w).toEqual(before)
 })
 it.each(['policy','metadata','fia','run-order','compatibility','context'] as const)('does not rewrite protected %s references',kind=>{
  const w=fixture()
  if(kind==='policy')w.mainPlan.conf.workaholic=['砾']
  if(kind==='metadata')w.mainPlan.facilities.room_1_1.slots[0]!.metadata={custom:true}
  if(kind==='fia'){const slot=w.mainPlan.facilities.dormitory_1.slots[1]!;slot.occupant={kind:'operator',operatorId:'菲亚梅塔'};slot.replacements=['砾']}
  if(kind==='run-order')w.mainPlan.facilities.room_3_1.slots[0]={occupant:{kind:'operator',operatorId:'芬'},groupId:null,replacements:['但书','砾']}
  if(kind==='compatibility')w.compatibility.backupPlans=[{target:'砾'}]
  const r=repairInventorySeed(w,owned(['白雪','斑点','菲亚梅塔','芬','但书']),kind==='context'?{assumptions:{operatorMorale:{[id('砾')]:12}}}:{})
  expect(r.status).toBe('blocked');expect(r.workspace).toBeNull()
 })
 it('does not borrow workers reserved by context or metadata',()=>{
  const w=fixture();w.mainPlan.facilities.factory.slots[0]!.metadata={target:'斑点'}
  expect(repairInventorySeed(w,owned(['砾','斑点'])).status).toBe('blocked')
  expect(repairInventorySeed(w,owned(['砾','斑点']),{assumptions:{idleOperators:['斑点']}}).status).toBe('blocked')
 })
 it('checks external actual participants even when source needs no replacements',()=>{
  const r=repairInventorySeed(fixture(),owned(['砾','白雪']),{resources:{extraWorkplaceOperatorIds:[id('斑点')]}})
  expect(r.status).toBe('blocked');expect(r.diagnostics.some(d=>d.code==='INVENTORY_OPERATOR_NOT_OWNED')).toBe(true)
 })
 it('does not repair auxiliary occupants or allocate into empty slots',()=>{
  const w=createDefaultWorkspace();w.mainPlan.facilities.dormitory_1.slots[0]!.occupant={kind:'operator',operatorId:'流明'}
  expect(repairInventorySeed(w,owned(['闪灵'])).status).toBe('blocked')
  expect(repairInventorySeed(createDefaultWorkspace(),owned(['斑点'])).status).toBe('unchanged')
 })
 it('requires a shared missing backup to support every referenced facility',()=>{
  const w=createDefaultWorkspace()
  w.mainPlan.facilities.room_1_1.slots[0]={occupant:{kind:'operator',operatorId:'砾'},groupId:null,replacements:['芬']}
  w.mainPlan.facilities.room_3_1.slots[0]={occupant:{kind:'operator',operatorId:'梓兰'},groupId:null,replacements:['芬']}
  expect(repairInventorySeed(w,owned(['砾','梓兰','斑点'])).status).toBe('blocked')
  const r=repairInventorySeed(w,owned(['砾','梓兰','斑点','香草']))
  expect(r.status).toBe('repaired');expect(r.changes[0]!.to).toBe('香草')
  expect(r.changes[0]!.positions).toHaveLength(2)
 })
 it('protects seat-addressing opaque strategies even without operator names',()=>{
  const w=fixture();w.mainPlan.conf.custom={room:'room_1_1',index:0}
  expect(repairInventorySeed(w,owned(['白雪','斑点'])).diagnostics.some(d=>d.code==='SEED_OPAQUE_STRATEGY')).toBe(true)
 })
 it('blocks opaque slot metadata that targets a different seat without naming a worker',()=>{
  const w=fixture();w.mainPlan.facilities.factory.slots[0]!.metadata={targetSlot:'room_1_1_0'}
  const r=repairInventorySeed(w,owned(['白雪','斑点']))
  expect(r.status).toBe('blocked');expect(r.diagnostics.some(d=>d.code==='SEED_OPAQUE_STRATEGY')).toBe(true)
 })
 it('rejects duplicate aliases and invalid inventory',()=>{
  const w=fixture();w.mainPlan.facilities.room_1_2.slots[0]!.occupant={kind:'operator',operatorId:id('砾')}
  expect(repairInventorySeed(w,owned(['砾','白雪'])).status).toBe('blocked')
  expect(repairInventorySeed(fixture(),owned(['斑点','斑点'])).status).toBe('blocked')
 })
})
