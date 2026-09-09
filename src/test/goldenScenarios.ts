export type EvidenceStatus = 'exact-verified' | 'external-verified' | 'external-unverified' | 'provisional'

export interface GoldenMetric {
  value: number
  unit: string
  evidenceStatus: EvidenceStatus
  tolerance?: number
  valuationLmdPerDay?: number
  description?: string
}

export interface GoldenScenario {
  id: string
  name: string
  inputFile: string
  inputSha256Lf: string
  inputSha256Raw: string
  evidenceStatus: EvidenceStatus
  source: string
  notes: string
  metrics: {
    expPerDay: GoldenMetric
    goldPerDay: GoldenMetric
    tradingLmdPerDay: GoldenMetric
    [key: string]: GoldenMetric | undefined
  }
}

export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  {
    id: 'mower-252-2gold',
    name: '252 二赤金排班参考基准',
    inputFile: 'src/workbench/compat/fixtures/mower-252-2gold.json',
    inputSha256Lf: 'dcfb1fba89076fdd23cb4daaefd3a1ed9a839d61df7a791647f815a68ba136e8',
    inputSha256Raw: 'd765b57a0669ddceaaabe6092fb53c2b5d576eb4176a991f8ab9dd9387ea3640',
    evidenceStatus: 'external-verified',
    source: 'mower表.xlsx（工作表3 / 252二赤金 (Test)）',
    notes: '2026-09-08 已核对工作簿公式与缓存值：D13/D14/D15 为三项日产，D16/D17 为两种综合算法；C54 的无人机产能全部计入 D14 赤金。该表是已核实的外部计算基准，不等于游戏机制真值。',
    metrics: {
      expPerDay: {
        value: 53835.4240,
        unit: 'EXP/日',
        evidenceStatus: 'external-verified',
        description: '作战记录制造长期日产',
      },
      goldPerDay: {
        value: 100.78126,
        unit: '条/日',
        evidenceStatus: 'external-verified',
        valuationLmdPerDay: 50390.6300,
        description: '赤金制造长期日产（按500龙门币/条折算库存价值）',
      },
      tradingLmdPerDay: {
        value: 61550.9859,
        unit: '龙门币/日',
        evidenceStatus: 'external-verified',
        description: '贸易站获取龙门币长期日产',
      },
    },
  },
]
