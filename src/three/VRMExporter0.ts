import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { VRM0BuildResult } from './VRMBuilder0'

interface GLTFJson {
  extensions?: Record<string, unknown>
  extensionsUsed?: string[]
  meshes?: unknown[]
  materials?: unknown[]
  [key: string]: unknown
}

interface GLTFWriterLike {
  json: GLTFJson
  nodeMap: Map<THREE.Object3D, number>
  extensionsUsed: Record<string, boolean>
}

/**
 * A GLTFExporter plugin that injects the legacy `VRM` (0.x) glTF extension,
 * mirroring VRMExporter.ts's VRMExtensionPlugin for VRM 1.0 - see that
 * file's doc comment for why this has to be a GLTFExporter plugin at all
 * (three-vrm ships no exporter of its own).
 *
 * VRM0's schema is a different shape from 1.0's throughout: humanBones is
 * an array instead of a dict, expressions are "blend shape groups" keyed by
 * a fixed preset-name enum plus an arbitrary display name, spring bones
 * only need each chain's root node (the runtime walks its bone children
 * itself), and first-person/materialProperties are effectively required
 * fields rather than optional ones - see VRMBuilder0.ts for the mapping
 * from this app's internal data to that shape.
 */
class VRM0ExtensionPlugin {
  name = 'VRM'
  private writer: GLTFWriterLike
  private data: VRM0BuildResult

  constructor(writer: GLTFWriterLike, data: VRM0BuildResult) {
    this.writer = writer
    this.data = data
  }

  afterParse(): void {
    const { writer, data } = this
    const { nodeMap, json } = writer

    const humanBones = Object.entries(data.humanBoneNodes)
      .map(([bone, node]) => {
        if (!node) return null
        const index = nodeMap.get(node)
        return index !== undefined ? { bone, node: index, useDefaultValues: true } : null
      })
      .filter((b): b is { bone: string; node: number; useDefaultValues: boolean } => b !== null)
    if (humanBones.length === 0) return

    const vrmExtension: Record<string, unknown> = {
      exporterVersion: 'ai-auto-vrm-maker',
      specVersion: '0.0',
      meta: data.meta,
      humanoid: { humanBones },
      firstPerson: this.buildFirstPerson(),
      materialProperties: this.buildMaterialProperties(),
    }

    const blendShapeMaster = this.buildBlendShapeMaster()
    if (blendShapeMaster) vrmExtension.blendShapeMaster = blendShapeMaster

    const secondaryAnimation = this.buildSecondaryAnimation()
    if (secondaryAnimation) vrmExtension.secondaryAnimation = secondaryAnimation

    json.extensions = json.extensions ?? {}
    json.extensions['VRM'] = vrmExtension
    writer.extensionsUsed = writer.extensionsUsed ?? {}
    writer.extensionsUsed['VRM'] = true

    // VRM0's spec quirk: a model's front is authored facing +Z (the opposite of glTF/VRM1's -Z
    // forward), and viewers rotate the loaded scene 180 degrees around Y to correct for it (see
    // @pixiv/three-vrm's `rotateVRM0`). This app's own camera/viewer already treats +Z as the
    // character's front (every "正面" front-view screenshot in this session shows the face from
    // a camera on the +Z side), which is exactly the orientation a VRM0 file is supposed to be
    // authored in - so no extra rotation is applied here.
  }

  private buildFirstPerson(): Record<string, unknown> {
    const { nodeMap, json } = this.writer
    const meshAnnotations = (json.meshes ?? []).map((_, meshIndex) => ({ mesh: meshIndex, firstPersonFlag: 'Auto' }))
    const firstPersonBone = this.data.headNode ? nodeMap.get(this.data.headNode) : undefined
    return {
      firstPersonBone: firstPersonBone ?? -1,
      firstPersonBoneOffset: { x: 0, y: 0.06, z: 0 },
      meshAnnotations,
    }
  }

  private buildMaterialProperties(): Record<string, unknown>[] {
    const { json } = this.writer
    // This app never writes MToon data (see README's "VRM Exportの実装説明" for why) - telling
    // VRM0 viewers to just render the plain glTF PBR material we already wrote is the VRM0
    // equivalent of that same choice, not an oversight.
    return (json.materials ?? []).map((m) => ({
      name: (m as { name?: string }).name ?? 'Material',
      shader: 'VRM_USE_GLTFSHADER',
      renderQueue: 2000,
      floatProperties: {},
      vectorProperties: {},
      textureProperties: {},
      keywordMap: {},
      tagMap: {},
    }))
  }

  private buildBlendShapeMaster(): { blendShapeGroups: Record<string, unknown>[] } | null {
    const { nodeMap } = this.writer
    const groups = this.data.expressions
      .map((exp) => {
        const binds = exp.morphTargetBinds
          .map((bind) => {
            // VRM0's BlendShapeBind.mesh is misleadingly named: despite the name, implementations
            // (UniVRM included) store the *node* index here, the same node a VRM1 expression's
            // morphTargetBinds.node refers to for this same THREE.Mesh - not an index into the
            // glTF-level `meshes` array.
            const nodeIndex = nodeMap.get(bind.mesh)
            return nodeIndex !== undefined ? { mesh: nodeIndex, index: bind.index, weight: bind.weight } : null
          })
          .filter((b): b is { mesh: number; index: number; weight: number } => b !== null)
        return binds.length > 0 ? { name: exp.name, presetName: exp.presetName, binds, materialValues: [] } : null
      })
      .filter((g): g is NonNullable<typeof g> => g !== null)

    return groups.length > 0 ? { blendShapeGroups: groups } : null
  }

  private buildSecondaryAnimation(): { boneGroups: Record<string, unknown>[]; colliderGroups: unknown[] } | null {
    const { nodeMap } = this.writer
    const boneGroups = this.data.springs
      .map((spring) => {
        const nodeIndex = nodeMap.get(spring.rootNode)
        if (nodeIndex === undefined) return null
        return {
          comment: spring.name,
          stiffiness: spring.stiffness,
          gravityPower: spring.gravityPower,
          gravityDir: { x: 0, y: -1, z: 0 },
          dragForce: spring.dragForce,
          center: -1,
          hitRadius: spring.hitRadius,
          bones: [nodeIndex],
          colliderGroups: [],
        }
      })
      .filter((g): g is NonNullable<typeof g> => g !== null)

    return boneGroups.length > 0 ? { boneGroups, colliderGroups: [] } : null
  }
}

/** Exports a scene as a VRM 0.x (.vrm) binary glTF Blob. */
export async function exportVRM0(scene: THREE.Object3D, vrmData: VRM0BuildResult): Promise<Blob> {
  const exporter = new GLTFExporter()
  exporter.register((writer) => new VRM0ExtensionPlugin(writer as unknown as GLTFWriterLike, vrmData))

  const result = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: false,
    includeCustomExtensions: true,
  })

  if (!(result instanceof ArrayBuffer)) {
    throw new Error('VRM (0.x) の書き出しに失敗しました（想定外の出力形式）。')
  }

  return new Blob([result], { type: 'model/gltf-binary' })
}
