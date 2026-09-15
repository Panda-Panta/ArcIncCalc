import {runScheduleSimulationBridge} from '../workbench/scheduleSimulationBridge'
self.onmessage=event=>{
 const {workspace,options,assumptions}=event.data
 try{self.postMessage(runScheduleSimulationBridge(workspace,options,assumptions))}
 catch(error){self.postMessage({report:null,error:error instanceof Error?error.message:String(error)})}
}
