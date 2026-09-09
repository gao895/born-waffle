import * as THREE from 'three'
import { detectBones } from './BoneDetector'
import { mapHumanoidBones } from './HumanoidMapper'
import type { RiggingProvider } from './RiggingProvider'
import type { HumanoidMappingTable } from '../types/humanoid'
import type { ModelStats } from '../types/model'

/**
 * Heuristic auto-rigger for bone-less models (V2 feature, section 40-42 of
 * the design spec): estimates a humanoid skeleton purely from the mesh's
 * silhouette (bounding box + a few horizontal "slabs" sampled at different
 * heights) and rigid/two-bone skin weights - no pose-estimation ML model,
 * no external service, everything runs client-side.
 *
 * This is a geometric approximation, not true auto-rigging (mesh
 * segmentation research like Pinocchio/RigNet is well beyond what a
 * heuristic can do): it assumes the mesh is a single, roughly upright
 * humanoid figure and infers where hips/knees/shoulders/etc. probably are
 * from standard body proportions, refining left/right and arm-pose
 * placement from the actual vertex distribution. Good enough to turn a
 * static AI-generated character mesh into something the rest of the
 * pipeline (Humanoid mapping, validation, VRM export) can work with -
 * not a substitute for a real rig.
 */
export class HeuristicRiggingProvider implements RiggingProvider {
  readonly name = 'heuristic-silhouette-v1'

  async detectSkeleton(): Promise<THREE.Skeleton | null> {
    return null // this provider only ever runs when BoneDetector already found nothing
  }

  async generateSkeleton(scene: THREE.Object3D): Promise<THREE.Skeleton> {
    const meshes = collectMeshes(scene)
    if (meshes.length === 0) throw new Error('スキニング対象のメッシュが見つかりませんでした。')

    const points = sampleWorldVertices(meshes)
    if (points.length < 8) throw new Error('頂点数が少なすぎるため、自動リギングできませんでした。')

    const box = new THREE.Box3()
    for (const p of points) box.expandByPoint(p)
    const height = Math.max(box.max.y - box.min.y, 1e-6)
    const centerX = (box.min.x + box.max.x) / 2
    const centerZ = (box.min.z + box.max.z) / 2
    const floorY = box.min.y

    const yAt = (fraction: number) => floorY + fraction * height

    const legSlab = slabExtent(points, yAt(0.05), yAt(0.42))
    const legs = splitLeftRight(legSlab.pointsInSlab, centerX)

    const torsoSlab = slabExtent(points, yAt(0.5), yAt(0.64))
    const shoulderSlab = slabExtent(points, yAt(0.74), yAt(0.82))
    const torsoHalfWidth = Math.max((torsoSlab.maxX - torsoSlab.minX) / 2, height * 0.06)
    const shoulderHalfWidth = Math.max((shoulderSlab.maxX - shoulderSlab.minX) / 2, torsoHalfWidth)
    const armsExtended = shoulderHalfWidth > torsoHalfWidth * 1.6

    const root = new THREE.Group()
    root.name = 'Armature'
    scene.add(root)

    const bones = new Map<string, THREE.Bone>()
    const makeBone = (name: string, parent: THREE.Object3D, worldPos: THREE.Vector3): THREE.Bone => {
      const bone = new THREE.Bone()
      bone.name = name
      parent.add(bone)
      setWorldPosition(bone, worldPos)
      bones.set(name, bone)
      return bone
    }

    const hips = makeBone('hips', root, new THREE.Vector3(centerX, yAt(0.5), centerZ))
    const spine = makeBone('spine', hips, new THREE.Vector3(centerX, yAt(0.58), centerZ))
    const chest = makeBone('chest', spine, new THREE.Vector3(centerX, yAt(0.64), centerZ))
    const upperChest = makeBone('upperChest', chest, new THREE.Vector3(centerX, yAt(0.7), centerZ))
    const neck = makeBone('neck', upperChest, new THREE.Vector3(centerX, yAt(0.82), centerZ))
    makeBone('head', neck, new THREE.Vector3(centerX, yAt(0.88), centerZ))

    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? 1 : -1 // +X assumed viewer's left in glTF/VRM convention; side detection elsewhere handles mislabeling via HumanoidMapper anyway
      const shoulderX = centerX + sign * torsoHalfWidth * 0.9
      const shoulder = makeBone(`${side}Shoulder`, upperChest, new THREE.Vector3(shoulderX, yAt(0.78), centerZ))

      if (armsExtended) {
        const armSpan = shoulderHalfWidth - torsoHalfWidth * 0.5
        const upperArmX = centerX + sign * (torsoHalfWidth * 0.5 + armSpan * 0.35)
        const lowerArmX = centerX + sign * (torsoHalfWidth * 0.5 + armSpan * 0.7)
        const handX = centerX + sign * shoulderHalfWidth
        const upperArm = makeBone(`${side}UpperArm`, shoulder, new THREE.Vector3(upperArmX, yAt(0.78), centerZ))
        const lowerArm = makeBone(`${side}LowerArm`, upperArm, new THREE.Vector3(lowerArmX, yAt(0.78), centerZ))
        makeBone(`${side}Hand`, lowerArm, new THREE.Vector3(handX, yAt(0.78), centerZ))
      } else {
        const armX = centerX + sign * torsoHalfWidth * 1.05
        const upperArm = makeBone(`${side}UpperArm`, shoulder, new THREE.Vector3(armX, yAt(0.78), centerZ))
        const lowerArm = makeBone(`${side}LowerArm`, upperArm, new THREE.Vector3(armX, yAt(0.62), centerZ))
        makeBone(`${side}Hand`, lowerArm, new THREE.Vector3(armX, yAt(0.47), centerZ))
      }

      const legX = side === 'left' ? legs.leftX : legs.rightX
      const upperLeg = makeBone(`${side}UpperLeg`, hips, new THREE.Vector3(legX, yAt(0.48), centerZ))
      const lowerLeg = makeBone(`${side}LowerLeg`, upperLeg, new THREE.Vector3(legX, yAt(0.28), centerZ))
      const foot = makeBone(`${side}Foot`, lowerLeg, new THREE.Vector3(legX, yAt(0.04), centerZ))
      makeBone(`${side}Toes`, foot, new THREE.Vector3(legX, yAt(0.02), centerZ + height * 0.04))
    }

