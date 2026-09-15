import {describe,it,expect} from 'vitest'
import {createDefaultWorkspace} from '../workbench/defaults'
import {compileRosterSchedule} from '../scheduler/compileRosterSchedule'
import {simulateSchedule} from './scheduleSimulation'
describe('unconstrained direct production accounting',()=>{
 it('continues completing orders with no gold, instead of filling a waiting queue',()=>{
  const s=compileRosterSchedule(createDefaultWorkspace(),{idleOperators:[]});s.rooms=s.rooms.filter(r=>r.roomId==='room_3_1')
  const finite=simulateSchedule(s,{sampleHours:72,production:{droneTarget:'none'}})
  const potential=simulateSchedule(s,{sampleHours:72,production:{droneTarget:'none',outputMode:'potential'}})
  expect(finite.production!.trading[0]!.blockedHours).toBeGreaterThan(0)
  expect(potential.production!.trading[0]!.blockedHours).toBe(0)
  expect(potential.production!.sample.completed.orderLmd).toBeGreaterThan(finite.production!.sample.completed.orderLmd)
  expect(potential.production!.ledger.outflows.gold??0).toBe(0)
  expect(potential.production!.assumptions.outputMode).toBe('potential')
 })
 it('ignores collection capacity and keeps only sample completed EXP after warmup',()=>{
  const s=compileRosterSchedule(createDefaultWorkspace(),{idleOperators:[]});s.rooms=s.rooms.filter(r=>r.roomId==='room_1_1');s.rooms[0]!.product='exp'
  const p=simulateSchedule(s,{warmupHours:3,sampleHours:48,production:{outputMode:'potential',droneTarget:'none',collectionIntervalHours:1000}}).production!
  expect(p.sample.completed.exp).toBe(16000);expect(p.manufacturing[0]!.blockedHours).toBe(0)
 })
 it('has identical direct output regardless of initial gold, materials or collection interval',()=>{
  const s=compileRosterSchedule(createDefaultWorkspace(),{idleOperators:[]})
  const a=simulateSchedule(s,{sampleHours:24,production:{outputMode:'potential',droneTarget:'none',seed:17}})
  const b=simulateSchedule(s,{sampleHours:24,production:{outputMode:'potential',droneTarget:'none',seed:17,initialResources:{gold:100000,lmd:999999,orirock:1000},collectionIntervalHours:100}})
  expect(a.production!.sample.completed).toEqual(b.production!.sample.completed)
 })
 it('accelerates trading post order completion when droneTarget is trading',()=>{
  const s=compileRosterSchedule(createDefaultWorkspace(),{idleOperators:[]})
  s.rooms=s.rooms.filter(r=>r.roomId==='room_3_1')
  const unaccelerated=simulateSchedule(s,{sampleHours:72,production:{droneTarget:'none',outputMode:'potential'}})
  const accelerated=simulateSchedule(s,{sampleHours:72,production:{droneTarget:'trading',droneTradingRoomId:'room_3_1',outputMode:'potential'}})
  expect(accelerated.production!.sample.completed.orderLmd).toBeGreaterThan(unaccelerated.production!.sample.completed.orderLmd)
 })
})
