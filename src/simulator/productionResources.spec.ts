import {describe,it,expect} from 'vitest'
import {createDefaultWorkspace} from '../workbench/defaults'
import {compileRosterSchedule} from '../scheduler/compileRosterSchedule'
import {resolveOperatorCharId as id} from '../workbench/compat/mowerJson'
import {simulateSchedule,type ScheduleSimulationOptions} from './scheduleSimulation'
import type {ResourceAmounts} from './resourceLedger'

/** Sparse, empty rooms isolate facility base production from operator-specific rules. */
function onlyRoom(product:'gold'|'exp'|'fragment'='gold',level:1|3=3){
 const s=compileRosterSchedule(createDefaultWorkspace())
 s.rooms=s.rooms.filter(r=>r.roomId==='room_1_1')
 Object.assign(s.rooms[0]!,{product,level})
 return s
}
const noDrones={droneTarget:'none' as const,collectionIntervalHours:0}
function conserved(r:ReturnType<typeof simulateSchedule>){
 expect(r.success).toBe(true);expect(r.production?.success).toBe(true)
 const p=r.production!,l=p.ledger
 for(const key of new Set([...Object.keys(l.initial),...Object.keys(l.balances),...Object.keys(l.inflows),...Object.keys(l.outflows)])){
  const k=key as keyof ResourceAmounts
  expect(l.balances[k]??0).toBeGreaterThanOrEqual(0)
  expect(l.balances[k]??0).toBeCloseTo((l.initial[k]??0)+(l.inflows[k]??0)-(l.outflows[k]??0),7)
  expect((p.sample.closing[k]??0)-(p.sample.opening[k]??0)).toBeCloseTo((p.sample.inflows[k]??0)-(p.sample.outflows[k]??0),7)
 }
 expect(l.balances.drone??0).toBeCloseTo(p.drones.stock,7)
 expect(p.drones.initial+p.drones.generated-p.drones.overflow-p.drones.consumed).toBeCloseTo(p.drones.stock,7)
}

