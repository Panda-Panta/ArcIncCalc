/** Keep checked mechanics templates represented as the observed corpus grows.
 * Frequency is evidence of use, never an efficiency score. Both pools are seeded.
 */
export function sampleCombinationTemplates<T extends {optimizerTags: string[]}>(
  candidates: readonly T[], next: () => number, limit: number,
): T[] {
  if (!Number.isInteger(limit) || limit < 1) return []
  const shuffle = (items: readonly T[]) => {
    const result = [...items]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      ;[result[i], result[j]] = [result[j]!, result[i]!]
    }
    return result
  }
  const checked = shuffle(candidates.filter(c => !c.optimizerTags.includes('mower-observed')))
  const observed = shuffle(candidates.filter(c => c.optimizerTags.includes('mower-observed')))
  const selected = [...checked.splice(0, Math.ceil(limit / 2)), ...observed.splice(0, Math.floor(limit / 2))]
  return [...selected, ...checked, ...observed].slice(0, limit)
}
