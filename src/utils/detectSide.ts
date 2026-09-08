import * as THREE from 'three'
import { LEFT_TOKENS, RIGHT_TOKENS, splitBoneNameTokens } from './normalizeBoneName'

export type Side = 'left' | 'right' | 'center' | 'unknown'

/**
 * Detects left/right/center from a bone name's tokens. Checks the first
 * and last token so both prefix styles ("L_Arm", "LeftArm") and suffix
 * styles ("Arm.L", "Arm_R") are recognized, without matching side words
 * that merely appear as a substring of an unrelated token (e.g. "leg").
 */
export function detectSideFromName(name: string): Side {
  const tokens = splitBoneNameTokens(name)
  if (tokens.length === 0) return 'unknown'

  const first = tokens[0]
  const last = tokens[tokens.length - 1]

  if (LEFT_TOKENS.has(first) || LEFT_TOKENS.has(last)) return 'left'
  if (RIGHT_TOKENS.has(first) || RIGHT_TOKENS.has(last)) return 'right'

  if (tokens.some((t) => t === 'center' || t === 'c' || t === 'middle' || t === 'mid')) {
    return 'center'
  }

  return 'unknown'
}

/**
 * Position-based fallback: compares a bone's world X position against the
 * skeleton's overall center X. By convention here, negative X (relative to
 * center) is treated as the model's left side and positive X as its right
 * side. This is only meant to break ties when the bone name gives no hint.
 */
export function detectSideFromPosition(worldX: number, centerX: number): Side {
  const delta = worldX - centerX
  const epsilon = 1e-4
  if (Math.abs(delta) < epsilon) return 'center'
  return delta < 0 ? 'left' : 'right'
}

const _worldPos = new THREE.Vector3()

export function getWorldX(object: THREE.Object3D): number {
  object.getWorldPosition(_worldPos)
  return _worldPos.x
}
