import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { importMowerJson } from '../workbench/compat/mowerJson'
import { runCalculationBridge } from '../workbench/calculationBridge'
import { GOLDEN_SCENARIOS } from './goldenScenarios'

describe('252 Golden Scenarios and External Baselines', () => {
  it('validates 252 reference input fixture hash integrity and units', () => {
    const scenario = GOLDEN_SCENARIOS.find(s => s.id === 'mower-252-2gold')!
    expect(scenario).toBeDefined()
    expect(scenario.evidenceStatus).toBe('external-verified')

    const fileContent = readFileSync(resolve(scenario.inputFile), 'utf-8')
    const lfHash = createHash('sha256').update(fileContent.replace(/\r\n/g, '\n')).digest('hex')
    const rawHash = createHash('sha256').update(fileContent).digest('hex')

    expect(lfHash).toBe(scenario.inputSha256Lf)
    expect(rawHash).toBe(scenario.inputSha256Raw)

    // Check all metrics have units and are marked as verified external evidence without fake tolerance
    for (const metric of Object.values(scenario.metrics)) {
      if (!metric) continue
      expect(metric.evidenceStatus).toBe('external-verified')
      expect(metric.unit.length).toBeGreaterThan(0)
      expect(metric.value).toBeGreaterThan(0)
      expect(metric.tolerance).toBeUndefined() // No fake tolerance
    }
  })

  it('evaluates current calculation bridge against external reference without concealing discrepancy', () => {
    const scenario = GOLDEN_SCENARIOS.find(s => s.id === 'mower-252-2gold')!
    const json = readFileSync(resolve(scenario.inputFile), 'utf-8')
    const ws = importMowerJson(json)
    const result = runCalculationBridge(ws)

    expect(result.success).toBe(true)
    expect(result.report).not.toBeNull()
    if (!result.report?.summary) throw new Error('Expected calculation report with non-null summary')

    const summary = result.report.summary
    const expRef = scenario.metrics.expPerDay.value
    const goldRef = scenario.metrics.goldPerDay.value
    const tradingRef = scenario.metrics.tradingLmdPerDay.value

    // Current legacy output after global virtual gold lines, 20-bed occupancy,
    // and Mower workaholic semantics (2026-09-09):
    // EXP: 46151.8298 / 53835.424 (-14.27%)
    // Gold: 80.6205 / 100.7813 (-20.00%; Excel includes all drones)
    // Trading LMD: 62793.3114 / 61550.9859 (+2.02%)
    const expDiffPercent = ((summary.exp - expRef) / expRef) * 100
    const goldDiffPercent = ((summary.goldCount - goldRef) / goldRef) * 100
    const tradingDiffPercent = ((summary.orderLmd - tradingRef) / tradingRef) * 100

    expect(expDiffPercent).toBeGreaterThan(-15)
    expect(expDiffPercent).toBeLessThan(-13)
    expect(goldDiffPercent).toBeGreaterThan(-21)
    expect(goldDiffPercent).toBeLessThan(-19)
    expect(tradingDiffPercent).toBeGreaterThan(1)
    expect(tradingDiffPercent).toBeLessThan(3)

    // Confirm we do NOT write fake tolerances asserting they are equal
    expect(summary.exp).not.toBe(expRef)
    expect(summary.goldCount).not.toBe(goldRef)
    expect(summary.orderLmd).not.toBe(tradingRef)
  })
})
