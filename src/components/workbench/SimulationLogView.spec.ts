/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SimulationLogView from './SimulationLogView.vue'
import type { ScheduleSimulationReport } from '../../simulator/scheduleSimulation'

function createSampleReport(): ScheduleSimulationReport {
  return {
    schemaVersion: 1,
    engine: 'mower-morale-v1',
    success: true,
    elapsedHours: 48,
    observedHours: 48,
    assumptions: {
      sampleHours: 48,
      warmupHours: 0,
      maxStepHours: 0.25,
      warmupModel: 'continuous',
      restingThreshold: 0.65,
      operationDurationHours: 0,
      dormAtmosphere: '',
      singleRecoveryTarget: '',
    },
    inputs: {
      schedule: {
        schemaVersion: 1,
        rooms: [
          {
            roomId: 'room_1_1',
            type: 'manufacture',
            level: 3,
            capacity: 1,
            slots: [
              {
                roomId: 'room_1_1',
                slotIndex: 0,
                occupant: { kind: 'operator', operatorId: 'char_102_texas' },
                primaryOperatorId: 'char_102_texas',
                orderedCandidates: [],
                groupId: null,
                role: 'work',
              },
            ],
          },
        ],
        operators: {},
        restPools: [],
        policies: {} as any,
        fiammettaPolicies: [],
        runOrderPolicies: [],
      } as any,
      options: {},
    },
    operators: [
      { operatorId: 'char_102_texas', operatorName: '德克萨斯', mainWorkHours: 24, substituteWorkHours: 0, workHours: 24, exhaustedHours: 0, restHours: 24, idleHours: 0, workFraction: 0.5, workRestRatio: 1, initialMorale: 24, finalMorale: 24 },
    ],
    rooms: [
      { roomId: 'room_1_1', roomType: 'manufacture', averageEfficiencyPercent: 130, efficiencyPercentHours: 6240, occupiedHours: 48, teams: [] },
    ],
    events: [
      { time: 24, type: 'shift-off', operators: ['char_102_texas'] },
    ],
    segments: [
      { start: 0, end: 48, occupants: { room_1_1_0: 'char_102_texas' }, bedOccupants: {}, morale: { char_102_texas: 18 }, efficiencyPercent: { room_1_1: 130 } },
    ],
    diagnostics: [],
  }
}

describe('SimulationLogView.vue', () => {
  it('renders empty state when report is null', () => {
    const wrapper = mount(SimulationLogView, {
      props: { report: null },
    })

    expect(wrapper.find('.log-empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无模拟日志数据')
  })

  it('renders report details and ScheduleTimelineGantt when report is passed', () => {
    const wrapper = mount(SimulationLogView, {
      props: { report: createSampleReport() },
    })

    expect(wrapper.find('.log-empty-state').exists()).toBe(false)
    expect(wrapper.find('.status-summary-bar').exists()).toBe(true)
    expect(wrapper.find('[data-test="schedule-timeline-gantt"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('模拟运行过程与计算日志')
    expect(wrapper.text()).toContain('德克萨斯')
  })
})
