import {describe,it,expect} from 'vitest'
import {createDefaultWorkspace} from '../workbench/defaults'
import {compileRosterSchedule} from '../scheduler/compileRosterSchedule'
import {resolveOperatorCharId as id} from '../workbench/compat/mowerJson'
import {prepareRunOrderSwap} from './mowerRunOrder'
function room(replacements:string[][]){const w=createDefaultWorkspace();w.mainPlan.facilities.room_1_1.type='trading';w.mainPlan.facilities.room_1_1.slots=replacements.map((r,i)=>({occupant:{kind:'operator',operatorId:i?'能天使':'拉普兰德'},groupId:null,replacements:r}));return compileRosterSchedule(w).rooms.find(r=>r.roomId==='room_1_1')!}
describe('Mower plan_run_order preserves slot and first candidate',()=>{
 it('keeps positional swaps and actual previous occupants for restoration',()=>{const r=prepareRunOrderSwap(room([['但书','芬'],['龙舌兰','香草']]),{room_1_1_0:id('斑点'),room_1_1_1:id('能天使')});expect(r.swaps).toEqual([{positionId:'room_1_1_0',slotIndex:0,outgoingOperatorId:id('斑点'),incomingOperatorId:id('但书')},{positionId:'room_1_1_1',slotIndex:1,outgoingOperatorId:id('能天使'),incomingOperatorId:id('龙舌兰')}]);expect(r.restoreOccupants.room_1_1_0).toBe(id('斑点'))})
 it('does not silently replace first ordinary candidate with later dedicated candidate',()=>{const r=prepareRunOrderSwap(room([['芬','但书'],['香草']]),{room_1_1_0:id('拉普兰德')});expect(r.swaps).toHaveLength(1);expect(r.swaps[0]?.incomingOperatorId).toBe(id('芬'));expect(r.diagnostics[0]?.code).toBe('RUN_ORDER_FIRST_CANDIDATE_NOT_SPECIAL')})
})
