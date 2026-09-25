import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { calculate } from '../../engine/calculate'
import { createDefaultConfig } from '../../domain/defaults'

const __dirname = dirname(fileURLToPath(import.meta.url))

function fileSha256(relativePath: string): string {
  const fullPath = resolve(__dirname, '../../', relativePath)
  const content = readFileSync(fullPath, 'utf-8').replace(/\r\n/g, '\n')
  return createHash('sha256').update(content).digest('hex')
}

describe('Engine Protection & Calculation Equivalence', () => {
  it('protects engine source files against unauthorized modifications', () => {
    // Authorized shift-run and actual unlocked-skill baseline (2026-09-19), normalized LF; default arithmetic stays unchanged.
    expect(fileSha256('engine/calculate.ts')).toBe('107094f2bf31bba94d97ff56ba33de93870dd3fa8744a869edb35efba5c2daea')
    expect(fileSha256('engine/morale.ts')).toBe('3b62a7e6a9077e60d9b435eb26f308ca9d1af2b203716755a948ff40c16c6484')
    expect(fileSha256('engine/operatorRules.ts')).toBe('b753b7ab6bdafe80e884a5d5b5b326b3fd258cc79ae2500705d2581f63ba616e')
  })

  it('produces deterministic baseline report for default configuration', () => {
    const config = createDefaultConfig()
    const report1 = calculate(config)
    const report2 = calculate(config)

    expect(report2).toEqual(report1)
    expect(report1.power).toEqual({ generation: 810, consumption: 810, margin: 0, sufficient: true })
    expect(report1.layoutValid).toBe(true)
    expect(report1.validationMessages).toEqual([])
    expect(report1.drones).toBe(240)
    expect(report1.manufacture).toHaveLength(4)
    expect(report1.trading).toHaveLength(2)
    expect(report1.morale).toEqual([])
    expect(Object.keys(report1.roomShiftDetails)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'])
    expect(report1.summary).toEqual({
      exp: 0,
      goldCount: 80,
      goldValue: 40000,
      orderLmd: expect.closeTo(33274.34, 1),
      fragments: 0,
      orundum: 0,
      goldConsumed: expect.closeTo(63.72, 1),
      fragmentsConsumed: 0,
      netGoldCount: expect.closeTo(16.28, 1),
      netGoldValue: expect.closeTo(8141.59, 1),
      virtualGoldCount: expect.closeTo(2.83, 1),
      virtualGoldValue: expect.closeTo(1415.93, 1),
      totalScore82: expect.closeTo(39787.61, 1),
      totalEquivalentLmd: expect.closeTo(42831.86, 1),
    })
  })
})
