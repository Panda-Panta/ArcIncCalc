import {OPERATOR_MAP} from '../domain/operators'
import {compileOperatorInventory,type OwnedOperatorInput} from '../domain/operatorInventory'
import type {EfficiencyResources} from '../domain/types'
import type {SimulationAssumptions} from '../scheduler/types'
import {compileRosterSchedule} from '../scheduler/compileRosterSchedule'
import {isShiftRunOperator} from '../scheduler/scheduleAdapter'
import {resolveOperatorCharId as resolveId} from '../workbench/compat/mowerJson'
import type {RosterWorkspace,MowerRoomId} from '../workbench/model'
import {validatePhysicalRoster} from './rosterDraft'
import {validateCatalogScheduleInventory as validateScheduleInventory} from './inventoryAdmission'

export interface InventorySeedContext {
 assumptions?:Partial<SimulationAssumptions>
 resources?:Partial<EfficiencyResources>
}
export interface InventorySeedChange {from:string;to:string;positions:string[]}
export interface InventorySeedResult {
 status:'unchanged'|'repaired'|'blocked'
 workspace:RosterWorkspace|null
 changes:InventorySeedChange[]
 diagnostics:{code:string;message:string}[]
}
const canonical=(value:string)=>resolveId(value.trim())
const display=(id:string)=>OPERATOR_MAP.get(id)?.name??id
const special=(id:string)=>isShiftRunOperator(id)||display(id)==='菲亚梅塔'
const roomTypes={manufacture:'MANUFACTURE',trading:'TRADING',power:'POWER',central:'CONTROL'} as const
interface Reference {roomId:MowerRoomId;slotIndex:number;replacementIndex:number|null;path:string;roomType:string|null;protected:boolean}

