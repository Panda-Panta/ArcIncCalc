import { describe, expect, it } from 'vitest'
import type { OperatorGroup } from '../domain/types'
import { assignOperatorToNamedGroup, setRosterSlot } from './rosterEditor'

describe('Mower-style roster editor operations', () => {
  it('exposes every facility slot while storing only assigned operators', () => {
    expect(setRosterSlot(['primary-a'], 3, 2, 'primary-c')).toEqual({
      operatorIds: ['primary-a', 'primary-c'],
      removedOperatorId: '',
    })

    expect(setRosterSlot(['primary-a', 'primary-c'], 3, 0, '')).toEqual({
      operatorIds: ['primary-c'],
      removedOperatorId: 'primary-a',
    })
  })

  it('joins operators across facilities by the same typed group name', () => {
    const initial: OperatorGroup[] = []
    const first = assignOperatorToNamedGroup(initial, 'primary-a', ' 莱茵组 ', () => 'group-rhine')
    const second = assignOperatorToNamedGroup(first, 'primary-b', '莱茵组', () => 'unused')

    expect(second).toEqual([{
      id: 'group-rhine',
      name: '莱茵组',
      operatorIds: ['primary-a', 'primary-b'],
    }])
  })

  it('clears membership and removes an empty named group', () => {
    const groups: OperatorGroup[] = [{
      id: 'group-rhine',
      name: '莱茵组',
      operatorIds: ['primary-a'],
    }]

    expect(assignOperatorToNamedGroup(groups, 'primary-a', '', () => 'unused')).toEqual([])
  })
})
