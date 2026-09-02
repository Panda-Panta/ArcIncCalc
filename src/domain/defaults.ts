import type { AppConfig, OutputRoom, RoomType } from './types'
import { EDITION } from './edition'

export const ROOM_LABELS: Record<RoomType, string> = {
  manufacture: '制造站',
  trading: '贸易站',
  power: '发电站',
}

export const ROOM_LIMITS: Record<RoomType, number> = {
  manufacture: 5,
  trading: 5,
  power: 3,
}

export function createRoom(id: string, type: RoomType): OutputRoom {
  return {
    id,
    type,
    level: 3,
    operatorCount: 0,
    operatorIds: [],
    skillBonus: 0,
    product: 'gold',
    strategy: 'gold',
    quality: 'normal',
    specialOrder: type === 'trading' ? EDITION.defaultSpecialOrder : 'none',
    powerStaffed: false,
  }
}

export function createDefaultConfig(): AppConfig {
  const roomTypes: RoomType[] = [
    'manufacture',
    'manufacture',
    'manufacture',
    'manufacture',
    'trading',
    'trading',
    'power',
    'power',
    'power',
  ]

  return {
    schemaVersion: 7,
    planName: '243 标准方案',
    hours: 24,
    rooms: roomTypes.map((type, index) => createRoom(`B${index + 1}`, type)),
    facilities: {
      reception: 3,
      office: 3,
      training: 3,
      workshop: 3,
      dormitories: [5, 5, 5, 5],
    },
    dormitoryOccupantCount: 0,
    facilityOperatorIds: {
      dormitories: [[], [], [], []],
      reception: [],
      workshop: [],
      office: [],
      training: [],
    },
    efficiencyResources: {
      manufacturePerceptionInformation: 0,
      tradingPerceptionInformation: 0,
      additionalGoldProductionLines: 0,
      monsterCuisine: 0,
      worldlyFireworks: 0,
      suiFacilities: 0,
      droneCapacity: 235,
      extraWorkplaceOperatorIds: [],
      trainingOperatorIds: [],
    },
    controlOperatorIds: [],
    zeroMoraleOperatorIds: [],
    operatorMorale: {},
    operatorBackups: {},
    operatorGroups: [],
    droneTarget: 'none',
  }
}
