/**
 * Shrinks oversized images embedded inside a binary .glb file *before* it
 * ever reaches GLTFLoader.
 *
 * Why this exists: GLTFLoader decodes every embedded image at full
 * resolution, and if that decode fails for any reason (out-of-memory on a
 * constrained mobile device is the common one for 4096x4096+ AI-generated
 * textures), it silently swallows the error and resolves the texture as
 * `null` (see GLTFLoader's `loadTextureImage`, which wraps the load in
 * `.catch(() => null)`). The model still "loads successfully" - just
 * completely untextured, with no error anywhere for the app to react to.
 *
 * Downscaling textures *after* GLTFLoader has already parsed them (see
 * `downscaleOversizedTextures` in ModelLoader.ts) can't help here, because
 * the failure happens during GLTFLoader's own decode, before that code
 * ever runs. The only way to prevent it is to make sure GLTFLoader never
 * has to decode a huge image in the first place - so we rewrite the GLB's
 * embedded image bytes down to a safe size first.
 */

const MAX_SOURCE_IMAGE_SIZE = 2048

interface GltfBufferView {
  buffer: number
  byteOffset?: number
  byteLength: number
}

interface GltfImage {
  bufferView?: number
  mimeType?: string
  uri?: string
}

interface GltfJson {
  asset?: { version?: string }
  images?: GltfImage[]
  bufferViews?: GltfBufferView[]
  buffers?: { byteLength: number; uri?: string }[]
  [key: string]: unknown
}

const GLB_MAGIC = 0x46546c67 // 'glTF'
const CHUNK_TYPE_JSON = 0x4e4f534a
const CHUNK_TYPE_BIN = 0x004e4942

/**
 * Returns a possibly-rewritten copy of `arrayBuffer` with any embedded
 * image larger than MAX_SOURCE_IMAGE_SIZE downscaled, or the original
 * buffer unchanged if it isn't a binary GLB, has no oversized embedded
 * images, or anything about the rewrite looks unsafe to attempt.
 */
export async function shrinkOversizedGlbImages(arrayBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    return await shrinkOversizedGlbImagesUnsafe(arrayBuffer)
  } catch (err) {
    console.warn('[GlbImagePreprocessor] 事前縮小に失敗したため、元のファイルをそのまま読み込みます。', err)
    return arrayBuffer
  }
}

async function shrinkOversizedGlbImagesUnsafe(arrayBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (arrayBuffer.byteLength < 20) return arrayBuffer

  const view = new DataView(arrayBuffer)
  if (view.getUint32(0, true) !== GLB_MAGIC) return arrayBuffer // not a .glb (e.g. plain .gltf JSON)

  const jsonChunkLength = view.getUint32(12, true)
  const jsonChunkType = view.getUint32(16, true)
  if (jsonChunkType !== CHUNK_TYPE_JSON) return arrayBuffer

  const jsonStart = 20
  const jsonText = new TextDecoder('utf-8').decode(arrayBuffer.slice(jsonStart, jsonStart + jsonChunkLength))
  const json = JSON.parse(jsonText) as GltfJson

  const binChunkStart = jsonStart + jsonChunkLength
  if (binChunkStart + 8 > arrayBuffer.byteLength) return arrayBuffer
  const binChunkLength = view.getUint32(binChunkStart, true)
  const binChunkType = view.getUint32(binChunkStart + 4, true)
  if (binChunkType !== CHUNK_TYPE_BIN) return arrayBuffer

  const binDataStart = binChunkStart + 8
  const originalBin = arrayBuffer.slice(binDataStart, binDataStart + binChunkLength)

  const images = json.images ?? []
  const bufferViews = json.bufferViews ?? []
  if (images.length === 0 || bufferViews.length === 0) return arrayBuffer
  if ((json.buffers?.length ?? 0) !== 1) return arrayBuffer // multi-buffer GLBs are unusual; skip rather than risk corrupting one

  const appended: ArrayBuffer[] = []
  let didRewrite = false

  for (const image of images) {
    if (image.bufferView === undefined) continue // external/data-URI image, not embedded in this chunk
    const bufferView = bufferViews[image.bufferView]
    if (!bufferView || bufferView.buffer !== 0) continue

    const mimeType = image.mimeType
    if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') continue

    const byteOffset = bufferView.byteOffset ?? 0
    const bytes = originalBin.slice(byteOffset, byteOffset + bufferView.byteLength)
    const dimensions = readImageDimensions(bytes, mimeType)
    if (!dimensions || (dimensions.width <= MAX_SOURCE_IMAGE_SIZE && dimensions.height <= MAX_SOURCE_IMAGE_SIZE)) continue

    const resizedBytes = await resizeImageBytes(bytes, mimeType, dimensions)
    if (!resizedBytes) continue

    const newByteOffset = originalBin.byteLength + appended.reduce((sum, b) => sum + alignTo4(b.byteLength), 0)
    appended.push(resizedBytes)
    bufferViews.push({ buffer: 0, byteOffset: newByteOffset, byteLength: resizedBytes.byteLength })
    image.bufferView = bufferViews.length - 1
    didRewrite = true
  }

  if (!didRewrite) return arrayBuffer

  const totalBinLength = originalBin.byteLength + appended.reduce((sum, b) => sum + alignTo4(b.byteLength), 0)
  const newBin = new Uint8Array(totalBinLength)
  newBin.set(new Uint8Array(originalBin), 0)
  let cursor = originalBin.byteLength
  for (const chunk of appended) {
    newBin.set(new Uint8Array(chunk), cursor)
    cursor += alignTo4(chunk.byteLength)
  }

  json.buffers![0].byteLength = newBin.byteLength

  return packGlb(json, newBin.buffer)
}

