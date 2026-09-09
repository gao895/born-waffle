import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { LoadedModel, ModelStats, MorphTargetInfo } from '../types/model'
import { shrinkOversizedGlbImages } from './GlbImagePreprocessor'
import { SafeDataUriImageLoader } from './SafeDataUriImageLoader'
import { normalizeBoneName } from '../utils/normalizeBoneName'

// GLTFLoader's default image loading fetches a blob: URL before decoding it;
// see GlbImagePreprocessor.ts for why that's replaced with a fetch-free
// data: URI loader for every embedded image.
const loadingManager = new THREE.LoadingManager()
loadingManager.addHandler(/^data:/i, new SafeDataUriImageLoader())
const loader = new GLTFLoader(loadingManager)

const TEXTURE_MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'] as const

// AI-generated models (Tripo, Meshy, etc.) commonly ship 4096x4096 textures.
// Decoding a couple of those on a phone's constrained GPU/memory budget is a
// common cause of the tab crashing or the model silently failing to appear,
// so on-load we shrink anything above this ceiling. 2048 is supported by
// effectively every WebGL-capable device (desktop and mobile alike), so we
// don't need a separate, more aggressive mobile-only cap.
const MAX_TEXTURE_SIZE = 2048

export class UnsupportedFormatError extends Error {}

/** Loads a .glb/.gltf File into a LoadedModel with derived statistics. */
export async function loadModelFile(file: File): Promise<LoadedModel> {
  const name = file.name.toLowerCase()
  if (!name.endsWith('.glb') && !name.endsWith('.gltf')) {
    throw new UnsupportedFormatError(
      '対応していないファイル形式です。.glb または .gltf ファイルを選択してください。',
    )
  }

  const rawArrayBuffer = await file.arrayBuffer()
  const preprocessed = await shrinkOversizedGlbImages(rawArrayBuffer)

  const gltf = await new Promise<GLTF>((resolve, reject) => {
    loader.parse(
      preprocessed.buffer,
      '',
      (result) => resolve(result),
      (error) => reject(error),
    )
  })

  const scene = gltf.scene
  scene.updateMatrixWorld(true)
  await downscaleOversizedTextures(scene)

  const { stats, skeleton, morphTargets, hasBones } = analyzeScene(scene, gltf.animations)

  const textureLoadWarning =
    preprocessed.embeddedImageCount > 0 && stats.textureCount === 0
      ? `このモデルには画像が${preprocessed.embeddedImageCount}枚含まれていますが、テクスチャの読み込みに失敗しました。お使いの端末のメモリ制約が原因の可能性があります。`
      : null

  return {
    fileName: file.name,
    fileSize: file.size,
    scene,
    stats,
    skeleton,
    morphTargets,
    animations: gltf.animations ?? [],
    hasBones,
    textureLoadWarning,
    textureDiagnosticsLog: preprocessed.log,
  }
}

/**
 * Re-derives a LoadedModel's stats/skeleton/hasBones after the scene graph
 * was mutated in place (e.g. by HeuristicRiggingProvider adding bones and
 * converting meshes to SkinnedMesh). Keeps everything else - file info,
 * texture diagnostics - from the original model.
 */
export function reanalyzeModel(model: LoadedModel): LoadedModel {
  model.scene.updateMatrixWorld(true)
  const { stats, skeleton, morphTargets, hasBones } = analyzeScene(model.scene, model.animations)
  return { ...model, stats, skeleton, morphTargets, hasBones }
}

