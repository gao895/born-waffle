/**
 * Rewrites a binary .glb's embedded images into `data:` URIs (shrinking
 * anything oversized along the way) before it ever reaches GLTFLoader.
 *
 * The actual, confirmed root cause (see on-device diagnostics from a real
 * report): GLTFLoader loads a bufferView-embedded image by wrapping its
 * bytes in a Blob, turning that into a `blob:` object URL, and then
 * fetching that URL (`fetch(blobUrl).then(r => r.blob())`, see
 * ImageBitmapLoader.load in three.js) before decoding it. On at least one
 * real device (inside the Claude iOS app's embedded WebView), that
 * `fetch()` call on a `blob:` URL fails outright - confirmed by the fact
 * that our own pre-shrink pass, which decodes the exact same bytes with
 * `createImageBitmap` directly from an in-memory Blob (no `fetch`, no
 * object URL), succeeds every time on that same device, while GLTFLoader's
 * own load of the (now small) result still silently resolves to no
 * texture. `.catch(() => null)` in GLTFLoader's `loadTextureImage` means
 * this never surfaces as an error - the model just ends up untextured.
 *
 * `data:` URIs sidestep the whole blob-registry/fetch path: they're
 * self-contained strings, not a per-document object reference, so fetching
 * one doesn't depend on the same browser/session state that a `blob:` URL
 * does. Every embedded image - not just oversized ones - is inlined as a
 * `data:` URI here, and ModelLoader additionally registers a custom
 * LoadingManager handler (see `createSafeGltfLoader`) that decodes `data:`
 * URIs directly via Blob + `createImageBitmap`, skipping `fetch()`
 * entirely, for the same reason.
 */

const SIZE_LADDER = [2048, 1024, 512, 256, 128] as const

// What actually has to fit in memory/on the wire is the encoded byte size,
// not the pixel dimensions - a detailed normal map can still be several MB
// as a lossless PNG at "only" 2048x2048. If a resize attempt is still this
// large, we treat it as not good enough and fall through to a smaller size.
const MAX_OUTPUT_BYTES = 1_500_000

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

export interface GlbPreprocessResult {
  /** Possibly-rewritten buffer; identical to the input if nothing needed changing. */
  buffer: ArrayBuffer
  /** Human-readable (Japanese) trace of what was inspected/resized/failed, for on-device diagnostics. */
  log: string[]
  /** Number of embedded (bufferView-referenced) images declared in the source file. */
  embeddedImageCount: number
}

export async function shrinkOversizedGlbImages(arrayBuffer: ArrayBuffer): Promise<GlbPreprocessResult> {
  const log: string[] = []
  try {
    return await inlineGlbImagesUnsafe(arrayBuffer, log)
  } catch (err) {
    log.push(`事前処理全体でエラーが発生したため、元のファイルをそのまま読み込みます: ${describeError(err)}`)
    return { buffer: arrayBuffer, log, embeddedImageCount: 0 }
  }
}

