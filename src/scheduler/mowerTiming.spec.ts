import { describe, expect, it } from 'vitest'
import { mowerReturnDelay, mowerRescueDelay } from './mowerTiming'
describe('Mower scheduler_task.py 320–413 deterministic timing',()=>{
 it('waits for first high priority only when its lag exceeds power-layout bound',()=>{
  expect(mowerReturnDelay([{hours:5},{hours:3.6}],2,99)).toBe(3.6)
  expect(mowerReturnDelay([{hours:5},{hours:3.6}],3,99)).toBe(5)
  expect(mowerReturnDelay([{hours:5},{hours:3.4}],2,99)).toBe(5)
 })
 it('full-rest only waits for explicitly marked high-priority members',()=>{
  expect(mowerReturnDelay([{hours:8},{hours:5,full:true},{hours:6,full:true}],2,1)).toBe(6)
 })
 it('ordinary rest may be cut short by the minimum thirty-minute rescue time',()=>{
  expect(mowerRescueDelay([{morale:3,lower:0,rate:2}])).toBe(1)
  expect(mowerRescueDelay([{morale:0,lower:0,rate:2}])).toBe(.5)
  expect(mowerReturnDelay([{hours:5}],2,.5)).toBe(.5)
  expect(mowerRescueDelay([{morale:0,lower:0,rate:2,ignore:true}])).toBe(24)
 })
})
