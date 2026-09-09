import { advanceRoster, createRosterRuntime, MORALE_EPSILON, nextRosterEventHours, settleRoster, type RuntimeConfig, type RuntimeRates } from '../scheduler/rosterRuntime'
export interface MoraleSegment { start: number; end: number; occupants: Record<string, string>; morale: Record<string, number>; bedOccupants: Record<string, string> }
export function simulateMoraleTimeline(config: RuntimeConfig, duration: number, rates: RuntimeRates) {
  if (!Number.isFinite(duration) || duration < 0) throw new Error('Invalid timeline duration')
  const state = createRosterRuntime(config); const segments: MoraleSegment[] = []
  settleRoster(state)
  while (state.time < duration - MORALE_EPSILON) {
    if (segments.length >= 1000000) throw new Error('Roster event limit reached')
    const hours = Math.min(nextRosterEventHours(state, rates), duration - state.time)
    if (!Number.isFinite(hours) || hours <= MORALE_EPSILON || state.time + hours <= state.time) {
      break
    }
    segments.push({ start: state.time, end: state.time + hours, occupants: { ...state.occupants }, morale: { ...state.morale }, bedOccupants: { ...state.bedOccupants } })
    advanceRoster(state, hours, rates); settleRoster(state)
  }
  return { segments, finalState: state }
}
