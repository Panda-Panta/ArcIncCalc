import { runSmartRoster, type SmartRosterOptions } from './smartRoster'
import type { RosterWorkspace } from '../workbench/model'
import type { OwnedOperatorInput } from '../domain/operatorInventory'

export interface SmartRosterWorkerMessage {
  base: RosterWorkspace
  entries: OwnedOperatorInput[]
  options?: SmartRosterOptions
}

self.onmessage = (event: MessageEvent<SmartRosterWorkerMessage>) => {
  try {
    const { base, entries, options } = event.data
    const report = runSmartRoster(base, entries, options, (progress) => {
      self.postMessage({ type: 'progress', progress })
    })
    self.postMessage({ type: 'complete', report })
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
