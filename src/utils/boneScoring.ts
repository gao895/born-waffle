/**
 * Generic scoring primitives used by the Humanoid bone mapper.
 * Weights follow the priority order from the design spec:
 * exact name > partial name > side match > parent hierarchy > position > bone length.
 */
export const SCORE_WEIGHTS = {
  exactName: 100,
  partialName: 70,
  sideMatch: 30,
  parentMatch: 20,
  positionMatch: 20,
  lengthMatch: 10,
} as const

/** Maximum score achievable when every bonus applies, used to normalize to 0-100 confidence. */
export const MAX_POSSIBLE_SCORE =
  SCORE_WEIGHTS.exactName +
  SCORE_WEIGHTS.sideMatch +
  SCORE_WEIGHTS.parentMatch +
  SCORE_WEIGHTS.positionMatch +
  SCORE_WEIGHTS.lengthMatch

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const prev = new Array<number>(b.length + 1)
  const curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

/** Similarity in [0, 1], 1 meaning identical strings. */
export function stringSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

export interface NameMatchResult {
  exact: boolean
  partial: boolean
  similarity: number
}

/**
 * Compares a candidate's normalized name against a list of known aliases
 * for a target bone (also normalized). Exact match wins; otherwise the
 * best partial similarity (substring containment or fuzzy closeness) is used.
 */
export function matchNameAgainstAliases(candidateNormalized: string, aliases: string[]): NameMatchResult {
  let best: NameMatchResult = { exact: false, partial: false, similarity: 0 }

  for (const alias of aliases) {
    if (candidateNormalized === alias) {
      return { exact: true, partial: true, similarity: 1 }
    }

    const contains = candidateNormalized.includes(alias) || alias.includes(candidateNormalized)
    const similarity = stringSimilarity(candidateNormalized, alias)
    // 0.6-0.65 lets unrelated-but-similarly-shaped words through (e.g. "upperarm"
    // vs "lowerarm", or "upperleg" vs "upperchest" both land around 0.6-0.63),
    // which caused optional/missing bones to steal real bones from other targets.
    const isPartial = contains || similarity >= 0.75

    if (isPartial && similarity > best.similarity) {
      best = { exact: false, partial: true, similarity }
    }
  }

  return best
}

export function clampConfidence(rawScore: number): number {
  return Math.max(0, Math.min(100, Math.round((rawScore / MAX_POSSIBLE_SCORE) * 100)))
}
