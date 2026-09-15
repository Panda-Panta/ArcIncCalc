import { matchesRiicIdentity } from '../domain/riicIdentity'
import type { AppConfig } from '../domain/types'
import { OPERATOR_MAP, type OperatorRecord } from '../domain/operators'
import { hasRiicTag } from '../domain/riicTags'

export interface GlobalResourceValue {
  derived: number
  override: number | null
  effective: number
  details: readonly string[]
}

export interface EffectivePowerStations {
  count: number
  physical: number
  greyBonus: number
  eunectesBonus: number
}

export interface RiicGlobalContext {
  /** Physical presence, including exhausted occupants; use assignedOperators for active providers. */
  presentOperators: readonly OperatorRecord[]
  assignedOperators: readonly OperatorRecord[]
  perceptionInformation: GlobalResourceValue
  thoughtChain: GlobalResourceValue
  silentResonance: GlobalResourceValue
  goldProductionLines: GlobalResourceValue
  physicalGoldProductionLines: number
  durinGoldProductionLines: number
  engineeringRobots: number
  effectivePowerStations: EffectivePowerStations
  tradeStationCount: number
  monsterCuisine: number
  worldlyFireworks: number
  suiFacilities: number
  eliteFacilities: number
  woodCatnip: number
  ursuSpecialDrink: number
  droneCapacity: number
  trainingOperatorIds: readonly string[]
  centralManufactureBonus: number
  centralManufactureDetails: readonly string[]
  unquantifiedControlSkills: readonly string[]
}

function selectedOperators(ids: readonly string[]): OperatorRecord[] {
  return ids.map((id) => OPERATOR_MAP.get(id)).filter((item): item is OperatorRecord => Boolean(item))
}

function isActive(id: string, config: AppConfig, activeOperatorIds?: ReadonlySet<string>): boolean {
  // Exhaustion disables workplace skills, not the recovery/resource skills of resting occupants.
  if (config.facilityOperatorIds.dormitories.some(ids => ids.includes(id))) return true
  const isDynamicAssignment =
    config.controlOperatorIds.includes(id) ||
    config.rooms.some((room) => room.operatorIds.includes(id))
  if (activeOperatorIds && isDynamicAssignment) return activeOperatorIds.has(id)
  return !config.zeroMoraleOperatorIds.includes(id)
}

function occupiedFacilityOperatorIds(config: AppConfig): readonly string[][] {
  return [
    config.controlOperatorIds,
    ...config.rooms.map((room) => room.operatorIds),
    ...config.facilityOperatorIds.dormitories,
    config.facilityOperatorIds.reception,
    config.facilityOperatorIds.workshop,
    config.facilityOperatorIds.office,
    config.facilityOperatorIds.training,
  ]
}

function occupiedGroupFacilities(config: AppConfig, groupId: string): number {
  return occupiedFacilityOperatorIds(config).filter((ids) =>
    selectedOperators(ids).some((operator) => matchesRiicIdentity(operator, 'groupId', groupId)),
  ).length
}

function deriveControlResources(config: AppConfig, activeOperatorIds?: ReadonlySet<string>) {
  const present = selectedOperators(config.controlOperatorIds)
  const active = present.filter(op => isActive(op.charId, config, activeOperatorIds))
  const woodCatnip = (active.some(op => op.name === '麒麟R夜刀') ? 8 : 0)
    + (active.some(op => op.name === '火龙S黑角') ? present.filter(op => hasRiicTag(op, 'monsterHunter')).length * 2 : 0)
  const ursuSpecialDrink = active.some(op => op.name === '战车')
    ? present.filter(op => matchesRiicIdentity(op, 'teamId', 'student')).length : 0
  return { woodCatnip, ursuSpecialDrink }
}

function deriveDirectSilentResonance(config: AppConfig, activeOperatorIds?: ReadonlySet<string>) {
  let value = 0
  const details: string[] = []
  for (const ids of config.facilityOperatorIds.dormitories) {
    if (ids.includes('char_245_cello') && isActive('char_245_cello', config, activeOperatorIds)) {
      const amount = selectedOperators([...new Set(ids)]).length
      value += amount
      details.push(`塑心 +${amount}`)
    }
  }
  if (config.facilityOperatorIds.office.includes('char_4109_baslin') && isActive('char_4109_baslin', config, activeOperatorIds)) {
    const amount = Math.max(0, config.facilities.office - 1) * 15
    value += amount
    details.push(`深律 +${amount}`)
  }
  return { value, details }
}

