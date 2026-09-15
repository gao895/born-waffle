import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type * as THREE from 'three'
import { type BoneClickInfo, SceneManager, type ViewDirection } from '../three/SceneManager'
import type { BoneCandidate } from '../types/humanoid'

export interface ModelViewerHandle {
  setView: (direction: ViewDirection) => void
}

interface ModelViewerProps {
  scene: THREE.Object3D | null
  bones: BoneCandidate[]
  bonesVisible: boolean
  selectedBoneNode: THREE.Object3D | null
  onBoneClick: (info: BoneClickInfo) => void
}

export const ModelViewer = forwardRef<ModelViewerHandle, ModelViewerProps>(function ModelViewer(
  { scene, bones, bonesVisible, selectedBoneNode, onBoneClick },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const managerRef = useRef<SceneManager | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const manager = new SceneManager(containerRef.current)
    managerRef.current = manager
    return () => {
      manager.dispose()
      managerRef.current = null
    }
  }, [])

  useEffect(() => {
    const manager = managerRef.current
    if (!manager) return
    manager.onBoneClick(onBoneClick)
    return () => manager.onBoneClick(null)
  }, [onBoneClick])

  useEffect(() => {
    const manager = managerRef.current
    if (!manager) return
    if (scene) {
      manager.setModel(
        scene,
        bones.map((b) => b.node),
      )
    } else {
      manager.clearModel()
    }
  }, [scene, bones])

  useEffect(() => {
    managerRef.current?.setBonesVisible(bonesVisible)
  }, [bonesVisible])

  useEffect(() => {
    managerRef.current?.highlightBone(selectedBoneNode)
  }, [selectedBoneNode])

  useImperativeHandle(ref, () => ({
    setView: (direction) => managerRef.current?.setView(direction),
  }))

  return <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-[#14151c]" />
})
