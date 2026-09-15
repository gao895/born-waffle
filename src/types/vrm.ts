import { VRMExpressionPresetName } from '@pixiv/three-vrm'

export { VRMExpressionPresetName }

export interface VRMMetadata {
  title: string
  version: string
  author: string
  contactInformation: string
  reference: string
  licenseUrl: string
  allowAvatarUsage: 'onlyAuthor' | 'onlySeparatelyLicensedPerson' | 'everyone'
}

export const DEFAULT_VRM_METADATA: VRMMetadata = {
  title: 'AI Auto VRM Avatar',
  version: '1.0',
  author: 'User',
  contactInformation: '',
  reference: '',
  licenseUrl: 'https://vrm.dev/licenses/1.0/',
  allowAvatarUsage: 'everyone',
}

export interface ExpressionMapping {
  preset: string
  morphTargetName: string | null
  meshNames: string[]
  confidence: number
  source: 'exact' | 'scored' | 'manual' | 'unmapped'
}

export interface SpringBoneJointConfig {
  nodeName: string
  hitRadius: number
  stiffness: number
  gravityPower: number
  dragForce: number
}

export interface SpringBoneChainConfig {
  id: string
  name: string
  rootBoneName: string
  joints: SpringBoneJointConfig[]
  colliderGroupIndices: number[]
}

export interface SpringBoneColliderConfig {
  boneName: string
  radius: number
  offset: [number, number, number]
}