export function deriveWorldlyFireworks(
  config: AppConfig,
  activeOperatorIds?: ReadonlySet<string>,
  moraleValues?: ReadonlyMap<string, number>,
): number {
  if (config.efficiencyResources.worldlyFireworks > 0) {
    return config.efficiencyResources.worldlyFireworks
  }
  const activeControlIds = new Set(
    config.controlOperatorIds.filter((id) => isActive(id, config, activeOperatorIds)),
  )
  const moraleOf = (id: string) => moraleValues?.get(id) ?? config.operatorMorale[id] ?? 24
  let value = 0
  if (activeControlIds.has('char_2023_ling') && moraleOf('char_2023_ling') > 12) value += 15
  if (activeControlIds.has('char_2015_dusk') && moraleOf('char_2015_dusk') <= 12) value += 15
  if (activeControlIds.has('char_2024_chyue')) {
    const workOperatorIds = [
      ...config.controlOperatorIds,
      ...config.rooms.flatMap((room) => room.operatorIds),
      ...config.facilityOperatorIds.reception,
      ...config.facilityOperatorIds.workshop,
      ...config.facilityOperatorIds.office,
      ...config.facilityOperatorIds.training,
    ]
    const activeSui = selectedOperators(
      workOperatorIds.filter((id) => isActive(id, config, activeOperatorIds)),
    ).filter((operator) => matchesRiicIdentity(operator, 'groupId', 'sui'))
    value += Math.min(5, activeSui.length) * 5
  }
  if (
    config.facilityOperatorIds.office.includes('char_473_mberry') &&
    isActive('char_473_mberry', config, activeOperatorIds)
  ) {
    value += Math.max(0, config.facilities.office - 1) * 10
  }
  const wuYouActive = config.rooms
    .filter((room) => room.type === 'trading')
    .some((room) =>
      room.operatorIds.includes('char_455_nothin') &&
      isActive('char_455_nothin', config, activeOperatorIds),
    )
  if (wuYouActive) value += config.dormitoryOccupantCount
  return value
}

function deriveMonsterCuisine(
  config: AppConfig,
  activeOperatorIds?: ReadonlySet<string>,
): number {
  return config.facilityOperatorIds.dormitories.reduce((sum, ids, index) => {
    const senshiActive = ids.includes('char_4143_sensi') &&
      isActive('char_4143_sensi', config, activeOperatorIds)
    return sum + (senshiActive ? config.facilities.dormitories[index] ?? 0 : 0)
  }, 0)
}

function resource(derived: number, override: number, details: string[]): GlobalResourceValue {
  const selectedOverride = override > 0 ? override : null
  return {
    derived,
    override: selectedOverride,
    effective: selectedOverride ?? derived,
    details,
  }
}

function allPresentOperators(config: AppConfig): OperatorRecord[] {
  const ids = new Set([
    ...config.rooms.flatMap((room) => room.operatorIds),
    ...config.controlOperatorIds,
    ...config.facilityOperatorIds.dormitories.flat(),
    ...config.facilityOperatorIds.reception,
    ...config.facilityOperatorIds.workshop,
    ...config.facilityOperatorIds.office,
    ...config.facilityOperatorIds.training,
    ...config.efficiencyResources.extraWorkplaceOperatorIds,
  ])
  return selectedOperators([...ids])
}

