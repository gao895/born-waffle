import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export type ViewDirection = 'front' | 'back' | 'left' | 'right' | 'top' | 'reset'

export interface BoneClickInfo {
  name: string
  node: THREE.Object3D
}

const BACKGROUND_COLOR = 0x14151c
const GRID_COLOR_MAIN = 0x3a3d4a
const GRID_COLOR_SECONDARY = 0x24262f

/**
 * Owns the raw three.js scene graph, camera, renderer, controls, lighting,
 * grid/floor and bone-marker interaction. Framework-agnostic so it can be
 * driven from a single React effect in ModelViewer.tsx without React
 * re-running any of this setup on every render.
 */
export class SceneManager {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  readonly controls: OrbitControls

  private container: HTMLElement
  private resizeObserver: ResizeObserver
  private frameId = 0

  private modelRoot: THREE.Object3D | null = null
  private modelCenter = new THREE.Vector3()
  private modelRadius = 1

  private boneMarkersGroup = new THREE.Group()
  private boneMarkers: THREE.Mesh[] = []
  private highlightedMarker: THREE.Mesh | null = null
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private boneClickCallback: ((info: BoneClickInfo) => void) | null = null

  constructor(container: HTMLElement) {
    this.container = container

    this.scene.background = new THREE.Color(BACKGROUND_COLOR)

    const { clientWidth, clientHeight } = container
    this.camera = new THREE.PerspectiveCamera(45, clientWidth / Math.max(clientHeight, 1), 0.01, 1000)
    this.camera.position.set(2, 1.6, 3)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(clientWidth, clientHeight)
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.target.set(0, 1, 0)

    const grid = new THREE.GridHelper(10, 20, GRID_COLOR_MAIN, GRID_COLOR_SECONDARY)
    this.scene.add(grid)

    const ambient = new THREE.AmbientLight(0xffffff, 1.1)
    this.scene.add(ambient)

    const directional = new THREE.DirectionalLight(0xffffff, 2.2)
    directional.position.set(2, 4, 3)
    this.scene.add(directional)
    const fillLight = new THREE.DirectionalLight(0xaeb6ff, 0.6)
    fillLight.position.set(-3, 2, -2)
    this.scene.add(fillLight)

    this.boneMarkersGroup.visible = false
    this.scene.add(this.boneMarkersGroup)

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)

    this.animate()
  }

  private animate = (): void => {
    this.frameId = requestAnimationFrame(this.animate)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.container
    if (clientWidth === 0 || clientHeight === 0) return
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(clientWidth, clientHeight)
  }

  setModel(root: THREE.Object3D, boneNodes: THREE.Object3D[]): void {
    this.clearModel()
    this.modelRoot = root
    this.scene.add(root)

    const box = new THREE.Box3().setFromObject(root)
    const sphere = new THREE.Sphere()
    box.getBoundingSphere(sphere)
    this.modelCenter.copy(sphere.center)
    this.modelRadius = Math.max(sphere.radius, 0.1)

    this.buildBoneMarkers(boneNodes)
    this.setView('front')
  }

  clearModel(): void {
    if (this.modelRoot) {
      this.scene.remove(this.modelRoot)
      this.modelRoot = null
    }
    this.clearBoneMarkers()
  }

  private buildBoneMarkers(boneNodes: THREE.Object3D[]): void {
    const markerRadius = Math.max(this.modelRadius * 0.012, 0.005)
    const geometry = new THREE.SphereGeometry(markerRadius, 8, 8)

    for (const bone of boneNodes) {
      const material = new THREE.MeshBasicMaterial({ color: 0x60a5fa })
      const marker = new THREE.Mesh(geometry, material)
      marker.userData.boneNode = bone
      marker.userData.boneName = bone.name
      bone.getWorldPosition(marker.position)
      marker.matrixAutoUpdate = false

      // Keep the marker glued to its bone every frame via an update callback stashed on the marker.
      marker.onBeforeRender = () => {
        bone.getWorldPosition(marker.position)
        marker.updateMatrix()
      }
      marker.updateMatrix()

      this.boneMarkersGroup.add(marker)
      this.boneMarkers.push(marker)
    }
  }

  private clearBoneMarkers(): void {
    for (const marker of this.boneMarkers) {
      marker.geometry.dispose()
      ;(marker.material as THREE.Material).dispose()
    }
    this.boneMarkersGroup.clear()
    this.boneMarkers = []
    this.highlightedMarker = null
  }

  setBonesVisible(visible: boolean): void {
    this.boneMarkersGroup.visible = visible
  }

  onBoneClick(callback: ((info: BoneClickInfo) => void) | null): void {
    this.boneClickCallback = callback
  }

  highlightBone(node: THREE.Object3D | null): void {
    if (this.highlightedMarker) {
      ;(this.highlightedMarker.material as THREE.MeshBasicMaterial).color.set(0x60a5fa)
      this.highlightedMarker.scale.setScalar(1)
    }
    this.highlightedMarker = null

    if (!node) return
    const marker = this.boneMarkers.find((m) => m.userData.boneNode === node)
    if (marker) {
      ;(marker.material as THREE.MeshBasicMaterial).color.set(0xf472b6)
      marker.scale.setScalar(1.8)
      this.highlightedMarker = marker
    }
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.boneMarkersGroup.visible || !this.boneClickCallback) return

    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(this.pointer, this.camera)
    const intersects = this.raycaster.intersectObjects(this.boneMarkers, false)
    if (intersects.length === 0) return

    const marker = intersects[0].object as THREE.Mesh
    const node = marker.userData.boneNode as THREE.Object3D
    const name = marker.userData.boneName as string
    this.boneClickCallback({ name, node })
  }

  setView(direction: ViewDirection): void {
    const center = this.modelCenter
    const distance = this.modelRadius * 2.6

    const positions: Record<ViewDirection, THREE.Vector3> = {
      front: new THREE.Vector3(0, center.y, distance),
      back: new THREE.Vector3(0, center.y, -distance),
      left: new THREE.Vector3(-distance, center.y, 0),
      right: new THREE.Vector3(distance, center.y, 0),
      top: new THREE.Vector3(0, center.y + distance, 0.001),
      reset: new THREE.Vector3(distance * 0.7, center.y + distance * 0.35, distance * 0.7),
    }

    const target = positions[direction].add(center)
    this.camera.position.copy(target)
    this.controls.target.copy(center)
    this.controls.update()
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId)
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown)
    this.clearModel()
    this.controls.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
