import type {AppConfig} from '../domain/types'
import {OPERATOR_MAP} from '../domain/operators'
import {projectControlOutput,type ControlProjection} from './controlImpact'

export interface CombinationSnapshotValue {
 complete:boolean;efficiencyBonusPerOperator:number;equivalentEfficiencyPerOperator:number;scoreGainPerOperator:number;dailyScore:number
}
export interface CombinationPriority {
 withoutControl:CombinationSnapshotValue;withControl:CombinationSnapshotValue
 controlGain:number;controlCount:number;operatorCount:number;supportCount:number;groupKey:string;diagnostics:string[]
}
function validate(config:AppConfig):void {
 const occupied=new Set<string>(),rooms=new Set<string>()
 const check=(ids:readonly string[],capacity:number)=>{
  if(ids.length>capacity)throw new Error('组合超过设施工位容量')
  for(const id of ids){if(!OPERATOR_MAP.has(id))throw new Error('组合含未知干员');if(occupied.has(id))throw new Error('组合中同一干员重复占位');occupied.add(id)}
 }
 for(const room of config.rooms){
  if(rooms.has(room.id))throw new Error('组合房间标识重复');rooms.add(room.id)
  if(![1,2,3].includes(room.level)||room.operatorCount!==room.operatorIds.length)throw new Error('设施等级或实际人数无效')
  if(room.skillBonus!==0||room.specialOrder!=='none'||room.quality!=='normal')throw new Error('组合初筛只使用干员实际技能，不能叠加手填效率或订单覆盖')
  check(room.operatorIds,room.type==='power'?1:room.level)
 }
 check(config.controlOperatorIds,5)
 if(config.dormitoryOccupantCount!==config.facilityOperatorIds.dormitories.flat().length)throw new Error('宿舍人数须来自实际占位')
 const resourceKeys=['manufacturePerceptionInformation','tradingPerceptionInformation','additionalGoldProductionLines','monsterCuisine','worldlyFireworks','suiFacilities'] as const
 if(resourceKeys.some(key=>config.efficiencyResources[key]!==0))throw new Error('组合支持资源须由实际设施与干员推导，不能使用手填资源')
 for(const ids of config.facilityOperatorIds.dormitories)check(ids,5)
 check(config.facilityOperatorIds.reception,2);check(config.facilityOperatorIds.office,1)
 check(config.facilityOperatorIds.training,2);check(config.facilityOperatorIds.workshop,1)
 // Presence and its opportunity cost must be tied to actual facilities.
 if(config.efficiencyResources.extraWorkplaceOperatorIds.length)throw new Error('组合优先级需要实际设施占位，不能使用额外在场名单')
 if(config.efficiencyResources.trainingOperatorIds.some(id=>!config.facilityOperatorIds.training.includes(id)))throw new Error('训练支持须实际入驻训练室')
}
const total=(p:ControlProjection,ids:ReadonlySet<string>)=>p.rooms.filter(r=>ids.has(r.roomId)).reduce((n,r)=>n+r.daily.score,0)
/** Instantaneous screening: the facility 100% base is never attributed to a worker. */
export function evaluateCombinationPriority(config:AppConfig,targetRoomIds:readonly string[]):CombinationPriority {
 validate(config)
 const target=new Set(targetRoomIds),rooms=config.rooms.filter(r=>target.has(r.id))
 if(!target.size||target.size!==targetRoomIds.length||rooms.length!==target.size)throw new Error('需要唯一且存在的目标生产设施')
 const groupKey=[...new Set(rooms.map(r=>r.type+':'+(r.type==='manufacture'?r.product:r.type==='trading'?r.strategy:'drone')))].sort().join('|')
 if(new Set(rooms.map(r=>r.type)).size!==1)throw new Error('人均效率只比较同类型生产设施；跨类型支持须单列')
 const operatorCount=rooms.reduce((n,r)=>n+r.operatorIds.length,0)
 if(!operatorCount)throw new Error('目标设施至少需要一名干员')
 const noControl=structuredClone(config);noControl.controlOperatorIds=[]
 const empty=structuredClone(noControl)
 for(const room of empty.rooms)if(target.has(room.id)){room.operatorIds=[];room.operatorCount=0;room.powerStaffed=false}
 const absent=projectControlOutput(empty),without=projectControlOutput(noControl),withControl=projectControlOutput(config)
 const value=(p:ControlProjection):CombinationSnapshotValue=>({
  complete:p.complete&&absent.complete,
  efficiencyBonusPerOperator:p.rooms.filter(r=>target.has(r.roomId)).reduce((n,r)=>n+r.efficiencyPercent-100,0)/operatorCount,
  // Trading reward transformations belong to the worker, even without a speed increase.
  equivalentEfficiencyPerOperator:p.rooms.filter(r=>target.has(r.roomId)).reduce((n,r)=>{const base=absent.rooms.find(b=>b.roomId===r.roomId)!.daily.score;return n+(base>0?(r.daily.score/base-1)*100:r.efficiencyPercent-100)},0)/operatorCount,
  scoreGainPerOperator:(total(p,target)-total(absent,target))/operatorCount,dailyScore:total(p,target),
 })
 const outside=config.rooms.filter(r=>!target.has(r.id)).flatMap(r=>r.operatorIds),f=config.facilityOperatorIds
 // Includes all explicitly present non-control background/support personnel.
 const supportCount=new Set([...outside,...f.dormitories.flat(),...f.reception,...f.office,...f.training,...f.workshop]).size
 return {withoutControl:value(without),withControl:value(withControl),controlGain:withControl.daily.score-without.daily.score,
  controlCount:config.controlOperatorIds.length,operatorCount,supportCount,groupKey,
  diagnostics:[...new Set([...absent.diagnostics,...without.diagnostics,...withControl.diagnostics])],
 }
}
export interface ControlPackageProposal {id:string;config:AppConfig;targetRoomIds:string[];conditionsVerified:boolean}
export interface ControlPackagePriority {
 id:string;status:'preferred'|'local-not-better'|'net-not-better'|'conditional'|'ineligible'
 local:CombinationPriority;reference:CombinationPriority;netDailyGain:number;netControlGain:number;productionGainWithoutControl:number;reasons:string[]
}
/** Compare whole configurations, charging the lost benefit of displaced central staff. */
export function rankControlPackages(baseline:AppConfig,proposals:readonly ControlPackageProposal[]):ControlPackagePriority[] {
 validate(baseline)
 const layout=(c:AppConfig)=>JSON.stringify({rooms:c.rooms.map(r=>[r.id,r.type,r.level,r.product,r.strategy]),facilities:c.facilities})
 const base=projectControlOutput(baseline),baseEmpty=structuredClone(baseline);baseEmpty.controlOperatorIds=[]
 const noBase=projectControlOutput(baseEmpty)
 return proposals.map(proposal=>{
  if(layout(proposal.config)!==layout(baseline))throw new Error('中枢组合比较须保持相同布局、等级与配方')
  const local=evaluateCombinationPriority(proposal.config,proposal.targetRoomIds),reference=evaluateCombinationPriority(baseline,proposal.targetRoomIds)
  const candidate=projectControlOutput(proposal.config),without=structuredClone(proposal.config);without.controlOperatorIds=[]
  const noCandidate=projectControlOutput(without)
  const netDailyGain=candidate.daily.score-base.daily.score
  const netControlGain=local.controlGain-(base.daily.score-noBase.daily.score)
  const productionGainWithoutControl=noCandidate.daily.score-noBase.daily.score
  let status:ControlPackagePriority['status']='preferred'
  const reasons=[...new Set([...local.diagnostics,...reference.diagnostics])]
  if(!local.withControl.complete||!reference.withoutControl.complete||!base.complete)status='ineligible'
  else if(local.withControl.equivalentEfficiencyPerOperator<=reference.withoutControl.equivalentEfficiencyPerOperator+1e-8)status='local-not-better'
  else if(netDailyGain<=1e-8)status='net-not-better'
  else if(!proposal.conditionsVerified)status='conditional'
  return {id:proposal.id,status,local,reference,netDailyGain,netControlGain,productionGainWithoutControl,reasons}
 }).sort((a,b)=>{
  const order={preferred:0,conditional:1,'net-not-better':2,'local-not-better':3,ineligible:4}
  return order[a.status]-order[b.status]||b.netDailyGain-a.netDailyGain||b.netControlGain-a.netControlGain||a.id.localeCompare(b.id)
 })
}
