import type { MorphTargetInfo } from '../types/model'
import type { ExpressionMapping } from '../types/vrm'
import { VRMExpressionPresetName } from '../types/vrm'
import { matchNameAgainstAliases } from '../utils/boneScoring'
import { normalizeBoneName } from '../utils/normalizeBoneName'

/** Common morph target / blend shape naming conventions mapped to VRM expression presets. */
const EXPRESSION_ALIASES: Record<string, string[]> = {
  [VRMExpressionPresetName.Blink]: ['blink', 'eyeblink', 'eyesclosed', 'eyeclose'],
  [VRMExpressionPresetName.BlinkLeft]: ['blinkleft', 'eyeblinkleft', 'eyecloseleft'],
  [VRMExpressionPresetName.BlinkRight]: ['blinkright', 'eyeblinkright', 'eyecloseright'],
  [VRMExpressionPresetName.Happy]: ['happy', 'smile', 'joy', 'mouthsmile'],
  [VRMExpressionPresetName.Angry]: ['angry', 'anger', 'mad'],
  [VRMExpressionPresetName.Sad]: ['sad', 'sorrow', 'mouthsad'],
  [VRMExpressionPresetName.Relaxed]: ['relaxed', 'relax', 'calm'],
  [VRMExpressionPresetName.Surprised]: ['surprised', 'surprise', 'shock'],
  [VRMExpressionPresetName.Neutral]: ['neutral', 'default'],
  [VRMExpressionPresetName.Aa]: ['aa', 'mouthopen', 'mouthaa', 'viseme_aa'],
  [VRMExpressionPresetName.Ih]: ['ih', 'mouthih', 'viseme_ih'],
  [VRMExpressionPresetName.Ou]: ['ou', 'mouthou', 'viseme_ou'],
  [VRMExpressionPresetName.Ee]: ['ee', 'mouthee', 'viseme_ee'],
  [VRMExpressionPresetName.Oh]: ['oh', 'mouthoh', 'viseme_oh'],
  [VRMExpressionPresetName.LookUp]: ['lookup', 'eyeup'],
  [VRMExpressionPresetName.LookDown]: ['lookdown', 'eyedown'],
  [VRMExpressionPresetName.LookLeft]: ['lookleft', 'eyeleft'],
  [VRMExpressionPresetName.LookRight]: ['lookright', 'eyeright'],
}

/**
 * Matches detected morph targets against VRM expression presets by name.
 * Only morph targets are considered (material color / texture transform
 * binds are out of scope for the automatic pass).
 */
export function mapExpressions(morphTargets: MorphTargetInfo[]): Record<string, ExpressionMapping> {
  const result: Record<string, ExpressionMapping> = {}

  for (const preset of Object.values(VRMExpressionPresetName)) {
    const aliases = EXPRESSION_ALIASES[preset] ?? [preset]

    let best: { target: MorphTargetInfo; exact: boolean; similarity: number } | null = null
    for (const target of morphTargets) {
      const match = matchNameAgainstAliases(normalizeBoneName(target.name), aliases)
      if (!match.partial) continue
      if (!best || match.similarity > best.similarity || (match.exact && !best.exact)) {
        best = { target, exact: match.exact, similarity: match.similarity }
      }
    }

    result[preset] = best
      ? {
          preset,
          morphTargetName: best.target.name,
          meshNames: [best.target.meshName],
          confidence: best.exact ? 99 : Math.round(40 + best.similarity * 55),
          source: 'scored',
        }
      : {
          preset,
          morphTargetName: null,
          meshNames: [],
          confidence: 0,
          source: 'unmapped',
        }
  }

  return result
}
