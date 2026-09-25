<script setup lang="ts">
import {ref,watch,onBeforeUnmount,computed} from 'vue'
import {scoreProduction} from '../../optimizer/productionObjective'
import OperatorInventoryPanel from './OperatorInventoryPanel.vue'
import ControlImpactPanel from './ControlImpactPanel.vue'
import RosterIncomeSearchPanel from './RosterIncomeSearchPanel.vue'
import type {RosterDraftResult} from '../../optimizer/rosterDraft'
import RosterDraftPanel from './RosterDraftPanel.vue'
import type {OwnedOperatorInput} from '../../domain/operatorInventory'
import {getRoomDisplayName} from '../../workbench/operatorHelpers'
import type {RosterWorkspace} from '../../workbench/model'
import type {ScheduleSimulationReport} from '../../simulator/scheduleSimulation'
import ScheduleTimelineGantt from './ScheduleTimelineGantt.vue'
const props=defineProps<{workspace:RosterWorkspace}>()
const sampleDays=ref(14),warmupDays=ref(7),step=ref(.25),warmupModel=ref<'continuous'|'hourly'>('continuous'),idleNames=ref('')
const runOrderMode=ref<'ideal'>('ideal'),droneTarget=ref<'gold'|'exp'|'none'>('gold')
const initialGold=ref(0),initialLmd=ref(0),initialOrirock=ref(0),initialDevice=ref(0),initialDrone=ref(0),seed=ref(1),collectionIntervalHours=ref(0)
const outputMode=ref<'potential'|'settled'>('potential')
const productionInputs=[outputMode,runOrderMode,droneTarget,initialGold,initialLmd,initialOrirock,initialDevice,initialDrone,seed,collectionIntervalHours]
const draftForSearch=ref<RosterDraftResult|null>(null)
const searchOptions=computed(()=>({maxStepHours:step.value,warmupModel:warmupModel.value,production:{runOrderMode:runOrderMode.value,droneTarget:droneTarget.value,initialResources:{gold:initialGold.value,lmd:initialLmd.value,orirock:initialOrirock.value,device:initialDevice.value,drone:initialDrone.value},seed:seed.value,collectionIntervalHours:collectionIntervalHours.value}}))
const searchAssumptions=computed(()=>({restingThreshold:.65,operationDurationHours:0,idleOperators:idleNames.value.split(/[,，\n]/).map(s=>s.trim()).filter(Boolean)}))
const simulationProduction=computed(()=>({...searchOptions.value.production,outputMode:outputMode.value,...(outputMode.value==='potential'?{initialResources:{drone:initialDrone.value},collectionIntervalHours:0}:{})}))
const reportBasis=ref('当前排班')
const running=ref(false),report=ref<ScheduleSimulationReport|null>(null),error=ref('')
const completedOutput=computed(()=>{const r=report.value,c=r?.production?.sample.completed;return c&&r.observedHours>0?scoreProduction(c,r.observedHours):null})
const productionComplete=computed(()=>report.value?.success===true&&report.value?.production?.success===true)
const inventory=ref<{enabled:boolean;valid:boolean;entries:OwnedOperatorInput[]}>({enabled:false,valid:true,entries:[]})
function updateInventory(value:typeof inventory.value){inventory.value=value;clear()}
let worker:Worker|undefined
function cancel(){worker?.terminate();worker=undefined;running.value=false}
function clear(){cancel();report.value=null;error.value=''}
watch(()=>props.workspace,clear,{deep:true})
watch([sampleDays,warmupDays,step,warmupModel,idleNames,...productionInputs],clear)
onBeforeUnmount(cancel)
function run(targetWorkspace:RosterWorkspace=props.workspace,basis='当前排班'){
 clear()
 reportBasis.value=basis
 if(inventory.value.enabled&&!inventory.value.valid){error.value='请先修正干员库中的输入错误';return}
 if(!Number.isFinite(sampleDays.value)||sampleDays.value<=0||!Number.isFinite(warmupDays.value)||warmupDays.value<0){error.value='采样天数应大于 0，预热天数不能为负';return}
 if((outputMode.value==='potential'?[initialDrone]:[initialGold,initialLmd,initialOrirock,initialDevice,initialDrone]).some(n=>!Number.isFinite(n.value)||n.value<0)){error.value='初始库存须为不小于 0 的数值';return}
 if(!Number.isSafeInteger(seed.value)||seed.value<0||seed.value>4294967295||(outputMode.value==='settled'&&(!Number.isFinite(collectionIntervalHours.value)||collectionIntervalHours.value<0))){error.value='随机种子须为 0–4294967295 的整数，收取间隔不能为负';return}
 running.value=true
 try{
  worker=new Worker(new URL('../../simulator/scheduleSimulationWorker.ts',import.meta.url),{type:'module'})
  const currentWorker=worker
  worker.onmessage=event=>{if(worker!==currentWorker)return;report.value=event.data.report??null;error.value=event.data.error??'';cancel()}
  worker.onerror=event=>{if(worker!==currentWorker)return;error.value=event.message||'模拟执行失败';cancel()}
  const names=idleNames.value.split(/[,，\n]/).map(s=>s.trim()).filter(Boolean)
  worker.postMessage({workspace:JSON.parse(JSON.stringify(targetWorkspace)),options:{...(inventory.value.enabled?{operatorInventory:JSON.parse(JSON.stringify(inventory.value.entries))}:{}),sampleHours:sampleDays.value*24,warmupHours:warmupDays.value*24,maxStepHours:step.value,warmupModel:warmupModel.value,recordSegments:true,production:JSON.parse(JSON.stringify(simulationProduction.value))},assumptions:{restingThreshold:.65,operationDurationHours:0,...(names.length?{idleOperators:names}:{})}})
 }catch(e){error.value=e instanceof Error?e.message:String(e);cancel()}
}
function download(){if(!report.value)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report.value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='心情与产出模拟.json';a.click();URL.revokeObjectURL(url)}
const resourceLabels=[['gold','赤金（件）'],['lmd','龙门币'],['exp','EXP 点数'],['fragment','源石碎片（件）'],['orundum','合成玉'],['orirock','固源岩（件）'],['device','装置（件）'],['drone','无人机（架）']] as const
const signed=(n:number)=>n>0?'+'+number(n):number(n)
const number=(n:number)=>n.toLocaleString('zh-CN',{maximumFractionDigits:2})
</script>
<template>
 <section class="schedule-simulation" aria-labelledby="schedule-simulation-title">
  <h2 id="schedule-simulation-title">心情与产出模拟</h2>
  <p>按实际主替班、休息床位及暖机时间计算效率，默认计算不受库存和缺金限制的直观产出。换班阈值 0.65、宿舍满氛围、操作耗时为零。</p>
  <OperatorInventoryPanel @change="updateInventory" />
  <RosterDraftPanel :workspace="workspace" :inventory="inventory" @invalidate="clear" @draft-change="draftForSearch=$event" @simulate="draft=>run(draft,'组合草案')" />
  <div class="simulation-controls">
   <label>预热（天）<input v-model.number="warmupDays" type="number" min="0" step="1" /></label>
   <label>采样（天）<input v-model.number="sampleDays" data-test="sample-days" type="number" min="1" step="1" /></label>
   <label>暖机增长<select v-model="warmupModel"><option value="continuous">连续增长（假设）</option><option value="hourly">整小时跳变（假设）</option></select></label>
   <button type="button" data-test="simulate-schedule" :disabled="running" @click="run()">{{running?'正在模拟…':'运行模拟'}}</button>
   <button v-if="running" type="button" @click="cancel">取消模拟</button>
  </div>
  <div class="simulation-controls production-controls">
   <label>产出口径<select v-model="outputMode" data-test="output-mode"><option value="potential">直观产出（忽略库存）</option><option value="settled">实际收支（含库存约束）</option></select></label>
   <label>跑单方式<select v-model="runOrderMode" data-test="run-order-mode" disabled><option value="ideal">理想跑单（无冲突、无等待）</option></select></label>
   <label>余量无人机<select v-model="droneTarget" data-test="drone-target"><option value="gold">加速赤金</option><option value="exp">加速作战记录</option><option value="none">不用</option></select></label>
  </div>
  <p class="simulation-note" data-test="simulation-controls-scope">以上设置用于“运行模拟”，不影响旧版快速估算；更改后需要重新运行。</p>
  <p class="simulation-note">理想跑单在订单完成瞬间应用但书／龙舌兰效果，不临时进驻、不增加等待、不消耗跑单心情或无人机；常驻阵容照常获取订单。</p>
  <details class="simulation-idle production-settings"><summary>随机种子、无人机与可选库存设置</summary>
   <p v-if="outputMode==='potential'">直观产出仅使用随机种子和初始无人机。其他库存与收取设置仅用于实际收支口径。</p><p v-else>库存从预热开始计入，采样只统计采样期间的到账与支出。收取间隔为 0 时，完成后及时收取。</p>
   <div class="simulation-controls">
    <label>赤金（件）<input v-model.number="initialGold" data-test="initial-gold" :disabled="outputMode==='potential'" type="number" min="0" step="1" /></label>
    <label>龙门币<input v-model.number="initialLmd" data-test="initial-lmd" :disabled="outputMode==='potential'" type="number" min="0" step="1" /></label>
    <label>固源岩（件）<input v-model.number="initialOrirock" data-test="initial-orirock" :disabled="outputMode==='potential'" type="number" min="0" step="1" /></label>
    <label>装置（件）<input v-model.number="initialDevice" data-test="initial-device" :disabled="outputMode==='potential'" type="number" min="0" step="1" /></label>
    <label>无人机（架）<input v-model.number="initialDrone" data-test="initial-drone" type="number" min="0" max="235" step="1" /></label>
    <label>随机种子<input v-model.number="seed" data-test="production-seed" type="number" min="0" max="4294967295" step="1" /></label>
    <label>收取间隔（小时）<input v-model.number="collectionIntervalHours" data-test="collection-interval" :disabled="outputMode==='potential'" type="number" min="0" step="0.25" /></label>
   </div>
   <p>相同种子可复现同一组订单抽样。碎片默认使用固源岩配方；装置库存仅在选择对应配方时消耗。</p>
  </details>
  <details class="simulation-idle"><summary>补充可入住宿舍的闲置干员</summary><p>用中文逗号或换行分隔。Mower 会从这些实际拥有的闲置干员中填充 Free；未提供时，仅统计已知占位，宿舍人数联动可能偏低。</p><textarea v-model="idleNames" rows="3" aria-label="闲置干员名单" placeholder="安比尔，杜林，桃金娘" /></details>
  <p class="simulation-note">效率包含基本效率 100%。直观产出按采样完成数计分，实际收支口径另计到账；预热长度及步长可调整，用于检查结果是否稳定。</p>
  <ControlImpactPanel :workspace="workspace" :inventory="inventory" />
  <RosterIncomeSearchPanel :workspace="workspace" :inventory="inventory" :options="searchOptions" :assumptions="searchAssumptions" :draft="draftForSearch" />
  <p v-if="error" role="alert" class="simulation-error">{{error}}</p>
  <template v-if="report">
   <p class="simulation-note">正在查看：{{reportBasis}}</p>
   <p role="status">{{report.success?'模拟窗口已完成':'模拟未完成'}} · 实际采样 {{number(report.observedHours/24)}} 天 <button type="button" @click="download">导出明细 JSON</button></p>
   <ScheduleTimelineGantt :report="report" @request-simulate="run()" />
   <details v-if="(report.events??[]).some(e=>e.type==='backup-plan')" data-test="backup-plan-events">
    <summary>副表切换记录（{{(report.events??[]).filter(e=>e.type==='backup-plan').length}} 次）</summary>
    <p>按实际心情和位置判断条件；下表显示采样期间的切换。完整任务记录可导出明细 JSON。</p>
    <table><thead><tr><th>模拟小时</th><th>副表</th><th>状态</th><th>阶段</th></tr></thead><tbody>
     <tr v-for="(event,index) in (report.events??[]).filter(e=>e.type==='backup-plan')" :key="index"><td>{{number(event.time)}}</td><td>{{event.backupName}}</td><td>{{event.active?'启用':'退出'}}</td><td>{{event.timing}}</td></tr>
    </tbody></table>
   </details>
   <section v-if="report.production" aria-label="采样产出与库存" class="production-results">
    <p :class="{'simulation-error':!report.production.success}" data-test="production-status">{{report.production.success?'产出策略已完整执行':'产出策略未完整执行'}}<span v-if="!report.production.success">，原因见下方假设与待核实项。</span></p>
    <template v-if="report.production.assumptions?.outputMode==='potential'&&completedOutput">
     <p data-test="completed-production-score">{{productionComplete?'每日综合产出':'未完成采样的折算值（不可作为日均结论）'}}：{{number(completedOutput.total)}} = {{number(completedOutput.exp)}} EXP + 0.8 × {{number(completedOutput.goldValue)}} 赤金价值 + 0.2 × {{number(completedOutput.orderValue)}} 订单面值</p>
     <p class="simulation-note">按采样完成产物折算每日，预热不计入。忽略库存、缺金及存仓/收取阻塞，不扣赤金交易成本。原始完成数量与测算明细可导出。</p>
    </template>
    <template v-else>
    <p class="simulation-note">下表只计实际采样期间的收取到账与支出，期初库存包含预热结余。尚未收取的产品不计入到账；净变动不等于总产量。</p>
    <div class="simulation-table"><table><caption>采样期间产出与库存</caption><thead><tr><th>资源</th><th>期初库存</th><th>到账</th><th>支出</th><th>净变动</th><th>期末库存</th></tr></thead><tbody>
     <tr v-for="[key,label] in resourceLabels" :key="key" :data-test="'production-'+key"><td>{{label}}</td><td>{{number(report.production.sample.opening[key]??0)}}</td><td>{{number(report.production.sample.inflows[key]??0)}}</td><td>{{number(report.production.sample.outflows[key]??0)}}</td><td>{{signed(report.production.sample.net[key]??0)}}</td><td>{{number(report.production.sample.closing[key]??0)}}</td></tr>
    </tbody></table></div>
    </template>
    <p>期末无人机：{{number(report.production.drones.stock)}} / {{number(report.production.drones.capacity)}} 架</p>
   </section>
   <div class="simulation-table"><table><caption>设施平均效率</caption><thead><tr><th>设施</th><th>总效率</th><th>共同在岗组合数</th></tr></thead><tbody><tr v-for="room in report.rooms" :key="room.roomId"><td>{{getRoomDisplayName(room.roomId,room.roomType)}}</td><td>{{number(room.averageEfficiencyPercent)}}%</td><td>{{room.teams.length}}</td></tr></tbody></table></div>
   <div class="simulation-table"><table><caption>干员工休统计（小时）</caption><thead><tr><th>干员</th><th>工作占比</th><th>主班</th><th>替班</th><th>宿舍休息</th><th>闲置</th><th>疲劳占岗</th><th>末心情</th></tr></thead><tbody><tr v-for="op in report.operators" :key="op.operatorId"><td>{{op.operatorName}}</td><td>{{number(op.workFraction*100)}}%</td><td>{{number(op.mainWorkHours)}}</td><td>{{number(op.substituteWorkHours)}}</td><td>{{number(op.restHours)}}</td><td>{{number(op.idleHours)}}</td><td>{{number(op.exhaustedHours)}}</td><td>{{number(op.finalMorale)}}</td></tr></tbody></table></div>
   <details open><summary>假设与待核实项（{{report.diagnostics.length}}）</summary><ul><li v-for="(d,index) in report.diagnostics" :key="index">{{d.message}}</li></ul></details>
  </template>
 </section>
