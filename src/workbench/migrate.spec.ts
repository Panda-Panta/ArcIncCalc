import { describe, it, expect } from 'vitest'
import { createDefaultConfig } from '../domain/defaults'
import { migrateAppConfigToWorkspace, COMPAT_OPERATOR_GROUPS_KEY } from './migrate'
import { MOWER_OUTPUT_ROOM_IDS } from './model'

describe('migrateAppConfigToWorkspace', () => {
  it('migrates standard v7 AppConfig into v8 RosterWorkspace mapping all 9 output rooms, control, dorms, and functional rooms', () => {
    const legacy = createDefaultConfig()
    legacy.planName = '自定义排班方案'

    // Configure 9 output rooms with different types, levels, and products/strategies
    // B1: manufacture gold, lv2
    legacy.rooms[0]!.type = 'manufacture'
    legacy.rooms[0]!.level = 2
    legacy.rooms[0]!.product = 'gold'
    legacy.rooms[0]!.operatorIds = ['char_002_amiya', 'char_102_texas']

    // B2: manufacture exp, lv3
    legacy.rooms[1]!.type = 'manufacture'
    legacy.rooms[1]!.level = 3
    legacy.rooms[1]!.product = 'exp'
    legacy.rooms[1]!.operatorIds = ['char_103_angel']

    // B3: manufacture fragment, lv1
    legacy.rooms[2]!.type = 'manufacture'
    legacy.rooms[2]!.level = 1
    legacy.rooms[2]!.product = 'fragment'
    legacy.rooms[2]!.operatorIds = []

    // B4: trading gold (money), lv3
    legacy.rooms[3]!.type = 'trading'
    legacy.rooms[3]!.level = 3
    legacy.rooms[3]!.strategy = 'gold'
    legacy.rooms[3]!.operatorIds = ['char_106_franka']

    // B5: trading orundum, lv2
    legacy.rooms[4]!.type = 'trading'
    legacy.rooms[4]!.level = 2
    legacy.rooms[4]!.strategy = 'orundum'
    legacy.rooms[4]!.operatorIds = ['char_107_liskam']

    // B6: power, lv3
    legacy.rooms[5]!.type = 'power'
    legacy.rooms[5]!.level = 3
    legacy.rooms[5]!.operatorIds = ['char_108_silent']

    // B7..B9: default power rooms
    legacy.rooms[6]!.type = 'power'
    legacy.rooms[6]!.level = 3
    legacy.rooms[7]!.type = 'power'
    legacy.rooms[7]!.level = 3
    legacy.rooms[8]!.type = 'power'
    legacy.rooms[8]!.level = 3

    // Operator groups
    legacy.operatorGroups = [
      { id: 'team_a', name: 'A组', operatorIds: ['char_002_amiya', 'char_108_silent'] },
      { id: 'team_b', name: 'B组', operatorIds: ['char_106_franka'] },
    ]

    // Backups
    legacy.operatorBackups = {
      char_002_amiya: 'char_103_angel',
      char_106_franka: 'char_107_liskam',
    }

    // Central (control)
    legacy.controlOperatorIds = ['char_002_amiya']

    // Dormitories levels and operators
    legacy.facilities.dormitories = [1, 2, 3, 4]
    legacy.facilityOperatorIds.dormitories = [
      ['char_102_texas'],
      ['char_103_angel'],
      [],
      ['char_107_liskam'],
    ]

    // Reception (meeting)
    legacy.facilities.reception = 2
    legacy.facilityOperatorIds.reception = ['char_106_franka']

    // Workshop (factory)
    legacy.facilities.workshop = 1
    legacy.facilityOperatorIds.workshop = ['char_108_silent']

    // Office (contact)
    legacy.facilities.office = 3
    legacy.facilityOperatorIds.office = ['char_002_amiya']

    // Training (train)
    legacy.facilities.training = 2
    legacy.facilityOperatorIds.training = ['char_102_texas']

    // Initial morale
    legacy.operatorMorale = { char_002_amiya: 12, char_102_texas: 24 }
    legacy.zeroMoraleOperatorIds = ['char_103_angel']

    const ws = migrateAppConfigToWorkspace(legacy)

    // Verify workspace metadata
    expect(ws.schemaVersion).toBe(8)
    expect(ws.name).toBe('自定义排班方案')
    expect(ws.mainPlan.name).toBe('自定义排班方案')
    expect(ws.mainPlan.id).toBe('plan1')

    const facilities = ws.mainPlan.facilities

    // 1. Output rooms
    expect(MOWER_OUTPUT_ROOM_IDS).toHaveLength(9)

    // B1: room_1_1
    expect(facilities.room_1_1.type).toBe('manufacture')
    expect(facilities.room_1_1.level).toBe(2)
    expect(facilities.room_1_1.product).toBe('gold')
    expect(facilities.room_1_1.slots).toHaveLength(2)
    expect(facilities.room_1_1.slots[0]!.occupant).toEqual({ kind: 'operator', operatorId: 'char_002_amiya' })
    expect(facilities.room_1_1.slots[0]!.groupId).toBe('team_a')
    expect(facilities.room_1_1.slots[0]!.replacements).toEqual(['char_103_angel'])
    expect(facilities.room_1_1.slots[1]!.occupant).toEqual({ kind: 'operator', operatorId: 'char_102_texas' })
    expect(facilities.room_1_1.slots[1]!.groupId).toBeNull()
    expect(facilities.room_1_1.slots[1]!.replacements).toEqual([])

    // B2: room_1_2
    expect(facilities.room_1_2.type).toBe('manufacture')
    expect(facilities.room_1_2.level).toBe(3)
    expect(facilities.room_1_2.product).toBe('exp')
    expect(facilities.room_1_2.slots).toHaveLength(1)

    // B3: room_1_3
    expect(facilities.room_1_3.type).toBe('manufacture')
    expect(facilities.room_1_3.level).toBe(1)
    expect(facilities.room_1_3.product).toBe('fragment')
    expect(facilities.room_1_3.slots).toHaveLength(0)

    // B4: room_2_1 (trading gold -> money)
    expect(facilities.room_2_1.type).toBe('trading')
    expect(facilities.room_2_1.level).toBe(3)
    expect(facilities.room_2_1.product).toBe('money')
    expect(facilities.room_2_1.slots[0]!.groupId).toBe('team_b')
    expect(facilities.room_2_1.slots[0]!.replacements).toEqual(['char_107_liskam'])

    // B5: room_2_2 (trading orundum -> orundum)
    expect(facilities.room_2_2.type).toBe('trading')
    expect(facilities.room_2_2.level).toBe(2)
    expect(facilities.room_2_2.product).toBe('orundum')

    // B6: room_2_3 (power -> undefined product)
    expect(facilities.room_2_3.type).toBe('power')
    expect(facilities.room_2_3.level).toBe(3)
    expect(facilities.room_2_3.product).toBeUndefined()
    expect(facilities.room_2_3.slots[0]!.groupId).toBe('team_a')

    // B7..B9: power rooms
    expect(facilities.room_3_1.type).toBe('power')
    expect(facilities.room_3_2.type).toBe('power')
    expect(facilities.room_3_3.type).toBe('power')

    // 2. Central (control)
    expect(facilities.central.type).toBe('central')
    expect(facilities.central.level).toBe(5)
    expect(facilities.central.slots).toHaveLength(1)
    expect(facilities.central.slots[0]!.occupant).toEqual({ kind: 'operator', operatorId: 'char_002_amiya' })
    expect(facilities.central.slots[0]!.groupId).toBe('team_a')
    expect(facilities.central.slots[0]!.replacements).toEqual(['char_103_angel'])

    // 3. Four dorms
    expect(facilities.dormitory_1.type).toBe('dormitory')
    expect(facilities.dormitory_1.level).toBe(1)
    expect(facilities.dormitory_1.slots).toHaveLength(1)
    expect(facilities.dormitory_1.slots[0]!.occupant).toEqual({ kind: 'operator', operatorId: 'char_102_texas' })

    expect(facilities.dormitory_2.type).toBe('dormitory')
    expect(facilities.dormitory_2.level).toBe(2)
    expect(facilities.dormitory_2.slots).toHaveLength(1)
    expect(facilities.dormitory_2.slots[0]!.occupant).toEqual({ kind: 'operator', operatorId: 'char_103_angel' })

    expect(facilities.dormitory_3.type).toBe('dormitory')
    expect(facilities.dormitory_3.level).toBe(3)
    expect(facilities.dormitory_3.slots).toHaveLength(0)

    expect(facilities.dormitory_4.type).toBe('dormitory')
    expect(facilities.dormitory_4.level).toBe(4)
    expect(facilities.dormitory_4.slots).toHaveLength(1)
    expect(facilities.dormitory_4.slots[0]!.occupant).toEqual({ kind: 'operator', operatorId: 'char_107_liskam' })

    // 4. Functional facilities: meeting (reception), factory (workshop), contact (office), train (training)
    expect(facilities.meeting.type).toBe('meeting')
    expect(facilities.meeting.level).toBe(2)
    expect(facilities.meeting.slots[0]!.occupant).toEqual({ kind: 'operator', operatorId: 'char_106_franka' })
    expect(facilities.meeting.slots[0]!.groupId).toBe('team_b')
    expect(facilities.meeting.slots[0]!.replacements).toEqual(['char_107_liskam'])

    expect(facilities.factory.type).toBe('factory')
    expect(facilities.factory.level).toBe(1)
    expect(facilities.factory.slots[0]!.occupant).toEqual({ kind: 'operator', operatorId: 'char_108_silent' })
    expect(facilities.factory.slots[0]!.groupId).toBe('team_a')

    expect(facilities.contact.type).toBe('contact')
    expect(facilities.contact.level).toBe(3)
    expect(facilities.contact.slots[0]!.occupant).toEqual({ kind: 'operator', operatorId: 'char_002_amiya' })

    expect(facilities.train.type).toBe('train')
    expect(facilities.train.level).toBe(2)
    expect(facilities.train.slots[0]!.occupant).toEqual({ kind: 'operator', operatorId: 'char_102_texas' })

    // 5. Initial morale & unrepresented fields in compatibility envelope
    expect(ws.compatibility.sourceVersion).toBe('7')
    expect(ws.compatibility.unrecognizedFields.operatorMorale).toEqual({ char_002_amiya: 12, char_102_texas: 24 })
    expect(ws.compatibility.unrecognizedFields.zeroMoraleOperatorIds).toEqual(['char_103_angel'])
  })

  it('handles default config cleanly with fallback values', () => {
    const defaultConfig = createDefaultConfig()
    const ws = migrateAppConfigToWorkspace(defaultConfig)

    expect(ws.schemaVersion).toBe(8)
    expect(ws.name).toBe('243 标准方案')
    expect(ws.mainPlan.name).toBe('243 标准方案')

    // Central is empty
    expect(ws.mainPlan.facilities.central.slots).toEqual([])

    // Meeting is empty
    expect(ws.mainPlan.facilities.meeting.slots).toEqual([])

    // Dormitories have level 5
    expect(ws.mainPlan.facilities.dormitory_1.level).toBe(5)
    expect(ws.mainPlan.facilities.dormitory_4.level).toBe(5)

    // Functional rooms have level 3
    expect(ws.mainPlan.facilities.meeting.level).toBe(3)
    expect(ws.mainPlan.facilities.factory.level).toBe(3)
    expect(ws.mainPlan.facilities.contact.level).toBe(3)
    expect(ws.mainPlan.facilities.train.level).toBe(3)
  })

  it('migrates dormitory levels even when facilityOperatorIds.dormitories is absent', () => {
    const legacy = createDefaultConfig()
    legacy.facilities.dormitories = [2, 3, 4, 1]
    delete (legacy.facilityOperatorIds as Partial<typeof legacy.facilityOperatorIds>).dormitories

    const ws = migrateAppConfigToWorkspace(legacy)

    expect(ws.mainPlan.facilities.dormitory_1.level).toBe(2)
    expect(ws.mainPlan.facilities.dormitory_2.level).toBe(3)
    expect(ws.mainPlan.facilities.dormitory_3.level).toBe(4)
    expect(ws.mainPlan.facilities.dormitory_4.level).toBe(1)
  })

  it('stores original group metadata in compatibility.unrecognizedFields with a typed internal key', () => {
    const legacy = createDefaultConfig()
    legacy.operatorGroups = [
      { id: 'team_alpha', name: '阿尔法作战小队', operatorIds: ['char_002_amiya'] },
      { id: 'team_beta', name: '贝塔支援小队', operatorIds: ['char_102_texas'] },
    ]

    const ws = migrateAppConfigToWorkspace(legacy)

    expect(ws.compatibility.unrecognizedFields[COMPAT_OPERATOR_GROUPS_KEY]).toEqual([
      { id: 'team_alpha', name: '阿尔法作战小队', operatorIds: ['char_002_amiya'] },
      { id: 'team_beta', name: '贝塔支援小队', operatorIds: ['char_102_texas'] },
    ])
  })

  it('preserves empty planName without falling back to default plan name', () => {
    const legacy = createDefaultConfig()
    legacy.planName = ''

    const ws = migrateAppConfigToWorkspace(legacy)

    expect(ws.name).toBe('')
    expect(ws.mainPlan.name).toBe('')
  })
})

