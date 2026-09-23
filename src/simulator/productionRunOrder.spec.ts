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
const options:ScheduleSimulationOptions={sampleHours:2,recordSegments:true,production:{runOrderMode:'ideal',droneTarget:'none',initialResources:{gold:100},collectionIntervalHours:0}}
const selected=(r:ReturnType<typeof simulateSchedule>,type:string)=>r.production!.events.filter(e=>e.type===type)

describe('run-order integration after natural mode removal',()=>{
 it.each(['potential','settled'])('rejects legacy natural mode for %s output before scheduling',outputMode=>{
  const production=JSON.parse(JSON.stringify({...options.production,runOrderMode:'natural',outputMode}))
  expect(()=>simulateSchedule(base(),{...options,production})).toThrow(/自然跑单.*禁用/)
 })
 it('keeps explicit drone swaps, spending and restoration',()=>{
  const r=simulateSchedule(base(),{...options,production:{runOrderMode:'drone',droneTarget:'none',initialResources:{gold:100,drone:20}}})
  expect(r.success&&r.production!.success).toBe(true)
  const insertion=144/1.31/60-180/3600
  expect(selected(r,'run-order-inserted')[0]!.time).toBeCloseTo(insertion,8)
  expect(selected(r,'order-completed')[0]!.time).toBeCloseTo(insertion,8)
  expect(selected(r,'run-order-restored')[0]!.time).toBeCloseTo(insertion,8)
  expect(r.production!.drones.consumed).toBe(2)
  expect(r.production!.ledger.outflows.gold).toBe(4)
  expect(r.production!.ledger.inflows.lmd).toBe(2000)
 })
 it('keeps ideal rewards virtual with no waiting or drone spending',()=>{
  const r=simulateSchedule(base(),options)
  expect(r.success&&r.production!.success).toBe(true)
  expect(selected(r,'run-order-inserted')).toHaveLength(0)
  expect(selected(r,'run-order-ideal')).toHaveLength(1)
  expect(selected(r,'order-completed')[0]!.time).toBeCloseTo(144/1.31/60,8)
  expect(r.production!.drones.consumed).toBe(0)
  expect(r.operators.some(o=>o.operatorId===id('但书'))).toBe(false)
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


})
