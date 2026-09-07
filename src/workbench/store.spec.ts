import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRosterWorkbenchStore } from './store'
import { createDefaultWorkspace } from './defaults'
import type { MowerOccupant, MowerSlot, RosterWorkspace } from './model'

describe('RosterWorkbenchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes with default schemaVersion 8 workspace and selectedRoomId room_1_1', () => {
    const store = useRosterWorkbenchStore()
    expect(store.workspace.schemaVersion).toBe(8)
    expect(store.workspace.name).toBe('默认排班')
    expect(store.selectedRoomId).toBe('room_1_1')
    expect(store.selectedRoom?.roomId).toBe('room_1_1')
    expect(store.selectedRoom?.type).toBe('manufacture')
  })

  it('loads workspace with structuredClone deep isolation (no mutation leakage)', () => {
    const store = useRosterWorkbenchStore()
    const customWs: RosterWorkspace = createDefaultWorkspace()
    customWs.name = '自定义排班'
    customWs.mainPlan.facilities.room_1_1.slots[0] = {
      occupant: { kind: 'operator', operatorId: 'char_002_amiya' },
      groupId: 'team_a',
      replacements: ['char_102_texas'],
    }

    store.loadWorkspace(customWs)
    expect(store.workspace.name).toBe('自定义排班')
    expect(store.workspace.mainPlan.facilities.room_1_1.slots[0]!.occupant).toEqual({
      kind: 'operator',
      operatorId: 'char_002_amiya',
    })

    // Mutating source object after load must NOT affect store
    customWs.name = '外部被修改'
    customWs.mainPlan.facilities.room_1_1.slots[0]!.replacements.push('char_extra')
    expect(store.workspace.name).toBe('自定义排班')
    expect(store.workspace.mainPlan.facilities.room_1_1.slots[0]!.replacements).toEqual(['char_102_texas'])

    // Mutating store must NOT affect source object
    store.workspace.name = 'Store被修改'
    expect(customWs.name).toBe('外部被修改')
  })

  it('updates selectedRoom and selectedRoomId correctly', () => {
    const store = useRosterWorkbenchStore()
    store.selectRoom('room_2_3')
    expect(store.selectedRoomId).toBe('room_2_3')
    expect(store.selectedRoom?.roomId).toBe('room_2_3')

    store.selectRoom(null)
    expect(store.selectedRoomId).toBeNull()
    expect(store.selectedRoom).toBeNull()
  })

  it('atomically swaps two output rooms including type, level, product, slots while preserving coordinate roomId', () => {
    const store = useRosterWorkbenchStore()
    const r1 = store.workspace.mainPlan.facilities.room_1_1
    const r2 = store.workspace.mainPlan.facilities.room_1_2

    r1.type = 'manufacture'
    r1.product = 'gold'
    r1.level = 2
    r1.slots = [
      { occupant: { kind: 'operator', operatorId: 'char_1' }, groupId: 'g1', replacements: ['char_sub1'] },
      { occupant: { kind: 'empty' }, groupId: null, replacements: [] },
    ]

    r2.type = 'trading'
    r2.product = 'money'
    r2.level = 3
    r2.slots = [
      { occupant: { kind: 'operator', operatorId: 'char_2' }, groupId: 'g2', replacements: ['char_sub2'] },
      { occupant: { kind: 'operator', operatorId: 'char_3' }, groupId: 'g2', replacements: [] },
      { occupant: { kind: 'empty' }, groupId: null, replacements: [] },
    ]

    store.swapOutputRooms('room_1_1', 'room_1_2')

    // Coordinate roomIds must remain preserved
    expect(store.workspace.mainPlan.facilities.room_1_1.roomId).toBe('room_1_1')
    expect(store.workspace.mainPlan.facilities.room_1_2.roomId).toBe('room_1_2')

    // Content of room_1_1 now has r2's previous content
    expect(store.workspace.mainPlan.facilities.room_1_1.type).toBe('trading')
    expect(store.workspace.mainPlan.facilities.room_1_1.product).toBe('money')
    expect(store.workspace.mainPlan.facilities.room_1_1.level).toBe(3)
    expect(store.workspace.mainPlan.facilities.room_1_1.slots[0]!.occupant).toEqual({
      kind: 'operator',
      operatorId: 'char_2',
    })
    expect(store.workspace.mainPlan.facilities.room_1_1.slots[1]!.occupant).toEqual({
      kind: 'operator',
      operatorId: 'char_3',
    })

    // Content of room_1_2 now has r1's previous content
    expect(store.workspace.mainPlan.facilities.room_1_2.type).toBe('manufacture')
    expect(store.workspace.mainPlan.facilities.room_1_2.product).toBe('gold')
    expect(store.workspace.mainPlan.facilities.room_1_2.level).toBe(2)
    expect(store.workspace.mainPlan.facilities.room_1_2.slots[0]!.occupant).toEqual({
      kind: 'operator',
      operatorId: 'char_1',
    })

    // Self swap should be a no-op
    store.swapOutputRooms('room_1_1', 'room_1_1')
    expect(store.workspace.mainPlan.facilities.room_1_1.type).toBe('trading')
  })

  it('updates facility with type safety and cannot overwrite coordinate roomId', () => {
    const store = useRosterWorkbenchStore()
    // Type-safe update: patch cannot change roomId
    store.updateFacility('room_1_1', {
      type: 'trading',
      level: 1,
      product: 'money',
      // @ts-expect-error: roomId should not be in update patch or cannot overwrite
      roomId: 'room_9_9',
    })

    const facility = store.workspace.mainPlan.facilities.room_1_1
    expect(facility.roomId).toBe('room_1_1')
    expect(facility.type).toBe('trading')
    expect(facility.level).toBe(1)
    expect(facility.product).toBe('money')
  })

  it('updates slot and occupant with structuredClone isolation', () => {
    const store = useRosterWorkbenchStore()
    const newSlot: MowerSlot = {
      occupant: { kind: 'operator', operatorId: 'char_002_amiya' },
      groupId: 'lead',
      replacements: ['char_103_angel'],
    }

    store.updateSlot('room_1_1', 0, newSlot)
    expect(store.workspace.mainPlan.facilities.room_1_1.slots[0]).toEqual(newSlot)

    // External mutation must not leak
    newSlot.replacements.push('external_leak')
    expect(store.workspace.mainPlan.facilities.room_1_1.slots[0]!.replacements).toEqual(['char_103_angel'])

    // Update occupant alone
    const newOccupant: MowerOccupant = { kind: 'free' }
    store.updateSlotOccupant('room_1_1', 0, newOccupant)
    expect(store.workspace.mainPlan.facilities.room_1_1.slots[0]!.occupant).toEqual({ kind: 'free' })
  })

  it('performs ordered replacement mutations: set, add, remove, reorder', () => {
    const store = useRosterWorkbenchStore()
    store.setReplacements('room_1_1', 0, ['rep_a', 'rep_b', 'rep_c'])
    expect(store.workspace.mainPlan.facilities.room_1_1.slots[0]!.replacements).toEqual(['rep_a', 'rep_b', 'rep_c'])

    // Add replacement
    store.addReplacement('room_1_1', 0, 'rep_d')
    expect(store.workspace.mainPlan.facilities.room_1_1.slots[0]!.replacements).toEqual([
      'rep_a',
      'rep_b',
      'rep_c',
      'rep_d',
    ])

    // Remove replacement at index 1 (rep_b)
    store.removeReplacement('room_1_1', 0, 1)
    expect(store.workspace.mainPlan.facilities.room_1_1.slots[0]!.replacements).toEqual(['rep_a', 'rep_c', 'rep_d'])

    // Reorder replacements: move rep_d from index 2 to index 0
    store.reorderReplacements('room_1_1', 0, 2, 0)
    expect(store.workspace.mainPlan.facilities.room_1_1.slots[0]!.replacements).toEqual(['rep_d', 'rep_a', 'rep_c'])
  })

  it('replaces operator globally across primaries, replacements, and policy lists', () => {
    const store = useRosterWorkbenchStore()
    const f1 = store.workspace.mainPlan.facilities.room_1_1
    const f2 = store.workspace.mainPlan.facilities.dormitory_1
    const conf = store.workspace.mainPlan.conf

    f1.slots = [{ occupant: { kind: 'operator', operatorId: 'char_old' }, groupId: null, replacements: ['char_other'] }]
    f2.slots = [{ occupant: { kind: 'operator', operatorId: 'char_safe' }, groupId: null, replacements: ['char_old'] }]
    conf.exhaust_require = ['char_old', 'char_stay']
    conf.rest_in_full = ['char_old']

    store.replaceOperatorGlobally('char_old', 'char_new')

    expect(f1.slots[0]!.occupant).toEqual({ kind: 'operator', operatorId: 'char_new' })
    expect(f2.slots[0]!.replacements).toEqual(['char_new'])
    expect(conf.exhaust_require).toEqual(['char_new', 'char_stay'])
    expect(conf.rest_in_full).toEqual(['char_new'])

    // Same operator or empty should no-op
    store.replaceOperatorGlobally('char_new', 'char_new')
    expect(f1.slots[0]!.occupant).toEqual({ kind: 'operator', operatorId: 'char_new' })
  })

  it('updates conf fields cleanly', () => {
    const store = useRosterWorkbenchStore()
    store.updateConf({
      ling_xi: 3,
      exhaust_require: ['令', '夕'],
      workaholic: ['阿米娅'],
    })

    expect(store.workspace.mainPlan.conf.ling_xi).toBe(3)
    expect(store.workspace.mainPlan.conf.exhaust_require).toEqual(['令', '夕'])
    expect(store.workspace.mainPlan.conf.workaholic).toEqual(['阿米娅'])
  })

  it('runs inferLevels invoking intelligent level inference', () => {
    const store = useRosterWorkbenchStore()
    // Configure 2 power plants
    store.workspace.mainPlan.facilities.room_1_3.type = 'power'
    store.workspace.mainPlan.facilities.room_2_3.type = 'power'
    store.workspace.mainPlan.facilities.room_3_3.type = 'trading'

    store.workspace.mainPlan.facilities.room_1_1.type = 'manufacture'
    store.workspace.mainPlan.facilities.room_1_1.slots = [
      { occupant: { kind: 'operator', operatorId: 'c1' }, groupId: null, replacements: [] },
      { occupant: { kind: 'operator', operatorId: 'c2' }, groupId: null, replacements: [] },
    ]

    store.inferLevels()

    expect(store.workspace.mainPlan.facilities.dormitory_1.level).toBe(1)
    expect(store.workspace.mainPlan.facilities.room_1_1.level).toBe(2)
  })

  it('resets workspace back to fresh default', () => {
    const store = useRosterWorkbenchStore()
    store.workspace.name = '修改的名字'
    store.resetWorkspace()
    expect(store.workspace.name).toBe('默认排班')
  })
})