async function inlineGlbImagesUnsafe(arrayBuffer: ArrayBuffer, log: string[]): Promise<GlbPreprocessResult> {
  const noop = (embeddedImageCount = 0): GlbPreprocessResult => ({ buffer: arrayBuffer, log, embeddedImageCount })

  if (arrayBuffer.byteLength < 20) return noop()

  const view = new DataView(arrayBuffer)
  if (view.getUint32(0, true) !== GLB_MAGIC) return noop() // not a .glb (e.g. plain .gltf JSON)

  const jsonChunkLength = view.getUint32(12, true)
  const jsonChunkType = view.getUint32(16, true)
  if (jsonChunkType !== CHUNK_TYPE_JSON) return noop()

  const jsonStart = 20
  const jsonText = new TextDecoder('utf-8').decode(arrayBuffer.slice(jsonStart, jsonStart + jsonChunkLength))
  const json = JSON.parse(jsonText) as GltfJson

  const binChunkStart = jsonStart + jsonChunkLength
  if (binChunkStart + 8 > arrayBuffer.byteLength) return noop()
  const binChunkLength = view.getUint32(binChunkStart, true)
  const binChunkType = view.getUint32(binChunkStart + 4, true)
  if (binChunkType !== CHUNK_TYPE_BIN) return noop()

  const binDataStart = binChunkStart + 8
  const originalBin = arrayBuffer.slice(binDataStart, binDataStart + binChunkLength)

  const images = json.images ?? []
  const bufferViews = json.bufferViews ?? []
  const embeddedImageCount = images.filter((i) => i.bufferView !== undefined).length
  if (embeddedImageCount === 0) return noop(embeddedImageCount)

  let didRewrite = false

  for (let i = 0; i < images.length; i++) {
    const image = images[i]
    if (image.bufferView === undefined) continue // external/data-URI image already
    const bufferView = bufferViews[image.bufferView]
    if (!bufferView) continue

    const mimeType = image.mimeType
    const byteOffset = bufferView.byteOffset ?? 0
    let bytes = originalBin.slice(byteOffset, byteOffset + bufferView.byteLength)
    let outMimeType = mimeType ?? 'application/octet-stream'

    if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
      const dimensions = readImageDimensions(bytes, mimeType)
      if (dimensions && Math.max(dimensions.width, dimensions.height) > SIZE_LADDER[0]) {
        const resized = await resizeImageBytesWithRetry(bytes, mimeType, dimensions, i, log)
        if (resized) {
          bytes = resized.bytes
          outMimeType = resized.mimeType
        }
      } else {
        log.push(`画像${i}: ${dimensions ? `${dimensions.width}x${dimensions.height}` : '(サイズ不明)'} は縮小不要のため、そのままdata URI化します。`)
      }
    } else {
      log.push(`画像${i}: 形式 (${mimeType ?? '不明'}) はそのままdata URI化します。`)
    }

    image.uri = `data:${outMimeType};base64,${arrayBufferToBase64(bytes)}`
    image.mimeType = outMimeType
    image.bufferView = undefined
    didRewrite = true
  }

  if (!didRewrite) return noop(embeddedImageCount)

  // The binary chunk (mesh/skin/animation data) is untouched - only the
  // JSON's `images[]` entries changed, from bufferView references to
  // self-contained data URIs. Leftover unused bufferView entries for the
  // old image bytes are harmless dead references.
  return { buffer: packGlb(json, originalBin), log, embeddedImageCount }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`
  return String(err)
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

interface ResizedImage {
  bytes: ArrayBuffer
  mimeType: 'image/png' | 'image/jpeg'
}

/**
 * Tries each size in SIZE_LADDER (skipping ones not smaller than the
 * source) until one produces an output small enough to trust, trying two
 * independent decode strategies at each size: `createImageBitmap` and a
 * plain `<img>` element, both fed the bytes directly via an in-memory Blob
 * (never a `fetch()` or object URL - see the module doc comment for why).
 * A successful decode that still comes out larger than MAX_OUTPUT_BYTES
 * (common for detailed PNG normal maps even at 2048px) is treated as not
 * good enough, and we fall through to a smaller size.
 */
async function resizeImageBytesWithRetry(
  bytes: ArrayBuffer,
  mimeType: 'image/png' | 'image/jpeg',
  dimensions: { width: number; height: number },
  imageIndex: number,
  log: string[],
): Promise<ResizedImage | null> {
  const maxSide = Math.max(dimensions.width, dimensions.height)
  let best: ResizedImage | null = null

  for (const targetMax of SIZE_LADDER) {
    if (targetMax >= maxSide) continue
    const scale = targetMax / maxSide
    const targetWidth = Math.max(1, Math.round(dimensions.width * scale))
    const targetHeight = Math.max(1, Math.round(dimensions.height * scale))
    const blob = new Blob([bytes], { type: mimeType })

    let canvas: HTMLCanvasElement | null = null
    try {
      canvas = await decodeToCanvasViaImageBitmap(blob, targetWidth, targetHeight)
      log.push(`画像${imageIndex}: ${targetMax}px相当のデコードに成功しました (createImageBitmap)。`)
    } catch (err) {
      log.push(`画像${imageIndex}: ${targetMax}px縮小がcreateImageBitmapで失敗 (${describeError(err)})。`)
    }

    if (!canvas) {
      try {
        canvas = await decodeToCanvasViaImageElement(blob, targetWidth, targetHeight)
        log.push(`画像${imageIndex}: ${targetMax}px相当のデコードに成功しました (Image要素)。`)
      } catch (err) {
        log.push(`画像${imageIndex}: ${targetMax}px縮小がImage要素でも失敗 (${describeError(err)})。`)
      }
    }

    if (!canvas) continue

    const result = await encodeSmallestCanvas(canvas, mimeType)
    const kb = (result.bytes.byteLength / 1024).toFixed(0)
    best = result // keep the smallest-so-far as a fallback even if nothing hits budget

    if (result.bytes.byteLength <= MAX_OUTPUT_BYTES) {
      log.push(`画像${imageIndex}: ${dimensions.width}x${dimensions.height} → ${targetMax}px (${result.mimeType}, ${kb}KB) に縮小しました。`)
      return result
    }
    log.push(`画像${imageIndex}: ${targetMax}pxでも${kb}KBと大きいため、さらに縮小します。`)
  }

  if (best) {
    log.push(`画像${imageIndex}: 目標サイズに届きませんでしたが、最小の結果 (${(best.bytes.byteLength / 1024).toFixed(0)}KB) を使用します。`)
    return best
  }

  log.push(`画像${imageIndex}: すべての縮小方法で失敗したため、元のサイズのまま読み込みを試みます。`)
  return null
}

async function decodeToCanvasViaImageBitmap(blob: Blob, targetWidth: number, targetHeight: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob, {
    resizeWidth: targetWidth,
    resizeHeight: targetHeight,
    resizeQuality: 'high',
  })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context を取得できませんでした')
    ctx.drawImage(bitmap, 0, 0)
    return canvas
  } finally {
    bitmap.close()
  }
}

async function decodeToCanvasViaImageElement(blob: Blob, targetWidth: number, targetHeight: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Image要素での画像デコードに失敗しました'))
      el.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context を取得できませんでした')
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Re-encodes as JPEG when the source has no transparency to preserve - PNG's lossless compression is a poor fit for detailed textures like normal maps. */
async function encodeSmallestCanvas(canvas: HTMLCanvasElement, originalMimeType: 'image/png' | 'image/jpeg'): Promise<ResizedImage> {
  const outputMimeType = originalMimeType === 'image/png' && !canvasHasTransparency(canvas) ? 'image/jpeg' : originalMimeType
  const bytes = await canvasToArrayBuffer(canvas, outputMimeType)
  return { bytes, mimeType: outputMimeType }
}

function canvasHasTransparency(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return true // can't check - assume it might need alpha, safer to keep PNG
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true
  }
  return false
}

async function canvasToArrayBuffer(canvas: HTMLCanvasElement, mimeType: string): Promise<ArrayBuffer> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, mimeType === 'image/jpeg' ? 0.92 : undefined)
  })
  if (!blob) throw new Error('canvas.toBlob が結果を返しませんでした')
  return blob.arrayBuffer()
}

function alignTo4(byteLength: number): number {
  return Math.ceil(byteLength / 4) * 4
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
