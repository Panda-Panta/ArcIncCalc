import { backupParticipants, createBackupPlanController } from '../scheduler/backupPlans'
import { inventoryOperatorRecords, operatorFor, hasOperatorSkill } from '../domain/operatorContext'
import {createProductionTimeline,type ProductionOptions,type ProductionReport,type ProductionFrame} from './productionTimeline'
import {createDefaultConfig,createRoom} from '../domain/defaults'
import {OPERATOR_MAP} from '../domain/operators'
import {compileOperatorInventory,type OwnedOperatorInput} from '../domain/operatorInventory'
import {validateScheduleInventory} from '../optimizer/inventoryAdmission'
import type {AppConfig,EfficiencyResources} from '../domain/types'
import {currentMoraleRates} from '../engine/morale'
import {evaluateDormitoryRecovery} from '../engine/dormitoryRecovery'
import {evaluateOperators} from '../engine/operatorRules'
import {buildRiicGlobalContext} from '../engine/globalContext'
import {getTemporalSkillBoundaries} from '../engine/timeDependentSkills'
import type {CompiledSchedule} from '../scheduler/types'
import {compiledScheduleToRuntimeConfig} from '../scheduler/scheduleAdapter'
import {advanceRoster,createRosterRuntime,MORALE_EPSILON,nextRosterEventHours,nextRosterActionHours,settleRoster,moraleDerivative,type RuntimeState,type RuntimeRates,type RuntimeEvent} from '../scheduler/rosterRuntime'

export interface ScheduleSimulationProgress {
 phase:'warmup'|'sampling'; elapsedHours:number; totalHours:number; warmupHours:number
}
export interface ScheduleSimulationOptions {
 operatorInventory?:OwnedOperatorInput[]
 production?:ProductionOptions
 sampleHours?:number; warmupHours?:number; maxStepHours?:number; maxEvents?:number
 warmupModel?:'continuous'|'hourly'; recordSegments?:boolean
 consumptionOverrides?:Record<string,number>; recoveryOverrides?:Record<string,number>
 atmosphereByRoom?:Record<string,number>; recoveryTargetByProvider?:Record<string,string>
 initialWorkHours?:Record<string,number>; efficiencyResources?:Partial<EfficiencyResources>
}
export interface SimulatedOperator {
 operatorId:string; operatorName:string; mainWorkHours:number; substituteWorkHours:number
 workHours:number; exhaustedHours:number; restHours:number; idleHours:number
 /** Measured occupancy of the explicit permanent primary slot. */
 permanentPrimaryOccupancyHours?:number
 workFraction:number; workRestRatio:number|null; initialMorale:number; finalMorale:number
}
export interface SimulatedRoom {
 roomId:string; roomType:string; averageEfficiencyPercent:number; efficiencyPercentHours:number
 occupiedHours:number; teams:{operatorIds:string[]; hours:number; fraction:number}[]
}
export interface ScheduleSegment {start:number;end:number;occupants:Record<string,string>;bedOccupants:Record<string,string>;morale:Record<string,number>;efficiencyPercent:Record<string,number>}
export interface ScheduleSimulationReport {
 schemaVersion:1; engine:'mower-morale-v1'; success:boolean; elapsedHours:number; observedHours:number
 inputs:{schedule:CompiledSchedule;options:ScheduleSimulationOptions}
 assumptions:{sampleHours:number;warmupHours:number;maxStepHours:number;warmupModel:'continuous'|'hourly';restingThreshold:number;operationDurationHours:0;dormAtmosphere:string;singleRecoveryTarget:string}
 production?:ProductionReport
 operators:SimulatedOperator[];rooms:SimulatedRoom[];events:RuntimeEvent[];segments:ScheduleSegment[]
 diagnostics:{code:string;message:string}[]
 shiftDeferrals?:{key:string;operatorIds:string[];blockedAt:number;resolvedAt?:number}[]
}
const EPS=MORALE_EPSILON
const numericKeys=['sampleHours','warmupHours','maxStepHours','maxEvents'] as const

