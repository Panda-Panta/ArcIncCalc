import type { RosterWorkspace } from '../workbench/model'

/** Automatic generation may use ordinary replacements, never conditional plans. */
export function mainPlanOnly(source: RosterWorkspace): RosterWorkspace {
  const copy = structuredClone(source)
  copy.compatibility.backupPlans = []
  return copy
}
