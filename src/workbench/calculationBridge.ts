import type { AppConfig, CalculationReport } from '../domain/types'
import { createDefaultConfig } from '../domain/defaults'
import { calculate } from '../engine/calculate'
import { compileMainPlanToAppConfig } from './adapter'
import type { RosterWorkspace } from './model'
import { validateRosterWorkspace, type ValidationResult } from './validate'

export interface CalculationBridgeResult {
  success: boolean
  report: CalculationReport | null
  validation: ValidationResult
  error?: string
}

/**
 * Pure calculation bridge helper:
 * Compiles a RosterWorkspace into AppConfig and invokes existing calculate engine without mutation.
 */
export function runCalculationBridge(
  workspace: RosterWorkspace,
  baseConfig?: AppConfig,
): CalculationBridgeResult {
  const validation = validateRosterWorkspace(workspace)
  if (!validation.isValid) {
    return {
      success: false,
      report: null,
      validation,
      error: '排班存在阻断错误，无法进行收益计算',
    }
  }

  const compiledConfig = compileMainPlanToAppConfig(
    workspace.mainPlan,
    workspace,
    baseConfig ?? createDefaultConfig(),
  )

  const report = calculate(compiledConfig)
  return {
    success: true,
    report,
    validation,
  }
}