</template>
<style scoped>
.schedule-simulation{margin:1.4rem 0;padding:1.5rem;border:1px solid #41505d;border-radius:12px;scroll-margin-top:90px;background:#17212a;color:#e3ebf2}.schedule-simulation h2{margin:0 0 .6rem}.schedule-simulation p{line-height:1.6}.simulation-controls{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}.production-controls{margin-top:1rem}.simulation-controls label{display:grid;gap:6px;font-size:.85rem}.simulation-controls input{width:100px}.schedule-simulation input,.schedule-simulation select,.schedule-simulation textarea{color:inherit;background:#101922;border:1px solid #63717d;padding:9px;border-radius:5px}.schedule-simulation button{padding:10px 15px;border-radius:5px;border:1px solid #95ab67;background:#c7e49b;color:#16210d;cursor:pointer}.schedule-simulation button:disabled{opacity:.5;cursor:wait}.simulation-table{overflow:auto;max-height:440px;margin:1rem 0}.simulation-table table{width:100%;border-collapse:collapse;white-space:nowrap}.simulation-table th,.simulation-table td{text-align:right;padding:9px;border-bottom:1px solid #3a4651}.simulation-table th:first-child,.simulation-table td:first-child{text-align:left}.simulation-table caption{text-align:left;padding:10px 0;font-weight:600}.simulation-table thead{position:sticky;top:0;background:#17212a}.simulation-error{color:#ffb4ab}.simulation-note,.simulation-idle{color:#b6c6d1;font-size:.9rem}.simulation-idle{margin-top:1rem}.simulation-idle textarea{width:min(100%,600px);box-sizing:border-box}.schedule-simulation summary{cursor:pointer}.schedule-simulation li{line-height:1.7;margin:.4rem 0}
</style>
