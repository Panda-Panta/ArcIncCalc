import type { ScheduleSimulationReport } from '../simulator/scheduleSimulation'
import { scoreProduction } from '../optimizer/productionObjective'

/** Mower ui/src/pages/report.vue: Tequila's premium is also valued at 0.8.
 * This is a reporting convention, never a physical gold inventory inflow.
 */
export function mowerReportMetrics(report: ScheduleSimulationReport) {
  const production = report.production
  if (!report.success || !production?.success || report.observedHours <= 0) return null
  const factor = 24 / report.observedHours
  const orders = production.events.filter(e => e.type === 'order-completed'
    && e.time > report.assumptions.warmupHours && e.time <= report.elapsedHours
    && e.order && e.order.kind !== 'orundum').map(e => e.order!)
  const tequilaBonus = orders.reduce((n, o) => n + (o.kind === 'tequila' ? Math.max(0, o.lmdReward - o.goldCost * 500) : 0), 0)
  const score = scoreProduction(production.sample.completed, report.observedHours)
  return {
    exp: score.exp, goldValue: score.goldValue, orderLmd: score.orderValue,
    tequilaGoldValue: tequilaBonus * factor,
    mower82: score.total + .8 * tequilaBonus * factor,
    meanOrderValue: orders.length ? orders.reduce((n, o) => n + o.lmdReward, 0) / orders.length : null,
    orderCount: orders.length,
    orderDistribution: Object.fromEntries([...new Set(orders.map(o => o.kind))].map(kind => [kind, {
      count: orders.filter(o => o.kind === kind).length,
      lmd: orders.filter(o => o.kind === kind).reduce((n, o) => n + o.lmdReward, 0),
    }])),
  }
}
