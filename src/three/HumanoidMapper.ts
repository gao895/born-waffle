import * as THREE from 'three'
import type { BoneCandidate, HumanoidMapping, HumanoidMappingTable, VRMHumanBoneName } from '../types/humanoid'
import { VRMHumanBoneList, VRMHumanBoneParentMap } from '../types/humanoid'
import type { ModelStats } from '../types/model'
import { clampConfidence, matchNameAgainstAliases, SCORE_WEIGHTS } from '../utils/boneScoring'
import { normalizeBoneNameSideless } from '../utils/normalizeBoneName'
import { EXPECTED_HEIGHT_RATIO, HUMANOID_BONE_ALIASES } from './humanoidAliases'

// Deliberately high: a match with zero name evidence can only reach this via
// several structural bonuses stacking (side + parent + position [+ length]),
// which keeps a bone with no real candidate (e.g. a missing optional bone like
// upperChest) from grabbing a real bone away from a later, correct target.
const MIN_SCORE_TO_ACCEPT = 70

/**
 * Maps detected skeleton bones onto the VRM Humanoid bone set.
 *
 * Bones are resolved in dependency order (hips first, then its
 * descendants) so that each bone's parent-chain bonus can rely on
 * already-resolved ancestors. Scoring follows section 32 of the design
 * spec: exact name > partial name > side match > parent match > position > length.
 */
export function mapHumanoidBones(candidates: BoneCandidate[], stats: ModelStats): HumanoidMappingTable {
  const table = {} as HumanoidMappingTable
  const used = new Set<THREE.Object3D>()

  const modelHeight = Math.max(stats.boundingBox.max[1] - stats.boundingBox.min[1], 1e-6)
  const floorY = stats.boundingBox.min[1]

  for (const vrmBoneName of VRMHumanBoneList) {
    const aliasEntry = HUMANOID_BONE_ALIASES[vrmBoneName]
    const expectedSide = aliasEntry.side

    const pool = candidates.filter((c) => {
      if (used.has(c.node)) return false
      if (expectedSide === 'left' && c.side === 'right') return false
      if (expectedSide === 'right' && c.side === 'left') return false
      return true
    })

    const parentVrmName = VRMHumanBoneParentMap[vrmBoneName]
    const parentNode = parentVrmName ? (table[parentVrmName]?.node ?? null) : null

    const heightRange = EXPECTED_HEIGHT_RATIO[vrmBoneName]

    let best: { candidate: BoneCandidate; score: number } | null = null
    const scored: { candidate: BoneCandidate; score: number }[] = []

    for (const candidate of pool) {
      let score = 0

      const nameMatch = matchNameAgainstAliases(normalizeBoneNameSideless(candidate.name), aliasEntry.aliases)
      if (nameMatch.exact) {
        score += SCORE_WEIGHTS.exactName
      } else if (nameMatch.partial) {
        score += SCORE_WEIGHTS.partialName * nameMatch.similarity
      }

      if (expectedSide !== 'center' && candidate.side === expectedSide) {
        score += SCORE_WEIGHTS.sideMatch
      }

      if (parentNode && candidate.parent === parentNode) {
        score += SCORE_WEIGHTS.parentMatch
      } else if (parentNode && isAncestor(parentNode, candidate.node, 2)) {
        score += SCORE_WEIGHTS.parentMatch * 0.5
      }

      if (heightRange) {
        const worldY = new THREE.Vector3().setFromMatrixPosition(candidate.node.matrixWorld).y
        const normalizedY = (worldY - floorY) / modelHeight
        if (normalizedY >= heightRange[0] && normalizedY <= heightRange[1]) {
          score += SCORE_WEIGHTS.positionMatch
        } else {
          const distance = Math.min(Math.abs(normalizedY - heightRange[0]), Math.abs(normalizedY - heightRange[1]))
          if (distance < 0.1) score += SCORE_WEIGHTS.positionMatch * 0.5
        }
      }

      const boneChildCount = candidate.node.children.filter((c) => (c as THREE.Bone).isBone).length
      if (boneChildCount === 1) {
        score += SCORE_WEIGHTS.lengthMatch
      }

      if (score > 0) scored.push({ candidate, score })
      if (!best || score > best.score) best = { candidate, score }
    }

    scored.sort((a, b) => b.score - a.score)
    const alternatives = scored.slice(0, 15).map((s) => s.candidate)

    const accept = best && best.score >= MIN_SCORE_TO_ACCEPT
    const mapping: HumanoidMapping = accept
      ? {
          boneName: vrmBoneName,
          node: best!.candidate.node,
          confidence: clampConfidence(best!.score),
          source: 'scored',
          alternatives,
        }
      : {
          boneName: vrmBoneName,
          node: null,
          confidence: 0,
          source: 'unmapped',
          alternatives,
        }

    table[vrmBoneName] = mapping
    if (accept) used.add(best!.candidate.node)
  }

  return table
}

function isAncestor(ancestor: THREE.Object3D, node: THREE.Object3D, maxDepth: number): boolean {
  let cursor: THREE.Object3D | null = node.parent
  let depth = 0
  while (cursor && depth < maxDepth) {
    if (cursor === ancestor) return true
    cursor = cursor.parent
    depth++
  }
  return false
}

/** Rebuilds a single bone's mapping after a manual dropdown change. */
export function applyManualMapping(
  table: HumanoidMappingTable,
  boneName: VRMHumanBoneName,
  node: THREE.Object3D | null,
): HumanoidMappingTable {
  const existing = table[boneName]
  return {
    ...table,
    [boneName]: {
      ...existing,
      node,
      confidence: node ? 100 : 0,
      source: node ? 'manual' : 'unmapped',
    },
  }
}
