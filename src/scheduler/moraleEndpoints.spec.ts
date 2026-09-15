import {describe,it,expect} from 'vitest'
import {createRosterRuntime,advanceRoster} from './rosterRuntime'
describe('physical morale endpoints are canonical across floating point integration',()=>{
 it('canonicalizes a recovered value within roundoff of 24',()=>{
  const s=createRosterRuntime({positions:[{id:'d',roomId:'dorm',primary:'A',candidates:[],dormitory:true}],beds:[],initialMorale:{A:23}})
  advanceRoster(s,1,{workRate:()=>0,recoveryRate:()=>.99999999999999});expect(s.morale.A).toBe(24)
 })
 it('canonicalizes exhausted zero but preserves meaningful near-full morale and internal skill boundaries',()=>{
  const s=createRosterRuntime({positions:[{id:'p',roomId:'trade',primary:'A',candidates:[]}],beds:[],initialMorale:{A:1}})
  advanceRoster(s,1,{workRate:()=>.99999999999999,recoveryRate:()=>0});expect(s.morale.A).toBe(0)
  s.morale.A=23.999999;advanceRoster(s,1,{workRate:()=>0,recoveryRate:()=>0});expect(s.morale.A).toBe(23.999999)
  s.morale.A=12+2e-8;advanceRoster(s,1,{workRate:()=>0,recoveryRate:()=>0});expect(s.morale.A).toBe(12+2e-8)
 })
})
