<script setup lang="ts">
import {ref,watch} from 'vue'
import type {RosterWorkspace} from '../../workbench/model'
import type {OwnedOperatorInput} from '../../domain/operatorInventory'
import {compileOperatorInventory} from '../../domain/operatorInventory'
import {compileRosterSchedule} from '../../scheduler/compileRosterSchedule'
import {compiledScheduleToRuntimeConfig} from '../../scheduler/scheduleAdapter'
import {createRosterRuntime} from '../../scheduler/rosterRuntime'
import {projectScheduleState} from '../../simulator/scheduleSimulation'
import {resolveOperatorCharId} from '../../workbench/compat/mowerJson'
import {validatePhysicalRoster} from '../../optimizer/rosterDraft'
import {validateScheduleInventory} from '../../optimizer/inventoryAdmission'
import {analyzeControlImpact,compareControlConfigurations,type ControlImpactAnalysis,type ControlConfigurationComparison} from '../../optimizer/controlImpact'
const props=defineProps<{workspace:RosterWorkspace;inventory:{enabled:boolean;valid:boolean;entries:OwnedOperatorInput[]}}>()
const result=ref<ControlImpactAnalysis|null>(null),comparison=ref<ControlConfigurationComparison|null>(null),alternative=ref(''),error=ref('')
watch([()=>props.workspace,()=>props.inventory],()=>{result.value=null;comparison.value=null;error.value=''},{deep:true})
watch(alternative,()=>{comparison.value=null;error.value=''})
function snapshot(){
 if(props.inventory.enabled&&!props.inventory.valid)throw new Error('干员库包含无效条目，请先修正')
 const ws: RosterWorkspace=JSON.parse(JSON.stringify(props.workspace)),errors=validatePhysicalRoster(ws)
 if(errors.length)throw new Error(errors.map(d=>d.message).join('；'))
 const schedule=compileRosterSchedule(ws,{idleOperators:[]})
 if(props.inventory.enabled){const check=validateScheduleInventory(schedule,compileOperatorInventory(props.inventory.entries));if(!check.valid)throw new Error(check.diagnostics.map(d=>d.message).join('；'))}
 const config=projectScheduleState(schedule,createRosterRuntime(compiledScheduleToRuntimeConfig(schedule)))
 for(const room of config.rooms)if(schedule.runOrderPolicies.some(p=>p.roomId===room.id))room.specialOrder='shiftRun'
 return config
}
function analyze(){error.value='';try{result.value=analyzeControlImpact(snapshot());comparison.value=null}catch(e){result.value=null;error.value=e instanceof Error?e.message:String(e)}}
function compare(){error.value='';comparison.value=null;try{
 const ids=alternative.value.split(/[,，\n]/).map(s=>s.trim()).filter(Boolean).map(resolveOperatorCharId)
 if(props.inventory.enabled){const owned=new Map(compileOperatorInventory(props.inventory.entries).operators.map(o=>[o.charId,o]));if(ids.some(id=>!owned.get(id)?.matchesMaximumSkills))throw new Error('备选中枢人员须已录入干员库且解锁当前最高技能')}
 comparison.value=compareControlConfigurations(snapshot(),ids)
 }catch(e){error.value=e instanceof Error?e.message:String(e)}}
