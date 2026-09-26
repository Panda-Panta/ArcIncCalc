import { describe, expect, it } from 'vitest'
import {
  createSummaryReport,
  serializeReportJson,
  getReportExportFilename,
} from './reportExport'
import type { ScheduleSimulationReport } from '../simulator/scheduleSimulation'

function makeMockReport(): ScheduleSimulationReport {
  return {
    schemaVersion: 1,
    engine: 'mower-morale-v1',
    success: true,
    elapsedHours: 24,
    observedHours: 24,
    assumptions: {
      sampleHours: 24,
      warmupHours: 0,
      maxStepHours: 0.25,
      warmupModel: 'continuous',
      restingThreshold: 0.65,
      operationDurationHours: 0,
      dormAtmosphere: '',
      singleRecoveryTarget: '',
    },
    inputs: {
      schedule: { schemaVersion: 1, rooms: [] } as any,
      options: {},
    },
    operators: [
      {
        operatorId: 'char_102_texas',
        operatorName: '德克萨斯',
        mainWorkHours: 24,
        substituteWorkHours: 0,
        workHours: 24,
        exhaustedHours: 0,
        restHours: 0,
        idleHours: 0,
        workFraction: 1,
        workRestRatio: null,
        initialMorale: 24,
        finalMorale: 24,
      },
    ],
    rooms: [
      {
        roomId: 'room_1_1',
        roomType: 'trading',
        averageEfficiencyPercent: 100,
        efficiencyPercentHours: 2400,
        occupiedHours: 24,
        teams: [],
      },
    ],
    events: [
      { time: 0, type: 'shift-on', operators: ['char_102_texas'] },
    ],
    segments: [
      {
        start: 0,
        end: 0.25,
        occupants: { room_1_1_0: 'char_102_texas' },
        bedOccupants: {},
        morale: { char_102_texas: 24, char_002_amiya: 24 },
        efficiencyPercent: { room_1_1: 100 },
      },
      {
        start: 0.25,
        end: 0.5,
        occupants: { room_1_1_0: 'char_102_texas' },
        bedOccupants: {},
        morale: { char_102_texas: 23.8, char_002_amiya: 24 },
        efficiencyPercent: { room_1_1: 100 },
      },
    ],
    diagnostics: [
      { code: 'TEST_DIAG', message: 'Test diagnostic message' },
    ],
  }
}

describe('reportExport', () => {
  it('creates summary report with empty segments while preserving all key fields', () => {
    const original = makeMockReport()
    expect(original.segments.length).toBe(2)

    const summary = createSummaryReport(original)
    expect(summary.segments).toEqual([])
    expect(summary.operators).toEqual(original.operators)
    expect(summary.rooms).toEqual(original.rooms)
    expect(summary.events).toEqual(original.events)
    expect(summary.diagnostics).toEqual(original.diagnostics)
    expect(summary.assumptions).toEqual(original.assumptions)
    expect(summary.inputs).toEqual(original.inputs)
  })

  it('serializes summary report with indentation for readability', () => {
    const report = makeMockReport()
    const json = serializeReportJson(report, 'summary')
    const parsed = JSON.parse(json)
    expect(parsed.segments).toEqual([])
    expect(json).toContain('\n  "schemaVersion": 1,')
  })

  it('serializes full report without indentation to save size', () => {
    const report = makeMockReport()
    const json = serializeReportJson(report, 'full')
    const parsed = JSON.parse(json)
    expect(parsed.segments.length).toBe(2)
    // Compact JSON should not contain multi-line indentation formatting
    expect(json).not.toContain('\n  "schemaVersion": 1,')
  })

  it('generates distinct filenames with correct date and prefixes', () => {
    const testDate = new Date('2026-09-26T12:00:00Z')
    expect(getReportExportFilename('summary', testDate)).toBe('基建产出报表_2026-09-26.json')
    expect(getReportExportFilename('full', testDate)).toBe('基建全量模拟轨迹_2026-09-26.json')
  })
})
