export type AtomicFacilityType = 'manufacture' | 'trading' | 'power' | 'central' | 'office' | 'dormitory'

export interface AtomicMember {
  name: string
  roomType: AtomicFacilityType
  product?: 'gold' | 'exp'
  minLevel?: number
}

export interface AtomicUnitConfPolicy {
  exhaustRequire?: string[]
  restInFull?: string[]
  restingPriorityLow?: string[]
  restingPriorityHigh?: string[]
  workaholic?: string[]
}

export interface ExternalCountRequirement {
  name: string
  count: number
  pool: string[]
}

export interface AtomicUnit {
  id: string
  name: string
  description: string
  preferredFacilityType: 'manufacture' | 'trading'
  preferredProduct?: 'gold' | 'exp' | 'any'
  coreMembers: AtomicMember[]
  nonCoreMembers?: AtomicMember[]
  thirdMemberWhitelist?: string[]
  externalRequirements?: ExternalCountRequirement[]
  confPolicy?: AtomicUnitConfPolicy
  adaptToPowerCount?: (powerCount: number, product?: 'gold' | 'exp') => {
    coreMembers: AtomicMember[]
    thirdMemberWhitelist?: string[]
    confPolicy?: AtomicUnitConfPolicy
  }
}

export const ATOMIC_UNITS: readonly AtomicUnit[] = [
  // 1. 深海猎人 (5人全核心)
  {
    id: 'abyssal_hunters',
    name: '深海猎人',
    description: '歌蕾蒂娅中枢，斯卡蒂、乌尔比安、安哲拉、幽灵鲨进驻制造站。全员核心，宿舍低优先级保障歌蕾蒂娅快速回满。',
    preferredFacilityType: 'manufacture',
    preferredProduct: 'any',
    coreMembers: [
      { name: '歌蕾蒂娅', roomType: 'central' },
      { name: '斯卡蒂', roomType: 'manufacture' },
      { name: '乌尔比安', roomType: 'manufacture' },
      { name: '安哲拉', roomType: 'manufacture' },
      { name: '幽灵鲨', roomType: 'manufacture' },
    ],
    confPolicy: {
      restingPriorityLow: ['乌尔比安', '斯卡蒂', '幽灵鲨', '安哲拉'],
      restingPriorityHigh: ['歌蕾蒂娅'],
    },
  },

  // 2. 自动化体系 (温蒂+森蚺+承曦格雷伊；2/3电自适应，Lancet-2入workaholic)
  {
    id: 'automation',
    name: '自动化体系',
    description: '温蒂+森蚺+承曦格雷伊。3电森蚺进制造，2电森蚺进中枢且Lancet-2进发电站。同站第3人严禁普通散件。',
    preferredFacilityType: 'manufacture',
    preferredProduct: 'gold',
    coreMembers: [
      { name: '温蒂', roomType: 'manufacture' },
      { name: '森蚺', roomType: 'manufacture' },
      { name: '承曦格雷伊', roomType: 'power' },
    ],
    thirdMemberWhitelist: ['冬时', '异客', '掠风', '清流', '森蚺'],
    adaptToPowerCount: (powerCount: number, product?: 'gold' | 'exp') => {
      const isGold = product === 'gold'
      if (powerCount >= 3) {
        return {
          coreMembers: [
            { name: '温蒂', roomType: 'manufacture', product: isGold ? 'gold' : undefined },
            { name: '森蚺', roomType: 'manufacture', product: isGold ? 'gold' : undefined },
            { name: '承曦格雷伊', roomType: 'power' },
            ...(isGold ? [{ name: '清流', roomType: 'manufacture' as const, product: 'gold' as const }] : []),
          ],
          thirdMemberWhitelist: ['冬时', '异客', '掠风', '清流', '森蚺'],
        }
      }
      // 2-power adaptive
      return {
        coreMembers: [
          { name: '温蒂', roomType: 'manufacture', product: isGold ? 'gold' : undefined },
          { name: '森蚺', roomType: 'central' },
          { name: 'Lancet-2', roomType: 'power' },
          { name: '承曦格雷伊', roomType: 'power' },
          ...(isGold ? [{ name: '清流', roomType: 'manufacture' as const, product: 'gold' as const }] : []),
        ],
        thirdMemberWhitelist: ['冬时', '异客', '掠风', '清流'],
        confPolicy: {
          workaholic: ['Lancet-2'],
        },
      }
    },
  },

  // 3. 红松林骑士 (5人全核心，严禁包含酒神)
  {
    id: 'pinus_sylvestris',
    name: '红松林骑士',
    description: '薇薇安娜与焰尾中枢，野鬃、灰毫、远牙制造站经验。全员核心，不包含酒神。',
    preferredFacilityType: 'manufacture',
    preferredProduct: 'exp',
    coreMembers: [
      { name: '薇薇安娜', roomType: 'central' },
      { name: '焰尾', roomType: 'central' },
      { name: '野鬃', roomType: 'manufacture', product: 'exp' },
      { name: '灰毫', roomType: 'manufacture', product: 'exp' },
      { name: '远牙', roomType: 'manufacture', product: 'exp' },
    ],
    nonCoreMembers: [
      { name: '玛恩纳', roomType: 'central' },
      { name: '砾', roomType: 'manufacture', product: 'exp' },
    ],
  },

  // 4. 黑钢国际 (4人全核心)
  {
    id: 'blacksteel',
    name: '黑钢国际',
    description: '涤火杰西卡进中枢，水月、香草、杰西卡进制造站。4人全核心。',
    preferredFacilityType: 'manufacture',
    preferredProduct: 'any',
    coreMembers: [
      { name: '涤火杰西卡', roomType: 'central' },
      { name: '水月', roomType: 'manufacture' },
      { name: '香草', roomType: 'manufacture' },
      { name: '杰西卡', roomType: 'manufacture' },
    ],
  },

  // 5. 红云酒神猫猫 (3人强制绑定，不可拆换)
  {
    id: 'vermeil_dionysus',
    name: '红云酒神猫猫',
    description: '红云+酒神+Miss.Christine进作战记录制造站。3人强行绑定，不可拆换。',
    preferredFacilityType: 'manufacture',
    preferredProduct: 'exp',
    coreMembers: [
      { name: '红云', roomType: 'manufacture', product: 'exp' },
      { name: '酒神', roomType: 'manufacture', product: 'exp' },
      { name: 'Miss.Christine', roomType: 'manufacture', product: 'exp' },
    ],
  },

  // 6. 红云容量组 (2核心+1推荐)
  {
    id: 'vermeil_capacity',
    name: '红云容量组',
    description: '红云+稀音进作战记录制造站，第3人为容量加成散件。',
    preferredFacilityType: 'manufacture',
    preferredProduct: 'exp',
    coreMembers: [
      { name: '红云', roomType: 'manufacture', product: 'exp' },
      { name: '稀音', roomType: 'manufacture', product: 'exp' },
    ],
    nonCoreMembers: [
      { name: '刻俄柏', roomType: 'manufacture', product: 'exp' },
      { name: '帕拉斯', roomType: 'manufacture', product: 'exp' },
      { name: '卡达', roomType: 'manufacture', product: 'exp' },
      { name: '豆苗', roomType: 'manufacture', product: 'exp' },
    ],
  },

  // 7. 莱茵生命 (2人核心/3人赤金核心)
  {
    id: 'rhine_lab',
    name: '莱茵生命',
    description: '多萝西+淬羽赫默制造站。赤金站娜斯提为第3核心，需基建内存在3名莱茵干员。',
    preferredFacilityType: 'manufacture',
    preferredProduct: 'any',
    coreMembers: [
      { name: '多萝西', roomType: 'manufacture' },
      { name: '淬羽赫默', roomType: 'manufacture' },
    ],
    nonCoreMembers: [
      { name: '娜斯提', roomType: 'manufacture', product: 'gold' },
      { name: '白面鸮', roomType: 'manufacture' },
      { name: '赫默', roomType: 'manufacture' },
      { name: '星源', roomType: 'manufacture' },
      { name: '梅尔', roomType: 'manufacture' },
    ],
    externalRequirements: [
      {
        name: '莱茵生命基建计数',
        count: 3,
        pool: ['白面鸮', '赫默', '星源', '梅尔', '缪尔赛思', '塞雷娅', '伊芙利特', '麦哲伦'],
      },
    ],
  },

  // 8. 苍苔金属工艺 (1核心+2金属)
  {
    id: 'cantabile_metalcraft',
    name: '苍苔金属工艺',
    description: '苍苔进驻赤金制造站，从6人金属工艺池中匹配2人进驻。',
    preferredFacilityType: 'manufacture',
    preferredProduct: 'gold',
    coreMembers: [
      { name: '苍苔', roomType: 'manufacture', product: 'gold' },
    ],
    nonCoreMembers: [
      { name: '砾', roomType: 'manufacture', product: 'gold' },
      { name: '引星棘刺', roomType: 'manufacture', product: 'gold' },
      { name: '斑点', roomType: 'manufacture', product: 'gold' },
      { name: '夜烟', roomType: 'manufacture', product: 'gold' },
      { name: '温米', roomType: 'manufacture', product: 'gold' },
    ],
  },

  // 9. 槐琥阿罗玛 (2人核心，需暖机配置)
  {
    id: 'aroma_waaifu',
    name: '槐琥阿罗玛',
    description: '阿罗玛+槐琥进驻赤金制造站。配置exhaust_require与rest_in_full进行暖机轮转。',
    preferredFacilityType: 'manufacture',
    preferredProduct: 'gold',
    coreMembers: [
      { name: '阿罗玛', roomType: 'manufacture', product: 'gold' },
      { name: '槐琥', roomType: 'manufacture', product: 'gold' },
    ],
    confPolicy: {
      exhaustRequire: ['阿罗玛', '槐琥'],
      restInFull: ['阿罗玛', '槐琥'],
    },
  },

  // 10. 泡泡容量组 (2人核心)
  {
    id: 'bubble_capacity',
    name: '泡泡容量组',
    description: '泡泡+火神进驻制造站，推荐贝娜提升大容量生产力。',
    preferredFacilityType: 'manufacture',
    preferredProduct: 'any',
    coreMembers: [
      { name: '泡泡', roomType: 'manufacture' },
      { name: '火神', roomType: 'manufacture' },
    ],
    nonCoreMembers: [
      { name: '贝娜', roomType: 'manufacture' },
      { name: '刻俄柏', roomType: 'manufacture' },
    ],
  },

  // 11. 纯感知信息体系 (3人核心)
  {
    id: 'pure_perception',
    name: '纯感知信息体系',
    description: '迷迭香制造站、絮雨办公室、黑键贸易站。独立于人间烟火。',
    preferredFacilityType: 'trading',
    coreMembers: [
      { name: '迷迭香', roomType: 'manufacture' },
      { name: '絮雨', roomType: 'office' },
      { name: '黑键', roomType: 'trading' },
    ],
    nonCoreMembers: [
      { name: '爱丽丝', roomType: 'dormitory' },
      { name: '琴柳', roomType: 'central' },
    ],
  },

  // 12. 感知+人间烟火双核体系 (6人全核心)
  {
    id: 'perception_fireworks',
    name: '感知+人间烟火双核体系',
    description: '迷迭香制造、絮雨办公室、黑键贸易1、乌有贸易2、夕与令中枢。双贸易站双核同驻。',
    preferredFacilityType: 'trading',
    coreMembers: [
      { name: '迷迭香', roomType: 'manufacture' },
      { name: '絮雨', roomType: 'office' },
      { name: '黑键', roomType: 'trading' },
      { name: '乌有', roomType: 'trading' },
      { name: '夕', roomType: 'central' },
      { name: '令', roomType: 'central' },
    ],
    nonCoreMembers: [
      { name: '桑葚', roomType: 'office' },
      { name: '爱丽丝', roomType: 'dormitory' },
    ],
  },

  // 13. 鸿雪4杜林体系 (2贸易核心+4杜林强制)
  {
    id: 'pozemka_durin',
    name: '鸿雪4杜林体系',
    description: '鸿雪+图耶进驻贸易站，4杜林（杜林/桃金娘/至简/褐果）进驻基建制造/宿舍。',
    preferredFacilityType: 'trading',
    coreMembers: [
      { name: '鸿雪', roomType: 'trading' },
      { name: '图耶', roomType: 'trading' },
    ],
    nonCoreMembers: [
      { name: '绮良', roomType: 'trading' },
      { name: '黑键', roomType: 'trading' },
    ],
    externalRequirements: [
      {
        name: '4名杜林族进驻基建',
        count: 4,
        pool: ['杜林', '桃金娘', '褐果', '至简', '褐果'],
      },
    ],
  },

  // 14. 企鹅物流 (2人核心，排除空)
  {
    id: 'penguin_logistics',
    name: '企鹅物流',
    description: '德克萨斯+拉普兰德进驻贸易站。第3人匹配高效率散件，排除空。',
    preferredFacilityType: 'trading',
    coreMembers: [
      { name: '德克萨斯', roomType: 'trading' },
      { name: '拉普兰德', roomType: 'trading' },
    ],
    nonCoreMembers: [
      { name: '能天使', roomType: 'trading' },
      { name: '伺夜', roomType: 'trading' },
      { name: '雪雉', roomType: 'trading' },
    ],
  },

  // 15. 拉特兰商道 (2人核心)
  {
    id: 'laterano',
    name: '拉特兰商道',
    description: '蕾缪安+能天使进驻贸易站。空弦为非核心辅助。',
    preferredFacilityType: 'trading',
    coreMembers: [
      { name: '蕾缪安', roomType: 'trading' },
      { name: '能天使', roomType: 'trading' },
    ],
    nonCoreMembers: [
      { name: '空弦', roomType: 'trading' },
    ],
  },

  // 16. 叙拉古组 (2人核心)
  {
    id: 'siracusa',
    name: '叙拉古组',
    description: '伺夜+贝洛内进驻贸易站，八幡海铃进驻中枢加成。',
    preferredFacilityType: 'trading',
    coreMembers: [
      { name: '伺夜', roomType: 'trading' },
      { name: '贝洛内', roomType: 'trading' },
    ],
    nonCoreMembers: [
      { name: '八幡海铃', roomType: 'central' },
    ],
  },

  // 17. 格拉斯哥帮 (2人核心)
  {
    id: 'glasgow',
    name: '格拉斯哥帮',
    description: '推进之王+摩根进驻贸易站，戴菲恩进驻中枢。',
    preferredFacilityType: 'trading',
    coreMembers: [
      { name: '推进之王', roomType: 'trading' },
      { name: '摩根', roomType: 'trading' },
    ],
    nonCoreMembers: [
      { name: '戴菲恩', roomType: 'central' },
    ],
  },

  // 18. 喀兰贸易 (3人核心)
  {
    id: 'karlan',
    name: '喀兰贸易',
    description: '银灰+孑进驻贸易站，灵知进驻中枢。',
    preferredFacilityType: 'trading',
    coreMembers: [
      { name: '银灰', roomType: 'trading' },
      { name: '孑', roomType: 'trading' },
      { name: '灵知', roomType: 'central' },
    ],
    nonCoreMembers: [
      { name: '崖心', roomType: 'trading' },
      { name: '琳琅诗怀雅', roomType: 'trading' },
    ],
  },
] as const

export const HIGH_EFFICIENCY_SINGLETONS = {
  goldManufacture: ['砾', '引星棘刺', '斑点', '夜烟', '温米', '铸铁'],
  expManufacture: ['白雪', '霜叶', '红豆', '截云', '断罪者', '食铁兽', '帕拉斯', '卡达', '豆苗', '圣约送葬人'],
  generalManufacture: ['调香师', '史都华德', '蛇屠箱', '深律', '霜华'],
  // 跑单分支：严禁但书、龙舌兰、可露希尔常驻，严禁空进驻企鹅物流，严禁包含原子核心
  trading: ['雪雉', '古米', '月见夜', '空爆', '缠丸', '夜烟', '芬', '暗索', '远山'],
  control: ['缪尔赛思', '凯尔希', '阿米娅', '琴柳', '玛恩纳', '维娜·维多利亚', '早露', '灰风'],
  durinRace: ['杜林', '桃金娘', '褐果', '至简'],
} as const

export const ALL_ATOMIC_CORE_NAMES: ReadonlySet<string> = new Set(
  ATOMIC_UNITS.flatMap((u) => u.coreMembers.map((m) => m.name)),
)