const n=(v:number)=>v.toLocaleString('zh-CN',{maximumFractionDigits:2})
const sign=(v:number)=>(v>0?'+':'')+n(v)
function download(){const url=URL.createObjectURL(new Blob([JSON.stringify({analysis:result.value,comparison:comparison.value,alternative:alternative.value,workspace:props.workspace},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='中枢产出增益.json';a.click();URL.revokeObjectURL(url)}
</script>
<template>
 <details class="control-impact" data-test="control-impact-panel"><summary>中枢产出增益与配置对照</summary>
  <p>将当前主班效率折算为每日直观产出：EXP + 0.8 × 赤金价值 + 0.2 × 订单面值。逐人移除只衡量当前配置中的边际贡献；同类取最高和联动会使这些数值不能直接相加。</p>
  <p>这是恒定效率的当前主班投影，不是长期工休结果。中枢普通驻守减耗与无人机充能另列；是否更适合长期排班，仍需动态模拟。依赖中枢的组合不预设为更优。</p>
  <button type="button" data-test="analyze-control" @click="analyze">量化当前中枢</button>
  <p v-if="error" role="alert">{{error}}</p>
  <template v-if="result">
   <p data-test="control-baseline">当前综合产出投影 {{n(result.baseline.daily.score)}} / 日；中枢普通驻守减耗 {{n(result.baseline.baseMoraleReductionPerHour)}} / 小时。</p>
   <p v-if="!result.baseline.complete||result.members.some(m=>!m.without.complete)" class="warning">存在未量化项；下表仅为已量化部分，不可用于完整排名。</p>
   <div class="control-table"><table><thead><tr><th>移除的中枢干员</th><th>其边际综合值 / 日</th><th>EXP 增量 / 日</th><th>赤金价值增量 / 日</th><th>订单面值增量 / 日</th><th>普通减耗 / 小时</th></tr></thead><tbody><tr v-for="m in result.members" :key="m.operatorId"><td>{{m.operatorName}}</td><td>{{sign(m.delta.daily.score)}}</td><td>{{sign(m.delta.daily.exp)}}</td><td>{{sign(m.delta.daily.goldValue)}}</td><td>{{sign(m.delta.daily.orderFaceValue)}}</td><td>{{sign(m.delta.baseMoraleReductionPerHour)}}</td></tr></tbody></table></div>
   <p>当前整组中枢相对空中枢的综合增量：{{sign(result.withoutAll.delta.daily.score)}} / 日。</p>
   <details v-for="m in result.members" :key="m.operatorId"><summary>{{m.operatorName}} · 各站效率影响与待核实项</summary><ul><li v-for="r in m.delta.rooms" :key="r.roomId">{{r.roomId}}：{{sign(r.efficiencyPoints)}} 个百分点</li><li>发电充能加成：{{sign(m.delta.powerBonusPercent)}} 个百分点</li><li v-for="(d,i) in m.without.diagnostics" :key="i">{{d}}</li></ul></details>
   <label class="alternative">完整中枢备选名单（最多5人，逗号分隔；留空表示空中枢）<input v-model="alternative" data-test="control-alternative" placeholder="阿米娅，凯尔希，戴菲恩" /></label>
   <button type="button" data-test="compare-control" @click="compare">比较这组中枢</button>
   <p v-if="comparison" data-test="control-comparison">备选相对当前：综合值 {{sign(comparison.delta.daily.score)}} / 日；普通驻守减耗变化 {{sign(comparison.delta.baseMoraleReductionPerHour)}} / 小时。{{comparison.candidate.complete&&comparison.baseline.complete?'':'存在未量化项，仅作部分参考。'}}</p>
   <ul v-if="comparison"><li v-for="(d,i) in comparison.candidate.diagnostics" :key="i">{{d}}</li></ul>
   <details><summary>计算假设与范围</summary><ul><li v-for="a in result.assumptions" :key="a">{{a}}</li><li v-for="(d,i) in result.baseline.diagnostics" :key="i">{{d}}</li></ul></details>
   <button type="button" data-test="export-control" @click="download">导出中枢对照 JSON</button>
  </template>
 </details>
</template>
<style scoped>
.control-impact{margin:1rem 0;padding:1rem;border:1px solid #526570;border-radius:8px;background:#14202a}.control-impact summary{cursor:pointer;font-weight:600}.control-impact p,.control-impact li{line-height:1.6}.control-impact button{background:#c7e49b;color:#16210d;padding:.6rem .9rem;border:1px solid #95ab67;border-radius:5px;cursor:pointer;margin:.5rem 0}.control-table{overflow:auto;max-height:330px}.control-table table{width:100%;min-width:770px;border-collapse:collapse}.control-table th,.control-table td{padding:.6rem;text-align:right;border-bottom:1px solid #42515e;white-space:nowrap}.control-table th:first-child,.control-table td:first-child{text-align:left}.alternative{display:grid;gap:.5rem;margin:1rem 0}.alternative input{max-width:450px;background:#101922;color:inherit;border:1px solid #63717d;border-radius:5px;padding:.6rem}.control-impact details{margin:.7rem 0}.warning,[role=alert]{color:#ffb4ab}
</style>
