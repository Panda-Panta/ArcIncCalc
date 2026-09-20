import {describe,it,expect} from 'vitest'
import {createDefaultWorkspace} from '../workbench/defaults'
import {compileRosterSchedule} from '../scheduler/compileRosterSchedule'
import {resolveOperatorCharId as id} from '../workbench/compat/mowerJson'
import {simulateSchedule,type ScheduleSimulationOptions} from './scheduleSimulation'

function base(primary='芬', replacements=['但书'], second=false){
 const w=createDefaultWorkspace()
 for(const key of ['room_1_1',...(second?['room_1_2']:[])] as const){
  const r=w.mainPlan.facilities[key as 'room_1_1'|'room_1_2'];r.type='trading';r.level=1;r.product='money'
  r.slots=[{occupant:{kind:'operator',operatorId:key==='room_1_1'?primary:'阿罗玛'},groupId:null,replacements}]
 }
 w.mainPlan.conf.workaholic=[primary,...(second?['阿罗玛']:[])]
 const s=compileRosterSchedule(w);s.rooms=s.rooms.filter(r=>r.roomId==='room_1_1'||second&&r.roomId==='room_1_2');s.restPools=[]
 return s
}
const options:ScheduleSimulationOptions={sampleHours:2,recordSegments:true,production:{runOrderMode:'natural',droneTarget:'none',initialResources:{gold:100},collectionIntervalHours:0}}
const selected=(r:ReturnType<typeof simulateSchedule>,type:string)=>r.production!.events.filter(e=>e.type===type)

