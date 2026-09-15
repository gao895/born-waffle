import * as THREE from 'three'
import { VRMLoaderPlugin } from '@pixiv/three-vrm'
import type { VRM } from '@pixiv/three-vrm'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMExpressionPresetName } from '../types/vrm'
import type { VRMBuildResult } from './VRMBuilder'

const PRESET_NAMES = new Set<string>(Object.values(VRMExpressionPresetName))

interface GLTFJson {
  extensions?: Record<string, unknown>
  extensionsUsed?: string[]
  [key: string]: unknown
}

interface GLTFWriterLike {
  json: GLTFJson
  nodeMap: Map<THREE.Object3D, number>
  extensionsUsed: Record<string, boolean>
}

/**
 * A GLTFExporter plugin that injects the VRMC_vrm and (optionally)
 * VRMC_springBone glTF extensions after the base glTF/GLB has been fully
 * written. This is necessary because @pixiv/three-vrm does not ship an
 * exporter (it is a loader-only library) - see the "VRM Export" section
 * of the project README for the full rationale.
 *
 * Node references are resolved through `writer.nodeMap`, which GLTFExporter
 * populates while walking the scene graph, so this must run in `afterParse`
 * once every node has been assigned an index.
 */
class VRMExtensionPlugin {
  name = 'VRMC_vrm'
  private writer: GLTFWriterLike
  private data: VRMBuildResult

  constructor(writer: GLTFWriterLike, data: VRMBuildResult) {
    this.writer = writer
    this.data = data
  }

  afterParse(): void {
    const { writer, data } = this
    const { nodeMap, json } = writer

    const humanBones: Record<string, { node: number }> = {}
    for (const [boneName, node] of Object.entries(data.humanBoneNodes)) {
      if (!node) continue
      const index = nodeMap.get(node)
      if (index !== undefined) humanBones[boneName] = { node: index }
    }
    if (Object.keys(humanBones).length === 0) return

    const vrmExtension: Record<string, unknown> = {
      specVersion: data.specVersion,
      meta: data.meta,
      humanoid: { humanBones },
    }

    const expressionJson = this.buildExpressions()
    if (expressionJson) vrmExtension.expressions = expressionJson

    json.extensions = json.extensions ?? {}
    json.extensions['VRMC_vrm'] = vrmExtension
    writer.extensionsUsed['VRMC_vrm'] = true

    const springBoneJson = this.buildSpringBone()
    if (springBoneJson) {
      json.extensions['VRMC_springBone'] = springBoneJson
      writer.extensionsUsed['VRMC_springBone'] = true
    }
  }

  private buildExpressions(): { preset: Record<string, unknown>; custom: Record<string, unknown> } | null {
    const { nodeMap } = this.writer
    const preset: Record<string, unknown> = {}
    const custom: Record<string, unknown> = {}

    for (const exp of this.data.expressions) {
      const morphTargetBinds = exp.morphTargetBinds
        .map((bind) => {
          const nodeIndex = nodeMap.get(bind.mesh)
          return nodeIndex !== undefined ? { node: nodeIndex, index: bind.index, weight: bind.weight } : null
        })
        .filter((b): b is { node: number; index: number; weight: number } => b !== null)

      if (morphTargetBinds.length === 0) continue
      const bucket = PRESET_NAMES.has(exp.preset) ? preset : custom
      bucket[exp.preset] = { morphTargetBinds }
    }

    if (Object.keys(preset).length === 0 && Object.keys(custom).length === 0) return null
    return { preset, custom }
  }

  private buildSpringBone(): { specVersion: '1.0'; springs: unknown[] } | null {
    const { nodeMap } = this.writer
    const springs = this.data.springs
      .map((spring) => {
        const joints = spring.joints
          .map((joint) => {
            const nodeIndex = nodeMap.get(joint.node)
            if (nodeIndex === undefined) return null
            return {
              node: nodeIndex,
              hitRadius: joint.hitRadius,
              stiffness: joint.stiffness,
              gravityPower: joint.gravityPower,
              gravityDir: joint.gravityDir,
              dragForce: joint.dragForce,
            }
          })
          .filter((j): j is NonNullable<typeof j> => j !== null)
        return joints.length > 0 ? { name: spring.name, joints } : null
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)

    return springs.length > 0 ? { specVersion: '1.0', springs } : null
  }
}

/** Exports a scene as a VRM 1.0 (.vrm) binary glTF Blob. */
export async function exportVRM(scene: THREE.Object3D, vrmData: VRMBuildResult): Promise<Blob> {
  const exporter = new GLTFExporter()
  exporter.register((writer) => new VRMExtensionPlugin(writer as unknown as GLTFWriterLike, vrmData))

  const result = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: false,
    includeCustomExtensions: true,
  })

  if (!(result instanceof ArrayBuffer)) {
    throw new Error('VRMの書き出しに失敗しました（想定外の出力形式）。')
  }

  return new Blob([result], { type: 'model/gltf-binary' })
}

/**
 * Re-parses a just-exported VRM file with @pixiv/three-vrm's VRMLoaderPlugin,
 * for the "load it back and preview it" round-trip (section 24 of the spec).
 * This is the same loader real VRM viewers use, so it doubles as a sanity
 * check that the file we wrote is actually spec-compliant.
 */
export async function loadVRMPreview(blob: Blob): Promise<VRM> {
  const arrayBuffer = await blob.arrayBuffer()
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))

  const gltf = await new Promise<GLTF>((resolve, reject) => {
    loader.parse(arrayBuffer, '', (result) => resolve(result), (error) => reject(error))
  })

  const vrm = gltf.userData.vrm as VRM | undefined
  if (!vrm) {
    throw new Error('書き出したVRMの再読み込みに失敗しました。')
  }
  return vrm
}
