import {generateAutomaticRoster} from './automaticRoster'
self.onmessage=(event:MessageEvent<{base:Parameters<typeof generateAutomaticRoster>[0];entries:Parameters<typeof generateAutomaticRoster>[1];options:Parameters<typeof generateAutomaticRoster>[2]}>)=>{
 try{self.postMessage({type:'complete',report:generateAutomaticRoster(event.data.base,event.data.entries,event.data.options)})}
 catch(error){self.postMessage({type:'error',error:error instanceof Error?error.message:String(error)})}
}