function derivePerceptionInformation(
  config: AppConfig,
  activeOperatorIds?: ReadonlySet<string>,
  moraleValues?: ReadonlyMap<string, number>,
): { value: number; details: string[]; rosmontisActive: boolean; ebenholzActive: boolean } {
  let value = 0
  const details: string[] = []
  const activeInRooms = (type: 'manufacture' | 'trading') => new Set(
    config.rooms
      .filter((room) => room.type === type)
      .flatMap((room) => room.operatorIds)
      .filter((id) => isActive(id, config, activeOperatorIds)),
  )
  const manufactureIds = activeInRooms('manufacture')
  const tradingIds = activeInRooms('trading')
  const rosmontisActive = manufactureIds.has('char_391_rosmon')
  const ebenholzActive = tradingIds.has('char_4046_ebnhlz')

  if (rosmontisActive) {
    value += config.dormitoryOccupantCount
    details.push(`迷迭香 +${config.dormitoryOccupantCount}`)
  }
  if (ebenholzActive) {
    value += config.dormitoryOccupantCount
    details.push(`黑键 +${config.dormitoryOccupantCount}`)
  }

  const officeIds = config.facilityOperatorIds.office.filter((id) =>
    isActive(id, config, activeOperatorIds),
  )
  if (officeIds.includes('char_436_whispr')) {
    const whisperain = Math.max(0, config.facilities.office - 1) * 10
    value += whisperain
    details.push(`絮雨 +${whisperain}`)
  }

  config.facilityOperatorIds.dormitories.forEach((operatorIds, index) => {
    const level = config.facilities.dormitories[index] ?? 0
    const activeIds = operatorIds.filter((id) => isActive(id, config, activeOperatorIds))
    if (activeIds.includes('char_338_iris')) {
      value += level
      details.push(`爱丽丝 +${level}`)
    }
    if (activeIds.includes('char_4047_pianst')) {
      value += level
      details.push(`车尔尼 +${level}`)
    }
  })

  const controlIds = new Set(
    config.controlOperatorIds.filter((id) => isActive(id, config, activeOperatorIds)),
  )
  const moraleOf = (id: string) => moraleValues?.get(id) ?? config.operatorMorale[id] ?? 24
  if (controlIds.has('char_2015_dusk') && moraleOf('char_2015_dusk') > 12) {
    value += 10
    details.push('夕 +10')
  }
  if (controlIds.has('char_2023_ling') && moraleOf('char_2023_ling') <= 12) {
    value += 10
    details.push('令 +10')
  }

  return { value, details, rosmontisActive, ebenholzActive }
}

function deriveAdditionalGoldProductionLines(
  config: AppConfig,
  assignedOperators: readonly OperatorRecord[],
  activeOperatorIds?: ReadonlySet<string>,
): number {
  const pozemkaActive = config.rooms
    .filter((room) => room.type === 'trading')
    .flatMap((room) => room.operatorIds)
    .some((id) => id === 'char_4055_bgsnow' && isActive(id, config, activeOperatorIds))
  if (!pozemkaActive) return 0
  return Math.min(4, assignedOperators.filter((operator) => hasRiicTag(operator, 'durin')).length)
}

function deriveKiraraGoldProductionLines(
  config: AppConfig,
  activeOperatorIds?: ReadonlySet<string>,
): number {
  const kiraraActive = config.rooms
    .filter((room) => room.type === 'trading')
    .flatMap((room) => room.operatorIds)
    .some((id) => id === 'char_478_kirara' && isActive(id, config, activeOperatorIds))
  if (!kiraraActive) return 0
  const physicalGoldLines = config.rooms.filter(
    (room) => room.type === 'manufacture' && room.product === 'gold',
  ).length
  return Math.floor(physicalGoldLines / 2) * 2
}

function facilityLevelTotal(config: AppConfig): number {
  return (
    5 +
    config.rooms.reduce((sum, room) => sum + room.level, 0) +
    config.facilities.reception +
    config.facilities.office +
    config.facilities.training +
    config.facilities.workshop +
    config.facilities.dormitories.reduce((sum, level) => sum + level, 0)
  )
}

