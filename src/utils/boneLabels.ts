import type { VRMHumanBoneName } from '../types/humanoid'

/** Japanese, beginner-friendly labels for VRM Humanoid bones (section 65: fewer technical terms). */
export const BONE_LABELS_JA: Partial<Record<VRMHumanBoneName, string>> = {
  hips: '腰 (Hips)',
  spine: '背骨 (Spine)',
  chest: '胸 (Chest)',
  upperChest: '上胸 (UpperChest)',
  neck: '首 (Neck)',
  head: '頭 (Head)',
  leftEye: '左目',
  rightEye: '右目',
  jaw: 'あご',

  leftUpperLeg: '左太もも',
  leftLowerLeg: '左すね',
  leftFoot: '左足首',
  leftToes: '左つま先',
  rightUpperLeg: '右太もも',
  rightLowerLeg: '右すね',
  rightFoot: '右足首',
  rightToes: '右つま先',

  leftShoulder: '左肩',
  leftUpperArm: '左上腕',
  leftLowerArm: '左前腕',
  leftHand: '左手',
  rightShoulder: '右肩',
  rightUpperArm: '右上腕',
  rightLowerArm: '右前腕',
  rightHand: '右手',
}

export function boneLabel(name: VRMHumanBoneName): string {
  return BONE_LABELS_JA[name] ?? name
}
