import {resolveOperatorCharId as resolveId} from '../workbench/compat/mowerJson'
import type {RosterWorkspace} from '../workbench/model'
const participants=(w:RosterWorkspace)=>Object.values(w.mainPlan.facilities).flatMap(r=>r.slots.flatMap(s=>[
 ...(s.occupant.kind==='operator'?[resolveId(s.occupant.operatorId)]:[]),...s.replacements.map(resolveId),
]))
/** Coordinated backup snapshot, not a time simulation. Off-duty mains are absent, and Free beds stay empty. */
export function buildBackupSnapshot(workspace:RosterWorkspace):RosterWorkspace {
 const all=participants(workspace)
 if(new Set(all).size!==all.length)throw new Error('主班和候补必须独立且唯一。')
 const snapshot=structuredClone(workspace)
 const seen=new Set<string>()
 for(const room of Object.values(snapshot.mainPlan.facilities))for(const slot of room.slots){
  if(slot.replacements.length>1||slot.replacements.length&&slot.occupant.kind!=='operator')throw new Error('替班快照要求每个普通主班至多一个候补。')
  if(slot.occupant.kind==='operator'){
   const id=resolveId(slot.replacements[0]??slot.occupant.operatorId)
   if(seen.has(id))throw new Error('替班快照含重复占位。')
   seen.add(id);slot.occupant={kind:'operator',operatorId:id}
  }
  slot.replacements=[];slot.groupId=null
 }
 return snapshot
}
