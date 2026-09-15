import { VRMRequiredHumanBoneName } from '../types/humanoid'
import type { HumanoidMappingTable, ValidationIssue, ValidationResult } from '../types/humanoid'
import { boneLabel } from '../utils/boneLabels'

/**
 * Checks the humanoid mapping against VRM 1.0's required bone set before
 * allowing export. Missing required bones are errors; low-confidence
 * mappings on present bones are warnings.
 */
export function validateHumanoidMapping(table: HumanoidMappingTable): ValidationResult {
  const issues: ValidationIssue[] = []

  for (const required of Object.values(VRMRequiredHumanBoneName)) {
    const mapping = table[required]
    if (!mapping || !mapping.node) {
      const label = boneLabel(required)
      issues.push({
        level: 'error',
        boneName: required,
        message: `${label}のボーンを自動認識できませんでした。詳細設定から手動で割り当ててください。`,
      })
    } else if (mapping.confidence < 50) {
      const label = boneLabel(required)
      issues.push({
        level: 'warning',
        boneName: required,
        message: `${label}の自動認識の確信度が低めです（${mapping.confidence}%）。内容を確認してください。`,
      })
    }
  }

  const hasError = issues.some((i) => i.level === 'error')
  const hasWarning = issues.some((i) => i.level === 'warning')

  return {
    status: hasError ? 'error' : hasWarning ? 'warning' : 'valid',
    issues,
  }
}
