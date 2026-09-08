import { useCallback, useRef, useState } from 'react'
import type * as THREE from 'three'
import type { BoneClickInfo } from '../three/SceneManager'
import type { ModelViewerHandle } from '../components/ModelViewer'

export function useViewer() {
  const viewerRef = useRef<ModelViewerHandle>(null)
  const [bonesVisible, setBonesVisible] = useState(false)
  const [selectedBone, setSelectedBone] = useState<BoneClickInfo | null>(null)
  const [hoveredBoneNode, setHoveredBoneNode] = useState<THREE.Object3D | null>(null)

  const setView = useCallback((direction: Parameters<ModelViewerHandle['setView']>[0]) => {
    viewerRef.current?.setView(direction)
  }, [])

  const handleBoneClick = useCallback((info: BoneClickInfo) => {
    setSelectedBone((prev) => (prev?.node === info.node ? null : info))
  }, [])

  const clearSelectedBone = useCallback(() => setSelectedBone(null), [])

  return {
    viewerRef,
    bonesVisible,
    setBonesVisible,
    selectedBone,
    selectedBoneNode: (hoveredBoneNode ?? selectedBone?.node ?? null) as THREE.Object3D | null,
    handleBoneClick,
    clearSelectedBone,
    setHoveredBoneNode,
    setView,
  }
}
