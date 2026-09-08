import * as THREE from 'three'
import type { BoneCandidate, HumanoidJudgement, PoseGuess } from '../types/humanoid'
import type { ModelStats } from '../types/model'
import { normalizeBoneNameSideless } from '../utils/normalizeBoneName'

const HUMANOID_KEYWORDS = ['hips', 'pelvis', 'spine', 'chest', 'neck', 'head', 'upperarm', 'upperleg', 'shoulder']

export interface HumanoidJudgementResult {
  judgement: HumanoidJudgement
  score: number
  reasons: string[]
}

/**
 * A lightweight heuristic classifier: not a machine-learned model, just a
 * weighted checklist over bone count, recognizable bone names, left/right
 * symmetry and overall proportions. Good enough to steer the UI message,
 * not meant to be authoritative.
 */
export function judgeHumanoid(bones: BoneCandidate[], stats: ModelStats): HumanoidJudgementResult {
  const reasons: string[] = []

  if (bones.length === 0) {
    return { judgement: 'unknown', score: 0, reasons: ['ボーンが見つかりませんでした。'] }
  }

  let score = 0

  if (bones.length >= 15) {
    score += 25
    reasons.push(`ボーン数が${bones.length}個あります。`)
  } else {
    reasons.push(`ボーン数が${bones.length}個と少なめです。`)
  }

  const normalizedSet = new Set(bones.map((b) => normalizeBoneNameSideless(b.name)))
  const matchedKeywords = HUMANOID_KEYWORDS.filter((kw) => normalizedSet.has(kw))
  score += matchedKeywords.length * 8
  if (matchedKeywords.length > 0) {
    reasons.push(`人体的なボーン名を${matchedKeywords.length}個検出しました。`)
  }

  const leftCount = bones.filter((b) => b.side === 'left').length
  const rightCount = bones.filter((b) => b.side === 'right').length
  if (leftCount > 0 && rightCount > 0) {
    const symmetry = 1 - Math.abs(leftCount - rightCount) / Math.max(leftCount, rightCount)
    score += symmetry * 20
    if (symmetry > 0.8) reasons.push('左右対称なボーン構造を検出しました。')
  }

  const { min, max } = stats.boundingBox
  const height = max[1] - min[1]
  const width = Math.max(max[0] - min[0], max[2] - min[2])
  if (height > 0 && width > 0 && height / width > 1.2) {
    score += 15
    reasons.push('縦長のバウンディングボックスです（人体らしい比率）。')
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  let judgement: HumanoidJudgement
  if (clamped >= 55) judgement = 'humanoid'
  else if (clamped >= 25) judgement = 'unknown'
  else judgement = 'non-humanoid'

  return { judgement, score: clamped, reasons }
}

/**
 * Rough T-pose / A-pose classifier based on the arm's angle from horizontal.
 * Looks for an "upper arm" bone with a child bone and measures the world
 * direction to that child relative to the horizontal plane.
 */
export function judgePose(bones: BoneCandidate[]): PoseGuess {
  const upperArm = bones.find((b) => {
    const n = normalizeBoneNameSideless(b.name)
    return n === 'upperarm' || (n.includes('arm') && !n.includes('lower') && !n.includes('fore') && !n.includes('hand'))
  })

  if (!upperArm) return 'other'

  const child = upperArm.node.children.find((c) => (c as THREE.Bone).isBone) as THREE.Bone | undefined
  if (!child) return 'other'

  const from = new THREE.Vector3().setFromMatrixPosition(upperArm.node.matrixWorld)
  const to = new THREE.Vector3().setFromMatrixPosition(child.matrixWorld)
  const dir = to.clone().sub(from)

  const horizontalDist = Math.sqrt(dir.x * dir.x + dir.z * dir.z)
  const angleFromHorizontalDeg = (Math.atan2(Math.abs(dir.y), horizontalDist) * 180) / Math.PI

  if (angleFromHorizontalDeg < 20) return 't-pose'
  if (angleFromHorizontalDeg < 70) return 'a-pose'
  return 'other'
}
