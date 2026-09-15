import type {AppConfig,RoomType,SpecialOrder} from '../domain/types'
import {OPERATOR_MAP} from '../domain/operators'
import {buildRiicGlobalContext} from '../engine/globalContext'
import {evaluateOperators} from '../engine/operatorRules'
import type {TimeContext} from '../engine/timeDependentSkills'
import {captureOrder,getOrderDistribution,type OrderMode,type SpecialCapture} from '../rules/orderRules'
import {MANUFACTURING_FORMULAS} from '../simulator/manufacturingTimeline'

export interface ControlDailyValue {exp:number;goldValue:number;orderFaceValue:number;score:number}
export interface ControlRoomProjection {
 roomId:string;type:RoomType;efficiencyPercent:number;daily:ControlDailyValue;details:string[];diagnostics:string[]
}
export interface ControlProjection {
 rooms:ControlRoomProjection[];daily:ControlDailyValue;activeControlCount:number
 baseMoraleReductionPerHour:number;powerBonusPercent:number;complete:boolean;diagnostics:string[]
}
export interface ControlImpactDelta {
 daily:ControlDailyValue;rooms:{roomId:string;efficiencyPoints:number}[]
 baseMoraleReductionPerHour:number;powerBonusPercent:number
}
export interface ControlImpactOptions {timeContext?:TimeContext}
export interface ControlImpactAnalysis {
 baseline:ControlProjection
 members:{operatorId:string;operatorName:string;without:ControlProjection;delta:ControlImpactDelta}[]
 withoutAll:{projection:ControlProjection;delta:ControlImpactDelta}
 assumptions:string[]
}
export interface ControlConfigurationComparison {
 baseline:ControlProjection;candidate:ControlProjection;delta:ControlImpactDelta;assumptions:string[]
}
const zero=():ControlDailyValue=>({exp:0,goldValue:0,orderFaceValue:0,score:0})
const score=(value:ControlDailyValue)=>{value.score=value.exp+.8*value.goldValue+.2*value.orderFaceValue;return value}
const assumptions=[
 '当前配置的恒定效率折算为每日连续期望产出；不是实际离散完成数，也不是经过工休模拟的长期产出。',
 '评分 = EXP + 0.8 × 赤金产量 × 500 + 0.2 × 订单面值；不使用赤金净库存、订单到账金额或赤金消耗抵扣。',
 '假定材料足够、无容量停机并及时收取；不强制消耗无人机，充能百分点单列，不折入产出评分。',
 '心情采用当前快照；缺少工作时长时暖机采用静态解释器默认值。暖机和中枢减耗对工休、休息与在岗率的影响须另跑时间模拟。',
 '移除中枢干员同时移除其基建在场条件和每名有效中枢干员 0.05/h 的基础减耗；这是配置移除边际，不是孤立的技能数值。',
 '同类取最高和组队联动使逐人移除边际不可相加；应比较完整中枢备选配置，带中枢支持的组合不预设优于其他组合。',
]
function otherOccupants(config:AppConfig):Set<string>{
 const f=config.facilityOperatorIds
 return new Set([...config.rooms.flatMap(r=>r.operatorIds),...f.dormitories.flat(),...f.reception,...f.workshop,...f.office,...f.training,
  ...config.efficiencyResources.extraWorkplaceOperatorIds,...config.efficiencyResources.trainingOperatorIds])
}
function validateControl(config:AppConfig,ids:readonly string[]):void {
 if(ids.length>5||new Set(ids).size!==ids.length)throw new Error('中枢名单超过五人或含重复干员')
 const occupied=otherOccupants(config)
 for(const id of ids){if(!OPERATOR_MAP.has(id))throw new Error(`未知中枢干员：${id}`);if(occupied.has(id))throw new Error(`中枢干员已占据其他设施：${OPERATOR_MAP.get(id)!.name}`)}
}
function specialCapture(special:SpecialOrder):SpecialCapture {
 switch(special){
  case 'provisoAlpha':return {proviso:1}
  case 'provisoBeta':return {proviso:2}
  case 'tequilaAlpha':return {tequila:1}
  case 'tequilaBeta':return {tequila:2}
  case 'uofficial':return {uOfficial:true}
  case 'closure':return {closure:true}
  case 'pepe':return {pepe:true}
  default:return {}
 }
}
export function projectControlOutput(config:AppConfig,options:ControlImpactOptions={}):ControlProjection {
 validateControl(config,config.controlOperatorIds)
 const present=new Set([...config.controlOperatorIds,...otherOccupants(config)])
 const active=new Set([...present].filter(id=>!config.zeroMoraleOperatorIds.includes(id)&&(config.operatorMorale[id]??24)>0))
 const morale=new Map([...present].map(id=>[id,config.zeroMoraleOperatorIds.includes(id)?0:config.operatorMorale[id]??24]))
 const context=buildRiicGlobalContext(config,active,morale)
 const diagnostics:string[]=[]
 for(const id of present)if(!OPERATOR_MAP.has(id))diagnostics.push(`未知在场干员：${id}`)
 const rooms:ControlRoomProjection[]=config.rooms.map(room=>{
  const result=evaluateOperators(room,config,active,morale,context,options.timeContext)
  const daily=zero(),issues=result.unquantifiedSkills.map(s=>`${room.id}：未量化 ${s}`)
  const efficiency=result.efficiencyPercent/100
  if(!Number.isFinite(efficiency)||efficiency<0)issues.push(`${room.id}：效率无效`)
  else if(room.type==='manufacture'){
   if(room.product==='fragment')issues.push(`${room.id}：源石碎片不在当前评分公式中，未折价`)
   else{
    const formula=MANUFACTURING_FORMULAS[room.product==='exp'?'exp-medium':'gold']
    if(room.level<formula.requiredRoomLevel)issues.push(`${room.id}：设施等级不足以生产所选配方`)
    else {const n=1440*efficiency/formula.baseMinutes*formula.batchSize;if(room.product==='exp')daily.exp=n*1000;else daily.goldValue=n*500}
   }
  }else if(room.type==='trading'){
   if(room.strategy==='orundum')issues.push(`${room.id}：合成玉不在当前评分公式中，未折价`)
   else if(result.specialOrder==='shiftRun')issues.push(`${room.id}：跑单需要换人时刻与等待过程，静态投影未计算该站订单价值`)
   else try{
    const mode:OrderMode=result.specialOrder==='pepe'?'pepe':result.specialOrder==='closure'?'closure':'gold'
    const distribution=getOrderDistribution(room.level,result.quality,mode)
    const completed=distribution.map(base=>captureOrder(base,specialCapture(result.specialOrder),0))
    const minutes=completed.reduce((n,o)=>n+o.probability*o.baseMinutes/(o.efficiencyAffected?efficiency:1),0)
    const reward=completed.reduce((n,o)=>n+o.probability*o.lmdReward,0)
    daily.orderFaceValue=minutes===Infinity?0:1440*reward/minutes
   }catch(error){issues.push(`${room.id}：订单规则无法量化：${String(error)}`)}
  }
  score(daily);diagnostics.push(...issues)
  return {roomId:room.id,type:room.type,efficiencyPercent:result.efficiencyPercent,daily,details:result.details,diagnostics:issues}
 })
 const daily=zero()
 for(const room of rooms){daily.exp+=room.daily.exp;daily.goldValue+=room.daily.goldValue;daily.orderFaceValue+=room.daily.orderFaceValue}
 const activeControlCount=config.controlOperatorIds.filter(id=>active.has(id)).length
 return {rooms,daily:score(daily),activeControlCount,baseMoraleReductionPerHour:activeControlCount*.05,
  powerBonusPercent:rooms.filter(r=>r.type==='power').reduce((n,r)=>n+r.efficiencyPercent-100,0),
  complete:diagnostics.length===0,diagnostics:[...new Set(diagnostics)]}
}
const project=projectControlOutput
function subtract(a:ControlProjection,b:ControlProjection):ControlImpactDelta {
 return {daily:{exp:a.daily.exp-b.daily.exp,goldValue:a.daily.goldValue-b.daily.goldValue,orderFaceValue:a.daily.orderFaceValue-b.daily.orderFaceValue,score:a.daily.score-b.daily.score},
  rooms:a.rooms.map(room=>({roomId:room.roomId,efficiencyPoints:room.efficiencyPercent-b.rooms.find(r=>r.roomId===room.roomId)!.efficiencyPercent})),
  baseMoraleReductionPerHour:a.baseMoraleReductionPerHour-b.baseMoraleReductionPerHour,powerBonusPercent:a.powerBonusPercent-b.powerBonusPercent}
}
/** Leave-one-out changes are baseline minus removal, and are deliberately not additive. */
export function analyzeControlImpact(config:AppConfig,options:ControlImpactOptions={}):ControlImpactAnalysis {
 const base=structuredClone(config),baseline=project(base,options)
 const members=base.controlOperatorIds.map(operatorId=>{
  const altered=structuredClone(base);altered.controlOperatorIds=altered.controlOperatorIds.filter(id=>id!==operatorId)
  const without=project(altered,options)
  return {operatorId,operatorName:OPERATOR_MAP.get(operatorId)!.name,without,delta:subtract(baseline,without)}
 })
 const empty=structuredClone(base);empty.controlOperatorIds=[]
 const projection=project(empty,options)
 return {baseline,members,withoutAll:{projection,delta:subtract(baseline,projection)},assumptions:[...assumptions]}
}
/** Candidate minus original: compare an actual occupied-slot opportunity, not only an empty control room. */
export function compareControlConfigurations(config:AppConfig,ids:readonly string[],options:ControlImpactOptions={}):ControlConfigurationComparison {
 const base=structuredClone(config),altered=structuredClone(config);altered.controlOperatorIds=[...ids]
 const baseline=project(base,options),candidate=project(altered,options)
 return {baseline,candidate,delta:subtract(candidate,baseline),assumptions:[...assumptions]}
}
