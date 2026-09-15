import catalog from '../data/mower-cross-room-runtime.json'
import {OPERATORS} from '../domain/operators'
import {compileOperatorInventory,type OwnedOperatorInput} from '../domain/operatorInventory'
import {isShiftRunOperator} from '../scheduler/scheduleAdapter'
import {resolveOperatorCharId as resolveId} from '../workbench/compat/mowerJson'
import type {MowerFacility,MowerFacilityType,MowerProduct,MowerRoomId,RosterWorkspace} from '../workbench/model'
import {validatePhysicalRoster} from './rosterDraft'

export interface CrossRoomMember {roomKey:string;slotIndex:number;operatorName:string;orderedCandidates:string[]}
export interface CrossRoomTemplate {
 id:string;name:string
 rooms:{roomKey:string;facility:MowerFacilityType;product:MowerProduct|null;capacity:number;sourceRoomOperators:string[]}[]
 members:CrossRoomMember[];issues:string[];relevantConf:Record<string,unknown>
 relatedBackupPlans:unknown[];conditionalStates:unknown[]
 sources:{file:string;sourceSha256:string;decodedSha256:string;groupName:string}[]
}
export const CROSS_ROOM_TEMPLATES=catalog.templates as unknown as CrossRoomTemplate[]
const byName=new Map(OPERATORS.map(o=>[o.name,o]))
const special=(name:string)=>!byName.has(name)||isShiftRunOperator(byName.get(name)!.charId)||name==='菲亚梅塔'||name==='孑'
const nonempty=(v:unknown):boolean=>Array.isArray(v)?v.length>0:v!==null&&v!==undefined&&v!==''&&v!==false
/** Admission is deliberately explicit: unsupported scheduling conditions remain in the learned catalog. */
export function crossRoomTemplateIssues(template:CrossRoomTemplate):string[]{
 const issues=[...template.issues]
 if(issues.length)return [...new Set(issues)]
 if(template.relatedBackupPlans.length)issues.push('RELATED_CONDITIONAL_PLAN')
 if(Object.values(template.relevantConf??{}).some(nonempty))issues.push('RELEVANT_POLICY')
 if(template.rooms.length<2||new Set(template.rooms.map(r=>r.roomKey)).size!==template.rooms.length)issues.push('INVALID_ROOM_KEYS')
 if(template.rooms.some(r=>!['manufacture','trading','power','central','contact','meeting','factory','train'].includes(r.facility)||r.product==='fragment'||r.product==='orundum'))issues.push('UNSUPPORTED_ROOM')
 if(!template.rooms.some(r=>r.facility==='manufacture'||r.facility==='trading'))issues.push('NO_PRODUCTION_MEMBER')
 const names=template.members.map(m=>m.operatorName)
 if(new Set(names).size!==names.length||new Set(template.members.map(m=>m.roomKey+':'+m.slotIndex)).size!==names.length)issues.push('DUPLICATE_MEMBER')
 if(template.members.some(m=>m.orderedCandidates.some(n=>!byName.has(n))))issues.push('UNKNOWN_CANDIDATE')
 if(template.members.some(m=>special(m.operatorName)||!m.orderedCandidates.some(n=>!special(n))))issues.push('UNSUPPORTED_MEMBER_OR_POOL')
 for(const member of template.members){
  const room=template.rooms.find(r=>r.roomKey===member.roomKey)
  if(!room||!Number.isInteger(member.slotIndex)||member.slotIndex<0||member.slotIndex>=room.capacity)issues.push('INVALID_MEMBER_SLOT')
 }
 return [...new Set(issues)]
}
export interface CrossRoomPlacement {
 templateId:string;groupId:string;sources:CrossRoomTemplate['sources']
 members:{roomId:MowerRoomId;slotIndex:number;operatorId:string;selectedCandidate:string;orderedCandidates:string[]}[]
}
export interface CrossRoomDraft {
 workspace:RosterWorkspace|null;selection:CrossRoomPlacement|null;statesVisited:number;diagnostics:string[]
}
const roomCapacity=(r:MowerFacility)=>['manufacture','trading'].includes(r.type)?r.level:['central','dormitory'].includes(r.type)?5:['meeting','train'].includes(r.type)?2:1
/** Place one source-defined synchronized group atomically. No co-occurring outsider is invented as a member.
 * The current two-snapshot generator selects one distinct backup per member from the original ordered pool.
 */
