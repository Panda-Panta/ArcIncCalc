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
    // The patch explicitly sets level: 1, which is respected now that level editing is unlocked.
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

  it('re-infers the complete facility layout after a type edit changes 3 power plants to 2', () => {
    const store = useRosterWorkbenchStore()
    const facilities = store.workspace.mainPlan.facilities

    expect(facilities.dormitory_1.level).toBe(5)
    store.updateFacility('room_3_3', { type: 'manufacture', product: 'gold' })

    expect(facilities.room_3_3.level).toBe(1)
    expect(facilities.dormitory_1.level).toBe(1)
    expect(facilities.dormitory_4.level).toBe(1)
    expect(facilities.room_1_3.level).toBe(3)
    expect(facilities.room_2_3.level).toBe(3)
    expect(facilities.meeting.level).toBe(3)
    expect(facilities.contact.level).toBe(3)
    expect(facilities.factory.level).toBe(3)
    expect(facilities.train.level).toBe(3)
    expect(facilities.central.level).toBe(5)
  })

  it('allows manual level modification when updateFacility is called with level', () => {
    const store = useRosterWorkbenchStore()
    const facilities = store.workspace.mainPlan.facilities

    store.updateFacility('room_1_1', { level: 2 })
    expect(facilities.room_1_1.level).toBe(2)

    store.updateFacility('room_1_1', { level: 1 })
    expect(facilities.room_1_1.level).toBe(1)

    store.updateFacility('dormitory_1', { level: 3 })
    expect(facilities.dormitory_1.level).toBe(3)
  })

  it('resets workspace back to fresh default', () => {
    const store = useRosterWorkbenchStore()
    store.workspace.name = '修改的名字'
    store.resetWorkspace()
    expect(store.workspace.name).toBe('默认排班')
  })

  it('idempotently appends roomId to importedPresentRooms across room-editing operations and swapOutputRooms', () => {
    const store = useRosterWorkbenchStore()
    const customWs = createDefaultWorkspace()
    customWs.compatibility.importedPresentRooms = ['room_1_1']
    store.loadWorkspace(customWs)

    // 1. updateFacility on new room
    store.updateFacility('room_1_2', { type: 'trading' })
    expect(store.workspace.compatibility.importedPresentRooms).toEqual(['room_1_1', 'room_1_2'])

    // Idempotent: editing existing room does not duplicate or reorder
    store.updateFacility('room_1_1', { level: 2 })
    expect(store.workspace.compatibility.importedPresentRooms).toEqual(['room_1_1', 'room_1_2'])

    // 2. swapOutputRooms marks both rooms
    store.swapOutputRooms('room_1_2', 'room_2_1')
    expect(store.workspace.compatibility.importedPresentRooms).toEqual(['room_1_1', 'room_1_2', 'room_2_1'])

    // 3. updateSlot
    store.updateSlot('room_2_2', 0, {
      occupant: { kind: 'empty' },
      groupId: null,
      replacements: [],
    })
    expect(store.workspace.compatibility.importedPresentRooms).toContain('room_2_2')

    // 4. updateSlotOccupant
    store.updateSlotOccupant('room_2_3', 0, { kind: 'free' })
    expect(store.workspace.compatibility.importedPresentRooms).toContain('room_2_3')

    // 5. updateSlotGroup
    store.updateSlotGroup('room_3_1', 0, 'new_group')
    expect(store.workspace.compatibility.importedPresentRooms).toContain('room_3_1')

    // 6. setReplacements
    store.setReplacements('room_3_2', 0, ['char_002_amiya'])
    expect(store.workspace.compatibility.importedPresentRooms).toContain('room_3_2')

    // 7. addReplacement
    store.addReplacement('room_3_3', 0, 'char_102_texas')
    expect(store.workspace.compatibility.importedPresentRooms).toContain('room_3_3')

    // 8. removeReplacement
    store.workspace.mainPlan.facilities.dormitory_1.slots[0]!.replacements = ['rep_to_remove']
    store.removeReplacement('dormitory_1', 0, 0)
    expect(store.workspace.compatibility.importedPresentRooms).toContain('dormitory_1')

    // 9. reorderReplacements
    store.workspace.mainPlan.facilities.central.slots[0]!.replacements = ['a', 'b']
    store.reorderReplacements('central', 0, 0, 1)
    expect(store.workspace.compatibility.importedPresentRooms).toContain('central')
  })

  it('leaves importedPresentRooms undefined when editing on a newly created workspace', () => {
    const store = useRosterWorkbenchStore()
    expect(store.workspace.compatibility.importedPresentRooms).toBeUndefined()

    store.updateFacility('room_1_2', { type: 'trading' })
    store.swapOutputRooms('room_1_1', 'room_1_2')
    store.updateSlotOccupant('room_2_1', 0, { kind: 'free' })

    expect(store.workspace.compatibility.importedPresentRooms).toBeUndefined()
  })

  it('clears rawProduct when updateFacility patch contains product, and clears rawName when patch contains type', () => {
    const store = useRosterWorkbenchStore()
    const customWs = createDefaultWorkspace()
    customWs.compatibility.facilityMetadata = {
      room_1_1: {
        rawName: '原制造站',
        rawProduct: 'custom_ore',
        otherMeta: 'keep_this',
      },
    }
    store.loadWorkspace(customWs)

    // Explicit product in patch clears rawProduct
    store.updateFacility('room_1_1', { product: undefined })
    expect(store.workspace.compatibility.facilityMetadata?.room_1_1?.rawProduct).toBeUndefined()
    expect(store.workspace.compatibility.facilityMetadata?.room_1_1?.rawName).toBe('原制造站')
    expect(store.workspace.compatibility.facilityMetadata?.room_1_1?.otherMeta).toBe('keep_this')

    // Explicit type in patch clears rawName
    store.updateFacility('room_1_1', { type: 'trading' })
    expect(store.workspace.compatibility.facilityMetadata?.room_1_1?.rawName).toBeUndefined()
    expect(store.workspace.compatibility.facilityMetadata?.room_1_1?.otherMeta).toBe('keep_this')
  })
})
