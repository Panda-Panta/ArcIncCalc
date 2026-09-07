/**
 * @vitest-environment jsdom
 *
 * Derivative work based on arknights-mower (PlanEditor.vue / SlickOperatorSelect.vue)
 * Original work Copyright (c) 2021 Nano
 * Licensed under the MIT License
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OperatorSelectModal from './OperatorSelectModal.vue'
import { useRosterWorkbenchStore } from '../../workbench/store'

describe('OperatorSelectModal.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders modal with search bar and 45px avatar grid when open is true', () => {
    const wrapper = mount(OperatorSelectModal, {
      props: {
        open: true,
        mode: 'main',
        roomId: 'room_1_1',
        slotIndex: 0,
      },
      attachTo: document.body,
      global: {
        stubs: {
          teleport: true,
          Teleport: true,
        },
      },
    })

    expect(wrapper.find('.search-input').exists()).toBe(true)
    expect(wrapper.find('.operator-grid').exists()).toBe(true)
    const items = wrapper.findAll('.operator-item')
    expect(items.length).toBeGreaterThan(0)
    const firstAvatar = wrapper.find('.operator-avatar')
    expect(firstAvatar.exists()).toBe(true)
    expect(firstAvatar.attributes('width')).toBe('45')
    expect(firstAvatar.attributes('height')).toBe('45')
  })

  describe('Search features (中文, 拼音全拼, 首字母)', () => {
    it('searches by Chinese character name', async () => {
      const wrapper = mount(OperatorSelectModal, {
        props: {
          open: true,
          mode: 'main',
          roomId: 'room_1_1',
          slotIndex: 0,
        },
        attachTo: document.body,
        global: {
          stubs: {
            teleport: true,
            Teleport: true,
          },
        },
      })

      const searchInput = wrapper.find('.search-input input')
      await searchInput.setValue('银灰')

      const items = wrapper.findAll('.operator-item')
      expect(items.length).toBeGreaterThan(0)
      const firstItem = items[0]
      expect(firstItem).toBeDefined()
      expect(firstItem!.attributes('data-op-name')).toBe('银灰')
    })

    it('searches by full pinyin (e.g. yinhui)', async () => {
      const wrapper = mount(OperatorSelectModal, {
        props: {
          open: true,
          mode: 'main',
          roomId: 'room_1_1',
          slotIndex: 0,
        },
        attachTo: document.body,
        global: {
          stubs: {
            teleport: true,
            Teleport: true,
          },
        },
      })

      const searchInput = wrapper.find('.search-input input')
      await searchInput.setValue('yinhui')

      const names = wrapper.findAll('.operator-item').map((i) => i.attributes('data-op-name'))
      expect(names).toContain('银灰')
    })

    it('searches by pinyin initials (e.g. yh for 银灰, amy for 阿米娅)', async () => {
      const wrapper = mount(OperatorSelectModal, {
        props: {
          open: true,
          mode: 'main',
          roomId: 'room_1_1',
          slotIndex: 0,
        },
        attachTo: document.body,
        global: {
          stubs: {
            teleport: true,
            Teleport: true,
          },
        },
      })

      const searchInput = wrapper.find('.search-input input')
      await searchInput.setValue('yh')

      const names = wrapper.findAll('.operator-item').map((i) => i.attributes('data-op-name'))
      expect(names).toContain('银灰')

      await searchInput.setValue('amy')
      const amiyaNames = wrapper.findAll('.operator-item').map((i) => i.attributes('data-op-name'))
      expect(amiyaNames).toContain('阿米娅')
    })
  })

  describe('Special values in main mode (Free / Current / Empty)', () => {
    it('renders special value buttons in main mode and allows selecting Free', async () => {
      const store = useRosterWorkbenchStore()
      const wrapper = mount(OperatorSelectModal, {
        props: {
          open: true,
          mode: 'main',
          roomId: 'room_1_1',
          slotIndex: 0,
        },
        attachTo: document.body,
        global: {
          stubs: {
            teleport: true,
            Teleport: true,
          },
        },
      })

      expect(wrapper.find('.special-values-section').exists()).toBe(true)
      const freeBtn = wrapper.find('.special-free')
      expect(freeBtn.exists()).toBe(true)

      await freeBtn.trigger('click')

      // Store updated
      const slot = store.workspace.mainPlan.facilities.room_1_1?.slots[0]
      expect(slot).toBeDefined()
      expect(slot!.occupant).toEqual({ kind: 'free' })

      // Emits
      expect(wrapper.emitted('selected')).toHaveLength(1)
      expect(wrapper.emitted('selected')?.[0]?.[0]).toMatchObject({
        mode: 'main',
        roomId: 'room_1_1',
        slotIndex: 0,
        selectionKind: 'free',
      })
      expect(wrapper.emitted('close')).toHaveLength(1)
      expect(wrapper.emitted('update:open')?.[0]?.[0]).toBe(false)
    })

    it('allows selecting Current in main mode', async () => {
      const store = useRosterWorkbenchStore()
      const wrapper = mount(OperatorSelectModal, {
        props: {
          open: true,
          mode: 'main',
          roomId: 'room_1_1',
          slotIndex: 1,
        },
        attachTo: document.body,
        global: {
          stubs: {
            teleport: true,
            Teleport: true,
          },
        },
      })

      const currentBtn = wrapper.find('.special-current')
      await currentBtn.trigger('click')

      const slot = store.workspace.mainPlan.facilities.room_1_1?.slots[1]
      expect(slot).toBeDefined()
      expect(slot!.occupant).toEqual({ kind: 'current' })
      expect(wrapper.emitted('selected')?.[0]?.[0]).toMatchObject({
        mode: 'main',
        roomId: 'room_1_1',
        slotIndex: 1,
        selectionKind: 'current',
      })
    })

    it('allows selecting Empty in main mode', async () => {
      const store = useRosterWorkbenchStore()
      // First populate with an operator
      const room = store.workspace.mainPlan.facilities.room_1_1
      expect(room).toBeDefined()
      const slot0 = room!.slots[0]
      expect(slot0).toBeDefined()
      slot0!.occupant = {
        kind: 'operator',
        operatorId: 'char_002_amiya',
      }

      const wrapper = mount(OperatorSelectModal, {
        props: {
          open: true,
          mode: 'main',
          roomId: 'room_1_1',
          slotIndex: 0,
        },
        attachTo: document.body,
        global: {
          stubs: {
            teleport: true,
            Teleport: true,
          },
        },
      })

      const emptyBtn = wrapper.find('.special-empty')
      await emptyBtn.trigger('click')

      const slot = store.workspace.mainPlan.facilities.room_1_1?.slots[0]
      expect(slot).toBeDefined()
      expect(slot!.occupant).toEqual({ kind: 'empty' })
      expect(wrapper.emitted('selected')?.[0]?.[0]).toMatchObject({
        mode: 'main',
        roomId: 'room_1_1',
        slotIndex: 0,
        selectionKind: 'empty',
      })
    })

    it('hides special value buttons in replacement mode', () => {
      const wrapper = mount(OperatorSelectModal, {
        props: {
          open: true,
          mode: 'replacement',
          roomId: 'room_1_1',
          slotIndex: 0,
        },
        attachTo: document.body,
        global: {
          stubs: {
            teleport: true,
            Teleport: true,
          },
        },
      })

      expect(wrapper.find('.special-values-section').exists()).toBe(false)
      expect(wrapper.find('.special-free').exists()).toBe(false)
      expect(wrapper.find('.special-current').exists()).toBe(false)
      expect(wrapper.find('.special-empty').exists()).toBe(false)
    })
  })

  describe('Occupancy and duplication hints (已在岗 / 重复占用)', () => {
    it('marks operator as on-duty when already stationed in a facility', async () => {
      const store = useRosterWorkbenchStore()
      // Station Texas in central
      const centralRoom = store.workspace.mainPlan.facilities.central
      expect(centralRoom).toBeDefined()
      centralRoom!.slots[0] = {
        occupant: { kind: 'operator', operatorId: 'char_102_texas' },
        groupId: null,
        replacements: [],
      }

      const wrapper = mount(OperatorSelectModal, {
        props: {
          open: true,
          mode: 'main',
          roomId: 'room_1_1',
          slotIndex: 0,
        },
        attachTo: document.body,
        global: {
          stubs: {
            teleport: true,
            Teleport: true,
          },
        },
      })

      const searchInput = wrapper.find('.search-input input')
      await searchInput.setValue('德克萨斯')

      const texasItem = wrapper.find('.operator-item[data-op-id="char_102_texas"]')
      expect(texasItem.exists()).toBe(true)
      expect(texasItem.classes()).toContain('is-assigned')
      const badge = texasItem.find('.badge-assigned')
      expect(badge.exists()).toBe(true)
      expect(badge.text()).toBe('在岗')
      expect(badge.attributes('title')).toContain('控制中枢')
    })

    it('marks operator as duplicate in replacement mode when already in slot replacements', async () => {
      const store = useRosterWorkbenchStore()
      // Add Texas to room_1_1 slot 0 replacements
      const room = store.workspace.mainPlan.facilities.room_1_1
      expect(room).toBeDefined()
      const slot0 = room!.slots[0]
      expect(slot0).toBeDefined()
      slot0!.replacements = ['char_102_texas']

      const wrapper = mount(OperatorSelectModal, {
        props: {
          open: true,
          mode: 'replacement',
          roomId: 'room_1_1',
          slotIndex: 0,
        },
        attachTo: document.body,
        global: {
          stubs: {
            teleport: true,
            Teleport: true,
          },
        },
      })

      const searchInput = wrapper.find('.search-input input')
      await searchInput.setValue('德克萨斯')

      const texasItem = wrapper.find('.operator-item[data-op-id="char_102_texas"]')
      expect(texasItem.exists()).toBe(true)
      expect(texasItem.classes()).toContain('is-duplicate')
      const badge = texasItem.find('.badge-duplicate')
      expect(badge.exists()).toBe(true)
      expect(badge.text()).toBe('已选')
    })
  })

  describe('Store writeback & metadata preservation', () => {
    it('accurately updates main slot occupant and preserves groupId and metadata', async () => {
      const store = useRosterWorkbenchStore()
      const room = store.workspace.mainPlan.facilities.room_1_1
      expect(room).toBeDefined()
      const slot = room!.slots[0]
      expect(slot).toBeDefined()
      slot!.groupId = 'custom-group-1'
      slot!.metadata = { customTag: 'special-priority', rank: 99 }
      slot!.replacements = ['char_103_angel']

      const wrapper = mount(OperatorSelectModal, {
        props: {
          open: true,
          mode: 'main',
          roomId: 'room_1_1',
          slotIndex: 0,
        },
        attachTo: document.body,
        global: {
          stubs: {
            teleport: true,
            Teleport: true,
          },
        },
      })

      const searchInput = wrapper.find('.search-input input')
      await searchInput.setValue('银灰')

      const svrashItem = wrapper.find('.operator-item[data-op-name="银灰"]')
      expect(svrashItem.exists()).toBe(true)
      await svrashItem.trigger('click')

      const updatedSlot = store.workspace.mainPlan.facilities.room_1_1?.slots[0]
      expect(updatedSlot).toBeDefined()
      // Main occupant updated
      expect(updatedSlot!.occupant).toEqual({
        kind: 'operator',
        operatorId: 'char_172_svrash',
      })
      // GroupId and metadata MUST be preserved!
      expect(updatedSlot!.groupId).toBe('custom-group-1')
      expect(updatedSlot!.metadata).toEqual({ customTag: 'special-priority', rank: 99 })
      expect(updatedSlot!.replacements).toEqual(['char_103_angel'])

      // Emitted event payload
      expect(wrapper.emitted('selected')?.[0]?.[0]).toEqual({
        mode: 'main',
        roomId: 'room_1_1',
        slotIndex: 0,
        selectionKind: 'operator',
        operatorId: 'char_172_svrash',
        operatorName: '银灰',
      })
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('appends operator to replacements in replacement mode and preserves occupant, groupId, and metadata', async () => {
      const store = useRosterWorkbenchStore()
      const room = store.workspace.mainPlan.facilities.room_1_1
      expect(room).toBeDefined()
      const slot = room!.slots[0]
      expect(slot).toBeDefined()
      slot!.occupant = { kind: 'operator', operatorId: 'char_002_amiya' }
      slot!.groupId = 'group-beta'
      slot!.metadata = { note: 'keep-this' }
      slot!.replacements = ['char_102_texas']

      const wrapper = mount(OperatorSelectModal, {
        props: {
          open: true,
          mode: 'replacement',
          roomId: 'room_1_1',
          slotIndex: 0,
        },
        attachTo: document.body,
        global: {
          stubs: {
            teleport: true,
            Teleport: true,
          },
        },
      })

      const searchInput = wrapper.find('.search-input input')
      await searchInput.setValue('银灰')

      const svrashItem = wrapper.find('.operator-item[data-op-name="银灰"]')
      await svrashItem.trigger('click')

      const updatedSlot = store.workspace.mainPlan.facilities.room_1_1?.slots[0]
      expect(updatedSlot).toBeDefined()
      // Replacement appended
      expect(updatedSlot!.replacements).toEqual(['char_102_texas', 'char_172_svrash'])
      // Occupant, GroupId, and Metadata preserved!
      expect(updatedSlot!.occupant).toEqual({ kind: 'operator', operatorId: 'char_002_amiya' })
      expect(updatedSlot!.groupId).toBe('group-beta')
      expect(updatedSlot!.metadata).toEqual({ note: 'keep-this' })

      expect(wrapper.emitted('selected')?.[0]?.[0]).toEqual({
        mode: 'replacement',
        roomId: 'room_1_1',
        slotIndex: 0,
        selectionKind: 'operator',
        operatorId: 'char_172_svrash',
        operatorName: '银灰',
      })
    })
  })

  describe('Unknown avatar fallback (未知头像回退)', () => {
    it('displays textual avatar fallback when operator image fails to load', async () => {
      const wrapper = mount(OperatorSelectModal, {
        props: {
          open: true,
          mode: 'main',
          roomId: 'room_1_1',
          slotIndex: 0,
        },
        attachTo: document.body,
        global: {
          stubs: {
            teleport: true,
            Teleport: true,
          },
        },
      })

      const firstItem = wrapper.find('.operator-item')
      const img = firstItem.find('img.operator-avatar')
      expect(img.exists()).toBe(true)

      // Trigger image error
      await img.trigger('error')

      // Fallback is displayed (re-query wrapper since modal re-render replaces child DOM elements)
      const updatedFirstItem = wrapper.find('.operator-item')
      const fallback = updatedFirstItem.find('.operator-avatar-fallback')
      expect(fallback.exists()).toBe(true)
      expect(updatedFirstItem.find('img.operator-avatar').exists()).toBe(false)
      expect(fallback.text()).toBe(updatedFirstItem.attributes('data-op-name'))
    })
  })
})
