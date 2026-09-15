import {describe,it,expect} from 'vitest'
import {createDefaultConfig,createRoom} from '../domain/defaults'
import {resolveOperatorCharId as id} from '../workbench/compat/mowerJson'
import {evaluateOperators} from './operatorRules'
import {evaluateTradeOrderCapacity} from './orderCapacity'
function capacity(names:string[],control:string[]=[],level:1|2|3=3,inactive:string[]=[]){const c=createDefaultConfig(),r=createRoom('t','trading');r.level=level;r.operatorIds=names.map(id);c.rooms=[r];c.controlOperatorIds=control.map(id);const active=new Set([...r.operatorIds,...c.controlOperatorIds].filter(x=>!inactive.map(id).includes(x)));return evaluateTradeOrderCapacity(r,c,active,evaluateOperators(r,c,active))}
describe('live trading order capacity from evaluated highest-phase skills',()=>{
 it('uses physical trading level base capacity',()=>{expect(capacity([],[],1).limit).toBe(6);expect(capacity([],[],2).limit).toBe(8);expect(capacity([]).limit).toBe(10)})
 it('requires exact named same-room partner and active providers',()=>{expect(capacity(['拉普兰德']).limit).toBe(10);expect(capacity(['拉普兰德','德克萨斯']).limit).toBe(14);expect(capacity(['拉普兰德','缄默德克萨斯']).limit).toBe(10);expect(capacity(['拉普兰德','德克萨斯'],[],3,['拉普兰德']).limit).toBe(10)})
 it('adds level scaling and signed capacity with lower bound one',()=>{expect(capacity(['佩佩','暗索'],[],2).limit).toBe(15);expect(capacity(['锏'],[],1).limit).toBe(1)})
 it('includes named and faction central support',()=>{expect(capacity(['银灰'],['灵知']).limit).toBe(20);expect(capacity(['赫德雷'],['维什戴尔']).limit).toBe(12)})
 it('reuses Jaye resolved partner efficiency and rejects circular capacity-to-efficiency',()=>{expect(capacity(['孑','银灰']).limit).toBe(12);expect(capacity(['孑','琳琅诗怀雅']).limit).toBeNull();expect(capacity(['孑','巫恋']).limit).toBeNull()})
})
