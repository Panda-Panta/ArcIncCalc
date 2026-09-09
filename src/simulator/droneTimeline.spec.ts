import { describe, expect, it } from 'vitest'
import { createDroneState, generateDrones, spendDrones } from './droneTimeline'

describe('drone stock', () => {
  it('tracks fractional charging, whole drones, overflow and consumption', () => {
    const initial = createDroneState(234)
    const charged = generateDrones(initial, 9, 1 / 6)
    expect(charged.stock).toBe(235)
    expect(charged.overflow).toBe(0.5)
    const used = spendDrones(charged, 2)
    expect(used.baseMinutes).toBe(6)
    expect(used.state.stock).toBe(233)
    expect(used.state.stock).toBe(used.state.initial + used.state.generated - used.state.overflow - used.state.consumed)
    expect(initial.stock).toBe(234)
  })
  it('does not spend fractional or unavailable drones', () => {
    const state = createDroneState(1.5)
    expect(() => spendDrones(state, 2)).toThrow()
    expect(() => spendDrones(state, 0.5)).toThrow()
    expect(() => generateDrones(state, -1, 1)).toThrow()
    expect(() => createDroneState(236)).toThrow()
    expect(() => generateDrones(state, 1, NaN)).toThrow()
  })
})