function analyzeScene(
  scene: THREE.Group,
  animations: THREE.AnimationClip[],
): {
  stats: ModelStats
  skeleton: THREE.Skeleton | null
  morphTargets: MorphTargetInfo[]
  hasBones: boolean
} {
  let meshCount = 0
  let vertexCount = 0
  let triangleCount = 0
  let boneCount = 0
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  const skeletons = new Set<THREE.Skeleton>()
  const morphTargets: MorphTargetInfo[] = []
  let skeleton: THREE.Skeleton | null = null

  scene.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      boneCount++
    }

    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
      const skinned = obj as THREE.SkinnedMesh
      if (skinned.skeleton) {
        skeletons.add(skinned.skeleton)
        if (!skeleton) skeleton = skinned.skeleton
      }
    }

    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh
      meshCount++

      const geometry = mesh.geometry
      const posAttr = geometry.getAttribute('position')
      if (posAttr) vertexCount += posAttr.count
      const indexAttr = geometry.getIndex()
      triangleCount += indexAttr ? indexAttr.count / 3 : (posAttr?.count ?? 0) / 3

      const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const mat of meshMaterials) {
        if (!mat) continue
        materials.add(mat)
        for (const key of TEXTURE_MAP_KEYS) {
          const tex = (mat as unknown as Record<string, THREE.Texture | undefined>)[key]
          if (tex) textures.add(tex)
        }
      }

      if (mesh.morphTargetDictionary) {
        for (const [morphName, index] of Object.entries(mesh.morphTargetDictionary)) {
          morphTargets.push({
            meshName: mesh.name || 'Mesh',
            mesh,
            index,
            name: morphName,
            normalized: normalizeBoneName(morphName),
          })
        }
      }
    }
  })

  const boundingBox = new THREE.Box3().setFromObject(scene)
  const boundingSphere = new THREE.Sphere()
  boundingBox.getBoundingSphere(boundingSphere)

  const stats: ModelStats = {
    meshCount,
    vertexCount,
    triangleCount: Math.round(triangleCount),
    materialCount: materials.size,
    textureCount: textures.size,
    boneCount,
    skeletonCount: skeletons.size,
    animationCount: animations?.length ?? 0,
    boundingBox: {
      min: [boundingBox.min.x, boundingBox.min.y, boundingBox.min.z],
      max: [boundingBox.max.x, boundingBox.max.y, boundingBox.max.z],
    },
    boundingSphereRadius: boundingSphere.radius,
  }

  return { stats, skeleton, morphTargets, hasBones: boneCount > 0 }
}

/**
 * Shrinks any texture wider AND taller than MAX_TEXTURE_SIZE using the
 * browser's native `createImageBitmap` resize path (hardware-accelerated,
 * and avoids running the image through a 2D canvas's color-management
 * pipeline, which can shift colors for JPEGs with an embedded, non-sRGB
 * ICC profile - common in AI-generated textures). Skips textures already
 * within budget and never processes the same texture twice (materials
 * commonly share one). Any failure leaves the original texture untouched -
 * full quality but no memory savings is a better fallback than a broken one.
 */
async function downscaleOversizedTextures(scene: THREE.Object3D): Promise<void> {
  const seen = new Set<THREE.Texture>()
  const pending: Promise<void>[] = []

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of materials) {
      if (!mat) continue
      for (const key of TEXTURE_MAP_KEYS) {
        const tex = (mat as unknown as Record<string, THREE.Texture | undefined>)[key]
        if (tex && !seen.has(tex)) {
          seen.add(tex)
          pending.push(downscaleTexture(tex))
        }
      }
    }
  })

  await Promise.all(pending)
}

async function downscaleTexture(texture: THREE.Texture): Promise<void> {
  const image = texture.image as { width?: number; height?: number; close?: () => void } | undefined
  const width = image?.width ?? 0
  const height = image?.height ?? 0
  if (!image || (width <= MAX_TEXTURE_SIZE && height <= MAX_TEXTURE_SIZE)) return

  const scale = MAX_TEXTURE_SIZE / Math.max(width, height)
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  try {
    const resized = await createImageBitmap(image as ImageBitmapSource, {
      resizeWidth: targetWidth,
      resizeHeight: targetHeight,
      resizeQuality: 'high',
    })
    texture.image = resized
    texture.needsUpdate = true
    image.close?.()
  } catch (err) {
    console.warn('[ModelLoader] テクスチャの縮小に失敗したため、元のサイズのまま使用します。', err)
  }
}

/** Fully releases GPU resources held by a previously loaded model's scene graph. */
export function disposeModel(scene: THREE.Object3D | null | undefined): void {
  if (!scene) return

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh) {
      mesh.geometry?.dispose()
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const mat of materials) {
        disposeMaterial(mat)
      }
    }
  })
}

function disposeMaterial(material: THREE.Material | undefined): void {
  if (!material) return
  for (const key of TEXTURE_MAP_KEYS) {
    const tex = (material as unknown as Record<string, THREE.Texture | undefined>)[key]
    tex?.dispose()
  }
  material.dispose()
}
