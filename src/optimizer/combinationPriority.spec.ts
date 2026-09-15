import {it,expect} from 'vitest'
import {createDefaultConfig,createRoom} from '../domain/defaults'
import {OPERATORS} from '../domain/operators'
import {evaluateCombinationPriority,rankControlPackages} from './combinationPriority'
const id=(name:string)=>OPERATORS.find(o=>o.name===name)!.charId
function config(names:string[]=['摩根','推进之王']){const c=createDefaultConfig(),r=createRoom('T','trading');r.level=3;r.specialOrder='none';r.operatorIds=names.map(id);r.operatorCount=names.length;c.rooms=[r];return c}
it('removes the facility base before per-person ranking and preserves both support variants',()=>{
 const c=config();c.controlOperatorIds=[id('戴菲恩')];const before=structuredClone(c)
 const r=evaluateCombinationPriority(c,['T'])
 expect(r.operatorCount).toBe(2);expect(r.controlCount).toBe(1)
 expect(r.withoutControl.efficiencyBonusPerOperator).toBe(38.5)
 expect(r.withControl.efficiencyBonusPerOperator).toBe(48.5)
 expect(r.withControl.dailyScore-r.withoutControl.dailyScore).toBeCloseTo(r.controlGain)
 expect(c).toEqual(before)
})
it('charges displaced global benefit even when dedicated local efficiency improves',()=>{
 const base=config(),candidate=structuredClone(base)
 for(let i=0;i<5;i++)base.rooms.push(createRoom('M'+i,'manufacture'))
 base.controlOperatorIds=[id('凯尔希')];candidate.rooms=structuredClone(base.rooms);candidate.controlOperatorIds=[id('戴菲恩')]
 const r=rankControlPackages(base,[{id:'dedicated',config:candidate,targetRoomIds:['T'],conditionsVerified:true}])[0]!
 expect(r.local.withControl.efficiencyBonusPerOperator).toBeGreaterThan(r.reference.withoutControl.efficiencyBonusPerOperator)
 expect(r.status).toBe('net-not-better');expect(r.netDailyGain).toBeLessThan(0)
 expect(r.netDailyGain).toBeCloseTo(r.netControlGain+r.productionGainWithoutControl)
})
it('compares complete control alternatives instead of adding overlapping bonuses',()=>{
 const base=config(),a=structuredClone(base),b=structuredClone(base)
 a.controlOperatorIds=['阿米娅','诗怀雅'].map(id);b.controlOperatorIds=['戴菲恩','诗怀雅'].map(id)
 const r=rankControlPackages(base,[{id:'general',config:a,targetRoomIds:['T'],conditionsVerified:true},{id:'dedicated',config:b,targetRoomIds:['T'],conditionsVerified:true}])
 expect(r.map(v=>v.id)).toEqual(['dedicated','general']);expect(r.every(v=>v.status==='preferred')).toBe(true)
 const single=structuredClone(a);single.controlOperatorIds=[id('阿米娅')]
 expect(evaluateCombinationPriority(a,['T']).controlGain).toBe(evaluateCombinationPriority(single,['T']).controlGain)
})
it('shows support staffing and refuses duplicates, extra presence, and mixed-type averages',()=>{
 const c=config(['鸿雪','图耶']);c.facilityOperatorIds.dormitories[0]=['杜林','桃金娘','褐果','至简'].map(id);c.dormitoryOccupantCount=4
 expect(evaluateCombinationPriority(c,['T']).supportCount).toBe(4)
 const m=createRoom('M','manufacture');m.operatorIds=[id('砾')];m.operatorCount=1;c.rooms.push(m)
 expect(()=>evaluateCombinationPriority(c,['T','M'])).toThrow('同类型')
 c.facilityOperatorIds.dormitories[1]=[id('鸿雪')];c.dormitoryOccupantCount=5;expect(()=>evaluateCombinationPriority(c,['T'])).toThrow('重复占位')
 const external=config();external.efficiencyResources.extraWorkplaceOperatorIds=[id('砾')]
 expect(()=>evaluateCombinationPriority(external,['T'])).toThrow('实际设施')
})
it('does not label unknown rules or unconfirmed conditions as preferred',()=>{
 const base=config(),c=structuredClone(base);c.controlOperatorIds=[id('戴菲恩')]
 expect(rankControlPackages(base,[{id:'unchecked',config:c,targetRoomIds:['T'],conditionsVerified:false}])[0]!.status).toBe('conditional')
 expect(evaluateCombinationPriority(config(['铎铃']),['T']).withControl.complete).toBe(false)
})

it('uses equivalent 82 output to retain reward-transforming traders such as Proviso',()=>{
 const c=config(['但书']);c.rooms[0]!.level=1
 const result=evaluateCombinationPriority(c,['T']).withoutControl
 expect(result.equivalentEfficiencyPerOperator).toBeGreaterThan(result.efficiencyBonusPerOperator)
 expect(result.equivalentEfficiencyPerOperator).toBeCloseTo(result.scoreGainPerOperator/2000*100)
})

it('keeps the same per-person efficiency when two identical rooms are evaluated together',()=>{
 const c=createDefaultConfig(),a=createRoom('A','manufacture'),b=createRoom('B','manufacture')
 a.operatorIds=[id('砾')];a.operatorCount=1;b.operatorIds=[id('调香师')];b.operatorCount=1;c.rooms=[a,b]
 const one=evaluateCombinationPriority(c,['A']).withoutControl.equivalentEfficiencyPerOperator
 const two=evaluateCombinationPriority(c,['B']).withoutControl.equivalentEfficiencyPerOperator
 expect(evaluateCombinationPriority(c,['A','B']).withoutControl.equivalentEfficiencyPerOperator).toBeCloseTo((one+two)/2)
})
it('requires real support occupancy rather than manual efficiency or resource counts',()=>{
 for(const mutate of [
  (c:ReturnType<typeof config>)=>{c.efficiencyResources.additionalGoldProductionLines=4},
  (c:ReturnType<typeof config>)=>{c.dormitoryOccupantCount=20},
  (c:ReturnType<typeof config>)=>{c.rooms[0]!.skillBonus=300},
  (c:ReturnType<typeof config>)=>{c.rooms[0]!.specialOrder='provisoBeta'},
 ]){const c=config();mutate(c);expect(()=>evaluateCombinationPriority(c,['T'])).toThrow()}
})
