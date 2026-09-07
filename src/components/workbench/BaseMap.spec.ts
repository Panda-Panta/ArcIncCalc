/**
 * @vitest-environment jsdom
 *
 * Derivative work based on arknights-mower (PlanEditor.vue)
 * Original work Copyright (c) 2021 Nano
 * Licensed under the MIT License
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import BaseMap from './BaseMap.vue'
import { useRosterWorkbenchStore } from '../../workbench/store'
import { MOWER_OUTPUT_ROOM_IDS, type MowerRoomId, type MowerFacilityType } from '../../workbench/model'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('BaseMap.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders narrow screen scroll wrapper and 980px plan-container with 3 column classes', () => {
    const wrapper = mount(BaseMap)
    const scrollWrapper = wrapper.find('.plan-scroll-wrapper')
    expect(scrollWrapper.exists()).toBe(true)

    const container = wrapper.find('.plan-container')
    expect(container.exists()).toBe(true)

    // Three columns: left_box, mid_box, right_box
    expect(wrapper.find('.left_box').exists()).toBe(true)
    expect(wrapper.find('.mid_box').exists()).toBe(true)
    expect(wrapper.find('.right_box').exists()).toBe(true)
  })

  it('renders exactly 18 cards without gaming rooms', () => {
    const wrapper = mount(BaseMap)
    const cards = wrapper.findAll('.facility-card')
    expect(cards.length).toBe(18)

    const gamingCards = cards.filter((card) => {
      const roomId = card.attributes('data-room-id') || ''
      return roomId.includes('gaming')
    })
    expect(gamingCards.length).toBe(0)
  })

  it('renders exact card count, room ids, and size variant classes across columns', () => {
    const wrapper = mount(BaseMap)

    // Left column: 9 output rooms with size-output / facility-output
    const leftCards = wrapper.findAll('.left_box .facility-card')
    expect(leftCards.length).toBe(9)
    for (const id of MOWER_OUTPUT_ROOM_IDS) {
      const card = wrapper.find(`[data-room-id="${id}"]`)
      expect(card.exists()).toBe(true)
      expect(card.classes()).toContain('size-output')
    }

    // Mid column: central + 4 dorms with size-center / facility-center
    const midCards = wrapper.findAll('.mid_box .facility-card')
    expect(midCards.length).toBe(5)
    const midIds = ['central', 'dormitory_1', 'dormitory_2', 'dormitory_3', 'dormitory_4']
    for (const id of midIds) {
      const card = wrapper.find(`[data-room-id="${id}"]`)
      expect(card.exists()).toBe(true)
      expect(card.classes()).toContain('size-center')
    }

    // Right column: 4 support rooms with size-support / facility-support
    const rightCards = wrapper.findAll('.right_box .facility-card')
    expect(rightCards.length).toBe(4)
    const rightIds = ['meeting', 'factory', 'contact', 'train']
    for (const id of rightIds) {
      const card = wrapper.find(`[data-room-id="${id}"]`)
      expect(card.exists()).toBe(true)
      expect(card.classes()).toContain('size-support')
    }

    // Train room displays 协助位 and 训练位
    const trainCard = wrapper.find('[data-room-id="train"]')
    expect(trainCard.text()).toContain('协助位')
    expect(trainCard.text()).toContain('训练位')
  })

  it('renders product watermark URL correctly for manufacture and trading rooms', () => {
    const store = useRosterWorkbenchStore()
    store.workspace.mainPlan.facilities.room_1_1.type = 'manufacture'
    store.workspace.mainPlan.facilities.room_1_1.product = 'gold'
    store.workspace.mainPlan.facilities.room_3_1.type = 'trading'
    store.workspace.mainPlan.facilities.room_3_1.product = 'money'

    const wrapper = mount(BaseMap)
    const card1 = wrapper.find('[data-room-id="room_1_1"]')
    const watermark1 = card1.find('.product-bg')
    expect(watermark1.exists()).toBe(true)
    expect(watermark1.attributes('style')).toContain('/product/gold.png')

    const card2 = wrapper.find('[data-room-id="room_3_1"]')
    const watermark2 = card2.find('.product-bg')
    expect(watermark2.exists()).toBe(true)
    expect(watermark2.attributes('style')).toContain('/product/lmd.png')
  })

  it('renders known operator Chinese avatar path, Free avatar, and skips empty slots', () => {
    const store = useRosterWorkbenchStore()
    store.workspace.mainPlan.facilities.room_1_1.slots = [
      {
        occupant: { kind: 'operator', operatorId: 'char_102_texas' },
        groupId: 'A',
        replacements: [],
      },
      {
        occupant: { kind: 'free' },
        groupId: null,
        replacements: [],
      },
      {
        occupant: { kind: 'empty' },
        groupId: null,
        replacements: [],
      },
    ]

    const wrapper = mount(BaseMap)
    const card = wrapper.find('[data-room-id="room_1_1"]')
    const images = card.findAll('img')
    expect(images.length).toBe(2)

    const img1 = images[0]
    expect(img1).toBeDefined()
    const src1 = img1!.attributes('src') ?? ''
    expect(decodeURI(src1)).toContain('avatar/德克萨斯.webp')

    const img2 = images[1]
    expect(img2).toBeDefined()
    const src2 = img2!.attributes('src') ?? ''
    expect(src2).toContain('avatar/Free.webp')
  })

  it('supports compact text fallback when avatar fails to load without breaking size', async () => {
    const store = useRosterWorkbenchStore()
    store.workspace.mainPlan.facilities.room_1_1.slots = [
      {
        occupant: { kind: 'operator', operatorId: '未知干员X' },
        groupId: null,
        replacements: [],
      },
    ]

    const wrapper = mount(BaseMap)
    const card = wrapper.find('[data-room-id="room_1_1"]')
    const img = card.find('img')
    expect(img.exists()).toBe(true)

    await img.trigger('error')

    const fallback = card.find('.avatar-fallback')
    expect(fallback.exists()).toBe(true)
    expect(fallback.text()).toContain('未知干员X')
  })

  it('selects facility room via selectRoom method when card is clicked', async () => {
    const store = useRosterWorkbenchStore()
    store.selectRoom(null)
    expect(store.selectedRoomId).toBeNull()

    const wrapper = mount(BaseMap)
    const targetRoom: MowerRoomId = 'room_2_2'
    const card = wrapper.find(`[data-room-id="${targetRoom}"]`)
    await card.trigger('click')

    expect(store.selectedRoomId).toBe(targetRoom)
    expect(card.classes()).toContain('is-selected')
  })

  it('allows dragging and dropping between output rooms and calls swapOutputRooms swapping all content', async () => {
    const store = useRosterWorkbenchStore()
    store.workspace.mainPlan.facilities.room_1_1.type = 'manufacture'
    store.workspace.mainPlan.facilities.room_1_1.level = 3
    store.workspace.mainPlan.facilities.room_1_1.product = 'gold'
    store.workspace.mainPlan.facilities.room_1_1.slots = [
      {
        occupant: { kind: 'operator', operatorId: 'char_102_texas' },
        groupId: 'G1',
        replacements: [],
      },
    ]

    store.workspace.mainPlan.facilities.room_1_2.type = 'trading'
    store.workspace.mainPlan.facilities.room_1_2.level = 2
    store.workspace.mainPlan.facilities.room_1_2.product = 'money'
    store.workspace.mainPlan.facilities.room_1_2.slots = [
      {
        occupant: { kind: 'free' },
        groupId: 'G2',
        replacements: [],
      },
    ]

    const wrapper = mount(BaseMap)
    const card1 = wrapper.find('[data-room-id="room_1_1"]')
    const card2 = wrapper.find('[data-room-id="room_1_2"]')

    let transferData = ''
    await card1.trigger('dragstart', {
      dataTransfer: {
        setData: (_format: string, data: string) => {
          transferData = data
        },
      },
    })
    expect(transferData).toBe('room_1_1')

    await card2.trigger('drop', {
      dataTransfer: {
        getData: (_format: string) => transferData,
      },
    })

    expect(store.workspace.mainPlan.facilities.room_1_1.type).toBe('trading')
    expect(store.workspace.mainPlan.facilities.room_1_1.level).toBe(2)
    expect(store.workspace.mainPlan.facilities.room_1_1.product).toBe('money')
    expect(store.workspace.mainPlan.facilities.room_1_1.slots[0]?.occupant.kind).toBe('free')

    expect(store.workspace.mainPlan.facilities.room_1_2.type).toBe('manufacture')
    expect(store.workspace.mainPlan.facilities.room_1_2.level).toBe(3)
    expect(store.workspace.mainPlan.facilities.room_1_2.product).toBe('gold')
    expect(store.workspace.mainPlan.facilities.room_1_2.slots[0]?.occupant.kind).toBe('operator')
  })

  it('prevents non-output rooms from being draggable and rejects drops', async () => {
    const store = useRosterWorkbenchStore()
    const wrapper = mount(BaseMap)

    const centralCard = wrapper.find('[data-room-id="central"]')
    const trainCard = wrapper.find('[data-room-id="train"]')

    expect(centralCard.attributes('draggable')).toBe('false')
    expect(trainCard.attributes('draggable')).toBe('false')

    let transferData = ''
    await centralCard.trigger('dragstart', {
      dataTransfer: {
        setData: (_format: string, data: string) => {
          transferData = data
        },
      },
    })
    expect(transferData).toBe('')

    const origCentralType = store.workspace.mainPlan.facilities.central.type
    await centralCard.trigger('drop', {
      dataTransfer: {
        getData: () => 'room_1_1',
      },
    })
    expect(store.workspace.mainPlan.facilities.central.type).toBe(origCentralType)
  })

  it('scopes root wrapper with mower-base-map and styles.css scopes general selectors without global leak', () => {
    const wrapper = mount(BaseMap)
    const rootEl = wrapper.find('.mower-base-map')
    expect(rootEl.exists()).toBe(true)

    const cssPath = resolve(__dirname, '../../workbench/styles.css')
    const cssContent = readFileSync(cssPath, 'utf-8')

    // Scoped rules check
    expect(cssContent).toContain('.mower-base-map .outer')
    expect(cssContent).toContain('.mower-base-map .draggable')
    expect(cssContent).toContain('.mower-base-map .avatars')

    // Root facility card waiting must NOT have width: 100% or height: 100%
    // Only inner .waiting-box has 100%
    expect(cssContent).not.toMatch(/\.facility-card\.waiting[^{]*\{[^}]*width:\s*100%/)
    expect(cssContent).toMatch(/\.waiting-box[^{]*\{[^}]*width:\s*100%/)
    expect(cssContent).toMatch(/\.waiting-box[^{]*\{[^}]*height:\s*100%/)

    // Left output rooms have no margin (0), mid and right have margin 2px 3px
    expect(cssContent).toMatch(/\.size-output[^{]*\{[^}]*margin:\s*0/)
    expect(cssContent).toMatch(/\.size-center[^{]*\{[^}]*margin:\s*2px\s+3px/)
    expect(cssContent).toMatch(/\.size-support[^{]*\{[^}]*margin:\s*2px\s+3px/)
  })

  it('implements role=button, tabindex=0, aria-label, aria-selected and Enter/Space selection on FacilityCard', async () => {
    const store = useRosterWorkbenchStore()
    store.selectRoom(null)
    const wrapper = mount(BaseMap)
    const card = wrapper.find('[data-room-id="room_1_1"]')

    expect(card.attributes('role')).toBe('button')
    expect(card.attributes('tabindex')).toBe('0')
    expect(card.attributes('aria-label')).toBeTruthy()
    expect(card.attributes('aria-selected')).toBe('false')

    // Enter triggers selection
    await card.trigger('keydown', { key: 'Enter' })
    expect(store.selectedRoomId).toBe('room_1_1')
    expect(card.attributes('aria-selected')).toBe('true')

    // Reset and test Space key
    store.selectRoom(null)
    await card.trigger('keydown', { key: ' ' })
    expect(store.selectedRoomId).toBe('room_1_1')
  })

  it('keys avatar error state by occupant identity and slot index, reloading when valid operator is swapped in', async () => {
    const store = useRosterWorkbenchStore()
    store.workspace.mainPlan.facilities.room_1_1.slots = [
      {
        occupant: { kind: 'operator', operatorId: 'invalid_op_1' },
        groupId: null,
        replacements: [],
      },
    ]

    const wrapper = mount(BaseMap)
    const card = wrapper.find('[data-room-id="room_1_1"]')
    const img = card.find('img')
    expect(img.exists()).toBe(true)

    // Trigger image error
    await img.trigger('error')
    expect(card.find('.avatar-fallback').exists()).toBe(true)

    // Now update occupant to valid operator
    store.workspace.mainPlan.facilities.room_1_1.slots = [
      {
        occupant: { kind: 'operator', operatorId: 'char_102_texas' },
        groupId: null,
        replacements: [],
      },
    ]
    await wrapper.vm.$nextTick()

    // New valid operator should re-render img and not be stuck in fallback
    const newImg = card.find('img')
    expect(newImg.exists()).toBe(true)
    expect(decodeURI(newImg.attributes('src') || '')).toContain('avatar/德克萨斯.webp')
    expect(card.find('.avatar-fallback').exists()).toBe(false)
  })

  it('prevents waiting output room from being dragged or accepting drop', async () => {
    const store = useRosterWorkbenchStore()
    // Make room_1_1 waiting (unbuilt)
    store.workspace.mainPlan.facilities.room_1_1.type = '' as unknown as MowerFacilityType
    // Make room_1_2 built
    store.workspace.mainPlan.facilities.room_1_2.type = 'manufacture'
    store.workspace.mainPlan.facilities.room_1_2.product = 'gold'

    const wrapper = mount(BaseMap)
    const waitingCard = wrapper.find('[data-room-id="room_1_1"]')
    const builtCard = wrapper.find('[data-room-id="room_1_2"]')

    expect(waitingCard.classes()).toContain('waiting')
    expect(waitingCard.attributes('draggable')).toBe('false')

    // Waiting card dragstart should do nothing
    let transferData = ''
    await waitingCard.trigger('dragstart', {
      dataTransfer: {
        setData: (_f: string, d: string) => {
          transferData = d
        },
      },
    })
    expect(transferData).toBe('')

    // Built card dragging and dropping onto waiting card must be rejected
    await builtCard.trigger('dragstart', {
      dataTransfer: {
        setData: (_f: string, d: string) => {
          transferData = d
        },
      },
    })
    expect(transferData).toBe('room_1_2')

    await waitingCard.trigger('drop', {
      dataTransfer: {
        getData: () => transferData,
      },
    })

    // room_1_1 should still be unbuilt waiting, room_1_2 still manufacture
    expect(store.workspace.mainPlan.facilities.room_1_1.type).toBe('')
    expect(store.workspace.mainPlan.facilities.room_1_2.type).toBe('manufacture')
  })
})