/** Pure occupancy projection. Empty Free slots have no operator and create no global resources. */
export function projectScheduleState(schedule:CompiledSchedule,state:RuntimeState):AppConfig {
 const c=createDefaultConfig()
 const occupants=(roomId:string)=>{
  const room=schedule.rooms.find(r=>r.roomId===roomId)!
  return room.slots.map(slot=>state.occupants[`${roomId}_${slot.slotIndex}`]??state.bedOccupants[`${roomId}_${slot.slotIndex}`]??'')
 }
 c.planName=schedule.sourceWorkspace.name
 c.rooms=schedule.rooms.filter(r=>['manufacture','trading','power'].includes(r.type)).map(r=>{
  const room=createRoom(r.roomId,r.type as 'manufacture'|'trading'|'power')
  room.level=r.level as 1|2|3;room.operatorIds=occupants(r.roomId).filter(Boolean);room.operatorCount=room.operatorIds.length
  if(['gold','exp','fragment'].includes(r.product??''))room.product=r.product as 'gold'|'exp'|'fragment'
  room.strategy=r.product==='orundum'?'orundum':'gold';room.specialOrder='none';room.powerStaffed=room.operatorCount>0
  return room
 })
 const dorms=schedule.rooms.filter(r=>r.type==='dormitory')
 c.facilities.dormitories=dorms.map(r=>r.level as 1|2|3|4|5)
 c.facilityOperatorIds.dormitories=dorms.map(r=>occupants(r.roomId).filter(Boolean))
 c.dormitoryOccupantCount=c.facilityOperatorIds.dormitories.reduce((n,ids)=>n+ids.length,0)
 c.controlOperatorIds=schedule.rooms.filter(r=>r.type==='central').flatMap(r=>occupants(r.roomId).filter(Boolean))
 const auxiliary={meeting:'reception',contact:'office',train:'training',factory:'workshop'} as const
 for(const [type,key] of Object.entries(auxiliary)) {
  const room=schedule.rooms.find(r=>r.type===type)
  c.facilityOperatorIds[key]=room?occupants(room.roomId).filter(Boolean):[]
  if(room)c.facilities[key]=room.level as 1|2|3
 }
 c.efficiencyResources.trainingOperatorIds=[...c.facilityOperatorIds.training]
 c.operatorMorale={...state.morale}
 // Dormitory skills continue during recovery, including the instant of entering at zero.
 const working=state.config.positions.filter(p=>!p.dormitory).map(p=>state.occupants[p.id]!)
 c.zeroMoraleOperatorIds=working.filter(id=>(state.morale[id]??24)<=0)
 c.workaholicOperatorIds=[...(schedule.policies.workaholic??[])]
 return c
}

