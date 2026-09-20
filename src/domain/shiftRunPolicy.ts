import { EDITION } from './edition'
import { OPERATOR_MAP } from './operators'

const unsupportedNames = new Set(['佩佩', '可露希尔', 'U-Official'])
/** Other facilities may still use these operators; only their trading orders are out of scope. */
export function isUnsupportedTradeOperator(idOrName: string): boolean {
  return EDITION.id === 'shift-run' && unsupportedNames.has(OPERATOR_MAP.get(idOrName)?.name ?? idOrName)
}
export function assertSupportedSpecialOrder(mode: string): void {
  if (EDITION.id === 'shift-run' && ['closure', 'pepe', 'uOfficial', 'uofficial'].includes(mode)) {
    throw new Error('Unsupported special order in shift-run edition: ' + mode + '；本分支仅支持但书、龙舌兰特殊订单')
  }
}
