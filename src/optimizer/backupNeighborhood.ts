import {OPERATOR_MAP} from '../domain/operators'
import {compileOperatorInventory,type OwnedOperatorInput} from '../domain/operatorInventory'
import {isShiftRunOperator} from '../scheduler/scheduleAdapter'
import {resolveOperatorCharId as resolveId} from '../workbench/compat/mowerJson'
import type {RosterWorkspace,MowerRoomId,MowerFacilityType,MowerSlot} from '../workbench/model'
import {CANDIDATE_FACILITY_TYPES,validatePhysicalRoster} from './rosterDraft'

export interface BackupNeighbor {
 label:string;workspace:RosterWorkspace
 move:{kind:'replace'|'reorder'|'exchange';positions:string[]}
}
interface Position {roomId:MowerRoomId;type:MowerFacilityType;index:number;key:string;slot:MowerSlot}
interface Change {kind:BackupNeighbor['move']['kind'];label:string;edits:{position:Position;index:number;value:string}[]}
const roomTypes=new Map(Object.entries(CANDIDATE_FACILITY_TYPES).map(([game,type])=>[type,game]))
const name=(id:string)=>OPERATOR_MAP.get(resolveId(id))?.name??id
function* roundRobin<T>(streams:Generator<T>[]):Generator<T> {
 const active=[...streams]
 while(active.length){const stream=active.shift()!,next=stream.next();if(!next.done){active.push(stream);yield next.value}}
}
/** Canonical IDs are used for validation only; untouched imported text is preserved. */
function physical(workspace:RosterWorkspace):boolean {
 const check=structuredClone(workspace)
 for(const room of Object.values(check.mainPlan.facilities))for(const slot of room.slots){
  if(slot.occupant.kind==='operator')slot.occupant.operatorId=resolveId(slot.occupant.operatorId)
  slot.replacements=slot.replacements.map(resolveId)
 }
 return validatePhysicalRoster(check).length===0
}
function fingerprint(workspace:RosterWorkspace):string {
 return JSON.stringify(Object.values(workspace.mainPlan.facilities).map(room=>[room.roomId,room.slots.map(slot=>slot.replacements.map(resolveId))]))
}
/** Bounded ordinary-backup moves, fairly interleaved across move types and positions. */
export function generateBackupNeighbors(workspace:RosterWorkspace,entries:OwnedOperatorInput[],limit=20,options:{reorder?:boolean;exchange?:boolean}={}):BackupNeighbor[] {
 if(!Number.isSafeInteger(limit)||limit<0||limit>21)throw new Error('邻域预算须为 0–21 的整数')
 if(options.reorder!==undefined&&typeof options.reorder!=='boolean'||options.exchange!==undefined&&typeof options.exchange!=='boolean')throw new Error('邻域动作开关须为布尔值')
 const inventory=compileOperatorInventory(entries)
 if(!inventory.valid)throw new Error('无效的干员库')
 if(limit===0||!physical(workspace))return []
 const rooms=Object.values(workspace.mainPlan.facilities),protectedIds=new Set<string>(),reserved=new Set<string>()
 for(const room of rooms)for(const slot of room.slots){
  if(slot.occupant.kind==='operator')reserved.add(resolveId(slot.occupant.operatorId))
  slot.replacements.forEach(id=>reserved.add(resolveId(id)))
  if(slot.occupant.kind==='operator'&&name(slot.occupant.operatorId)==='菲亚梅塔')slot.replacements.forEach(id=>protectedIds.add(resolveId(id)))
 }
 const protect=(value:unknown):void=>{if(typeof value==='string'){const id=resolveId(value);protectedIds.add(id);reserved.add(id)}else if(value&&typeof value==='object')Object.values(value).forEach(protect)}
 protect(workspace.mainPlan.conf)
 const special=(id:string)=>isShiftRunOperator(id)||name(id)==='菲亚梅塔'
 const positions:Position[]=[]
 for(const room of rooms){
  if(!['manufacture','trading','power','central','contact','meeting'].includes(room.type))continue
  room.slots.forEach((slot,index)=>{
   if(slot.occupant.kind!=='operator'||special(slot.occupant.operatorId)||protectedIds.has(resolveId(slot.occupant.operatorId))||slot.metadata&&Object.keys(slot.metadata).length)return
   // Even a later special candidate changes literal replacement[0] run-order semantics.
   if(slot.replacements.some(id=>special(id)||protectedIds.has(resolveId(id))))return
   positions.push({roomId:room.roomId,type:room.type,index,key:`${room.roomId}_${index}`,slot})
  })
 }
 const owned=new Map(inventory.operators.map(o=>[o.charId,o]))
 const qualified=(id:string,type:MowerFacilityType)=>{const o=owned.get(resolveId(id));return Boolean(o?.matchesMaximumSkills&&o.skills.some(s=>s.roomType===roomTypes.get(type)))}
 const unused=inventory.operators.filter(o=>o.matchesMaximumSkills&&!reserved.has(o.charId)&&!special(o.charId))
 function* replacements(p:Position):Generator<Change>{
  const pool=unused.filter(o=>qualified(o.charId,p.type))
  const indices=p.slot.replacements.length?p.slot.replacements.map((_,i)=>i):[0]
  for(const o of pool)for(const index of indices)yield {kind:'replace',label:`${p.roomId} 第 ${p.index+1} 位候补 ${index+1} → ${o.name}`,edits:[{position:p,index,value:o.charId}]}
 }
 function* reorders(p:Position):Generator<Change>{
  for(let i=0;i<p.slot.replacements.length-1;i++){
   const a=p.slot.replacements[i]!,b=p.slot.replacements[i+1]!
   if(resolveId(a)===resolveId(b)||!qualified(a,p.type)||!qualified(b,p.type))continue
   yield {kind:'reorder',label:`${p.roomId} 第 ${p.index+1} 位候补顺序：${name(a)} ↔ ${name(b)}`,edits:[{position:p,index:i,value:b},{position:p,index:i+1,value:a}]}
  }
 }
 function* exchanges(a:Position,b:Position):Generator<Change>{
  for(let i=0;i<a.slot.replacements.length;i++)for(let j=0;j<b.slot.replacements.length;j++){
   const x=a.slot.replacements[i]!,y=b.slot.replacements[j]!,xi=resolveId(x),yi=resolveId(y)
   if(xi===yi||!qualified(x,a.type)||!qualified(y,b.type))continue
   if(a.slot.replacements.some((id,k)=>k!==i&&resolveId(id)===yi)||b.slot.replacements.some((id,k)=>k!==j&&resolveId(id)===xi))continue
   yield {kind:'exchange',label:`${a.roomId} 第 ${a.index+1} 位与 ${b.roomId} 第 ${b.index+1} 位互换候补：${name(x)} ↔ ${name(y)}`,edits:[{position:a,index:i,value:y},{position:b,index:j,value:x}]}
  }
 }
 const exchangeStreams:Generator<Change>[]=[]
 if(options.exchange!==false)for(let distance=1;distance<positions.length;distance++)for(let i=0;i+distance<positions.length;i++){
  const a=positions[i]!,b=positions[i+distance]!
  if(a.type===b.type)exchangeStreams.push(exchanges(a,b))
 }
 const streams=[roundRobin(positions.map(replacements))]
 if(options.reorder!==false)streams.push(roundRobin(positions.map(reorders)))
 if(options.exchange!==false)streams.push(roundRobin(exchangeStreams))
 const results:BackupNeighbor[]=[],seen=new Set([fingerprint(workspace)])
 for(const change of roundRobin(streams)){
  const copy=structuredClone(workspace)
  for(const edit of change.edits)copy.mainPlan.facilities[edit.position.roomId].slots[edit.position.index]!.replacements[edit.index]=edit.value
  const key=fingerprint(copy)
  if(seen.has(key)||!physical(copy))continue
  seen.add(key);results.push({label:change.label,workspace:copy,move:{kind:change.kind,positions:[...new Set(change.edits.map(e=>e.position.key))]}})
  if(results.length===limit)break
 }
 return results
}