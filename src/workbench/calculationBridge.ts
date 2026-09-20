import { inventoryOperatorRecords } from '../domain/operatorContext'
import { compileOperatorInventory } from '../domain/operatorInventory'
import type { AppConfig, CalculationReport, SummaryOutput } from '../domain/types'
import { createDefaultConfig } from '../domain/defaults'
import { calculate } from '../engine/calculate'
import { compileRosterSchedule } from '../scheduler/compileRosterSchedule'
import { compileMainPlanToAppConfig } from './adapter'
import type { RosterWorkspace } from './model'
import { validateRosterWorkspace, type ValidationResult } from './validate'
import { runScheduleSimulationBridge } from './scheduleSimulationBridge'
import type { ScheduleSimulationOptions, ScheduleSimulationReport } from '../simulator/scheduleSimulation'

export type CalculationEngineKind = 'legacy' | 'simulation' | 'event-v2'

export interface CalculationDiagnostic {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
}

export interface CalculationBridgeOptions {
  engine?: CalculationEngineKind
  baseConfig?: AppConfig
  simulationOptions?: ScheduleSimulationOptions
}

export interface CalculationBridgeResult {
  success: boolean
  report: CalculationReport | null
  simulationReport?: ScheduleSimulationReport | null
  validation: ValidationResult
  engine?: CalculationEngineKind
  diagnostics?: CalculationDiagnostic[]
  error?: string
}

export function simulationReportToCalculationReport(
  workspace: RosterWorkspace,
  simReport: ScheduleSimulationReport,
  baseConfig: AppConfig = createDefaultConfig(),
): CalculationReport {
  const days = simReport.observedHours > 0 ? simReport.observedHours / 24 : 1
  const completed = simReport.production?.sample.completed
  const outflows = simReport.production?.sample.outflows
  const inflows = simReport.production?.sample.inflows

  const exp = (completed?.exp ?? 0) / days
  const goldCount = (completed?.gold ?? 0) / days
  const goldValue = goldCount * 500
  const orderLmd = (completed?.orderLmd ?? 0) / days

  const warmupHours = simReport.assumptions?.warmupHours ?? 0
  const sampleOrderEvents = simReport.production?.events.filter(
    e => e.type === 'order-completed' && e.time >= warmupHours
  ) ?? []
  const ordersGoldCost = sampleOrderEvents.reduce((n, e) => n + (e.order?.goldCost ?? 0), 0) / days
  const goldConsumed = (outflows?.gold ?? 0) > 0 ? (outflows?.gold ?? 0) / days : ordersGoldCost
  const netGoldCount = goldCount - goldConsumed

  // Tequila virtual gold (within sample period)
  const tequilaBonusLmd = sampleOrderEvents.filter(e => e.order?.kind === 'tequila')
    .reduce((sum, e) => sum + Math.max(0, e.order!.lmdReward - e.order!.goldCost * 500), 0)
  const virtualGoldCount = tequilaBonusLmd / 500 / days
  const virtualGoldValue = virtualGoldCount * 500

  // 82 score: exp + 0.8 * (goldValue + virtualGoldValue) + 0.2 * orderLmd
  const totalScore82 = exp + 0.8 * (goldValue + virtualGoldValue) + 0.2 * orderLmd
  const totalEquivalentLmd = orderLmd + exp + (netGoldCount + virtualGoldCount) * 500

  const fragments = (inflows?.fragment ?? 0) / days
  const orundum = (inflows?.orundum ?? 0) / days
  const drones = (inflows?.drone ?? 0) / days

  const compiledConfig = compileMainPlanToAppConfig(workspace.mainPlan, workspace, baseConfig)
  if(simReport.inputs.options.operatorInventory)compiledConfig.operatorRecords=inventoryOperatorRecords(compileOperatorInventory(simReport.inputs.options.operatorInventory))
  const legacyReport = calculate(compiledConfig)

  const summary: SummaryOutput = {
    exp,
    goldCount,
    goldValue,
    virtualGoldCount,
    virtualGoldValue,
    orderLmd,
    fragments,
    orundum,
    goldConsumed,
    fragmentsConsumed: 0,
    netGoldCount,
    netGoldValue: netGoldCount * 500,
    totalScore82,
    totalEquivalentLmd,
  }

  return {
    ...legacyReport,
    summary,
    drones: drones > 0 ? drones : legacyReport.drones,
    validationMessages: simReport.diagnostics.map(d => d.message),
  }
}

/**
 * Pure calculation bridge helper:
 * Supports 'legacy' (default), 'simulation', and 'event-v2' engines.
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

  // Deep clone to strip any Vue reactive proxies before simulation / structuredClone
  const cleanWorkspace: RosterWorkspace = JSON.parse(JSON.stringify(workspace))

  if (engine === 'event-v2') {
    const compiled = compileRosterSchedule(cleanWorkspace)
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

  if (engine === 'simulation') {
    const simBridge = runScheduleSimulationBridge(
      cleanWorkspace,
      options.simulationOptions ? {
        ...options.simulationOptions,
        production: options.simulationOptions.production ?? { outputMode: 'potential', runOrderMode: 'ideal', droneTarget: 'gold' },
      } : {
        warmupHours: 72,
        sampleHours: 168,
        warmupModel: 'hourly',
        production: {
          outputMode: 'potential',
          runOrderMode: 'ideal',
          droneTarget: 'gold',
        },
      },
    )

    if (simBridge.report?.success && simBridge.report.production?.success) {
      const report = simulationReportToCalculationReport(
        cleanWorkspace,
        simBridge.report,
        options.baseConfig ?? createDefaultConfig(),
      )
      return {
        success: true,
        report,
        simulationReport: simBridge.report,
        validation,
        engine: 'simulation',
      }
    }

    return {
      success: false,
      report: null,
      validation,
      engine: 'simulation',
      simulationReport: simBridge.report,
      error: simBridge.error ?? ('动态模拟未完成：' + (simBridge.report?.diagnostics.map(d => d.message).join('；') || '未取得完整生产报告')),
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
