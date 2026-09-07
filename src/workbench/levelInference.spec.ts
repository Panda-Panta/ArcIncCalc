import { describe, it, expect } from 'vitest'
import { inferFacilityLevels } from './levelInference'
import { createDefaultWorkspace } from './defaults'

describe('inferFacilityLevels', () => {
  it('infers all facilities to max level when there are 3 power plants (independent of staffing)', () => {
    const workspace = createDefaultWorkspace()
    const facilities = workspace.mainPlan.facilities

    // 3 power plants in output rooms
    facilities.room_1_3.type = 'power'
    facilities.room_2_3.type = 'power'
    facilities.room_3_3.type = 'power'

    // Manufacturing room with 0 operators
    facilities.room_1_1.type = 'manufacture'
    facilities.room_1_1.slots = []

    inferFacilityLevels(facilities)

    expect(facilities.room_1_1.level).toBe(3)
    expect(facilities.room_1_3.level).toBe(3)
    expect(facilities.dormitory_1.level).toBe(5)
    expect(facilities.dormitory_4.level).toBe(5)
    expect(facilities.meeting.level).toBe(3)
    expect(facilities.contact.level).toBe(3)
    expect(facilities.factory.level).toBe(3)
    expect(facilities.train.level).toBe(3)
  })

  it('infers stepped levels when there are 2 power plants', () => {
    const workspace = createDefaultWorkspace()
    const facilities = workspace.mainPlan.facilities

    // 2 power plants
    facilities.room_1_3.type = 'power'
    facilities.room_2_3.type = 'power'
    facilities.room_3_3.type = 'trading'

    // Room with 2 operators -> level 2
    facilities.room_1_1.type = 'manufacture'
    facilities.room_1_1.slots = [
      { occupant: { kind: 'operator', operatorId: 'char_1' }, groupId: null, replacements: [] },
      { occupant: { kind: 'operator', operatorId: 'char_2' }, groupId: null, replacements: [] },
    ]

    // Empty manufacture room -> fallback level 1
    facilities.room_1_2.type = 'manufacture'
    facilities.room_1_2.slots = []

    inferFacilityLevels(facilities)

    expect(facilities.dormitory_1.level).toBe(1)
    expect(facilities.dormitory_4.level).toBe(1)
    expect(facilities.room_1_3.level).toBe(3)
    expect(facilities.room_2_3.level).toBe(3)
    expect(facilities.room_1_1.level).toBe(2)
    expect(facilities.room_1_2.level).toBe(1)
    expect(facilities.meeting.level).toBe(3)
    expect(facilities.contact.level).toBe(3)
  })

  it('does NOT trigger exact 3-power rule when there are 4 power plants and leaves levels unchanged', () => {
    const workspace = createDefaultWorkspace()
    const facilities = workspace.mainPlan.facilities

    // 4 power plants
    facilities.room_1_3.type = 'power'
    facilities.room_2_3.type = 'power'
    facilities.room_3_3.type = 'power'
    facilities.room_1_2.type = 'power'

    // Set custom levels before inference
    facilities.dormitory_1.level = 2
    facilities.room_1_1.type = 'manufacture'
    facilities.room_1_1.level = 1
    facilities.meeting.level = 2

    inferFacilityLevels(facilities)

    // With 4 power plants, neither 3-power nor 2-power rule should apply; levels remain unchanged
    expect(facilities.dormitory_1.level).toBe(2)
    expect(facilities.room_1_1.level).toBe(1)
    expect(facilities.meeting.level).toBe(2)
  })

  it('infers levels 1, 2, and 3 for 2-power manufacture and trading rooms with 1, 2, and 3 occupants', () => {
    const workspace = createDefaultWorkspace()
    const facilities = workspace.mainPlan.facilities

    // 2 power plants
    facilities.room_1_3.type = 'power'
    facilities.room_2_3.type = 'power'

    // Manufacture rooms with 1, 2, and 3 occupants
    facilities.room_1_1.type = 'manufacture'
    facilities.room_1_1.slots = [
      { occupant: { kind: 'operator', operatorId: 'char_1' }, groupId: null, replacements: [] },
    ]

    facilities.room_1_2.type = 'manufacture'
    facilities.room_1_2.slots = [
      { occupant: { kind: 'operator', operatorId: 'char_1' }, groupId: null, replacements: [] },
      { occupant: { kind: 'operator', operatorId: 'char_2' }, groupId: null, replacements: [] },
    ]

    facilities.room_2_1.type = 'manufacture'
    facilities.room_2_1.slots = [
      { occupant: { kind: 'operator', operatorId: 'char_1' }, groupId: null, replacements: [] },
      { occupant: { kind: 'operator', operatorId: 'char_2' }, groupId: null, replacements: [] },
      { occupant: { kind: 'operator', operatorId: 'char_3' }, groupId: null, replacements: [] },
    ]

    // Trading rooms with 1, 2, and 3 occupants
    facilities.room_3_1.type = 'trading'
    facilities.room_3_1.slots = [
      { occupant: { kind: 'operator', operatorId: 'char_4' }, groupId: null, replacements: [] },
    ]

    facilities.room_3_2.type = 'trading'
    facilities.room_3_2.slots = [
      { occupant: { kind: 'operator', operatorId: 'char_4' }, groupId: null, replacements: [] },
      { occupant: { kind: 'operator', operatorId: 'char_5' }, groupId: null, replacements: [] },
    ]

    facilities.room_3_3.type = 'trading'
    facilities.room_3_3.slots = [
      { occupant: { kind: 'operator', operatorId: 'char_4' }, groupId: null, replacements: [] },
      { occupant: { kind: 'operator', operatorId: 'char_5' }, groupId: null, replacements: [] },
      { occupant: { kind: 'operator', operatorId: 'char_6' }, groupId: null, replacements: [] },
    ]

    inferFacilityLevels(facilities)

    // Manufacture levels 1, 2, 3
    expect(facilities.room_1_1.level).toBe(1)
    expect(facilities.room_1_2.level).toBe(2)
    expect(facilities.room_2_1.level).toBe(3)

    // Trading levels 1, 2, 3
    expect(facilities.room_3_1.level).toBe(1)
    expect(facilities.room_3_2.level).toBe(2)
    expect(facilities.room_3_3.level).toBe(3)
  })

  it('counts free and current slots as occupied when inferring levels in 2-power layout', () => {
    const workspace = createDefaultWorkspace()
    const facilities = workspace.mainPlan.facilities

    facilities.room_1_3.type = 'power'
    facilities.room_2_3.type = 'power'
    facilities.room_3_3.type = 'trading'

    // Manufacture with 1 free occupant -> level 1
    facilities.room_1_1.type = 'manufacture'
    facilities.room_1_1.slots = [
      { occupant: { kind: 'free' }, groupId: null, replacements: [] },
    ]

    // Manufacture with 1 free + 1 current -> level 2
    facilities.room_1_2.type = 'manufacture'
    facilities.room_1_2.slots = [
      { occupant: { kind: 'free' }, groupId: null, replacements: [] },
      { occupant: { kind: 'current' }, groupId: null, replacements: [] },
    ]

    // Trading with 1 operator + 1 free + 1 current -> level 3
    facilities.room_3_1.type = 'trading'
    facilities.room_3_1.slots = [
      { occupant: { kind: 'operator', operatorId: 'char_1' }, groupId: null, replacements: [] },
      { occupant: { kind: 'free' }, groupId: null, replacements: [] },
      { occupant: { kind: 'current' }, groupId: null, replacements: [] },
    ]

    inferFacilityLevels(facilities)

    expect(facilities.room_1_1.level).toBe(1)
    expect(facilities.room_1_2.level).toBe(2)
    expect(facilities.room_3_1.level).toBe(3)
  })

  it('does not count trailing empty slots towards facility level', () => {
    const workspace = createDefaultWorkspace()
    const facilities = workspace.mainPlan.facilities

    facilities.room_1_3.type = 'power'
    facilities.room_2_3.type = 'power'
    facilities.room_3_3.type = 'trading'

    // Manufacture: 1 operator followed by 2 empty slots -> level 1
    facilities.room_1_1.type = 'manufacture'
    facilities.room_1_1.slots = [
      { occupant: { kind: 'operator', operatorId: 'char_1' }, groupId: null, replacements: [] },
      { occupant: { kind: 'empty' }, groupId: null, replacements: [] },
      { occupant: { kind: 'empty' }, groupId: null, replacements: [] },
    ]

    // Manufacture: 1 free + 1 current followed by 1 empty slot -> level 2
    facilities.room_1_2.type = 'manufacture'
    facilities.room_1_2.slots = [
      { occupant: { kind: 'free' }, groupId: null, replacements: [] },
      { occupant: { kind: 'current' }, groupId: null, replacements: [] },
      { occupant: { kind: 'empty' }, groupId: null, replacements: [] },
    ]

    // Trading: 1 operator followed by 2 empty slots -> level 1
    facilities.room_3_1.type = 'trading'
    facilities.room_3_1.slots = [
      { occupant: { kind: 'operator', operatorId: 'char_2' }, groupId: null, replacements: [] },
      { occupant: { kind: 'empty' }, groupId: null, replacements: [] },
      { occupant: { kind: 'empty' }, groupId: null, replacements: [] },
    ]

    // Trading: 2 operators followed by 1 empty slot -> level 2
    facilities.room_3_2.type = 'trading'
    facilities.room_3_2.slots = [
      { occupant: { kind: 'operator', operatorId: 'char_2' }, groupId: null, replacements: [] },
      { occupant: { kind: 'operator', operatorId: 'char_3' }, groupId: null, replacements: [] },
      { occupant: { kind: 'empty' }, groupId: null, replacements: [] },
    ]

    inferFacilityLevels(facilities)

    expect(facilities.room_1_1.level).toBe(1)
    expect(facilities.room_1_2.level).toBe(2)
    expect(facilities.room_3_1.level).toBe(1)
    expect(facilities.room_3_2.level).toBe(2)
  })

  it('leaves facility levels unchanged for 0, 1, and 4 power layouts', () => {
    // 0 Power Plants
    const ws0 = createDefaultWorkspace()
    const f0 = ws0.mainPlan.facilities
    // Set all output rooms to manufacture
    f0.room_1_3.type = 'manufacture'
    f0.room_2_3.type = 'manufacture'
    f0.room_3_3.type = 'manufacture'
    f0.dormitory_1.level = 2
    f0.dormitory_2.level = 4
    f0.room_1_1.level = 1
    f0.meeting.level = 2
    f0.central.level = 4

    inferFacilityLevels(f0)

    expect(f0.dormitory_1.level).toBe(2)
    expect(f0.dormitory_2.level).toBe(4)
    expect(f0.room_1_1.level).toBe(1)
    expect(f0.meeting.level).toBe(2)
    expect(f0.central.level).toBe(4)

    // 1 Power Plant
    const ws1 = createDefaultWorkspace()
    const f1 = ws1.mainPlan.facilities
    f1.room_1_3.type = 'power'
    f1.room_2_3.type = 'manufacture'
    f1.room_3_3.type = 'manufacture'
    f1.dormitory_1.level = 2
    f1.dormitory_2.level = 4
    f1.room_1_1.level = 1
    f1.meeting.level = 2
    f1.central.level = 4

    inferFacilityLevels(f1)

    expect(f1.dormitory_1.level).toBe(2)
    expect(f1.dormitory_2.level).toBe(4)
    expect(f1.room_1_1.level).toBe(1)
    expect(f1.meeting.level).toBe(2)
    expect(f1.central.level).toBe(4)

    // 4 Power Plants
    const ws4 = createDefaultWorkspace()
    const f4 = ws4.mainPlan.facilities
    f4.room_1_3.type = 'power'
    f4.room_2_3.type = 'power'
    f4.room_3_3.type = 'power'
    f4.room_1_2.type = 'power'
    f4.dormitory_1.level = 2
    f4.dormitory_2.level = 4
    f4.room_1_1.level = 1
    f4.meeting.level = 2
    f4.central.level = 4

    inferFacilityLevels(f4)

    expect(f4.dormitory_1.level).toBe(2)
    expect(f4.dormitory_2.level).toBe(4)
    expect(f4.room_1_1.level).toBe(1)
    expect(f4.meeting.level).toBe(2)
    expect(f4.central.level).toBe(4)
  })
})


