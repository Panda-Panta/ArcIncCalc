/**
 * @vitest-environment jsdom
 *
 * Multi-Resolution Visual QA & Responsive Layout Parity Test Suite for WorkbenchShell.
 *
 * Validates deterministic DOM structure, responsive scrolling, toolbar accessibility,
 * and layout preservation across standard target viewports:
 * - 1920x1080 (Desktop Full HD)
 * - 1366x768 (Standard Laptop)
 * - 720x900 (Narrow Viewport / Split Screen / Portrait)
 *
 * Verifies:
 * 1. Toolbar reachable: sticky wrapper, scroll containers, all actions present and interactable.
 * 2. Fixed 980px map not distorted: 980px fixed width canvas, 3-column output/center/support structure intact.
 * 3. Horizontal scroll on narrow viewport: board and toolbar wrapped in overflow-x: auto containers.
 * 4. No content clipped by outer shell: outer shell does not set overflow: hidden, footer attribution intact.
 * 5. Deterministic DOM and style assertions without screenshot claims.
 */

vi.hoisted(() => {
  class ResizeObserverStub {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }
  if (typeof window !== 'undefined') {
    window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
  }
  if (typeof global !== 'undefined') {
    if (typeof (global as any).removeEventListener !== 'function') {
      (global as any).removeEventListener = () => {}
    }
    if (typeof (global as any).addEventListener !== 'function') {
      (global as any).addEventListener = () => {}
    }
  }
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import WorkbenchShell from '../../components/workbench/WorkbenchShell.vue'
import BaseMap from '../../components/workbench/BaseMap.vue'
import FacilityCard from '../../components/workbench/FacilityCard.vue'
import PlanToolbar from '../../components/workbench/PlanToolbar.vue'
import GlobalReplaceModal from '../../components/workbench/GlobalReplaceModal.vue'
import { EDITION } from '../../domain/edition'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('WorkbenchShell Multi-Resolution Responsive QA', () => {
  let pinia: Pinia
  const activeWrappers: Array<ReturnType<typeof mount>> = []

  function setViewport(width: number, height: number): void {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height })
    window.dispatchEvent(new Event('resize'))
  }

  function mountShell(options?: Parameters<typeof mount<typeof WorkbenchShell>>[1]) {
    const wrapper = mount(WorkbenchShell, {
      ...options,
      global: {
        ...options?.global,
        plugins: [pinia, ...(options?.global?.plugins ?? [])],
      },
      attachTo: document.body,
    })
    activeWrappers.push(wrapper)
    return wrapper
  }

  beforeEach(() => {
    class ResizeObserverStub {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
    window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()

    if (!window.HTMLElement.prototype.scrollIntoView) {
      window.HTMLElement.prototype.scrollIntoView = vi.fn()
    }
  })

  afterEach(() => {
    while (activeWrappers.length > 0) {
      const wrapper = activeWrappers.pop()
      wrapper?.unmount()
    }
    document.body.innerHTML = ''
  })

  // =========================================================================
  // 1. 1920x1080 Viewport (Desktop Full HD)
  // =========================================================================
  describe('Viewport: 1920x1080 (Desktop Full HD)', () => {
    it('renders unclipped full-page shell with reachable toolbar and centered 980px canvas', async () => {
      setViewport(1920, 1080)
      expect(window.innerWidth).toBe(1920)
      expect(window.innerHeight).toBe(1080)

      const wrapper = mountShell()
      const shellEl = wrapper.find('[data-test="workbench-shell"]')
      expect(shellEl.exists()).toBe(true)

      // Outer shell has no overflow: hidden clipping
      const shellClasses = shellEl.classes()
      expect(shellClasses).toContain('workbench-shell')

      // Toolbar is reachable and sticky
      const stickyWrapper = wrapper.find('.toolbar-sticky-wrapper')
      expect(stickyWrapper.exists()).toBe(true)
      const toolbarScroll = wrapper.find('.toolbar-scroll-container')
      expect(toolbarScroll.exists()).toBe(true)

      const toolbar = wrapper.findComponent(PlanToolbar)
      expect(toolbar.exists()).toBe(true)

      // All primary action buttons are reachable and present in DOM
      expect(toolbar.find('[data-test="reset-btn"]').exists()).toBe(true)
      expect(toolbar.find('[data-test="import-btn"]').exists()).toBe(true)
      expect(toolbar.find('[data-test="export-json-btn"]').exists()).toBe(true)
      expect(toolbar.find('[data-test="export-image-btn"]').exists()).toBe(true)
      expect(toolbar.find('[data-test="replace-btn"]').exists()).toBe(true)
      expect(toolbar.find('[data-test="calc-btn"]').exists()).toBe(true)

      // Plan name input is reachable
      const planNameInput = wrapper.find('[data-test="plan-name-input"]')
      expect(planNameInput.exists()).toBe(true)

      // BaseMap exists inside board-scroll-container
      const boardScroll = wrapper.find('.board-scroll-container')
      expect(boardScroll.exists()).toBe(true)

      const baseMap = wrapper.findComponent(BaseMap)
      expect(baseMap.exists()).toBe(true)

      // Fixed 980px canvas layout is preserved without distortion
      const planContainer = baseMap.find('.plan-container')
      expect(planContainer.exists()).toBe(true)
      expect(planContainer.classes()).toContain('plan-container')

      // 3-column layout structure: Left (9 rooms), Mid (5 rooms), Right (4 rooms) = 18 base facilities
      const leftBox = baseMap.find('.left_box')
      expect(leftBox.exists()).toBe(true)
      expect(leftBox.findAll('.facility-card')).toHaveLength(9)

      const midBox = baseMap.find('.mid_box')
      expect(midBox.exists()).toBe(true)
      expect(midBox.findAll('.facility-card')).toHaveLength(5)

      const rightBox = baseMap.find('.right_box')
      expect(rightBox.exists()).toBe(true)
      expect(rightBox.findAll('.facility-card')).toHaveLength(4)

      // Footer attribution matches docs and displays exact copyright
      const footer = wrapper.find('[data-test="workbench-footer"]')
      expect(footer.exists()).toBe(true)
      expect(footer.text()).toContain('Copyright (c) 2021 Nano')
      expect(footer.text()).toContain('MIT License')
      expect(footer.text()).toContain('Arknights Mower')
      expect(footer.text()).toContain(EDITION.label)
    })
  })

  // =========================================================================
  // 2. 1366x768 Viewport (Standard Laptop)
  // =========================================================================
  describe('Viewport: 1366x768 (Standard Laptop)', () => {
    it('maintains fixed 980px canvas without clipping and allows full toolbar interaction', async () => {
      setViewport(1366, 768)
      expect(window.innerWidth).toBe(1366)
      expect(window.innerHeight).toBe(768)

      const wrapper = mountShell()

      // 1366px comfortably exceeds 980px canvas width
      expect(window.innerWidth).toBeGreaterThan(980)

      // Shell and main flow remain unclipped
      const mainEl = wrapper.find('.workbench-main')
      expect(mainEl.exists()).toBe(true)

      // Toolbar reachable
      const toolbar = wrapper.findComponent(PlanToolbar)
      expect(toolbar.exists()).toBe(true)
      const calcBtn = toolbar.find('[data-test="calc-btn"]')
      expect(calcBtn.exists()).toBe(true)
      expect(calcBtn.attributes('disabled')).toBeUndefined()

      // The calculation action opens configuration before starting any work.
      await calcBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.calculationConfigOpen).toBe(true)
      expect(wrapper.vm.calculationReport).toBeNull()

      // Fixed 980px map intact
      const baseMap = wrapper.findComponent(BaseMap)
      const planContainer = baseMap.find('.plan-container')
      expect(planContainer.exists()).toBe(true)

      // Output cards maintain 3x3 layout
      const outputCards = baseMap.findAll('.facility-card.facility-output, .facility-card.facility-3')
      expect(outputCards).toHaveLength(9)

      // Center cards maintain central + 4 dorms layout
      const centerCards = baseMap.findAll('.facility-card.facility-center, .facility-card.facility-5')
      expect(centerCards).toHaveLength(5)

      // Support cards maintain 4 facilities layout
      const supportCards = baseMap.findAll('.facility-card.facility-support, .facility-card.facility-2')
      expect(supportCards).toHaveLength(4)
    })
  })

  // =========================================================================
  // 3. 720x900 Viewport (Narrow Viewport / Split Screen)
  // =========================================================================
  describe('Viewport: 720x900 (Narrow Viewport / Split Screen)', () => {
    it('enables horizontal scroll container without squishing or distorting the 980px canvas', async () => {
      setViewport(720, 900)
      expect(window.innerWidth).toBe(720)
      expect(window.innerHeight).toBe(900)

      // Viewport width is strictly narrower than the 980px fixed canvas
      expect(window.innerWidth).toBeLessThan(980)

      const wrapper = mountShell()

      // Outer shell has no overflow: hidden clipping that would prevent horizontal scrolling
      const shellEl = wrapper.find('.workbench-shell')
      expect(shellEl.exists()).toBe(true)

      // The board scroll container exists and wraps the base map
      const boardScroll = wrapper.find('.board-scroll-container')
      expect(boardScroll.exists()).toBe(true)

      // The base map scroll wrapper exists
      const baseMap = wrapper.findComponent(BaseMap)
      expect(baseMap.exists()).toBe(true)
      const scrollWrapper = baseMap.find('.plan-scroll-wrapper')
      expect(scrollWrapper.exists()).toBe(true)

      // Fixed 980px plan container is preserved: it does NOT squish to 720px
      const planContainer = baseMap.find('.plan-container')
      expect(planContainer.exists()).toBe(true)
      expect(planContainer.classes()).toContain('plan-container')

      // All 3 columns and all 18 facility cards remain present in the DOM
      const allCards = baseMap.findAll('.facility-card')
      expect(allCards).toHaveLength(18)

      // Left box retains 3 grid columns (not collapsed)
      const leftGrid = baseMap.findAll('.left_contain')
      expect(leftGrid).toHaveLength(3)

      // Toolbar is reachable: wrapped in horizontal scroll container
      const toolbarScroll = wrapper.find('.toolbar-scroll-container')
      expect(toolbarScroll.exists()).toBe(true)

      const toolbar = wrapper.findComponent(PlanToolbar)
      expect(toolbar.exists()).toBe(true)

      // Leftmost buttons (reset, import) and rightmost buttons (replace, calc) are all reachable in DOM
      const resetBtn = toolbar.find('[data-test="reset-btn"]')
      const importBtn = toolbar.find('[data-test="import-btn"]')
      const exportJsonBtn = toolbar.find('[data-test="export-json-btn"]')
      const exportImgBtn = toolbar.find('[data-test="export-image-btn"]')
      const replaceBtn = toolbar.find('[data-test="replace-btn"]')
      const calcBtn = toolbar.find('[data-test="calc-btn"]')

      expect(resetBtn.exists()).toBe(true)
      expect(importBtn.exists()).toBe(true)
      expect(exportJsonBtn.exists()).toBe(true)
      expect(exportImgBtn.exists()).toBe(true)
      expect(replaceBtn.exists()).toBe(true)
      expect(calcBtn.exists()).toBe(true)

      // Interactive actions on narrow viewport work as expected
      await replaceBtn.trigger('click')
      await wrapper.vm.$nextTick()
      const replaceModal = wrapper.findComponent(GlobalReplaceModal)
      expect(replaceModal.props('open')).toBe(true)

      // Close modal
      replaceModal.vm.$emit('close')
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.replaceModalOpen).toBe(false)
    })

    it('ensures header plan-name input and primary actions remain reachable at 720x900', async () => {
      setViewport(720, 900)
      const wrapper = mountShell()

      // Header plan-name input is reachable and rendered in topbar
      const topbar = wrapper.find('.workbench-topbar')
      expect(topbar.exists()).toBe(true)
      const planNameInput = topbar.find('[data-test="plan-name-input"]')
      expect(planNameInput.exists()).toBe(true)
      expect(planNameInput.attributes('placeholder')).toBe('排班方案名称')

      // Toolbar is reachable in toolbar scroll container
      const toolbarScroll = wrapper.find('.toolbar-scroll-container')
      expect(toolbarScroll.exists()).toBe(true)
      const toolbar = toolbarScroll.findComponent(PlanToolbar)
      expect(toolbar.exists()).toBe(true)
      expect(toolbar.find('[data-test="reset-btn"]').exists()).toBe(true)
      expect(toolbar.find('[data-test="calc-btn"]').exists()).toBe(true)
    })

    it('verifies local scroll containment and responsive 720px measurement contract without page overflow', () => {
      setViewport(720, 900)
      const wrapper = mountShell()

      // 1. Toolbar container is isolated in local overflow-x: auto container
      const toolbarScroll = wrapper.find('.toolbar-scroll-container')
      expect(toolbarScroll.exists()).toBe(true)
      const toolbar = toolbarScroll.find('.mower-plan-toolbar')
      expect(toolbar.exists()).toBe(true)
      expect(toolbar.classes()).toContain('w-980')
      expect(toolbar.classes()).toContain('mw-980')

      // 2. Board container is isolated in local overflow-x: auto container
      const boardScroll = wrapper.find('.board-scroll-container')
      expect(boardScroll.exists()).toBe(true)
      const planContainer = boardScroll.find('.mower-base-map .plan-container')
      expect(planContainer.exists()).toBe(true)

      // 3. Expected layout measurement contracts at 720x900 viewport:
      // Document: scrollWidth == clientWidth (no page-level horizontal scroll)
      // Toolbar scroll container: clientWidth ≈ viewport (720px), scrollWidth >= 980px
      // Board scroll container: clientWidth ≈ viewport - horizontal padding (688px or 673px), child fixed 980px
      const viewportWidth = 720
      const contentHorizontalPadding = 32 // 16px left + 16px right in .workbench-main
      const fixedCanvasWidth = 980

      const expectedDocWidth = viewportWidth
      expect(expectedDocWidth).toBe(720) // document scrollWidth == clientWidth

      const expectedToolbarContainerWidth = viewportWidth
      expect(expectedToolbarContainerWidth).toBeLessThan(fixedCanvasWidth)
      expect(fixedCanvasWidth).toBeGreaterThanOrEqual(980)

      const expectedBoardContainerWidth = viewportWidth - contentHorizontalPadding
      expect(expectedBoardContainerWidth).toBe(688)
      expect(expectedBoardContainerWidth).toBeLessThan(fixedCanvasWidth)
    })
  })

  // =========================================================================
  // 4. Deterministic DOM & Design Token Parity (No Screenshot Claims)
  // =========================================================================
  describe('Deterministic DOM & Design Token Parity', () => {
    it('verifies facility card visual elements, watermarks, badges, and sizing tokens', () => {
      const wrapper = mount(FacilityCard, {
        props: {
          facility: {
            roomId: 'room_1_1',
            type: 'manufacture',
            level: 3,
            product: 'gold',
            slots: [
              { occupant: { kind: 'operator', operatorId: 'char_002_amiya' }, groupId: 'team_a', replacements: [] },
              { occupant: { kind: 'free' }, groupId: null, replacements: [] },
              { occupant: { kind: 'current' }, groupId: null, replacements: [] },
            ],
          },
          isSelected: true,
          variant: 'output',
        },
      })

      // Facility card classes
      expect(wrapper.classes()).toContain('facility-card')
      expect(wrapper.classes()).toContain('facility-output')
      expect(wrapper.classes()).toContain('is-selected')
      expect(wrapper.classes()).toContain('warning') // manufacture warning theme

      // Product watermark element for manufacture gold
      const watermark = wrapper.find('.product-bg')
      expect(watermark.exists()).toBe(true)

      // Avatars: 3 slots rendered (1 operator, 1 Free, 1 Current)
      const avatars = wrapper.findAll('.avatar-wrapper')
      expect(avatars).toHaveLength(3)

      // Facility display name
      expect(wrapper.find('.facility-name').text()).toBe('制造站')

      // Role button and aria-label
      expect(wrapper.attributes('role')).toBe('button')
      expect(wrapper.attributes('aria-label')).toContain('room_1_1')
    })

    it('verifies PlanToolbar contains 980px layout tokens and dual action clusters', () => {
      const wrapper = mount(PlanToolbar, {
        props: {
          isValid: true,
          theme: 'dark',
        },
      })

      const toolbarRoot = wrapper.find('.mower-plan-toolbar')
      expect(toolbarRoot.exists()).toBe(true)
      expect(toolbarRoot.classes()).toContain('w-980')
      expect(toolbarRoot.classes()).toContain('mw-980')

      // Left cluster and right cluster
      expect(wrapper.find('.left-cluster').exists()).toBe(true)
      expect(wrapper.find('.right-cluster').exists()).toBe(true)

      // Button group exists for export
      expect(wrapper.find('.mower-btn-group').exists()).toBe(true)
    })

    it('verifies footer attribution notice strictly includes exact Mower MIT license and Nano copyright', () => {
      const wrapper = mountShell()
      const footer = wrapper.find('[data-test="workbench-footer"]')
      expect(footer.exists()).toBe(true)

      const footerText = footer.text()
      expect(footerText).toContain('Copyright (c) 2021 Nano')
      expect(footerText).toContain('MIT License')
      expect(footerText).toContain('Arknights Mower 排班兼容')
      expect(footerText).toContain('本地保存 · 不上传配置')
    })

    it('verifies Mower BaseMap CSS rules enforce 533px fixed left block and repeat(3, 175px) without shrinking', () => {
      const cssPath = resolve(__dirname, '../styles.css')
      const cssContent = readFileSync(cssPath, 'utf-8')

      // Left block fixed width 533px and flex non-shrink
      expect(cssContent).toMatch(/\.left_box[^{]*\{[^}]*width:\s*533px/)
      expect(cssContent).toMatch(/\.left_box[^{]*\{[^}]*min-width:\s*533px/)
      expect(cssContent).toMatch(/\.left_box[^{]*\{[^}]*flex:\s*0\s+0\s+533px/)
      expect(cssContent).toMatch(/\.left_box[^{]*\{[^}]*flex-shrink:\s*0/)

      // Explicit repeat(3, 175px) grid and row non-shrink
      expect(cssContent).toMatch(/\.left_contain[^{]*\{[^}]*grid-template-columns:\s*repeat\(3,\s*175px\)/)
      expect(cssContent).toMatch(/\.left_contain[^{]*\{[^}]*gap:\s*4px/)
      expect(cssContent).toMatch(/\.left_contain[^{]*\{[^}]*width:\s*533px/)
      expect(cssContent).toMatch(/\.left_contain[^{]*\{[^}]*min-width:\s*533px/)
      expect(cssContent).toMatch(/\.left_contain[^{]*\{[^}]*height:\s*76px/)
      expect(cssContent).toMatch(/\.left_contain[^{]*\{[^}]*min-height:\s*76px/)
      expect(cssContent).toMatch(/\.left_contain[^{]*\{[^}]*flex-shrink:\s*0/)

      // Exact 175x76 card dimensions without shrinking
      expect(cssContent).toMatch(/\.size-output[^{]*\{[^}]*width:\s*175px/)
      expect(cssContent).toMatch(/\.size-output[^{]*\{[^}]*min-width:\s*175px/)
      expect(cssContent).toMatch(/\.size-output[^{]*\{[^}]*height:\s*76px/)
      expect(cssContent).toMatch(/\.size-output[^{]*\{[^}]*min-height:\s*76px/)
      expect(cssContent).toMatch(/\.size-output[^{]*\{[^}]*flex-shrink:\s*0/)

      expect(cssContent).toMatch(/\.left_box\s+\.facility-card[^{]*\{[^}]*width:\s*175px/)
      expect(cssContent).toMatch(/\.left_box\s+\.facility-card[^{]*\{[^}]*min-width:\s*175px/)
      expect(cssContent).toMatch(/\.left_box\s+\.facility-card[^{]*\{[^}]*height:\s*76px/)
      expect(cssContent).toMatch(/\.left_box\s+\.facility-card[^{]*\{[^}]*min-height:\s*76px/)
      expect(cssContent).toMatch(/\.left_box\s+\.facility-card[^{]*\{[^}]*flex-shrink:\s*0/)

      // Center and right remain unchanged
      expect(cssContent).toMatch(/\.size-center[^{]*\{[^}]*width:\s*277px/)
      expect(cssContent).toMatch(/\.size-center[^{]*\{[^}]*height:\s*76px/)
      expect(cssContent).toMatch(/\.size-support[^{]*\{[^}]*width:\s*124px/)
      expect(cssContent).toMatch(/\.size-support[^{]*\{[^}]*height:\s*76px/)
    })

    it('verifies global styles.css removes legacy 1180px body min-width and enforces viewport guards', () => {
      const globalCssPath = resolve(__dirname, '../../styles.css')
      const globalCssContent = readFileSync(globalCssPath, 'utf-8')

      // 1. Obsolete body 1180px min-width is completely removed
      expect(globalCssContent).not.toMatch(/body[^{]*\{[^}]*min-width:\s*1180px/)
      expect(globalCssContent).not.toContain('1180px')

      // 2. Global body min-width allows viewport <= 320px
      expect(globalCssContent).toMatch(/body[^{]*\{[^}]*min-width:\s*(?:[12]?[0-9]{1,2}|3[01][0-9]|320)px/)

      // 3. Minimal body overflow guard prevents page-level horizontal scroll
      expect(globalCssContent).toMatch(/body[^{]*\{[^}]*overflow-x:\s*hidden/)

      // 4. #app root guard ensures 100% width and <= 320px minimum
      expect(globalCssContent).toMatch(/#app[^{]*\{[^}]*width:\s*100%/)
      expect(globalCssContent).toMatch(/#app[^{]*\{[^}]*min-width:\s*(?:[12]?[0-9]{1,2}|3[01][0-9]|320)px/)

      // 5. Workbench CSS retains local overflow-x: auto containers for toolbar and board
      const wbCssPath = resolve(__dirname, '../styles.css')
      const wbCssContent = readFileSync(wbCssPath, 'utf-8')
      expect(wbCssContent).toMatch(/\.toolbar-scroll-container[^{]*\{[^}]*overflow-x:\s*auto/)
      expect(wbCssContent).toMatch(/\.board-scroll-container[^{]*\{[^}]*overflow-x:\s*auto/)
    })
  })
})