    scene.updateMatrixWorld(true)

    const boneList = [...bones.values()]
    return new THREE.Skeleton(boneList)
  }

  async skinMesh(scene: THREE.Object3D, skeleton: THREE.Skeleton): Promise<void> {
    scene.updateMatrixWorld(true)
    const segments = buildBoneSegments(skeleton.bones)
    const meshes = collectMeshes(scene)

    for (const mesh of meshes) {
      const skinned = convertToSkinnedMesh(mesh, segments)
      const parent = mesh.parent
      if (!parent) continue
      parent.remove(mesh)
      parent.add(skinned)
    }

    scene.updateMatrixWorld(true)
    for (const mesh of collectSkinnedMeshes(scene)) {
      mesh.bind(skeleton)
    }
  }

  async mapHumanoid(scene: THREE.Object3D, skeleton: THREE.Skeleton): Promise<HumanoidMappingTable> {
    const bones = detectBones(scene, skeleton)
    const box = new THREE.Box3().setFromObject(scene)
    // mapHumanoidBones only reads `boundingBox` off the stats object; the rest is unused here.
    const stats: ModelStats = {
      meshCount: 0,
      vertexCount: 0,
      triangleCount: 0,
      materialCount: 0,
      textureCount: 0,
      boneCount: skeleton.bones.length,
      skeletonCount: 1,
      animationCount: 0,
      boundingBox: {
        min: [box.min.x, box.min.y, box.min.z],
        max: [box.max.x, box.max.y, box.max.z],
      },
      boundingSphereRadius: box.getBoundingSphere(new THREE.Sphere()).radius,
    }
    return mapHumanoidBones(bones, stats)
  }
}

function collectMeshes(scene: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(mesh)
  })
  return meshes
}

function collectSkinnedMeshes(scene: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = []
  scene.traverse((obj) => {
    const mesh = obj as THREE.SkinnedMesh
    if (mesh.isSkinnedMesh) meshes.push(mesh)
  })
  return meshes
}

const MAX_SAMPLED_VERTICES = 40_000

function sampleWorldVertices(meshes: THREE.Mesh[]): THREE.Vector3[] {
  const totalVertices = meshes.reduce((sum, m) => sum + (m.geometry.getAttribute('position')?.count ?? 0), 0)
  const stride = Math.max(1, Math.floor(totalVertices / MAX_SAMPLED_VERTICES))

  const points: THREE.Vector3[] = []
  const v = new THREE.Vector3()
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false)
    const position = mesh.geometry.getAttribute('position')
    if (!position) continue
    for (let i = 0; i < position.count; i += stride) {
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
      points.push(v.clone())
    }
  }
  return points
}

function slabExtent(points: THREE.Vector3[], yMin: number, yMax: number): { minX: number; maxX: number; pointsInSlab: THREE.Vector3[] } {
  const inSlab = points.filter((p) => p.y >= yMin && p.y <= yMax)
  if (inSlab.length === 0) return { minX: 0, maxX: 0, pointsInSlab: [] }
  let minX = Infinity
  let maxX = -Infinity
  for (const p of inSlab) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
  }
  return { minX, maxX, pointsInSlab: inSlab }
}

