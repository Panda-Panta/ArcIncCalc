import { describe, expect, it } from 'vitest'
import { createDefaultWorkspace } from './defaults'
import { runCalculationBridge } from './calculationBridge'

describe('runCalculationBridge engine options', () => {
  it('defaults to legacy engine and returns a valid report', () => {
    const ws = createDefaultWorkspace()
    const result = runCalculationBridge(ws)

    expect(result.success).toBe(true)
    expect(result.engine).toBe('legacy')
    expect(result.report).not.toBeNull()
    expect(result.report?.power.sufficient).toBe(true)
  })

  it('runs legacy engine explicitly when options.engine is legacy', () => {
    const ws = createDefaultWorkspace()
    const result = runCalculationBridge(ws, { engine: 'legacy' })

    expect(result.success).toBe(true)
    expect(result.engine).toBe('legacy')
    expect(result.report).not.toBeNull()
  })

  it('returns unavailable diagnostic and null report for event-v2 without wrapping legacy numbers', () => {
    const ws = createDefaultWorkspace()
    const result = runCalculationBridge(ws, { engine: 'event-v2' })

    expect(result.success).toBe(false)
    expect(result.engine).toBe('event-v2')
    // Strictly null report - NEVER wrap legacy numbers!
    expect(result.report).toBeNull()
    expect(result.diagnostics).toBeDefined()
    expect(result.diagnostics?.some(d => d.code === 'EVENT_V2_UNAVAILABLE')).toBe(true)
    expect(result.error).toContain('event-v2')
  })

  it('stops before calculation if validation fails', () => {
    const ws = createDefaultWorkspace()
    // Introduce critical error: duplicate primary operator in central
    ws.mainPlan.facilities.central.slots = [
      { occupant: { kind: 'operator', operatorId: '阿米娅' }, groupId: null, replacements: [] },
      { occupant: { kind: 'operator', operatorId: '阿米娅' }, groupId: null, replacements: [] },
    ]

    const result = runCalculationBridge(ws, { engine: 'legacy' })
    expect(result.success).toBe(false)
    expect(result.report).toBeNull()
    expect(result.error).toBe('排班存在阻断错误，无法进行收益计算')
  })
})
