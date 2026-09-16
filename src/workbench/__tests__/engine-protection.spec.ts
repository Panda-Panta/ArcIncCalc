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
    // Exact baseline SHA256 hashes of the untouched engine files (normalized LF)
    expect(fileSha256('engine/calculate.ts')).toBe('50302fa8f0223610ef2d2e781a9db687f7fc4e5759555ba9c9919e4168ab2921')
    expect(fileSha256('engine/morale.ts')).toBe('6c3d6bbfce1101325bcc2823968a44c008224e2b8082524a70d44a45ebecbc58')
    expect(fileSha256('engine/operatorRules.ts')).toBe('59eaa299c8dbf11c3d2a3b2c171ec54da0bcf2593d25e33a086b3436534d6486')
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
