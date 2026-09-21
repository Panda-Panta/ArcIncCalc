import { it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import type { ScheduleSimulationReport } from '../simulator/scheduleSimulation'
import { mowerReportMetrics } from './mowerReportMetrics'

it('reconstructs the screenshot seven-day total from its labelled components', () => {
  const observations = JSON.parse(readFileSync(new URL('../../validation/mower-backup-2026-09-22/screenshot-observations.json', import.meta.url), 'utf8'))
  const rows = observations.dailyRows.filter((row: [string, ...number[]]) => row[0] >= observations.sevenDayWindow[0]) as [string, number, number, number, number][]
  expect(rows).toHaveLength(7)
  const mean = rows.reduce((n, [, exp, gold, orders, tequila]) => n + exp + .8 * (gold + tequila) + .2 * orders, 0) / 7
  expect(Number((mean / 10000).toFixed(2))).toBe(observations.displayedSevenDayScoreWan)
})

it('matches Mower 82 arithmetic without adding virtual gold to the ledger', () => {
  const report = JSON.parse(readFileSync(new URL('../../validation/mower-backup-2026-09-22/production-24h.json', import.meta.url), 'utf8')).report as ScheduleSimulationReport
  const before = JSON.stringify(report)
  const value = mowerReportMetrics(report)!
  const premium = report.production!.events.filter(e => e.type === 'order-completed' && e.order?.kind === 'tequila').reduce((n, e) => n + e.order!.lmdReward - e.order!.goldCost * 500, 0)
  expect(premium).toBeGreaterThan(0)
  expect(value.mower82).toBeCloseTo(value.exp + .8 * (value.goldValue + premium) + .2 * value.orderLmd)
  expect(value.tequilaGoldValue).toBe(premium)
  expect(JSON.stringify(report)).toBe(before)
  report.assumptions.warmupHours = report.elapsedHours
  expect(mowerReportMetrics(report)!.tequilaGoldValue).toBe(0)
  report.success = false
  expect(mowerReportMetrics(report)).toBeNull()
})
