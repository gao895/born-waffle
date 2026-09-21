// Some rigging pipelines (Mixamo chief among them) bake their own tool/rig name into every
// bone as a namespace prefix ("mixamorig:Hips"). That survives fine when the ':' separator is
// still there for the regex below to strip - but three.js's FBXLoader runs every bone name
// through PropertyBinding.sanitizeNodeName(), which treats ':' as a reserved character and
// deletes it outright (not just before parsing gets here), leaving "mixamorigHips" with no
// separator left to split on. camelCase splitting still breaks that into ["mixamorig", "hips"]
// tokens, but without filtering "mixamorig" out it stays baked into the joined identifier
// ("mixamorighips"), which no longer exact-matches any VRM bone alias and barely partial-matches
// short ones (a short alias like "hips"/"head"/"neck" gets swamped by the prefix's own length) -
// dropping it here, the same way left/right tokens are already dropped, restores exact matches
// across an entire Mixamo-rigged FBX.
const NAMESPACE_NOISE_TOKENS = new Set(['mixamorig'])

/**
 * Splits a raw bone name into lowercase word tokens, handling the naming
 * conventions found in the wild: rig namespaces ("mixamorig:Hips",
 * "Armature|Hips"), camelCase ("LeftUpperArm"), snake_case ("left_arm"),
 * dot suffixes ("Arm.L"), and digit runs ("Bip01_L_UpperArm").
 */
export function splitBoneNameTokens(raw: string): string[] {
  let s = raw.trim()
  // Strip rig namespace prefixes up to the last ':' or '|'.
  s = s.replace(/^.*[:|]/, '')
  // Insert boundaries at camelCase and letter/digit transitions.
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2')
  s = s.replace(/([a-zA-Z])([0-9])/g, '$1 $2')
  s = s.replace(/([0-9])([a-zA-Z])/g, '$1 $2')
  return s
    .split(/[^a-zA-Z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter(Boolean)
    .filter((t) => !NAMESPACE_NOISE_TOKENS.has(t))
}

/** Normalizes a bone name into a single comparable identifier. */
export function normalizeBoneName(raw: string): string {
  return splitBoneNameTokens(raw).join('')
}

const LEFT_TOKENS = new Set(['left', 'lft', 'l'])
const RIGHT_TOKENS = new Set(['right', 'rgt', 'r'])

/**
 * Normalizes a name with left/right side tokens removed, so "LeftUpperArm"
 * and "RightUpperArm" both collapse to "upperarm" for side-agnostic
 * candidate matching.
 */
export function normalizeBoneNameSideless(raw: string): string {
  return splitBoneNameTokens(raw)
    .filter((t) => !LEFT_TOKENS.has(t) && !RIGHT_TOKENS.has(t))
    .join('')
}

export { LEFT_TOKENS, RIGHT_TOKENS }
