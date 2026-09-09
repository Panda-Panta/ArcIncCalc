import type { AppConfig, CalculationReport } from '../domain/types'
import { createDefaultConfig } from '../domain/defaults'
import { calculate } from '../engine/calculate'
import { compileRosterSchedule } from '../scheduler/compileRosterSchedule'
import { compileMainPlanToAppConfig } from './adapter'
import type { RosterWorkspace } from './model'
import { validateRosterWorkspace, type ValidationResult } from './validate'

export type CalculationEngineKind = 'legacy' | 'event-v2'

export interface CalculationDiagnostic {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
}

export interface CalculationBridgeOptions {
  engine?: CalculationEngineKind
  baseConfig?: AppConfig
}

export interface CalculationBridgeResult {
  success: boolean
  report: CalculationReport | null
  validation: ValidationResult
  engine?: CalculationEngineKind
  diagnostics?: CalculationDiagnostic[]
  error?: string
}

/**
 * Pure calculation bridge helper:
 * Supports 'legacy' (default) and 'event-v2' engines.
 * When event-v2 is requested but not fully ready, returns null report and explicit diagnostic.
 */
export function runCalculationBridge(
  workspace: RosterWorkspace,
  optionsOrBaseConfig?: CalculationBridgeOptions | AppConfig,
): CalculationBridgeResult {
  const options: CalculationBridgeOptions = (optionsOrBaseConfig && 'schemaVersion' in optionsOrBaseConfig)
    ? { baseConfig: optionsOrBaseConfig, engine: 'legacy' }
    : (optionsOrBaseConfig ?? {})

  const engine = options.engine ?? 'legacy'
  const validation = validateRosterWorkspace(workspace)
  if (!validation.isValid) {
    return {
      success: false,
      report: null,
      validation,
      engine,
      error: '排班存在阻断错误，无法进行收益计算',
    }
  }

  if (engine === 'event-v2') {
    const compiled = compileRosterSchedule(workspace)
    const diagnostics: CalculationDiagnostic[] = [
      {
        code: 'EVENT_V2_UNAVAILABLE',
        severity: 'warning',
        message: 'event-v2 事件模拟器全周期产出积分尚未完全闭环，暂不可用；请使用 legacy 引擎查看近似稳态结果。',
      },
      ...compiled.diagnostics.map(d => ({
        code: d.code,
        severity: d.severity,
        message: d.message,
      })),
    ]

    return {
      success: false,
      report: null,
      validation,
      engine: 'event-v2',
      diagnostics,
      error: 'event-v2 事件模拟器全周期积分产出尚未就绪',
    }
  }

  const compiledConfig = compileMainPlanToAppConfig(
    workspace.mainPlan,
    workspace,
    options.baseConfig ?? createDefaultConfig(),
  )

  const report = calculate(compiledConfig)
  return {
    success: true,
    report,
    validation,
    engine: 'legacy',
  }
}
