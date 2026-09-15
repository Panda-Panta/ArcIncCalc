import {runRosterIncomeSearch,type IncomeSearchRequest} from './rosterIncomeSearch'
self.onmessage=(event:MessageEvent<IncomeSearchRequest>)=>{
 try{const report=runRosterIncomeSearch(event.data,progress=>self.postMessage({type:'progress',progress}));self.postMessage({type:'complete',report})}
 catch(error){self.postMessage({type:'error',error:error instanceof Error?error.message:String(error)})}
}
