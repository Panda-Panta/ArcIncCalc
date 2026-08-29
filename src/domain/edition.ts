import type { SpecialOrder } from './types'

export interface CalculatorEdition {
  id: 'standard' | 'shift-run'
  label: string
  description: string
  storageNamespace: string
  allowShiftRun: boolean
  importLegacyConfig: boolean
  defaultSpecialOrder: SpecialOrder
}

export const EDITION: CalculatorEdition = {
  id: 'standard',
  label: '常规排班版',
  description: '以持续进驻和常规订单为核心，不启用跑单。',
  storageNamespace: 'standard',
  allowShiftRun: false,
  importLegacyConfig: true,
  defaultSpecialOrder: 'none',
}
