import * as THREE from 'three'

/**
 * A three.js-compatible loader for `data:` URIs that decodes the image
 * directly from an in-memory Blob via `createImageBitmap`, never through
 * `fetch()`.
 *
 * Registered on GLTFLoader's LoadingManager (see `createGltfLoader` in
 * ModelLoader.ts) to replace its default image loading for `data:` URIs -
 * GLTFLoader's built-in `ImageBitmapLoader` fetches the URL first
 * (`fetch(url).then(r => r.blob())`) before decoding it, and on at least
 * one real device `fetch()` on the `blob:` URLs GLTFLoader normally builds
 * for embedded images fails outright (see GlbImagePreprocessor.ts for the
 * full story and how embedded images end up as `data:` URIs in the first
 * place). Skipping `fetch()` entirely avoids that failure mode regardless
 * of its exact cause.
 */
export class SafeDataUriImageLoader extends THREE.Loader {
  /** Tells GLTFLoader's `loadImageSource` to treat our resolved value as an already-built Texture, not a raw ImageBitmap. */
  readonly isImageBitmapLoader = false

  override load(
    url: string,
    onLoad: (texture: THREE.Texture) => void,
    _onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void,
  ): void {
    dataUriToBlob(url)
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        const texture = new THREE.Texture(bitmap as unknown as ImageBitmap)
        texture.needsUpdate = true
        onLoad(texture)
      })
      .catch((err: unknown) => onError?.(err))
  }
}

async function dataUriToBlob(dataUri: string): Promise<Blob> {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUri)
  if (!match) throw new Error('data URIの形式を解析できませんでした')

  const mimeType = match[1] || 'application/octet-stream'
  const isBase64 = Boolean(match[2])
  const payload = match[3]

  if (!isBase64) {
    return new Blob([decodeURIComponent(payload)], { type: mimeType })
  }

  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}
