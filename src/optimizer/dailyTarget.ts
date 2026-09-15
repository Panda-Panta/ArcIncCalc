import {compileRosterSchedule} from '../scheduler/compileRosterSchedule'
import {validatePhysicalRoster} from './rosterDraft'
import type {RosterWorkspace} from '../workbench/model'
import {compareIncome,type IncomeCase} from './incomeComparison'

export interface DailyTargetAssessment {
 target:number;status:'reached'|'below'|'ineligible'|'short-window'|'conditional'|'other-layout'
 minimum:number|null;maximum:number|null;conservativeDaily:number|null;stepSpread:number|null;reasons:string[]
}
/** A finite-window acceptance gate, separate from improvement relative to a baseline. */
export function assess252DailyTarget(workspace:RosterWorkspace,cases:IncomeCase[],window:{sampleHours:number;warmupHours:number},target=100000,conditional=false):DailyTargetAssessment {
 if(!Number.isFinite(target)||target<=0)throw new Error('日产出目标须为有限正数')
 const result:DailyTargetAssessment={target,status:'ineligible',minimum:null,maximum:null,conservativeDaily:null,stepSpread:null,reasons:[]}
 const counts=(type:string)=>Object.values(workspace.mainPlan.facilities).filter(r=>r.type===type).length
 if(counts('power')!==2||counts('manufacture')!==5||counts('trading')!==2){result.status='other-layout';result.reasons.push('252 目标仅适用于 2 电 5 制 2 贸布局');return result}
 // Bind the evidence to its own window and layout; caller labels cannot upgrade it.
 const expected=compileRosterSchedule(workspace).rooms.map(r=>({id:r.roomId,type:r.type,level:r.level,product:r.product}))
 const layoutKey=(items:{id:string;type:string;level:number;product?:string}[])=>JSON.stringify(items.map(r=>[r.id,r.type,r.level,r.product??null]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))
 try{
  if(validatePhysicalRoster(workspace).length||new Set(cases.map(c=>c.context)).size!==1||new Set(cases.map(c=>`${c.seed}:${c.step}`)).size!==4||cases.some(c=>c.key!==`${c.seed}:${c.step}`))throw new Error('来源不一致')
  for(const c of cases){const source=JSON.parse(c.context);if(source.sampleHours!==window.sampleHours||source.warmupHours!==window.warmupHours||!Array.isArray(source.layout)||layoutKey(source.layout)!==layoutKey(expected))throw new Error('来源不一致')}
 }catch{result.reasons.push('四组证据的窗口、布局或共同条件与目标请求不一致');return result}
 // Self-comparison reuses all eligibility, scenario, and potential-output checks.
 const validation=compareIncome(cases,cases,'composite')
 if(validation.status==='ineligible'){result.reasons=validation.reasons;return result}
 const values=cases.map(c=>c.output!.daily.total)
 result.minimum=Math.min(...values);result.maximum=Math.max(...values)
 result.stepSpread=Math.max(...[...new Set(cases.map(c=>c.seed))].map(seed=>{
  const group=cases.filter(c=>c.seed===seed).map(c=>c.output!.daily.total)
  return Math.max(...group)-Math.min(...group)
 }))
 result.conservativeDaily=result.minimum-result.stepSpread
 if(!Number.isFinite(window.sampleHours)||!Number.isFinite(window.warmupHours)||window.sampleHours<168||window.warmupHours<24){result.status='short-window';result.reasons.push('达标验证至少预热 24 小时、采样 168 小时');return result}
 if(conditional){result.status='conditional';result.reasons.push('组合条件未核实');return result}
 result.status=result.conservativeDaily>=target?'reached':'below'
 result.reasons.push('以四组最小日均减去同种子步长差作为保守值；仅代表本次模型窗口，非长期或实测保证')
 return result
}

/** Reproducible search ordering; independent of the trade-order simulation seeds. */
export function seededSearchOrder<T>(items:readonly T[],seed:number):T[] {
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw new Error('搜索种子须为 uint32')
 const output=[...items];let state=seed>>>0
 for(let i=output.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=Math.floor(state/0x100000000*(i+1));[output[i],output[j]]=[output[j]!,output[i]!]}
 return output
}
