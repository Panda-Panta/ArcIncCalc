/**
 * Derivative work based on arknights-mower (Plan.vue / SlickOperatorSelect.vue)
 * Original work Copyright (c) 2021 Nano
 * Licensed under the MIT License
 */

export type PolicyOperatorListKey =
  | 'rest_in_full'
  | 'exhaust_require'
  | 'workaholic'
  | 'resting_priority'
  | 'refresh_trading'
  | 'refresh_drained'
  | 'ope_resting_priority'

export interface PolicyListFieldMeta {
  key: PolicyOperatorListKey
  label: string
  help: string
  placeholder: string
}

export const POLICY_LIST_FIELDS: readonly PolicyListFieldMeta[] = [
  {
    key: 'rest_in_full',
    label: '需要回满心情的干员',
    help: '请查阅文档',
    placeholder: '选择需要回满心情的干员...',
  },
  {
    key: 'exhaust_require',
    label: '需要用尽心情的干员',
    help: '仅推荐写入具有暖机技能的干员',
    placeholder: '选择需要用尽心情的干员...',
  },
  {
    key: 'workaholic',
    label: '0心情工作的干员',
    help: '心情涣散状态仍能触发技能的干员',
    placeholder: '选择0心情工作的干员...',
  },
  {
    key: 'resting_priority',
    label: '宿舍低优先级干员',
    help: '请查阅文档',
    placeholder: '选择宿舍低优先级干员...',
  },
  {
    key: 'refresh_trading',
    label: '跑单时间刷新干员',
    help: '贸易站外影响贸易效率的干员。\n默认情况下，mower 只在贸易站内干员换班后重读所有贸易站的订单剩余时间。\n若有贸易站外的干员影响贸易效率，且与贸易站内的干员不在一组，则需写入此选项中。',
    placeholder: '填入在贸易站外影响贸易效率的干员',
  },
  {
    key: 'refresh_drained',
    label: '用尽刷新',
    help: '会影响用尽干员心情消耗速率的干员。\n在填入该选项的干员上下班后，会重新读取用尽干员的下班时间',
    placeholder: '选择用尽刷新干员...',
  },
  {
    key: 'ope_resting_priority',
    label: '干员休息优先级',
    help: '会按照优先级放入宿舍的时候重新排序。\n宿舍重新排序触发此设置优先级最高，所以非高效组谨慎填写',
    placeholder: '选择干员休息优先级...',
  },
] as const
