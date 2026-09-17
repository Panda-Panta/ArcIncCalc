/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RiicSkillsBrowser from './RiicSkillsBrowser.vue'

describe('RiicSkillsBrowser.vue', () => {
  it('renders correctly with operator cards and header stats', () => {
    const wrapper = mount(RiicSkillsBrowser)

    expect(wrapper.find('[data-test="riic-skills-browser"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('全量干员后勤技能与联动羁绊数据库')

    // Verify header stats reflect loaded operators
    expect(wrapper.text()).toContain('总干员数')
    expect(wrapper.find('[data-test="operator-cards-grid"]').exists()).toBe(true)
  })

  it('filters operators by operator name and pinyin abbreviation', async () => {
    const wrapper = mount(RiicSkillsBrowser)
    const opInput = wrapper.find<HTMLInputElement>('[data-test="search-operator-input"]')

    // Search by Chinese name matches Texas and Texas the Omertosa
    await opInput.setValue('德克萨斯')
    expect(wrapper.find('[data-test="op-card-德克萨斯"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="op-card-缄默德克萨斯"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="result-status-text"]').text()).toContain('2 位干员')

    // Search by pinyin abbreviation
    await opInput.setValue('dks')
    expect(wrapper.find('[data-test="op-card-德克萨斯"]').exists()).toBe(true)
  })

  it('filters operators by skill keyword', async () => {
    const wrapper = mount(RiicSkillsBrowser)
    const skillInput = wrapper.find<HTMLInputElement>('[data-test="search-skill-input"]')

    await skillInput.setValue('赤金')
    const statusText = wrapper.find('[data-test="result-status-text"]').text()
    expect(statusText).toContain('位干员')
    expect(wrapper.findAll('.op-card').length).toBeGreaterThan(0)
  })

  it('filters operators by facility tabs', async () => {
    const wrapper = mount(RiicSkillsBrowser)

    // Click Trading tab
    const tradingTab = wrapper.find('[data-test="tab-TRADING"]')
    expect(tradingTab.exists()).toBe(true)
    await tradingTab.trigger('click')

    expect(tradingTab.classes()).toContain('active')
    expect(wrapper.find('[data-test="result-status-text"]').text()).toContain('位干员')
    expect(wrapper.findAll('.op-card').length).toBeGreaterThan(0)

    // Click Dormitory tab
    const dormTab = wrapper.find('[data-test="tab-DORMITORY"]')
    await dormTab.trigger('click')
    expect(dormTab.classes()).toContain('active')
    expect(wrapper.find('[data-test="result-status-text"]').text()).toContain('位干员')
  })

  it('toggles synergy-only filter', async () => {
    const wrapper = mount(RiicSkillsBrowser)
    const synergyBtn = wrapper.find('[data-test="synergy-toggle-btn"]')

    await synergyBtn.trigger('click')
    expect(synergyBtn.classes()).toContain('active')

    // Cards should now only contain synergy operators
    expect(wrapper.findAll('.op-card').length).toBeGreaterThan(0)

    await synergyBtn.trigger('click')
    expect(synergyBtn.classes()).not.toContain('active')
  })

  it('resets filters when reset button is clicked', async () => {
    const wrapper = mount(RiicSkillsBrowser)

    await wrapper.find<HTMLInputElement>('[data-test="search-operator-input"]').setValue('银灰')
    expect(wrapper.find('[data-test="reset-filters-btn"]').exists()).toBe(true)

    await wrapper.find('[data-test="reset-filters-btn"]').trigger('click')
    expect(wrapper.find<HTMLInputElement>('[data-test="search-operator-input"]').element.value).toBe('')
    expect(wrapper.find('[data-test="reset-filters-btn"]').exists()).toBe(false)
  })
})