function deriveEffectivePowerStations(
  config: AppConfig,
  activeOperatorIds?: ReadonlySet<string>,
): EffectivePowerStations {
  const powerRooms = config.rooms.filter((room) => room.type === 'power')
  const powerOperators = powerRooms.flatMap((room) => selectedOperators(room.operatorIds))
  const activeIds = new Set(
    powerRooms
      .flatMap((room) => room.operatorIds)
      .filter((id) => isActive(id, config, activeOperatorIds)),
  )
  const workPlatforms = new Set([
    'char_285_medic2',
    'char_286_cast3',
    'char_376_therex',
    'char_4000_jnight',
    'char_4093_frston',
    'char_4136_phonor',
    'char_4188_confes',
    'char_4227_gallus',
  ])
  const physical = powerRooms.length
  const greyRoom = powerRooms.find((room) => room.operatorIds.includes('char_1027_greyy2'))
  const activePlatformInOtherRoom = powerRooms.some(
    (room) =>
      room.id !== greyRoom?.id &&
      room.operatorIds.some((id) => activeIds.has(id) && workPlatforms.has(id)),
  )
  const greyBonus =
    greyRoom && activeIds.has('char_1027_greyy2') && !activePlatformInOtherRoom ? 1 : 0
  const eunectesBonus =
    config.controlOperatorIds.includes('char_416_zumama') &&
    isActive('char_416_zumama', config, activeOperatorIds) &&
    powerOperators.some((operator) => operator.charId === 'char_285_medic2')
      ? 2
      : 0
  return { count: physical + greyBonus + eunectesBonus, physical, greyBonus, eunectesBonus }
}

export function deriveCentralManufactureBonus(
  config: AppConfig,
  activeOperatorIds?: ReadonlySet<string>,
): { value: number; details: readonly string[]; unquantifiedSkills: readonly string[] } {
  const controlOperators = selectedOperators(
    config.controlOperatorIds.filter((id) => isActive(id, config, activeOperatorIds)),
  )
  let staticMax = 0
  const details: string[] = []
  const unquantifiedSkills: string[] = []

  for (const operator of controlOperators) {
    for (const skill of operator.skills.filter((item) => item.roomType === 'CONTROL')) {
      if (operator.charId === 'char_003_kalts' || operator.charId === 'char_4179_monstr') {
        staticMax = Math.max(staticMax, 2)
        continue
      }
      if (operator.charId === 'char_1044_hsgma2') {
        const hasOtherLgd = controlOperators.some(
          (other) => other.charId !== 'char_1044_hsgma2' && matchesRiicIdentity(other, 'groupId', 'lgd'),
        )
        if (hasOtherLgd) {
          staticMax = Math.max(staticMax, 3)
        }
        continue
      }
      if (operator.charId === 'char_1029_yato2') {
        const hasOtherMh = controlOperators.some(
          (other) => other.charId !== operator.charId && hasRiicTag(other, 'monsterHunter'),
        )
        if (hasOtherMh) {
          staticMax = Math.max(staticMax, 2)
        }
        continue
      }
      if (operator.charId === 'char_4004_pudd') {
        const platformIds = new Set([
          'char_285_medic2',
          'char_286_cast3',
          'char_376_therex',
          'char_4000_jnight',
          'char_4093_frston',
          'char_4136_phonor',
          'char_4188_confes',
          'char_4227_gallus',
        ])
        const activeRobotCount = config.rooms
          .filter((r) => r.type === 'power')
          .flatMap((r) => r.operatorIds)
          .filter((id) => isActive(id, config, activeOperatorIds))
          .filter((id) => {
            const op = OPERATOR_MAP.get(id)
            return Boolean(op && hasRiicTag(op, 'workPlatform')) || platformIds.has(id)
          }).length
        if (activeRobotCount >= 2) {
          staticMax = Math.max(staticMax, 2)
        }
        continue
      }
      if (operator.charId === 'char_2027_wang') {
        const external = config.rooms.filter(r => r.type === 'trading' || r.type === 'power').length
        const actual = config.rooms.filter(r => r.type === 'manufacture').length
        if (actual > external) staticMax = Math.max(staticMax, 2)
        continue
      }
      if (/^进驻控制中枢时，所有制造站生产力\+([\d.]+)%/.test(skill.description)) {
        const match = skill.description.match(/^进驻控制中枢时，所有制造站生产力\+([\d.]+)%/)
        if (match && Number(match[1]) > staticMax) {
          staticMax = Number(match[1])
        }
      }
    }
  }

  if (staticMax > 0) {
    details.push(`控制中枢：全局制造 +${staticMax}%（同类取最高）`)
  }

  return { value: staticMax, details, unquantifiedSkills }
}

