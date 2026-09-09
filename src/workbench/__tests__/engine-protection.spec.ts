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
    expect(fileSha256('engine/calculate.ts')).toBe('6191f95a8a651d0add5e43c34744b4dbfd2493afeb63b220181ff2b9396391fb')
    expect(fileSha256('engine/morale.ts')).toBe('f2e4c1eee58bac88257f23b375ea7aa84059fb82d46c57ba88438e2689396fa2')
    expect(fileSha256('engine/operatorRules.ts')).toBe('84fae664ab138bcddf0b421a1c6ad8fd1ed8d4c23296746b4d1ec52c4b75630a')
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
    })
  })
})