describe('natural Mower run-order integration: independently calculated fixtures',()=>{
 it('supports explicit natural completion with a 15 second insertion lead and no drone spending',()=>{
  const r=simulateSchedule(base(),options)
  expect(r.success).toBe(true);expect(r.production!.success).toBe(true)
  expect(r.production!.assumptions.runOrderMode).toBe('natural');expect(r.production!.assumptions.runOrderLeadSeconds).toBe(15)
  const insertion=144/1.31/60-15/3600,waiting=(1.31*15/60)/1.01/60
  expect(selected(r,'run-order-inserted')[0]!.time).toBeCloseTo(insertion,8)
  expect(selected(r,'order-completed')[0]!.time).toBeCloseTo(insertion+waiting,8)
  expect(r.production!.drones.consumed).toBe(0);expect(r.production!.ledger.outflows.drone??0).toBe(0)
  expect(r.production!.ledger.outflows.gold).toBe(4);expect(r.production!.ledger.inflows.lmd).toBe(2000)
 })
 it('charges the actual temporary worker and grants the displaced primary idle time during the longer wait',()=>{
  const r=simulateSchedule(base(),options),waiting=(1.31*15/60)/1.01/60
  const main=r.operators.find(o=>o.operatorId===id('芬'))!,temp=r.operators.find(o=>o.operatorId===id('但书'))!
  expect(temp.workHours).toBeCloseTo(waiting,8);expect(temp.finalMorale).toBeCloseTo(24-waiting,8)
  expect(main.idleHours).toBeCloseTo(waiting,8);expect(main.workHours).toBeCloseTo(2-waiting,8)
  expect(main.finalMorale).toBeCloseTo(24-(2-waiting),8)
  const during=r.segments.filter(s=>s.occupants.room_1_1_0===id('但书'))
  expect(during.length).toBeGreaterThan(0);expect(during.every(s=>s.efficiencyPercent.room_1_1===101)).toBe(true)
 })
 it('selects replacement[0] literally and cannot grant the later Proviso conversion',()=>{
  const r=simulateSchedule(base('砾',['芬','但书']),{...options,sampleHours:2.5})
  expect(selected(r,'run-order-inserted')[0]!.operatorIds).toEqual([id('芬')])
  expect(r.production!.ledger.outflows.gold).toBe(2);expect(r.production!.ledger.inflows.lmd).toBe(1000)
  expect(r.diagnostics.some(d=>d.code==='RUN_ORDER_FIRST_CANDIDATE_NOT_SPECIAL')).toBe(true)
 })
 it('removes a borrowed operator from the Free bed and does not restore that bed implicitly',()=>{
  const s=base(),w=createDefaultWorkspace();w.mainPlan.facilities.dormitory_1.slots=[{occupant:{kind:'free'},groupId:null,replacements:[]}]
  const dorm=compileRosterSchedule(w);s.rooms.push(dorm.rooms.find(r=>r.roomId==='dormitory_1')!);s.restPools=[dorm.restPools.find(r=>r.roomId==='dormitory_1')!]
  s.assumptions.idleOperators=[id('但书')]
  const r=simulateSchedule(s,options),start=selected(r,'run-order-inserted')[0]!.time,end=selected(r,'run-order-restored')[0]!.time
  expect(r.segments.some(x=>x.end<=start+1e-8&&x.bedOccupants.dormitory_1_0===id('但书'))).toBe(true)
  for(const segment of r.segments.filter(x=>x.start>=start-1e-8))expect(Object.values(segment.bedOccupants)).not.toContain(id('但书'))
  const op=r.operators.find(o=>o.operatorId===id('但书'))!
  expect(op.restHours).toBeCloseTo(start,7);expect(op.idleHours).toBeCloseTo(2-end,7)
 })
 it('retains exhausted physical presence without granting a special order or staff efficiency',()=>{
  const s=base();s.assumptions.operatorMorale[id('但书')]=0
  const r=simulateSchedule(s,options),insertion=144/1.31/60-15/3600,waiting=1.31*15/3600
  expect(selected(r,'order-completed')[0]!.time).toBeCloseTo(insertion+waiting,8)
  expect(r.production!.ledger.outflows.gold).toBe(2);expect(r.production!.ledger.inflows.lmd).toBe(1000)
  expect(r.operators.find(o=>o.operatorId===id('但书'))!.exhaustedHours).toBeCloseTo(waiting,8)
  expect(r.segments.filter(x=>x.occupants.room_1_1_0===id('但书')).every(x=>x.efficiencyPercent.room_1_1===100)).toBe(true)
 })
 it('cannot put the same dedicated candidate into two stations concurrently',()=>{
  const r=simulateSchedule(base('砾',['但书'],true),{...options,sampleHours:2.5})
  expect(r.success).toBe(true)
  for(const segment of r.segments)expect(Object.values(segment.occupants).filter(x=>x===id('但书')).length).toBeLessThanOrEqual(1)
  const done=selected(r,'order-completed');expect(done).toHaveLength(2)
  expect(r.production!.ledger.inflows.lmd).toBe(3000)
 })
 it('rejects a zero-second natural lead instead of silently missing every conversion',()=>{
  expect(()=>simulateSchedule(base(),{...options,production:{...options.production,runOrderLeadSeconds:0}})).toThrow()
 })
 it('initializes dedicated candidates from the configured starting morale',()=>{
  const s=base();s.assumptions.initialMorale=8
  const r=simulateSchedule(s,options),waiting=(1.31*15/60)/1.01/60
  const op=r.operators.find(x=>x.operatorId===id('但书'))!
  expect(op.initialMorale).toBe(8);expect(op.finalMorale).toBeCloseTo(8-waiting,8)
 })
 it('is insensitive to the outer numerical step for constant-efficiency natural swaps',()=>{
  const s=base(),a=simulateSchedule(s,{...options,maxStepHours:.25}),b=simulateSchedule(s,{...options,maxStepHours:.013})
  expect(a.success&&b.success).toBe(true)
  const events=(r:ReturnType<typeof simulateSchedule>)=>r.production!.events.filter(e=>['run-order-inserted','run-order-restored','order-completed'].includes(e.type))
  expect(events(a).map(x=>x.type)).toEqual(events(b).map(x=>x.type))
  for(const [i,event] of events(a).entries())expect(event.time).toBeCloseTo(events(b)[i]!.time,8)
  expect(a.production!.ledger.inflows.lmd).toBe(b.production!.ledger.inflows.lmd)
 })
 it('retains captured special costs while an unfunded queue fills and blocks acquisition',()=>{
  const r=simulateSchedule(base(),{...options,sampleHours:20,consumptionOverrides:{[id('芬')]:0,[id('但书')]:0},production:{droneTarget:'none',initialResources:{gold:0},collectionIntervalHours:0}})
  expect(r.success).toBe(true)
  const trade=r.production!.trading[0]!
  expect(trade.pendingOrders).toHaveLength(6);expect(trade.collectedOrders).toBe(0);expect(trade.remainingBaseMinutes).toBeNull()
  expect(trade.pendingOrders.every(o=>o.goldCost===4&&o.lmdReward===2000)).toBe(true)
  expect(trade.blockedHours).toBeGreaterThan(0);expect(r.production!.ledger.inflows.lmd??0).toBe(0)
 })
 it('preserves highest-phase Jaye cancellation as completed orders accumulate',()=>{
  const r=simulateSchedule(base('孑',[]),{...options,sampleHours:4.1,consumptionOverrides:{[id('孑')]:0},production:{droneTarget:'none',initialResources:{gold:0},collectionIntervalHours:0}})
  expect(r.success).toBe(true)
  // E2 Jaye: limit 6, no partners; 6 * 4% + 1% staff. The +4% per queued
  // order cancels the first skill loss, so both 144-minute orders take 1.92 h.
  expect(r.rooms[0]!.averageEfficiencyPercent).toBeCloseTo(125,8)
  const done=selected(r,'order-completed');expect(done).toHaveLength(2)
  expect(done[0]!.time).toBeCloseTo(1.92,8);expect(done[1]!.time).toBeCloseTo(3.84,8)
  expect(r.production!.trading[0]!.pendingOrders).toHaveLength(2)
 })

 it('includes known dedicated replacements in the low-priority Free pool without a separate idle roster',()=>{
  // Mower operators.py:286-297 registers every non-Fiammetta replacement as
  // Operator(name, ""), whose default type is low (line 925). get_free_list
  // in base_schedule.py:2645-2673 includes known idle non-high operators.
  const s=base(),w=createDefaultWorkspace()
  w.mainPlan.facilities.dormitory_1.slots=[{occupant:{kind:'free'},groupId:null,replacements:[]}]
  const dorm=compileRosterSchedule(w)
  s.rooms.push(dorm.rooms.find(r=>r.roomId==='dormitory_1')!)
  s.restPools=[dorm.restPools.find(r=>r.roomId==='dormitory_1')!]
  s.assumptions.operatorMorale[id('但书')]=8
  expect(s.assumptions.idleOperators).toBeUndefined()
  const r=simulateSchedule(s,{...options,sampleHours:3})
  expect(r.success).toBe(true)
  const op=r.operators.find(x=>x.operatorId===id('但书'))!
  expect(op.restHours).toBeGreaterThan(0)
  const restored=selected(r,'run-order-restored')[0]!.time
  expect(r.segments.some(x=>x.start>restored+1e-8&&x.bedOccupants.dormitory_1_0===id('但书'))).toBe(true)
 })

})