export function buildRiicGlobalContext(
  config: AppConfig,
  activeOperatorIds?: ReadonlySet<string>,
  moraleValues?: ReadonlyMap<string, number>,
): RiicGlobalContext {
  const presentOperators = allPresentOperators(config)
  const assignedOperators = presentOperators.filter(op => isActive(op.charId, config, activeOperatorIds))
  const perception = derivePerceptionInformation(config, activeOperatorIds, moraleValues)
  const perceptionInformation = resource(perception.value, 0, perception.details)
  const thoughtChain = resource(
    perception.rosmontisActive ? perception.value : 0,
    config.efficiencyResources.manufacturePerceptionInformation,
    perception.details,
  )
  const directResonance = deriveDirectSilentResonance(config, activeOperatorIds)
  const silentResonance = resource(
    (perception.ebenholzActive ? perception.value : 0) + directResonance.value,
    config.efficiencyResources.tradingPerceptionInformation,
    [...(perception.ebenholzActive ? perception.details : []), ...directResonance.details],
  )
  const physicalGoldLines = config.rooms.filter(
    (room) => room.type === 'manufacture' && room.product === 'gold',
  ).length
  const derivedAdditionalGoldLines = deriveAdditionalGoldProductionLines(
    config,
    presentOperators,
    activeOperatorIds,
  )
  const derivedKiraraGoldLines = deriveKiraraGoldProductionLines(config, activeOperatorIds)
  const configuredAdditionalGoldLines = config.efficiencyResources.additionalGoldProductionLines
  const additionalGoldLines = configuredAdditionalGoldLines > 0
    ? configuredAdditionalGoldLines
    : derivedAdditionalGoldLines + derivedKiraraGoldLines
  const goldProductionLines = resource(
    physicalGoldLines + derivedAdditionalGoldLines + derivedKiraraGoldLines,
    configuredAdditionalGoldLines > 0 ? physicalGoldLines + configuredAdditionalGoldLines : 0,
    [
      `实体赤金线 ${physicalGoldLines}`,
      `鸿雪虚拟线 ${derivedAdditionalGoldLines}`,
      `绮良虚拟线 ${derivedKiraraGoldLines}`,
      `额外赤金线合计 ${additionalGoldLines}`,
    ],
  )
  const derivedWorldlyFireworks = deriveWorldlyFireworks(config, activeOperatorIds, moraleValues)
  const derivedMonsterCuisine = deriveMonsterCuisine(config, activeOperatorIds)
  const derivedSuiFacilityCount = occupiedGroupFacilities(config, 'sui')
  const controlResources = deriveControlResources(config, activeOperatorIds)
  const centralManufacture = deriveCentralManufactureBonus(config, activeOperatorIds)

  return {
    presentOperators,
    assignedOperators,
    ...controlResources,
    eliteFacilities: occupiedGroupFacilities(config, 'elite'),
    perceptionInformation,
    thoughtChain,
    silentResonance,
    goldProductionLines,
    physicalGoldProductionLines: physicalGoldLines,
    durinGoldProductionLines: derivedAdditionalGoldLines,
    engineeringRobots: Math.min(64, facilityLevelTotal(config)),
    effectivePowerStations: deriveEffectivePowerStations(config, activeOperatorIds),
    tradeStationCount: config.rooms.filter((room) => room.type === 'trading').length,
    monsterCuisine: config.efficiencyResources.monsterCuisine > 0
      ? config.efficiencyResources.monsterCuisine
      : derivedMonsterCuisine,
    worldlyFireworks: config.efficiencyResources.worldlyFireworks > 0
      ? config.efficiencyResources.worldlyFireworks
      : derivedWorldlyFireworks,
    suiFacilities: config.efficiencyResources.suiFacilities > 0
      ? config.efficiencyResources.suiFacilities
      : derivedSuiFacilityCount,
    droneCapacity: config.efficiencyResources.droneCapacity,
    trainingOperatorIds: [
      ...config.facilityOperatorIds.training,
      ...config.efficiencyResources.trainingOperatorIds,
    ],
    centralManufactureBonus: centralManufacture.value,
    centralManufactureDetails: centralManufacture.details,
    unquantifiedControlSkills: centralManufacture.unquantifiedSkills,
  }
}
