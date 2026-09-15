import * as THREE from 'three'
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Reduces the model's total triangle count to fit a platform's polygon
 * budget (VRChat, cluster, etc. all cap this). Uses meshoptimizer's
 * `simplify()` (shipped with three.js), which works purely on the index
 * buffer against vertex positions - it only ever *removes* triangles from
 * the existing vertex set, never creating new vertices - so every other
 * per-vertex attribute (skinIndex, skinWeight, uv, normal, morph targets)
 * stays valid and correctly indexed with no remapping needed. This is
 * what makes it safe to run on a rigged SkinnedMesh without corrupting
 * the skin weights three.js's own SimplifyModifier would (it interpolates
 * every attribute generically, which doesn't make sense for bone indices).
 */

export interface MeshReductionResult {
  name: string
  beforeTriangles: number
  afterTriangles: number
}

export interface PolygonReductionResult {
  beforeTriangles: number
  afterTriangles: number
  meshes: MeshReductionResult[]
}

export async function reduceTriangleCount(scene: THREE.Object3D, targetTriangleCount: number): Promise<PolygonReductionResult> {
  if (!Number.isFinite(targetTriangleCount) || targetTriangleCount <= 0) {
    throw new Error('目標ポリゴン数が不正です。')
  }

  await MeshoptSimplifier.ready

  const meshes: THREE.Mesh[] = []
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh) meshes.push(mesh)
  })
  if (meshes.length === 0) throw new Error('対象のメッシュが見つかりませんでした。')

  const beforeTriangles = meshes.reduce((sum, m) => sum + countTriangles(m.geometry), 0)

  if (beforeTriangles <= targetTriangleCount) {
    return { beforeTriangles, afterTriangles: beforeTriangles, meshes: [] }
  }

  // Split the target budget across meshes proportionally to their current share of triangles.
  const ratio = targetTriangleCount / beforeTriangles
  const results: MeshReductionResult[] = []
  let afterTriangles = 0

  for (const mesh of meshes) {
    const before = countTriangles(mesh.geometry)
    const meshTarget = Math.max(4, Math.round(before * ratio))
    const after = simplifyMeshGeometry(mesh, meshTarget)
    afterTriangles += after
    results.push({ name: mesh.name || 'Mesh', beforeTriangles: before, afterTriangles: after })
  }

  return { beforeTriangles, afterTriangles, meshes: results }
}

function countTriangles(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex()
  const position = geometry.getAttribute('position')
  return index ? index.count / 3 : (position?.count ?? 0) / 3
}

function simplifyMeshGeometry(mesh: THREE.Mesh, targetTriangleCount: number): number {
  let geometry = mesh.geometry
  if (!geometry.getIndex()) {
    // FBXLoader (unlike GLTFLoader, whose glTF accessors always carry an explicit index) can hand
    // back fully non-indexed geometry - no vertex is shared between adjacent triangles at all. If
    // we fed that to simplify() via a trivial 0,1,2,... identity index below, meshopt's LockBorder
    // flag (see the loop below) would see every single edge as a "boundary" (used by only one
    // triangle) and refuse to collapse any of them, making simplification a silent no-op. Welding
    // vertices whose full attribute set (position+normal+uv+skin weights+...) already matches
    // recovers the real shared topology - exactly the interior vertices this exporter duplicated
    // for no reason - while leaving genuine seams (a UV island edge, a hard normal) untouched.
    geometry = mergeVertices(geometry)
    mesh.geometry = geometry
  }

  const position = geometry.getAttribute('position')
  if (!position || position.itemSize !== 3) return countTriangles(geometry)

  const before = countTriangles(geometry)
  if (before <= targetTriangleCount) return before

  const positions = position.array instanceof Float32Array ? position.array : new Float32Array(position.array)

  const indexAttr = geometry.getIndex()
  const indices: Uint32Array | Uint16Array =
    indexAttr && (indexAttr.array instanceof Uint32Array || indexAttr.array instanceof Uint16Array)
      ? indexAttr.array
      : identityIndex(position.count)

  const targetIndexCount = Math.min(indices.length, targetTriangleCount * 3)

  // Many exported models pack several logically separate parts (body, armor
  // plates, a held weapon, a chain) into one merged mesh/vertex buffer. With
  // no error ceiling, simplify() is free to collapse an edge on one part
  // into a spatially-close vertex on an unrelated part, stitching a long
  // "bridge" triangle between them - this is what turned the held weapon
  // into a warped, seemingly attached-to-the-arm mess after a first attempt
  // that used target_error=1 (no limit). LockBorder keeps every boundary
  // edge (an edge used by only one triangle - exactly the seam around a
  // disconnected part) fixed in place, so simplification stays within each
  // part instead of bridging across them. We still need real reduction, so
  // raise the error ceiling only as far as necessary to hit the target
  // count, trying the smallest (most shape-preserving) value first.
  let newIndices: Uint32Array | Uint16Array = indices
  for (const targetError of [0.01, 0.05, 0.1, 0.2, 0.4, 0.7, 1]) {
    const [result] = MeshoptSimplifier.simplify(indices, positions, 3, targetIndexCount, targetError, ['LockBorder'])
    newIndices = result
    if (newIndices.length <= targetIndexCount) break
  }

  geometry.setIndex(new THREE.BufferAttribute(newIndices, 1))

  // simplify() only ever drops triangles from the index buffer - every attribute array keeps its
  // original full length, vertices no surviving triangle references included, so a "reduced" mesh
  // would otherwise still ship the entire pre-reduction vertex buffer (the dominant byte cost for
  // a dense mesh) even though most of it is now dead weight. Expanding to only the surviving
  // indices and re-welding shared vertices trims every attribute down to what's actually used.
  const compacted = mergeVertices(geometry.toNonIndexed())
  mesh.geometry = compacted
  return countTriangles(compacted)
}

function identityIndex(vertexCount: number): Uint32Array | Uint16Array {
  const array = vertexCount > 65535 ? new Uint32Array(vertexCount) : new Uint16Array(vertexCount)
  for (let i = 0; i < vertexCount; i++) array[i] = i
  return array
}