function alignTo4(byteLength: number): number {
  return Math.ceil(byteLength / 4) * 4
}

function readImageDimensions(bytes: ArrayBuffer, mimeType: string): { width: number; height: number } | null {
  const view = new DataView(bytes)
  if (mimeType === 'image/png') {
    if (bytes.byteLength < 24) return null
    if (view.getUint32(0) !== 0x89504e47) return null
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }

  if (mimeType === 'image/jpeg') {
    let offset = 2 // skip SOI (FFD8)
    while (offset + 9 < bytes.byteLength) {
      if (view.getUint8(offset) !== 0xff) break
      const marker = view.getUint8(offset + 1)
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      const segmentLength = view.getUint16(offset + 2)
      if (isSOF) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) }
      }
      offset += 2 + segmentLength
    }
    return null
  }

  return null
}

async function resizeImageBytes(
  bytes: ArrayBuffer,
  mimeType: string,
  dimensions: { width: number; height: number },
): Promise<ArrayBuffer | null> {
  const scale = MAX_SOURCE_IMAGE_SIZE / Math.max(dimensions.width, dimensions.height)
  const targetWidth = Math.max(1, Math.round(dimensions.width * scale))
  const targetHeight = Math.max(1, Math.round(dimensions.height * scale))

  const blob = new Blob([bytes], { type: mimeType })
  const bitmap = await createImageBitmap(blob, {
    resizeWidth: targetWidth,
    resizeHeight: targetHeight,
    resizeQuality: 'high',
  })

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return null
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const resizedBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, mimeType === 'image/jpeg' ? 0.92 : undefined)
  })
  if (!resizedBlob) return null

  return resizedBlob.arrayBuffer()
}

function packGlb(json: GltfJson, bin: ArrayBuffer): ArrayBuffer {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonPadded = alignTo4(jsonBytes.byteLength)
  const binPadded = alignTo4(bin.byteLength)

  const totalLength = 12 + 8 + jsonPadded + 8 + binPadded
  const out = new ArrayBuffer(totalLength)
  const view = new DataView(out)
  const bytes = new Uint8Array(out)

  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, 2, true) // glTF version
  view.setUint32(8, totalLength, true)

  view.setUint32(12, jsonPadded, true)
  view.setUint32(16, CHUNK_TYPE_JSON, true)
  bytes.set(jsonBytes, 20)
  for (let i = jsonBytes.byteLength; i < jsonPadded; i++) bytes[20 + i] = 0x20 // space padding

  const binChunkHeaderOffset = 20 + jsonPadded
  view.setUint32(binChunkHeaderOffset, binPadded, true)
  view.setUint32(binChunkHeaderOffset + 4, CHUNK_TYPE_BIN, true)
  bytes.set(new Uint8Array(bin), binChunkHeaderOffset + 8)
  // Remaining bytes (zero padding) are already zero-initialized by `new ArrayBuffer`.

  return out
}
