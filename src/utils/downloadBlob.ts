export function downloadBlob(blob: Blob, fileName: string): void {
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
