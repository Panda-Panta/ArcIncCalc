import { compileRosterSchedule } from '../scheduler/compileRosterSchedule'
import type { SimulationAssumptions } from '../scheduler/types'
import { simulateSchedule, type ScheduleSimulationOptions, type ScheduleSimulationReport } from '../simulator/scheduleSimulation'
import type { RosterWorkspace } from './model'
import { validateRosterWorkspace } from './validate'

export function runScheduleSimulationBridge(
  workspace: RosterWorkspace,
  options: ScheduleSimulationOptions = {},
  assumptions: Partial<SimulationAssumptions> = {},
): { report: ScheduleSimulationReport | null; error?: string } {
  const validation = validateRosterWorkspace(workspace)
  if (!validation.isValid) {
    return {
      report: null,
      error: `排班存在阻断错误：${validation.criticalErrors.map(d => d.message).join('；')}`,
    }
  }

  try {
    const report = simulateSchedule(compileRosterSchedule(workspace, assumptions), options)
    if (workspace.compatibility.backupPlans.length) {
      report.diagnostics.push({
        code: 'BACKUP_PLANS_NOT_EXECUTED',
        message: '本报告仅执行主排班；备用计划及条件触发保留但不执行',
      })
    }
    return { report }
  } catch (error) {
    return {
      report: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
