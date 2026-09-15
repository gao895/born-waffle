/**
 * iOS Safari (and several other mobile browsers) doesn't reliably honor `<a download>` for a
 * blob: URL - instead of saving the file, it often just navigates to/tries to preview the blob
 * in-place, which for an arbitrary binary format like .vrm has nowhere to go and silently does
 * nothing. The Web Share API with a File payload opens the native share sheet (Save to Files,
 * AirDrop, etc.), which is what iOS actually supports reliably for getting a generated blob onto
 * the device, so it's tried first wherever available and the anchor trick is kept as the desktop
 * fallback (most desktop browsers don't implement navigator.share at all).
 */
export async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  const file = new File([blob], fileName, { type: blob.type })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (err) {
      // The user backing out of the share sheet throws AbortError - that's not a failure, so
      // don't fall through to the anchor path and immediately re-prompt a save they just declined.
      if (err instanceof Error && err.name === 'AbortError') return
    }
  }

  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    // Revoke on the next tick so the browser has time to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
