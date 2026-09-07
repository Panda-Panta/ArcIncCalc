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
    expect(fileSha256('engine/calculate.ts')).toBe('0f3f212b12e6b410841961b7ea385a3f757570abe7f968f69dad005c11602bf6')
    expect(fileSha256('engine/morale.ts')).toBe('d77cfa8fc8e3cfeb0b8054e2e5a9bff3970338f3494e4851b16d01ab1de22136')
    expect(fileSha256('engine/operatorRules.ts')).toBe('20062d7d5715f10267f73e8267763b63cf103331a2ea08e0843c28c2dbb5e0a4')
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
      orderLmd: expect.closeTo(41769.91, 1),
      fragments: 0,
      orundum: 0,
      goldConsumed: expect.closeTo(69.38, 1),
      fragmentsConsumed: 0,
    })
  })
})
