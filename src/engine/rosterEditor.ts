import type { OperatorGroup } from '../domain/types'

export function setRosterSlot(
  operatorIds: string[],
  capacity: number,
  slotIndex: number,
  operatorId: string,
) {
  const slots = Array.from({ length: capacity }, (_, index) => operatorIds[index] ?? '')
  const removedOperatorId = slots[slotIndex] ?? ''
  if (operatorId) {
    const duplicateIndex = slots.indexOf(operatorId)
    if (duplicateIndex >= 0 && duplicateIndex !== slotIndex) slots[duplicateIndex] = ''
  }
  slots[slotIndex] = operatorId
  return {
    operatorIds: slots.filter(Boolean),
    removedOperatorId: removedOperatorId === operatorId ? '' : removedOperatorId,
  }
}

export function assignOperatorToNamedGroup(
  groups: OperatorGroup[],
  operatorId: string,
  groupName: string,
  createGroupId: () => string,
): OperatorGroup[] {
  const name = groupName.trim()
  const next = groups
    .map((group) => ({ ...group, operatorIds: group.operatorIds.filter((id) => id !== operatorId) }))
    .filter((group) => group.operatorIds.length > 0)
  if (!name) return next

  const existing = next.find((group) => group.name.trim() === name)
  if (existing) {
    existing.operatorIds.push(operatorId)
    return next
  }
  return [...next, { id: createGroupId(), name, operatorIds: [operatorId] }]
}
