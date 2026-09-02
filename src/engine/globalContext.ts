import type { AppConfig } from '../domain/types'
import { OPERATOR_MAP, type OperatorRecord } from '../domain/operators'

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
  droneCapacity: number
  trainingOperatorIds: readonly string[]
}

function selectedOperators(ids: readonly string[]): OperatorRecord[] {
  return ids.map((id) => OPERATOR_MAP.get(id)).filter((item): item is OperatorRecord => Boolean(item))
}

function isActive(id: string, config: AppConfig, activeOperatorIds?: ReadonlySet<string>): boolean {
  return activeOperatorIds ? activeOperatorIds.has(id) : !config.zeroMoraleOperatorIds.includes(id)
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

function allAssignedOperators(
  config: AppConfig,
  activeOperatorIds?: ReadonlySet<string>,
): OperatorRecord[] {
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
  return selectedOperators([...ids].filter((id) => isActive(id, config, activeOperatorIds)))
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
    const whisperain = config.facilities.office * 10
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
  const durinNames = new Set(['至简', '桃金娘', '褐果', '杜林', '特克诺'])
  return Math.min(4, assignedOperators.filter((operator) => durinNames.has(operator.name)).length)
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

export function buildRiicGlobalContext(
  config: AppConfig,
  activeOperatorIds?: ReadonlySet<string>,
  moraleValues?: ReadonlyMap<string, number>,
): RiicGlobalContext {
  const assignedOperators = allAssignedOperators(config, activeOperatorIds)
  const perception = derivePerceptionInformation(config, activeOperatorIds, moraleValues)
  const perceptionInformation = resource(perception.value, 0, perception.details)
  const thoughtChain = resource(
    perception.rosmontisActive ? perception.value : 0,
    config.efficiencyResources.manufacturePerceptionInformation,
    perception.details,
  )
  const silentResonance = resource(
    perception.ebenholzActive ? perception.value : 0,
    config.efficiencyResources.tradingPerceptionInformation,
    perception.details,
  )
  const physicalGoldLines = config.rooms.filter(
    (room) => room.type === 'manufacture' && room.product === 'gold',
  ).length
  const derivedAdditionalGoldLines = deriveAdditionalGoldProductionLines(
    config,
    assignedOperators,
    activeOperatorIds,
  )
  const configuredAdditionalGoldLines = config.efficiencyResources.additionalGoldProductionLines
  const additionalGoldLines = configuredAdditionalGoldLines > 0
    ? configuredAdditionalGoldLines
    : derivedAdditionalGoldLines
  const goldProductionLines = resource(
    physicalGoldLines + derivedAdditionalGoldLines,
    configuredAdditionalGoldLines > 0 ? physicalGoldLines + configuredAdditionalGoldLines : 0,
    [`实体赤金线 ${physicalGoldLines}`, `额外赤金线 ${additionalGoldLines}`],
  )

  return {
    assignedOperators,
    perceptionInformation,
    thoughtChain,
    silentResonance,
    goldProductionLines,
    physicalGoldProductionLines: physicalGoldLines,
    durinGoldProductionLines: derivedAdditionalGoldLines,
    engineeringRobots: Math.min(64, facilityLevelTotal(config)),
    effectivePowerStations: deriveEffectivePowerStations(config, activeOperatorIds),
    tradeStationCount: config.rooms.filter((room) => room.type === 'trading').length,
    monsterCuisine: config.efficiencyResources.monsterCuisine,
    worldlyFireworks: config.efficiencyResources.worldlyFireworks,
    suiFacilities: config.efficiencyResources.suiFacilities,
    droneCapacity: 235,
    trainingOperatorIds: [
      ...config.facilityOperatorIds.training,
      ...config.efficiencyResources.trainingOperatorIds,
    ],
  }
}