/** Integrates rates over actual joint rosters. This reports efficiency and duty, not order/resource settlement. */
export function simulateSchedule(schedule:CompiledSchedule,options:ScheduleSimulationOptions={},onProgress?:(progress:ScheduleSimulationProgress)=>void):ScheduleSimulationReport {
 schedule=structuredClone(schedule)
 const sampleHours=options.sampleHours??336,warmupHours=options.warmupHours??0,maxStepHours=options.maxStepHours??.25,maxEvents=options.maxEvents??200000
 const values={sampleHours,warmupHours,maxStepHours,maxEvents}
 for(const key of numericKeys)if(!Number.isFinite(values[key]) || (key==='warmupHours'?values[key]<0:values[key]<=0))throw new Error(`Invalid ${key}`)
 if(!Number.isSafeInteger(maxEvents)||!Number.isFinite(sampleHours+warmupHours))throw new Error('Invalid simulation horizon/event limit')
 for(const [kind,table] of Object.entries({consumption:options.consumptionOverrides,recovery:options.recoveryOverrides,initialWorkHours:options.initialWorkHours,atmosphere:options.atmosphereByRoom}))for(const value of Object.values(table??{}))if(!Number.isFinite(value)||(kind!=='consumption'&&value<0))throw new Error(`Invalid ${kind} override`)
 const warmupModel=options.warmupModel??'continuous'
 if(!['continuous','hourly'].includes(warmupModel))throw new Error('Invalid warmup model')
 const report:ScheduleSimulationReport={schemaVersion:1,engine:'mower-morale-v1',success:false,elapsedHours:0,observedHours:0,
  assumptions:{sampleHours,warmupHours,maxStepHours,warmupModel,restingThreshold:schedule.assumptions.restingThreshold??.65,operationDurationHours:0,dormAtmosphere:'各宿舍默认等级上限；可逐室覆盖',singleRecoveryTarget:'默认选择槽位顺序第一个未满且符合条件的干员；可显式覆盖'},
  inputs:{schedule:structuredClone(schedule),options:structuredClone(options)},operators:[],rooms:[],events:[],segments:[],diagnostics:[]}
 const diagnostic=(code:string,message:string)=>{if(!report.diagnostics.some(d=>d.code===code&&d.message===message))report.diagnostics.push({code,message})}
 for(const d of schedule.diagnostics)diagnostic(d.code,d.message)
 if(schedule.diagnostics.some(d=>d.severity==='error'||d.code==='UNKNOWN_OPERATOR'))return report
 const inventory=options.operatorInventory===undefined?undefined:compileOperatorInventory(options.operatorInventory)
 const operatorRecords=inventory?inventoryOperatorRecords(inventory):undefined
 if(inventory){
  try {
   const ids=backupParticipants(schedule.sourceWorkspace)
   const owned=new Set(inventory.operators.map(op=>op.charId))
   const missing=ids.filter(id=>!owned.has(id))
   if(missing.length){diagnostic('BACKUP_INVENTORY_MISSING',missing.map(id=>OPERATOR_MAP.get(id)?.name??id).join('、'));return report}
  } catch(error){diagnostic('INVALID_BACKUP_PLAN',String(error));return report}
  const admission=validateScheduleInventory(schedule,inventory,options.efficiencyResources)
  for(const d of admission.diagnostics)diagnostic(d.code,d.message)
  if(!admission.valid)return report
 }
 if(schedule.assumptions.elitePhase!==2){diagnostic('SKILL_STAGE_UNSUPPORTED','当前动态模拟使用已校对的最高基建技能；较低精英阶段尚未编译');return report}
 if(schedule.assumptions.operationDurationHours!==0){diagnostic('OPERATION_DURATION_UNSUPPORTED','当前模拟仅支持忽略换人操作耗时');return report}
 if(schedule.runOrderPolicies.length&&!options.production)diagnostic('ORDER_LIFECYCLE_NOT_SIMULATED','保留跑单配置；本报告统计日常班组效率，尚未模拟每单插入干员、收单与资源结算')
 diagnostic('TIME_INTEGRATION_MODEL',`使用${warmupModel==='hourly'?'整小时':'连续'}暖机，最大步长 ${maxStepHours} h；复制取整等非线性效率采用区间中点数值积分，可缩小步长检查敏感性`)
 diagnostic('SINGLE_RECOVERY_TARGET_ASSUMPTION','单体恢复目标为显式模拟策略；多个合格目标时默认槽位顺序，并非已确认的游戏随机目标规则')
 let state:RuntimeState
 let backups:ReturnType<typeof createBackupPlanController> | undefined
 try{
  const runtimeConfig=compiledScheduleToRuntimeConfig(schedule)
  // Ideal runners are virtual order modifiers. Keep explicit primary/idle placements,
  // but do not register virtual candidates as extra dorm residents or morale workers.
  if(options.production&&(options.production.runOrderMode??'ideal')==='ideal')runtimeConfig.runOrderPolicies=[]
  if(runtimeConfig.fiammetta&&!hasOperatorSkill({operatorRecords},runtimeConfig.fiammetta.operatorId,'dorm_exchangeAp[000]'))runtimeConfig.fiammetta=undefined
  state=createRosterRuntime(runtimeConfig)
  backups=createBackupPlanController(schedule,state,{virtualRunners:!!options.production&&(options.production.runOrderMode??'ideal')==='ideal',canUseFiammetta:id=>hasOperatorSkill({operatorRecords},id,'dorm_exchangeAp[000]')})
 }catch(error){diagnostic('INVALID_RUNTIME',String(error));return report}
 const total=warmupHours+sampleHours,initial={...state.morale}
 const entered=new Map<string,{room:string;time:number}>()
 const refreshSessions=(newEvents:RuntimeEvent[]=[])=>{
  const reset=new Set(newEvents.filter(e=>e.type==='fiammetta').map(e=>e.operators[1]))
  const working=new Map(state.config.positions.filter(p=>!p.dormitory&&state.occupants[p.id]).map(p=>[state.occupants[p.id]!,p.roomId]))
  for(const id of entered.keys())if(!working.has(id))entered.delete(id)
  for(const [id,room] of working)if(entered.get(id)?.room!==room||reset.has(id))entered.set(id,{room,time:state.time-(state.time===0&&!reset.has(id)?(options.initialWorkHours?.[id]??0):0)})
 }
 refreshSessions()
 const stats=new Map(Object.keys(state.morale).map(id=>[id,{operatorId:id,operatorName:OPERATOR_MAP.get(id)?.name??id,mainWorkHours:0,substituteWorkHours:0,workHours:0,exhaustedHours:0,restHours:0,idleHours:0,permanentPrimaryOccupancyHours:0,workFraction:0,workRestRatio:null,initialMorale:initial[id]!,finalMorale:initial[id]!} as SimulatedOperator]))
 const roomStats=new Map(projectScheduleState(schedule,state).rooms.map(r=>[r.id,{roomId:r.id,roomType:r.type,averageEfficiencyPercent:0,efficiencyPercentHours:0,occupiedHours:0,teams:[]} as SimulatedRoom]))
 // Rates are queried repeatedly within the same immutable time slice. Track actual
 // map writes (including same-time Fiammetta/swaps) instead of serializing all operators per query.
 let rateRevision=0,cachedRevision=-1,cachedTime=NaN
 let cachedWork:Record<string,number>={},cachedRecovery:Record<string,number>={}
 const trackRateMap=<T extends string|number>(map:Record<string,T>):Record<string,T>=>new Proxy(map,{
  set(target,key,value){if(target[String(key)]!==value)rateRevision++;return Reflect.set(target,key,value)},
  deleteProperty(target,key){if(Object.prototype.hasOwnProperty.call(target,key))rateRevision++;return Reflect.deleteProperty(target,key)},
 })
 state.morale=trackRateMap(state.morale);state.occupants=trackRateMap(state.occupants);state.bedOccupants=trackRateMap(state.bedOccupants)
 let trackedMorale=state.morale,trackedOccupants=state.occupants,trackedBeds=state.bedOccupants,trackedConfig=state.config
 const updateRates=()=>{
  if(state.config!==trackedConfig){trackedConfig=state.config;rateRevision++}
  // Runtime replaces the bed map atomically after group reservations/reordering.
  if(state.morale!==trackedMorale){state.morale=trackedMorale=trackRateMap(state.morale);rateRevision++}
  if(state.occupants!==trackedOccupants){state.occupants=trackedOccupants=trackRateMap(state.occupants);rateRevision++}
  if(state.bedOccupants!==trackedBeds){state.bedOccupants=trackedBeds=trackRateMap(state.bedOccupants);rateRevision++}
  if(cachedRevision===rateRevision&&cachedTime===state.time)return
  cachedRevision=rateRevision;cachedTime=state.time
  const c=projectScheduleState(schedule,state);c.operatorRecords=operatorRecords;Object.assign(c.efficiencyResources,options.efficiencyResources)
  const snapshot=currentMoraleRates(c)
  for(const message of snapshot.unquantified)diagnostic('UNQUANTIFIED_WORK_RATE',message)
  let work=snapshot.rates,atBoundary=false
  const restingIds=new Set([...Object.values(state.bedOccupants),...state.config.positions.filter(p=>p.dormitory).map(p=>state.occupants[p.id]!)])
  // Strict mood thresholds use the directional limit in an evaluation copy, never alter physical mood.
  for(const [id,m] of Object.entries(c.operatorMorale)){
   const direction=restingIds.has(id)?1:-Math.sign(options.consumptionOverrides?.[id]??work[id]??0)
   if([4,8,12,16,18,20].some(x=>Math.abs(m-x)<EPS)){c.operatorMorale[id]=m+direction*EPS*2;atBoundary=true}
  }
  if(atBoundary)work=currentMoraleRates(c).rates
  cachedWork={...work,...options.consumptionOverrides};cachedRecovery={}
  const dorms=schedule.rooms.filter(r=>r.type==='dormitory'),morale=new Map(Object.entries(c.operatorMorale))
  for(const [index,room] of dorms.entries()){
   const ids=c.facilityOperatorIds.dormitories[index]??[],targets=new Map<string,string>()
   for(const id of ids){
    const skill=operatorFor(c,id)?.skills.find(s=>s.roomType==='DORMITORY'&&s.description.includes('某个干员'))
    const target=options.recoveryTargetByProvider?.[id]??ids.find(other=>(morale.get(other)??24)<24-EPS
      && !operatorFor(c,other)?.skills.some(s=>s.buffId==='dorm_recExcludeOther[000]')
      &&(!skill?.description.includes('除自身以外')||other!==id))
    if(target)targets.set(id,target)
   }
   const recovery=evaluateDormitoryRecovery(c,index,morale,options.atmosphereByRoom?.[room.roomId]??(!schedule.assumptions.defaultsApplied.includes('dormAtmosphere')?schedule.assumptions.dormAtmosphere:room.level*1000),targets)
   Object.assign(cachedRecovery,Object.fromEntries(recovery.rates))
   for(const message of recovery.unquantified)diagnostic('UNQUANTIFIED_RECOVERY',`${room.roomId}: ${message}`)
  }
  Object.assign(cachedRecovery,options.recoveryOverrides)
  for(const p of state.config.positions.filter(p=>!p.dormitory)){
   const id=state.occupants[p.id]!
   if(cachedWork[id]===undefined){
    cachedWork[id]=0
    const room=schedule.rooms.find(r=>r.roomId===p.roomId)
    if(room?.type==='factory'||room?.type==='train')diagnostic('PASSIVE_AUXILIARY_OCCUPANCY',`${p.roomId} / ${OPERATOR_MAP.get(id)?.name??id}：本次只模拟闲置进驻，不执行加工或训练任务，心情消耗 0/h`)
    else if((state.morale[id]??24)>0)diagnostic('UNQUANTIFIED_WORK_RATE',`${p.roomId} / ${OPERATOR_MAP.get(id)?.name??id}：尚未建模该设施的任务心情消耗；当前按未执行任务的 0/h`)
   }
  }
 }
 const rates:RuntimeRates={workRate:id=>{updateRates();return cachedWork[id]??0},recoveryRate:id=>{updateRates();return cachedRecovery[id]??0},thresholds:()=>[4,8,12,16,18,20]}
 const blockedMessages=new Map<string,{code:string;message:string}>()
 const deferrals:NonNullable<ScheduleSimulationReport['shiftDeferrals']>=[]
 const pendingDeferrals=new Map<string,typeof deferrals[number]>()
 const blockedMembers=new Map<string,string[]>()
 const refreshGroups=()=>{blockedMembers.clear(); for(const p of state.config.positions.filter(p=>!p.dormitory&&!p.permanent)){
  const key=p.group?`group:${p.group}`:`slot:${p.id}`
  blockedMembers.set(key,[...(blockedMembers.get(key)??[]),p.primary])
 }
 }
 refreshGroups()
 let backupFailed=false
 const settleUnsafe=()=>{
  // Capture each planning pass: a deduplicated message alone cannot prove
  // whether an already recovered group blocked again later.
  state.diagnostics=state.diagnostics.filter(d=>d.code!=='group-blocked')
  const count=state.events.length
  const phase=(timing:Parameters<NonNullable<typeof backups>['evaluate']>[0])=>{
   const changed=backups?.evaluate(timing)??false
   if(changed){Object.assign(schedule,backups!.schedule);cachedRevision=-1;refreshGroups()}
   return changed
  }
  phase('BEGINNING')
  settleRoster(state,rates,0,phase)
  let passes=0
  while(phase('END')){
   if(++passes>64)throw new Error('副表同刻任务链循环')
   settleRoster(state,rates,0,phase)
  }
  const events=state.events.slice(count)
  for(const [key,episode] of pendingDeferrals)if(events.some(e=>e.type==='shift-off'&&e.time>episode.blockedAt+EPS&&e.operators.length===episode.operatorIds.length&&episode.operatorIds.every(id=>e.operators.includes(id)))){
   episode.resolvedAt=state.time;pendingDeferrals.delete(key)
  }
  for(const d of state.diagnostics.filter(d=>d.code==='group-blocked')){
   blockedMessages.set(d.message,d)
   const key=[...blockedMembers.keys()].find(k=>d.message===`${k}: insufficient available candidates or beds; original occupants retained`)
   if(key&&!pendingDeferrals.has(key)){
    const episode={key,operatorIds:[...blockedMembers.get(key)!],blockedAt:state.time}
    deferrals.push(episode);pendingDeferrals.set(key,episode)
   }
  }
  refreshSessions(events);cachedRevision=-1
 }
 const settle=()=>{
  if(backupFailed)return
  try{settleUnsafe()}catch(error){backupFailed=true;diagnostic('BACKUP_EXECUTION_FAILED',error instanceof Error?error.message:String(error))}
 }
 const frameAt=(offset:number):ProductionFrame=>{
  const c=projectScheduleState(schedule,state);c.operatorRecords=operatorRecords;Object.assign(c.efficiencyResources,options.efficiencyResources)
  for(const id of Object.keys(c.operatorMorale))c.operatorMorale[id]=Math.max(0,Math.min(24,c.operatorMorale[id]!+moraleDerivative(state,id,rates)*offset))
  c.zeroMoraleOperatorIds=state.config.positions.filter(p=>!p.dormitory&&(c.operatorMorale[state.occupants[p.id]!]??0)<=0).map(p=>state.occupants[p.id]!)
  const morale=new Map(Object.entries(c.operatorMorale)),active=new Set(Object.keys(state.morale).filter(id=>!c.zeroMoraleOperatorIds.includes(id)))
  const context=buildRiicGlobalContext(c,active,morale),workHoursByOperator=new Map([...entered].map(([id,s])=>[id,Math.max(0,state.time+offset-s.time)]))
  const evaluations:ProductionFrame['evaluations']={}
  for(const room of c.rooms){const result=evaluateOperators(room,c,active,morale,context,{workHoursByOperator,warmupModel});evaluations[room.id]=result;for(const text of result.unquantifiedSkills)diagnostic('UNQUANTIFIED_EFFICIENCY',`${room.id}: ${text}`)}
  return {time:state.time+offset,config:c,active,morale,evaluations}
 }
 const efficiencies=(frame:ProductionFrame)=>Object.fromEntries(Object.entries(frame.evaluations).map(([id,r])=>[id,r.efficiencyPercent]))
 settle()
 if(backupFailed)return report
 const production=options.production?createProductionTimeline(schedule,state,options.production,warmupHours,diagnostic,()=>{refreshSessions();cachedRevision=-1}):undefined
 production?.settle(()=>frameAt(0))
 let steps=0,lastProgress=-1,lastPhase=''
 // Ideal order events cannot alter the morale clock. Keep its next boundary
 // and endpoint independent of random production subdivisions; otherwise tiny
 // summation differences eventually change discrete group/backup decisions.
 const independentMoraleClock=!!production&&(options.production?.runOrderMode??'ideal')==='ideal'
 let moraleStep:{end:number;morale:Record<string,number>;actionAt:number}|undefined
 const reportProgress=()=>{
  if(!onProgress)return
  const percent=Math.floor(state.time/total*100),phase=state.time<warmupHours-EPS?'warmup':'sampling'
  if(percent!==lastProgress||phase!==lastPhase){
   lastProgress=percent;lastPhase=phase
   onProgress({phase,elapsedHours:state.time,totalHours:total,warmupHours})
  }
 }
 while(state.time<total-EPS&&!backupFailed){
  reportProgress()
  if(steps++>=maxEvents){diagnostic('SIMULATION_EVENT_LIMIT',`达到 ${maxEvents} 个积分区间，结果未完成`);break}
  let action=moraleStep?moraleStep.actionAt-state.time:production?.isRosterLocked()?Infinity:nextRosterActionHours(state,rates)
  if(action<=EPS){settle();production?.settle(()=>frameAt(0));action=production?.isRosterLocked()?Infinity:nextRosterActionHours(state,rates);if(action<=EPS){diagnostic('SIMULATION_SAME_TIME_ACTION','同刻调度未能稳定，结果未完成');break}}
  let dt=moraleStep?moraleStep.end-state.time:Math.min(maxStepHours,total-state.time,nextRosterEventHours(state,rates,!production?.isRosterLocked()),state.time<warmupHours-EPS?warmupHours-state.time:Infinity)
  if(!moraleStep)for(const [id,s] of entered)for(const boundary of getTemporalSkillBoundaries(id,{operatorRecords})){const delay=boundary+s.time-state.time;if(delay>EPS)dt=Math.min(dt,delay)}
  if(independentMoraleClock&&!moraleStep){
   const morale=Object.fromEntries(Object.entries(state.morale).map(([id,m])=>{
    const value=Math.max(0,Math.min(24,m+moraleDerivative(state,id,rates)*dt))
    return [id,value<=EPS?0:value>=24-EPS?24:value]
   }))
   moraleStep={end:state.time+dt,morale,actionAt:state.time+action}
  }
  const frames=new Map<number,ProductionFrame>()
  const frame=(offset:number)=>{let value=frames.get(offset);if(!value){value=frameAt(offset);frames.set(offset,value)}return value}
  if(production)dt=production.nextStep(dt,frame)
  if(!Number.isFinite(dt)||dt<=0||state.time+dt===state.time){diagnostic('SIMULATION_STALLED','无法确定下一个正长度区间');break}
  const observed=state.time>=warmupHours-EPS
  if(observed){
   const eff=efficiencies(frame(dt/2))
   for(const [id,s] of stats){
    const p=state.config.positions.find(p=>state.occupants[p.id]===id)
    const resting=Object.values(state.bedOccupants).includes(id)||p?.dormitory
    if(!resting&&p?.permanent&&p.primary===id)s.permanentPrimaryOccupancyHours!+=dt
    if(resting)s.restHours+=dt
    else if(p){if((state.morale[id]??0)<=0 && moraleDerivative(state,id,rates)<=0)s.exhaustedHours+=dt;else{s.workHours+=dt;if(p.primary===id)s.mainWorkHours+=dt;else s.substituteWorkHours+=dt}}
    else s.idleHours+=dt
   }
   for(const [id,r] of roomStats){
    r.efficiencyPercentHours+=eff[id]!*dt
    const ids=state.config.positions.filter(p=>p.roomId===id).map(p=>state.occupants[p.id]!).filter(Boolean).sort()
    if(ids.length)r.occupiedHours+=dt
    let team=r.teams.find(t=>JSON.stringify(t.operatorIds)===JSON.stringify(ids))
    if(!team){team={operatorIds:ids,hours:0,fraction:0};r.teams.push(team)}team.hours+=dt
   }
   report.observedHours+=dt
   if(options.recordSegments)report.segments.push({start:state.time,end:state.time+dt,occupants:{...state.occupants},bedOccupants:{...state.bedOccupants},morale:{...state.morale},efficiencyPercent:eff})
  }
  production?.advance(dt,frame(dt/2))
  advanceRoster(state,dt,rates)
  if(moraleStep&&Math.abs(state.time-moraleStep.end)<=EPS){
   state.time=moraleStep.end
   Object.assign(state.morale,moraleStep.morale)
   moraleStep=undefined
  }
  production?.settle(()=>frameAt(0))
  if(Math.abs(dt-action)<=EPS&&!production?.isRosterLocked()){settle();production?.settle(()=>frameAt(0))}
 }
 report.elapsedHours=state.time;report.success=!backupFailed&&Math.abs(state.time-total)<EPS
 report.operators=[...stats.values()].map(s=>({...s,finalMorale:state.morale[s.operatorId]!,workFraction:report.observedHours?s.workHours/report.observedHours:0,workRestRatio:s.restHours>EPS?s.workHours/s.restHours:null}))
 report.rooms=[...roomStats.values()].map(r=>({...r,averageEfficiencyPercent:report.observedHours?r.efficiencyPercentHours/report.observedHours:0,teams:r.teams.map(t=>({...t,fraction:report.observedHours?t.hours/report.observedHours:0}))}))
 if(production){report.production=production.report();report.production.success&&=report.success}
 report.events=state.events.filter(e=>e.time>=warmupHours-EPS)
 report.shiftDeferrals=deferrals
 for(const d of state.diagnostics.filter(d=>d.code!=='group-blocked'))diagnostic(d.code,d.message)
 for(const d of blockedMessages.values()){
  const key=[...blockedMembers.keys()].find(k=>d.message===`${k}: insufficient available candidates or beds; original occupants retained`)
  const episodes=deferrals.filter(e=>e.key===key)
  if(report.success&&episodes.length&&episodes.every(e=>e.resolvedAt!==undefined))diagnostic('SHIFT_DEFERRED_RECOVERED',`${d.message}; ${episodes.length} 次延后均已由后续完整分组下班事件确认恢复`)
  else diagnostic(d.code,d.message)
 }
 reportProgress()
 return report
}