/**
 * Looks for a horizontal gap in the leg slab's X distribution (the space
 * between two separate legs). Falls back to a small symmetric offset when
 * no clear gap is found (e.g. a long dress/robe covering both legs).
 */
function splitLeftRight(points: THREE.Vector3[], centerX: number): { leftX: number; rightX: number } {
  if (points.length < 4) {
    return { leftX: centerX + 0.09, rightX: centerX - 0.09 }
  }

  const xs = points.map((p) => p.x).sort((a, b) => a - b)
  const totalWidth = xs[xs.length - 1] - xs[0]
  if (totalWidth < 1e-4) {
    return { leftX: centerX + 0.09, rightX: centerX - 0.09 }
  }

  let biggestGap = 0
  let gapMid = centerX
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1]
    if (gap > biggestGap) {
      biggestGap = gap
      gapMid = (xs[i] + xs[i - 1]) / 2
    }
  }

  if (biggestGap > totalWidth * 0.12) {
    const leftSide = points.filter((p) => p.x > gapMid)
    const rightSide = points.filter((p) => p.x <= gapMid)
    const median = (arr: number[]) => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)]
    return {
      leftX: leftSide.length ? median(leftSide.map((p) => p.x)) : gapMid + totalWidth * 0.15,
      rightX: rightSide.length ? median(rightSide.map((p) => p.x)) : gapMid - totalWidth * 0.15,
    }
  }

  // No clear split - treat as a single merged leg silhouette (e.g. a dress) and offset a little either side of center.
  const offset = Math.max(totalWidth * 0.15, 0.05)
  return { leftX: centerX + offset, rightX: centerX - offset }
}

function setWorldPosition(bone: THREE.Bone, worldPos: THREE.Vector3): void {
  const parent = bone.parent
  if (!parent) {
    bone.position.copy(worldPos)
    return
  }
  parent.updateWorldMatrix(true, false)
  const local = parent.worldToLocal(worldPos.clone())
  bone.position.copy(local)
  bone.updateWorldMatrix(false, false)
}

interface BoneSegment {
  bone: THREE.Bone
  index: number
  start: THREE.Vector3
  end: THREE.Vector3
}

function buildBoneSegments(bones: THREE.Bone[]): BoneSegment[] {
  return bones.map((bone, index) => {
    const start = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld)
    const boneChild = bone.children.find((c) => (c as THREE.Bone).isBone) as THREE.Bone | undefined
    const end = boneChild ? new THREE.Vector3().setFromMatrixPosition(boneChild.matrixWorld) : start.clone()
    return { bone, index, start, end }
  })
}

function pointToSegmentDistance(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3): number {
  const ab = end.clone().sub(start)
  const lengthSq = ab.lengthSq()
  if (lengthSq < 1e-10) return point.distanceTo(start)
  const t = THREE.MathUtils.clamp(point.clone().sub(start).dot(ab) / lengthSq, 0, 1)
  const closest = start.clone().addScaledVector(ab, t)
  return point.distanceTo(closest)
}

function convertToSkinnedMesh(mesh: THREE.Mesh, segments: BoneSegment[]): THREE.SkinnedMesh {
  const geometry = mesh.geometry
  const position = geometry.getAttribute('position')
  const vertexCount = position.count

  const skinIndex = new Uint16Array(vertexCount * 4)
  const skinWeight = new Float32Array(vertexCount * 4)
  const world = new THREE.Vector3()
  const EPSILON = 1e-4

  for (let i = 0; i < vertexCount; i++) {
    world.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)

    let bestIdx = -1
    let bestDist = Infinity
    let secondIdx = -1
    let secondDist = Infinity

    for (const seg of segments) {
      const d = pointToSegmentDistance(world, seg.start, seg.end)
      if (d < bestDist) {
        secondIdx = bestIdx
        secondDist = bestDist
        bestIdx = seg.index
        bestDist = d
      } else if (d < secondDist) {
        secondIdx = seg.index
        secondDist = d
      }
    }

    const w1 = 1 / (bestDist + EPSILON)
    const w2 = secondIdx >= 0 ? 1 / (secondDist + EPSILON) : 0
    const wSum = w1 + w2

    skinIndex[i * 4] = bestIdx
    skinWeight[i * 4] = w1 / wSum
    if (secondIdx >= 0) {
      skinIndex[i * 4 + 1] = secondIdx
      skinWeight[i * 4 + 1] = w2 / wSum
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4))

  const skinnedMesh = new THREE.SkinnedMesh(geometry, mesh.material)
  skinnedMesh.name = mesh.name
  skinnedMesh.position.copy(mesh.position)
  skinnedMesh.quaternion.copy(mesh.quaternion)
  skinnedMesh.scale.copy(mesh.scale)
  skinnedMesh.userData = mesh.userData

  return skinnedMesh
}
