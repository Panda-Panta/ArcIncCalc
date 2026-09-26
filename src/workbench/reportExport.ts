import type { ScheduleSimulationReport } from '../simulator/scheduleSimulation'

export type ExportReportMode = 'summary' | 'full'

/**
 * Creates a lightweight summary version of the simulation report.
 * Strips the heavy `segments` array (which contains thousands of discrete timeline
 * snapshots with all 70+ operators' morale and facility occupancy), reducing file
 * size by over 95% (e.g. from 50MB down to < 500KB) while preserving all essential
 * output tables: inputs, assumptions, operators, rooms, events, production ledger & sample,
 * diagnostics, and shift deferrals.
 */
export function createSummaryReport(report: ScheduleSimulationReport): ScheduleSimulationReport {
  return {
    ...report,
    segments: [],
  }
}

/**
 * Serializes the report into a JSON string based on the chosen export mode.
 * - 'summary': Lightweight report without `segments`, formatted with 2 spaces for human reading.
 * - 'full': Full report including all `segments`. Serialized as compact JSON (no extra indentation)
 *           to avoid browser memory bloat and save ~45% disk space.
 */
export function serializeReportJson(report: ScheduleSimulationReport, mode: ExportReportMode): string {
  if (mode === 'summary') {
    return JSON.stringify(createSummaryReport(report), null, 2)
  }
  return JSON.stringify(report)
}

/**
 * Generates an appropriate filename for the exported JSON.
 */
export function getReportExportFilename(mode: ExportReportMode, date: Date = new Date()): string {
  const dateStr = date.toISOString().slice(0, 10)
  if (mode === 'summary') {
    return `基建产出报表_${dateStr}.json`
  }
  return `基建全量模拟轨迹_${dateStr}.json`
}

/**
 * Triggers browser download for the simulation report.
 */
export function downloadReportJson(report: ScheduleSimulationReport, mode: ExportReportMode = 'summary'): void {
  const json = serializeReportJson(report, mode)
  const mime = 'application/json'
  const blob = new Blob([json], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = getReportExportFilename(mode)
  a.click()
  URL.revokeObjectURL(url)
}