export function applyCrossRoomTemplate(base:RosterWorkspace,entries:readonly OwnedOperatorInput[],template:CrossRoomTemplate,maxStates=128):CrossRoomDraft {
 const result:CrossRoomDraft={workspace:null,selection:null,statesVisited:0,diagnostics:[]}
 const fail=(message:string)=>{result.diagnostics.push(message);return result}
 if(!Number.isInteger(maxStates)||maxStates<1||maxStates>100000)return fail('INVALID_BUDGET')
 const issues=crossRoomTemplateIssues(template)
 if(issues.length)return fail(issues.join(';'))
 const inventory=compileOperatorInventory(entries)
 if(!inventory.valid)return fail('INVALID_INVENTORY')
 const owned=new Set(inventory.operators.filter(o=>o.matchesMaximumSkills).map(o=>o.charId))
 const reserved=new Set(Object.values(base.mainPlan.facilities).flatMap(r=>r.slots.flatMap(s=>[...(s.occupant.kind==='operator'?[resolveId(s.occupant.operatorId)]:[]),...s.replacements.map(resolveId)])))
 const mains=template.members.map(m=>byName.get(m.operatorName)!.charId)
 if(mains.some(id=>!owned.has(id)||reserved.has(id)))return fail('MEMBER_UNAVAILABLE')
 mains.forEach(id=>reserved.add(id))
 const pools=template.members.map(m=>m.orderedCandidates.filter(n=>!special(n)).map(n=>byName.get(n)!.charId).filter(id=>owned.has(id)&&!reserved.has(id)))
 if(pools.some(p=>!p.length))return fail('BACKUP_UNAVAILABLE')
 // Ordered DFS retains the earliest feasible joint assignment; no shared candidate is used twice.
 let matched:string[]|null=null
 function match(index:number,selected:string[],used:Set<string>):boolean {
  if(result.statesVisited>=maxStates)return false
  result.statesVisited++
  if(index===pools.length){matched=[...selected];return true}
  for(const id of pools[index]!){if(used.has(id))continue;used.add(id);selected.push(id);if(match(index+1,selected,used))return true;selected.pop();used.delete(id)}
  return false
 }
 if(!match(0,[],new Set()))return fail(result.statesVisited>=maxStates?'BUDGET_EXHAUSTED':'BACKUP_CONFLICT')
 const mapped=new Map<string,MowerRoomId>(),usedRooms=new Set<MowerRoomId>()
 const rooms=Object.values(base.mainPlan.facilities)
 function place(index:number):boolean {
  if(result.statesVisited>=maxStates)return false
  result.statesVisited++
  if(index===template.rooms.length)return true
  const source=template.rooms[index]!,members=template.members.filter(m=>m.roomKey===source.roomKey)
  for(const target of rooms){
   if(usedRooms.has(target.roomId)||target.type!==source.facility||source.product&&target.product!==source.product)continue
   if(source.product==='exp'&&target.level<3||source.capacity>roomCapacity(target))continue
   if(members.some(m=>{const slot=target.slots[m.slotIndex];return !slot||slot.occupant.kind!=='empty'||slot.groupId!==null||slot.replacements.length>0||Object.keys(slot.metadata??{}).length>0}))continue
   usedRooms.add(target.roomId);mapped.set(source.roomKey,target.roomId)
   if(place(index+1))return true
   usedRooms.delete(target.roomId);mapped.delete(source.roomKey)
  }
  return false
 }
 if(!place(0))return fail(result.statesVisited>=maxStates?'BUDGET_EXHAUSTED':'LAYOUT_UNAVAILABLE')
 const workspace=structuredClone(base),existingGroups=new Set(Object.values(workspace.mainPlan.facilities).flatMap(r=>r.slots.map(s=>s.groupId)))
 let groupId=`合集_${template.name}_${template.id.slice(-8)}`
 while(existingGroups.has(groupId))groupId+='_' 
 const selection:CrossRoomPlacement={templateId:template.id,groupId,sources:structuredClone(template.sources),members:[]}
 for(const [index,member]of template.members.entries()){
  const roomId=mapped.get(member.roomKey)!,slot=workspace.mainPlan.facilities[roomId].slots[member.slotIndex]!,operatorId=mains[index]!,selectedCandidate=matched![index]!
  slot.occupant={kind:'operator',operatorId};slot.groupId=groupId;slot.replacements=[selectedCandidate]
  selection.members.push({roomId,slotIndex:member.slotIndex,operatorId,selectedCandidate,orderedCandidates:member.orderedCandidates.map(n=>byName.get(n)!.charId)})
  const present=workspace.compatibility.importedPresentRooms
  if(present&&!present.includes(roomId))present.push(roomId)
 }
 const physical=validatePhysicalRoster(workspace)
 if(physical.length)return fail(physical.map(d=>d.message).join(';'))
 result.workspace=workspace;result.selection=selection
 result.diagnostics.push('按原表跨站组共同换班；从原有序候补中选互不冲突的成员。未复制条件计划或推断工休比。')
 return result
}
