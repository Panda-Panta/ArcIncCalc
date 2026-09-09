import { expect, it } from 'vitest'
import { simulateMoraleTimeline } from '../simulator/moraleTimeline'
it('Fiammetta recovers at exactly 2/h, exchanges morale and reselects ordered targets', () => {
  const r = simulateMoraleTimeline({ positions: [
    { id: 'a', roomId: 'r', primary: 'A', candidates: [], permanent: true },
    { id: 'b', roomId: 's', primary: 'B', candidates: [], permanent: true },
    { id: 'f', roomId: 'd', primary: 'F', candidates: [], dormitory: true, permanent: true },
  ], beds: [], initialMorale: { A: 2, B: 1, F: 22 }, fiammetta: { operatorId: 'F', orderedTargets: ['A', 'B'], threshold: 20 } }, 1, { workRate: () => 1, recoveryRate: () => 99 })
  expect(r.finalState.morale.F).toBe(1)
  expect(r.finalState.morale.A).toBe(24)
  expect(r.finalState.morale.B).toBe(0)
  expect(r.finalState.events.filter(e => e.type === 'fiammetta').map(e => e.operators)).toEqual([['F', 'A']])
})
