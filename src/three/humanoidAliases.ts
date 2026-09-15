import type { VRMHumanBoneName } from '../types/humanoid'
import type { Side } from '../utils/detectSide'

type BoneAliasEntry = { aliases: string[]; side: Side | 'either' }

const FINGER_BASE: Record<string, string[]> = {
  thumb: ['thumb'],
  index: ['index', 'indexfinger'],
  middle: ['middle', 'middlefinger'],
  ring: ['ring', 'ringfinger'],
  little: ['little', 'pinky', 'littlefinger'],
}

function fingerAliases(finger: string, segmentWord: string, segmentDigit: string): string[] {
  const bases = FINGER_BASE[finger]
  const out: string[] = []
  for (const b of bases) {
    out.push(`${b}${segmentWord}`)
    out.push(`${b}${segmentDigit}`)
  }
  return out
}

/**
 * Sideless alias lists (side markers are stripped before comparison, and
 * checked separately via BoneCandidate.side) for every VRM 1.0 human bone.
 * Ref: https://github.com/vrm-c/vrm-specification VRMC_vrm-1.0/humanoid.md
 */
export const HUMANOID_BONE_ALIASES: Record<VRMHumanBoneName, BoneAliasEntry> = {
  hips: { aliases: ['hips', 'hip', 'pelvis', 'root'], side: 'center' },
  spine: { aliases: ['spine', 'spine1', 'waist'], side: 'center' },
  chest: { aliases: ['chest', 'spine2'], side: 'center' },
  upperChest: { aliases: ['upperchest', 'chest2', 'spine3'], side: 'center' },
  neck: { aliases: ['neck'], side: 'center' },
  head: { aliases: ['head'], side: 'center' },
  leftEye: { aliases: ['eye'], side: 'left' },
  rightEye: { aliases: ['eye'], side: 'right' },
  jaw: { aliases: ['jaw'], side: 'center' },

  leftUpperLeg: { aliases: ['upperleg', 'upleg', 'thigh', 'leg1'], side: 'left' },
  leftLowerLeg: { aliases: ['lowerleg', 'shin', 'calf', 'knee', 'leg2', 'leg'], side: 'left' },
  leftFoot: { aliases: ['foot', 'ankle'], side: 'left' },
  leftToes: { aliases: ['toe', 'toes', 'toebase'], side: 'left' },
  rightUpperLeg: { aliases: ['upperleg', 'upleg', 'thigh', 'leg1'], side: 'right' },
  rightLowerLeg: { aliases: ['lowerleg', 'shin', 'calf', 'knee', 'leg2', 'leg'], side: 'right' },
  rightFoot: { aliases: ['foot', 'ankle'], side: 'right' },
  rightToes: { aliases: ['toe', 'toes', 'toebase'], side: 'right' },

  leftShoulder: { aliases: ['shoulder', 'clavicle'], side: 'left' },
  leftUpperArm: { aliases: ['upperarm', 'arm'], side: 'left' },
  leftLowerArm: { aliases: ['lowerarm', 'forearm', 'elbow'], side: 'left' },
  leftHand: { aliases: ['hand', 'wrist'], side: 'left' },
  rightShoulder: { aliases: ['shoulder', 'clavicle'], side: 'right' },
  rightUpperArm: { aliases: ['upperarm', 'arm'], side: 'right' },
  rightLowerArm: { aliases: ['lowerarm', 'forearm', 'elbow'], side: 'right' },
  rightHand: { aliases: ['hand', 'wrist'], side: 'right' },

  leftThumbMetacarpal: { aliases: fingerAliases('thumb', 'metacarpal', '0'), side: 'left' },
  leftThumbProximal: { aliases: fingerAliases('thumb', 'proximal', '1'), side: 'left' },
  leftThumbDistal: { aliases: fingerAliases('thumb', 'distal', '2'), side: 'left' },
  leftIndexProximal: { aliases: fingerAliases('index', 'proximal', '1'), side: 'left' },
  leftIndexIntermediate: { aliases: fingerAliases('index', 'intermediate', '2'), side: 'left' },
  leftIndexDistal: { aliases: fingerAliases('index', 'distal', '3'), side: 'left' },
  leftMiddleProximal: { aliases: fingerAliases('middle', 'proximal', '1'), side: 'left' },
  leftMiddleIntermediate: { aliases: fingerAliases('middle', 'intermediate', '2'), side: 'left' },
  leftMiddleDistal: { aliases: fingerAliases('middle', 'distal', '3'), side: 'left' },
  leftRingProximal: { aliases: fingerAliases('ring', 'proximal', '1'), side: 'left' },
  leftRingIntermediate: { aliases: fingerAliases('ring', 'intermediate', '2'), side: 'left' },
  leftRingDistal: { aliases: fingerAliases('ring', 'distal', '3'), side: 'left' },
  leftLittleProximal: { aliases: fingerAliases('little', 'proximal', '1'), side: 'left' },
  leftLittleIntermediate: { aliases: fingerAliases('little', 'intermediate', '2'), side: 'left' },
  leftLittleDistal: { aliases: fingerAliases('little', 'distal', '3'), side: 'left' },

  rightThumbMetacarpal: { aliases: fingerAliases('thumb', 'metacarpal', '0'), side: 'right' },
  rightThumbProximal: { aliases: fingerAliases('thumb', 'proximal', '1'), side: 'right' },
  rightThumbDistal: { aliases: fingerAliases('thumb', 'distal', '2'), side: 'right' },
  rightIndexProximal: { aliases: fingerAliases('index', 'proximal', '1'), side: 'right' },
  rightIndexIntermediate: { aliases: fingerAliases('index', 'intermediate', '2'), side: 'right' },
  rightIndexDistal: { aliases: fingerAliases('index', 'distal', '3'), side: 'right' },
  rightMiddleProximal: { aliases: fingerAliases('middle', 'proximal', '1'), side: 'right' },
  rightMiddleIntermediate: { aliases: fingerAliases('middle', 'intermediate', '2'), side: 'right' },
  rightMiddleDistal: { aliases: fingerAliases('middle', 'distal', '3'), side: 'right' },
  rightRingProximal: { aliases: fingerAliases('ring', 'proximal', '1'), side: 'right' },
  rightRingIntermediate: { aliases: fingerAliases('ring', 'intermediate', '2'), side: 'right' },
  rightRingDistal: { aliases: fingerAliases('ring', 'distal', '3'), side: 'right' },
  rightLittleProximal: { aliases: fingerAliases('little', 'proximal', '1'), side: 'right' },
  rightLittleIntermediate: { aliases: fingerAliases('little', 'intermediate', '2'), side: 'right' },
  rightLittleDistal: { aliases: fingerAliases('little', 'distal', '3'), side: 'right' },
}

/** Approximate expected normalized height (0 = ground, 1 = top of model) per bone, for the position-match bonus. */
export const EXPECTED_HEIGHT_RATIO: Partial<Record<VRMHumanBoneName, [number, number]>> = {
  hips: [0.45, 0.62],
  spine: [0.5, 0.68],
  chest: [0.55, 0.72],
  upperChest: [0.6, 0.78],
  neck: [0.75, 0.9],
  head: [0.8, 1.0],
  leftUpperLeg: [0.35, 0.55],
  rightUpperLeg: [0.35, 0.55],
  leftLowerLeg: [0.12, 0.4],
  rightLowerLeg: [0.12, 0.4],
  leftFoot: [0.0, 0.12],
  rightFoot: [0.0, 0.12],
  leftToes: [0.0, 0.08],
  rightToes: [0.0, 0.08],
  leftShoulder: [0.6, 0.78],
  rightShoulder: [0.6, 0.78],
  leftUpperArm: [0.55, 0.78],
  rightUpperArm: [0.55, 0.78],
  leftLowerArm: [0.4, 0.7],
  rightLowerArm: [0.4, 0.7],
  leftHand: [0.3, 0.65],
  rightHand: [0.3, 0.65],
}