describe('production resource contracts independent of the event controller',()=>{
 it('uses storage weights, pauses a full level-1 warehouse, and resumes after a scheduled collection',()=>{
  // 24 weight / 2 per gold = 12 pieces at 14.4 h. Collect at 20 h; piece 13 at 21.2 h.
  const r=simulateSchedule(onlyRoom('gold',1),{sampleHours:21.3,production:{...noDrones,collectionIntervalHours:20}})
  conserved(r)
  const m=r.production!.manufacturing[0]!
  expect(m.completedItems).toBe(13);expect(m.pendingItems).toBe(1)
  expect(m.blockedHours).toBeCloseTo(5.6,7);expect(m.blockedMaterialHours).toBe(0)
  expect(r.production!.ledger.balances.gold).toBe(12)
  expect(m.remainingBaseMinutes).toBeCloseTo(66,6)
 })
 it('settles one medium EXP record as 1000 EXP and keeps the next record incomplete',()=>{
  const r=simulateSchedule(onlyRoom('exp'),{sampleHours:3.5,production:noDrones})
  conserved(r)
  expect(r.production!.manufacturing[0]!.completedItems).toBe(1)
  expect(r.production!.manufacturing[0]!.remainingBaseMinutes).toBeCloseTo(150,7)
  expect(r.production!.ledger.balances.exp).toBe(1000)
 })
 it('pays orirock batch inputs once at start, including the next funded work in progress',()=>{
  const r=simulateSchedule(onlyRoom('fragment'),{sampleHours:1.5,production:{...noDrones,initialResources:{orirock:4,lmd:3200}}})
  conserved(r)
  const p=r.production!
  expect(p.ledger.balances.fragment).toBe(1)
  expect(p.ledger.outflows.orirock).toBe(4);expect(p.ledger.outflows.lmd).toBe(3200)
  expect(p.ledger.entries.filter(e=>e.reason.includes('manufacture-start:'))).toHaveLength(2)
  expect(p.manufacturing[0]!.remainingBaseMinutes).toBeCloseTo(30,7)
  expect(p.manufacturing[0]!.blockedMaterialHours).toBe(0)
 })
 it('does not charge partial recipe costs when one input is missing',()=>{
  const r=simulateSchedule(onlyRoom('fragment'),{sampleHours:2.5,production:{...noDrones,initialResources:{orirock:4,lmd:1600}}})
  conserved(r)
  const p=r.production!
  expect(p.ledger.balances.fragment).toBe(1);expect(p.ledger.balances.orirock).toBe(2)
  expect(p.ledger.outflows.lmd).toBe(1600);expect(p.ledger.outflows.orirock).toBe(2)
  expect(p.manufacturing[0]!.blockedMaterialHours).toBeCloseTo(1.5,7)
 })
 it('honors the alternative device recipe without consuming orirock',()=>{
  const r=simulateSchedule(onlyRoom('fragment'),{sampleHours:1.5,production:{...noDrones,fragmentFormulaByRoom:{room_1_1:'fragment-device'},initialResources:{device:1,lmd:1000,orirock:9}}})
  conserved(r)
  const p=r.production!
  expect(p.ledger.balances.fragment).toBe(1);expect(p.ledger.balances.device).toBe(0)
  expect(p.ledger.balances.orirock).toBe(9);expect(p.ledger.outflows.orirock??0).toBe(0)
  expect(p.manufacturing[0]!.blockedMaterialHours).toBeCloseTo(.5,7)
 })
 it('carries an unfinished warmup batch across the sampling boundary without charging again',()=>{
  const r=simulateSchedule(onlyRoom('fragment'),{warmupHours:.5,sampleHours:.75,production:{...noDrones,initialResources:{orirock:2,lmd:1600}}})
  conserved(r)
  const s=r.production!.sample
  expect(s.opening.orirock).toBe(0);expect(s.opening.lmd).toBe(0)
  expect(s.outflows.orirock).toBe(0);expect(s.outflows.lmd).toBe(0)
  expect(s.inflows.fragment).toBe(1);expect(s.net.fragment).toBe(1)
  expect(r.production!.manufacturing[0]!.blockedMaterialHours).toBeCloseTo(.25,7)
 })
 it('credits completions at the warmup boundary to opening inventory rather than counting them twice',()=>{
  const r=simulateSchedule(onlyRoom(),{warmupHours:1.2,sampleHours:1.2,production:noDrones})
  conserved(r)
  expect(r.production!.sample.opening.gold).toBe(1)
  expect(r.production!.sample.closing.gold).toBe(2)
  expect(r.production!.sample.inflows.gold).toBe(1)
 })
 it('has one shared drone recharge baseline for three empty power stations and records overflow',()=>{
  const s=compileRosterSchedule(createDefaultWorkspace());s.rooms=s.rooms.filter(r=>r.type==='power')
  const r=simulateSchedule(s,{sampleHours:2,production:{...noDrones,initialResources:{drone:230}}})
  conserved(r)
  expect(r.production!.drones.generated).toBeCloseTo(20,8)
  expect(r.production!.drones.stock).toBe(235)
  expect(r.production!.drones.overflow).toBeCloseTo(15,8)
  expect(r.production!.drones.consumed).toBe(0)
 })
 it('collects only the completed run-order facility before the scheduled global collection',()=>{
  const ws=createDefaultWorkspace()
  ws.mainPlan.facilities.room_3_1.level=1
  ws.mainPlan.facilities.room_3_1.slots=[{occupant:{kind:'operator',operatorId:'砾'},groupId:null,replacements:['但书']}]
  ws.mainPlan.facilities.room_3_2.level=1
  ws.mainPlan.facilities.room_3_2.slots=[{occupant:{kind:'operator',operatorId:'能天使'},groupId:null,replacements:[]}]
  ws.mainPlan.conf.workaholic=['砾','能天使']
  const s=compileRosterSchedule(ws);s.rooms=s.rooms.filter(r=>['room_1_1','room_3_1','room_3_2'].includes(r.roomId))
  // The faster other post has an unpaid finished order; gold also waits in the warehouse.
  const r=simulateSchedule(s,{sampleHours:2.5,production:{...noDrones,runOrderMode:'natural',collectionIntervalHours:10,initialResources:{gold:20}}})
  conserved(r)
  const p=r.production!
  expect(p.events.some(e=>e.type==='run-order-restored')).toBe(true)
  expect(p.drones.consumed).toBe(0)
  expect(p.manufacturing[0]!.completedItems).toBe(2)
  expect(p.manufacturing[0]!.pendingItems).toBe(2)
  expect(p.trading.find(t=>t.roomId==='room_3_1')!.collectedOrders).toBe(1)
  expect(p.trading.find(t=>t.roomId==='room_3_2')!.collectedOrders).toBe(0)
  expect(p.trading.find(t=>t.roomId==='room_3_2')!.pendingOrders).toHaveLength(1)
  expect(p.ledger.balances.gold).toBe(16)
  expect(p.ledger.balances.lmd).toBe(2000)
 })
 it('does not change ordinary Mower duty decisions when only passive production events are added',()=>{
  const ws=createDefaultWorkspace()
  ws.mainPlan.facilities.room_1_1.slots=[{occupant:{kind:'operator',operatorId:'砾'},groupId:null,replacements:['斑点']}]
  ws.mainPlan.facilities.room_1_1.level=1
  ws.mainPlan.facilities.dormitory_1.slots=[{occupant:{kind:'free'},groupId:null,replacements:[]}]
  const s=compileRosterSchedule(ws),o:ScheduleSimulationOptions={sampleHours:54,consumptionOverrides:{[id('砾')]:1,[id('斑点')]:1},recoveryOverrides:{[id('砾')]:2,[id('斑点')]:2}}
  const a=simulateSchedule(s,o),b=simulateSchedule(s,{...o,production:noDrones})
  conserved(b);expect(a.success).toBe(true)
  expect(b.events.map(e=>[e.type,e.operators])).toEqual(a.events.map(e=>[e.type,e.operators]))
  a.events.forEach((e,i)=>expect(b.events[i]!.time).toBeCloseTo(e.time,7))
  for(const op of a.operators){const other=b.operators.find(x=>x.operatorId===op.operatorId)!
   for(const k of ['mainWorkHours','substituteWorkHours','restHours','idleHours','exhaustedHours','finalMorale'] as const)expect(other[k]).toBeCloseTo(op[k],7)
  }
 })
})