/** Build a complete ordinary-staff repair atomically. This admits a seed, not its dynamic income. */
export function repairInventorySeed(workspace:RosterWorkspace,entries:OwnedOperatorInput[],context:InventorySeedContext={}):InventorySeedResult {
 const blocked=(diagnostics:InventorySeedResult['diagnostics']):InventorySeedResult=>({status:'blocked',workspace:null,changes:[],diagnostics})
 const inventory=compileOperatorInventory(entries)
 if(!inventory.valid)return blocked(inventory.diagnostics.map(d=>({code:'INVENTORY_INVALID',message:d.message})))
 const normalized=structuredClone(workspace)
 for(const room of Object.values(normalized.mainPlan.facilities))for(const slot of room.slots){
  if(slot.occupant.kind==='operator')slot.occupant.operatorId=canonical(slot.occupant.operatorId)
  slot.replacements=slot.replacements.map(canonical)
 }
 const errors=validatePhysicalRoster(normalized)
 if(errors.length)return blocked(errors.map(e=>({code:'SEED_INVALID_LAYOUT',message:e.message})))
 const eligible=new Map(inventory.operators.filter(o=>o.matchesMaximumSkills).map(o=>[o.charId,o]))
 const reserved=new Set<string>(),protectedIds=new Set<string>(),references=new Map<string,Reference[]>()
 const protect=(value:unknown):void=>{
  if(typeof value==='string'){
   for(const token of [value,...value.split(/[,，;；\s"'()[\]{}:=<>!&|]+/)]){
    const id=canonical(token)
    if(OPERATOR_MAP.has(id)){reserved.add(id);protectedIds.add(id)}
   }
  }else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){protect(key);protect(child)}
 }
 protect(workspace.mainPlan.conf);protect(workspace.compatibility);protect(context)
 for(const room of Object.values(workspace.mainPlan.facilities))for(const [index,slot] of room.slots.entries()){
  protect(slot.metadata)
  const primary=slot.occupant.kind==='operator'?canonical(slot.occupant.operatorId):null
  const slotProtected=Boolean(slot.metadata&&Object.keys(slot.metadata).length)||Boolean(primary&&special(primary))||slot.replacements.some(id=>special(canonical(id)))
  const roomType=room.type in roomTypes?roomTypes[room.type as keyof typeof roomTypes]:null
  const add=(value:string,replacementIndex:number|null)=>{
   const id=canonical(value);reserved.add(id)
   const list=references.get(id)??[]
   list.push({roomId:room.roomId,slotIndex:index,replacementIndex,path:`${room.roomId}.slots.${index}.${replacementIndex===null?'occupant':`replacements.${replacementIndex}`}`,roomType,protected:slotProtected})
   references.set(id,list)
   if(slotProtected)protectedIds.add(id)
  }
  if(primary)add(primary,null)
  slot.replacements.forEach(add)
 }
 const missing=[...references.keys()].filter(id=>!eligible.has(id))
 const diagnostics:InventorySeedResult['diagnostics']=[]
 // Opaque strategies may address seats rather than names, so name scanning alone is insufficient.
 const knownConf=new Set(['ling_xi','exhaust_require','rest_in_full','resting_priority','workaholic','refresh_trading','refresh_drained','ope_resting_priority'])
 const opaque=Object.values(workspace.mainPlan.facilities).some(room=>room.slots.some(slot=>slot.metadata&&Object.keys(slot.metadata).length>0))||Object.keys(workspace.mainPlan.conf).some(key=>!knownConf.has(key))||workspace.compatibility.backupPlans.length>0||[workspace.compatibility.unrecognizedFields,workspace.compatibility.unrecognizedRooms,workspace.compatibility.facilityMetadata].some(value=>value&&Object.keys(value).length>0)
 if(missing.length&&opaque)diagnostics.push({code:'SEED_OPAQUE_STRATEGY',message:'排班含尚未解释的策略或兼容字段，不能自动改写其中可能引用的工位；请先明确这些策略。'})
 for(const id of missing){
  const refs=references.get(id)!
  if(protectedIds.has(id)||special(id)||refs.some(r=>r.protected||!r.roomType)||refs.some(r=>!OPERATOR_MAP.get(id)?.skills.some(s=>s.roomType===r.roomType))){
   diagnostics.push({code:'SEED_PROTECTED_OPERATOR',message:`${display(id)}：缺员或技能阶段不支持，且涉及特殊策略、显式联动、辅助设施或非普通设施技能，不能自动替换。`})
  }
 }
 if(diagnostics.length)return blocked(diagnostics)
 const available=inventory.operators.filter(o=>o.matchesMaximumSkills&&!reserved.has(o.charId)&&!special(o.charId))
 const pools=new Map(missing.map(id=>[id,available.filter(o=>references.get(id)!.every(r=>o.skills.some(s=>s.roomType===r.roomType))).map(o=>o.charId)]))
 const allocation=new Map<string,string>(),owner=new Map<string,string>()
 // Maximum bipartite matching preserves one replacement identity across all its references.
 const match=(id:string,seen:Set<string>):boolean=>{
  const pool=pools.get(id)!
  for(const candidate of pool)if(!seen.has(candidate)&&!owner.has(candidate)){
   seen.add(candidate);owner.set(candidate,id);allocation.set(id,candidate);return true
  }
  for(const candidate of pool){
   if(seen.has(candidate))continue
   seen.add(candidate)
   const previous=owner.get(candidate)!
   if(match(previous,seen)){owner.set(candidate,id);allocation.set(id,candidate);return true}
  }
  return false
 }
 for(const id of missing)if(!match(id,new Set()))diagnostics.push({code:'SEED_INSUFFICIENT_OPERATORS',message:`${display(id)}：没有足够的未占用且技能阶段受支持的替代干员覆盖所有对应设施。`})
 if(diagnostics.length)return blocked(diagnostics)
 const repaired=structuredClone(workspace),changes:InventorySeedChange[]=[]
 for(const [from,to] of allocation){
  const refs=references.get(from)!
  for(const ref of refs){
   const slot=repaired.mainPlan.facilities[ref.roomId].slots[ref.slotIndex]!
   if(ref.replacementIndex===null)slot.occupant={kind:'operator',operatorId:to}
   else slot.replacements[ref.replacementIndex]=to
  }
  changes.push({from:display(from),to:display(to),positions:refs.map(ref=>ref.path)})
 }
 const validationCopy=structuredClone(repaired)
 for(const room of Object.values(validationCopy.mainPlan.facilities))for(const slot of room.slots){
  if(slot.occupant.kind==='operator')slot.occupant.operatorId=canonical(slot.occupant.operatorId)
  slot.replacements=slot.replacements.map(canonical)
 }
 const finalErrors=validatePhysicalRoster(validationCopy)
 if(finalErrors.length)return blocked(finalErrors.map(e=>({code:'SEED_INVALID_LAYOUT',message:e.message})))
 const schedule=compileRosterSchedule(repaired,context.assumptions)
 const compileErrors=schedule.diagnostics.filter(d=>d.severity==='error')
 if(compileErrors.length)return blocked(compileErrors.map(d=>({code:d.code,message:d.message})))
 const admission=validateScheduleInventory(schedule,inventory,context.resources)
 if(!admission.valid)return blocked(admission.diagnostics)
 return {status:changes.length?'repaired':'unchanged',workspace:repaired,changes,diagnostics:[]}
}
