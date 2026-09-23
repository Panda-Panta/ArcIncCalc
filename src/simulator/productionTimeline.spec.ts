import {readFileSync} from 'node:fs'
import {importMowerJson} from '../workbench/compat/mowerJson'
import {describe,it,expect} from 'vitest'
import {createDefaultWorkspace} from '../workbench/defaults'
import {compileRosterSchedule} from '../scheduler/compileRosterSchedule'
import {simulateSchedule} from './scheduleSimulation'

function emptyBase(){const w=createDefaultWorkspace();for(const r of Object.values(w.mainPlan.facilities))if(r.type==='manufacture')r.product='gold';return compileRosterSchedule(w)}
describe('joint production event clock',()=>{
 it('settles drone-produced gold into waiting trades at the same instant',()=>{
  const s=emptyBase();s.rooms=s.rooms.filter(r=>['room_1_1','room_3_1','room_3_2'].includes(r.roomId))
  s.rooms.filter(r=>r.type==='trading').forEach(r=>r.level=1)
  const r=simulateSchedule(s,{sampleHours:3.1,production:{droneTarget:'gold',initialResources:{drone:205}}})
  const second=r.production!.events.find(e=>e.type==='order-collected'&&e.orderId==='room_3_2:1')!
  expect(second.time).toBeCloseTo(3,7)
 })
 it('carries drone work across manufacturing batch boundaries without charging it twice',()=>{
  const s=emptyBase();s.rooms=s.rooms.filter(r=>r.roomId==='room_1_1')
  const r=simulateSchedule(s,{sampleHours:.03,production:{droneTarget:'gold',initialResources:{drone:234.75}}})
  expect(r.production!.manufacturing[0]!.completedItems).toBe(8)
  expect(r.production!.manufacturing[0]!.remainingBaseMinutes).toBeCloseTo(1.2,7)
  expect(r.production!.drones.consumed).toBe(215)
 })
 it('crosses coincident roster and fractional manufacturing endpoints in the real 252 fixture',()=>{
  const ws=importMowerJson(readFileSync('src/workbench/compat/fixtures/mower-252-2gold.json','utf8'))
  const r=simulateSchedule(compileRosterSchedule(ws),{sampleHours:12,production:{runOrderMode:'ideal',droneTarget:'none'}})
  expect(r.success).toBe(true)
  expect(r.production!.manufacturing.find(m=>m.roomId==='room_2_2')!.completedItems).toBeGreaterThanOrEqual(17)
 },30000)
 it('produces integer gold while preserving the incomplete next batch',()=>{
  const r=simulateSchedule(emptyBase(),{sampleHours:1.3,production:{droneTarget:'none'}})
  expect(r.success).toBe(true)
  expect(r.production!.manufacturing.every(x=>x.completedItems===1)).toBe(true)
  expect(r.production!.ledger.balances.gold).toBe(4)
  expect(r.production!.manufacturing[0]!.remainingBaseMinutes).toBeCloseTo(66,7)
 })
 it('never delivers an order without paying its gold',()=>{
  const s=emptyBase();s.rooms=s.rooms.filter(r=>r.type!=='manufacture')
  const r=simulateSchedule(s,{sampleHours:48,production:{droneTarget:'none'}})
  expect(r.production!.ledger.balances.lmd??0).toBe(0)
  expect(r.production!.trading.every(x=>x.pendingOrders.length===10)).toBe(true)
  expect(r.production!.trading.every(x=>x.blockedHours>0)).toBe(true)
 })
 it('separates sample ledger changes from warmup without resetting work',()=>{
  const r=simulateSchedule(emptyBase(),{sampleHours:1.2,warmupHours:1.2,production:{droneTarget:'none'}})
  expect(r.production!.sample.inflows.gold).toBe(4)
  expect(r.production!.manufacturing.every(x=>x.completedItems===2)).toBe(true)
 })
 it('retains recipe material costs and refuses unfunded fragment batches',()=>{
  const s=emptyBase();const m=s.rooms.find(r=>r.type==='manufacture')!;m.product='fragment'
  const r=simulateSchedule(s,{sampleHours:3,production:{droneTarget:'none'}})
  const f=r.production!.manufacturing.find(x=>x.roomId===m.roomId)!
  expect(f.completedItems).toBe(0);expect(f.blockedMaterialHours).toBe(3)
 })
 it('has repeatable seeded order draws and sample accounting',()=>{
  const s=emptyBase(),o={sampleHours:24,production:{droneTarget:'none' as const,seed:42,initialResources:{gold:100}}}
  const a=simulateSchedule(s,o),b=simulateSchedule(s,o)
  expect(a).toEqual(b)
  for(const [key,v] of Object.entries(a.production!.ledger.balances)){
   const l=a.production!.ledger,k=key as keyof typeof l.balances
   expect(v).toBeCloseTo((l.initial[k]??0)+(l.inflows[k]??0)-(l.outflows[k]??0),8)
  }
 })
})
