import {OPERATOR_MAP} from '../domain/operators'
import {resolveOperatorCharId as id} from '../workbench/compat/mowerJson'
import {MOWER_OUTPUT_ROOM_IDS,type RosterWorkspace} from '../workbench/model'
import {projectRosterOutput} from './rosterProjection'
import {buildBackupSnapshot} from './backupSnapshot'

export interface FixedDutyRow {
 roomId:string;mainScore:number;backupScore:number;ratio:number|null;weightedScore:number|null;rankingScore:number|null;specialOperators:string[]
}
export interface FixedDutyEstimate {
 ratio:number;mainScore:number;backupScore:number;weightedScore:number|null;rankingScore:number|null
 ordinaryWeightedScore:number|null;rows:FixedDutyRow[];specialOperators:string[];complete:boolean;diagnostics:string[]
}
/** Description routing only; this is not a morale-rate interpreter. */
export function hasConsumptionSkill(value:string):boolean {
 const operator=OPERATOR_MAP.get(id(value))
 return !operator||operator.name==='歌蕾蒂娅'||operator.skills.some(skill=>/心情[^。；;]{0,30}消耗|消耗[^。；;]{0,15}心情/.test(skill.description.replace(/<[^>]*>/g,'')))
}
/** Coordinated snapshots for combination screening, never a Mower time simulation. */
export function estimateFixedDuty(workspace:RosterWorkspace,ratio=.775):FixedDutyEstimate {
 if(!Number.isFinite(ratio)||ratio<.75||ratio>.8)throw new Error('普通主班参考占比须为75%–80%')
 const main=projectRosterOutput(workspace),backup=projectRosterOutput(buildBackupSnapshot(workspace))
 return combineDutySnapshots(workspace,main,backup,ratio)
}
/** Combine already projected snapshots without spending another projection budget. */
export function combineDutySnapshots(workspace:RosterWorkspace,main:ReturnType<typeof projectRosterOutput>,backup:ReturnType<typeof projectRosterOutput>,ratio=.775):FixedDutyEstimate {
 if(!Number.isFinite(ratio)||ratio<.75||ratio>.8)throw new Error('普通主班参考占比须为75%–80%')
 const complete=main.complete&&backup.complete
 const specials=(values:string[])=>[...new Set(values.filter(hasConsumptionSkill).map(value=>OPERATOR_MAP.get(id(value))?.name??value))]
 const participants=Object.values(workspace.mainPlan.facilities).flatMap(room=>room.slots.flatMap(slot=>slot.occupant.kind==='operator'?[slot.occupant.operatorId,...slot.replacements.slice(0,1)]:[]))
 const specialOperators=specials(participants)
 const activeRooms=MOWER_OUTPUT_ROOM_IDS.filter(key=>['manufacture','trading','power'].includes(workspace.mainPlan.facilities[key].type))
 const rows=main.rooms.map((room,index)=>{
  const roomId=activeRooms[index]!
  // Cross-room production can depend on special staff elsewhere. Until their schedules are
  // specified, conservatively propagate the uncertainty instead of weighting their effects.
  const rowSpecialOperators=[...specialOperators]
  const other=backup.rooms.find(r=>r.roomId===room.roomId)!
  const weightedScore=!complete||rowSpecialOperators.length?null:room.daily.score*ratio+other.daily.score*(1-ratio)
  // Undefined duty fractions never get 77.5%; the lower snapshot is only a ranking heuristic.
  return {roomId,mainScore:room.daily.score,backupScore:other.daily.score,ratio:rowSpecialOperators.length?null:ratio,weightedScore,rankingScore:complete?(weightedScore??Math.min(room.daily.score,other.daily.score)):null,specialOperators:rowSpecialOperators}
 })
 return {ratio,mainScore:main.daily.score,backupScore:backup.daily.score,weightedScore:complete&&!specialOperators.length?rows.reduce((n,r)=>n+r.weightedScore!,0):null,
  rankingScore:complete?rows.reduce((n,r)=>n+r.rankingScore!,0):null,ordinaryWeightedScore:complete?rows.reduce((n,r)=>n+(r.weightedScore??0),0):null,rows,specialOperators,complete,
  diagnostics:[...new Set([...main.diagnostics,...backup.diagnostics,...(specialOperators.length?['特殊心情技能工休比待定；跨站影响暂按全表未知传播，各站不强行加权。用各站主替两个快照较低值参与搭配排序，该分值不是日均预测。']:[]),
   '普通岗位按设定主班占比作两快照参考；跨站与中枢状态分别重算，未推导混合换班时序、休息人数及特殊干员工休比。无人机不折价。'])]}
}
