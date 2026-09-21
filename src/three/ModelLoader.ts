import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
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

/** Loads a .glb/.gltf/.fbx File into a LoadedModel with derived statistics. */
export async function loadModelFile(file: File): Promise<LoadedModel> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.fbx')) return loadFbxFile(file)
  if (!name.endsWith('.glb') && !name.endsWith('.gltf')) {
    throw new UnsupportedFormatError(
      '対応していないファイル形式です。.glb / .gltf / .fbx ファイルを選択してください。',
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
 * FBX is a completely different binary/ASCII format from glTF, so it needs its own loader
 * (three.js's FBXLoader) rather than going through GLTFLoader - but the resulting scene graph
 * (a THREE.Group with Bone/SkinnedMesh/Material nodes) is handled by the exact same
 * analyzeScene/downscaleOversizedTextures/disposeModel logic below either way. This is the
 * main path for a model already rigged in Blender/Maya/Unity and exported as FBX: since it
 * arrives with a real skeleton, it skips HeuristicRiggingProvider's auto-rigging entirely and
 * goes straight through the same BoneDetector/HumanoidMapper pipeline any skeleton-having GLB
 * uses (see useSkeleton.ts) - the well-tested path, not the geometric-heuristic one.
 *
 * FBXLoader.parse() is synchronous but texture images (both embedded and externally referenced)
 * decode asynchronously in the background afterward, so unlike the GLTFLoader path above -
 * whose callback only fires once every resource is ready - this has to explicitly wait for
 * pending texture images before analyzing/downscaling, or it would run against textures that
 * haven't loaded yet. External texture file references (a "Path Mode: Copy" export without
 * "Embed Textures" in Blender) have no matching file available in the browser and will simply
 * fail to load - only embedded textures are guaranteed to work.
 */
async function loadFbxFile(file: File): Promise<LoadedModel> {
  const arrayBuffer = await file.arrayBuffer()
  const fbxLoader = new FBXLoader()
  const scene = fbxLoader.parse(arrayBuffer, '')
  scene.updateMatrixWorld(true)

  await waitForTextureImages(scene)
  clearInvalidTextureMaps(scene)
  resetSpuriousWhiteEmissive(scene)
  await downscaleOversizedTextures(scene)

  const animations = scene.animations ?? []
  const { stats, skeleton, morphTargets, hasBones } = analyzeScene(scene, animations)

  return {
    fileName: file.name,
    fileSize: file.size,
    scene,
    stats,
    skeleton,
    morphTargets,
    animations,
    hasBones,
    textureLoadWarning: null,
    textureDiagnosticsLog: [],
  }
}

/**
 * FBXLoader assigns each texture's underlying <img> element synchronously but lets it decode
 * in the background, so code running right after parse() can see 0x0 images. Resolves once
 * every texture already attached to a material has either finished loading or failed (a failed
 * external reference shouldn't hang the whole model load - it just renders untextured).
 */
function waitForTextureImages(scene: THREE.Object3D): Promise<void> {
  const pending: Promise<void>[] = []
  const seen = new Set<THREE.Texture>()

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of materials) {
      if (!mat) continue
      for (const key of TEXTURE_MAP_KEYS) {
        const tex = (mat as unknown as Record<string, THREE.Texture | undefined>)[key]
        if (!tex || seen.has(tex)) continue
        seen.add(tex)
        const img = tex.image as HTMLImageElement | undefined
        if (img instanceof HTMLImageElement && !img.complete) {
          pending.push(
            new Promise((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true })
              img.addEventListener('error', () => resolve(), { once: true })
            }),
          )
        }
      }
    }
  })

  return Promise.all(pending).then(() => undefined)
}

/**
 * An FBX texture that references an external file (a "Path Mode: Copy" export without embedded
 * content) has no matching file in the browser and never resolves to real image data at all -
 * there's no <img> element for waitForTextureImages() above to wait on or see fail, `texture.
 * image` simply stays whatever FBXLoader initialized it to (typically null). That's invisible in
 * the 3D viewer (the mesh just renders untextured on that map), but GLTFExporter has no such
 * fallback: it throws ("No valid image data found") the moment it tries to serialize a texture
 * with no image, aborting the entire VRM export over one broken map. Dropping the map here first
 * keeps that failure from reaching export at all, consistent with this app's documented behavior
 * for unresolvable external texture references (render without it, don't fail the whole model).
 */
function clearInvalidTextureMaps(scene: THREE.Object3D): void {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of materials) {
      if (!mat) continue
      const record = mat as unknown as Record<string, THREE.Texture | undefined>
      for (const key of TEXTURE_MAP_KEYS) {
        const tex = record[key]
        if (!tex) continue
        const img = tex.image as { width?: number; height?: number } | null | undefined
        if (!img || !img.width || !img.height) {
          record[key] = undefined
          tex.dispose()
          mat.needsUpdate = true
        }
      }
    }
  })
}

/**
 * AI-generated FBX exports (Tripo confirmed, likely others) commonly write a full white
 * Emissive/EmissiveColor into the material with no accompanying emissive map. FBXLoader passes
 * that through faithfully (see its `materialNode.Emissive`/`EmissiveColor` handling), and a
 * three-point-light Phong/Standard material with emissive locked to white renders that surface
 * as flat, fully bright white regardless of its base color map - the emissive term is additive
 * and a map-less [1,1,1] swamps everything else. This is invisible in a renderer whose own
 * lighting happens to mask it, but it's blatant once the exported VRM is viewed anywhere with
 * standard PBR shading (this app's own preview after round-tripping through export, cluster,
 * VRChat, ...). A textured character was never meant to self-illuminate white, so treat a
 * suspiciously-white, map-less emissive as the exporter mistake it almost certainly is and
 * zero it out - a deliberately white-glowing material without a map to shape that glow would be
 * essentially unheard of for this kind of asset.
 */
function resetSpuriousWhiteEmissive(scene: THREE.Object3D): void {
  const WHITE_THRESHOLD = 0.9
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of materials) {
      if (!mat) continue
      const m = mat as THREE.MeshPhongMaterial | THREE.MeshStandardMaterial
      if (!m.emissive || m.emissiveMap) continue
      if (m.emissive.r >= WHITE_THRESHOLD && m.emissive.g >= WHITE_THRESHOLD && m.emissive.b >= WHITE_THRESHOLD) {
        m.emissive.setRGB(0, 0, 0)
        m.needsUpdate = true
      }
    }
  })
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
