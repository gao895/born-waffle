import type { VRMMetadata } from '../types/vrm'

interface MetadataPanelProps {
  metadata: VRMMetadata
  onChange: (metadata: VRMMetadata) => void
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-400">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
      />
    </label>
  )
}

export function MetadataPanel({ metadata, onChange }: MetadataPanelProps) {
  const set = <K extends keyof VRMMetadata>(key: K, value: VRMMetadata[K]) => onChange({ ...metadata, [key]: value })

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">アバター情報</h3>
      <Field label="Avatar Name" value={metadata.title} onChange={(v) => set('title', v)} />
      <Field label="Author" value={metadata.author} onChange={(v) => set('author', v)} />
      <Field label="Version" value={metadata.version} onChange={(v) => set('version', v)} />
      <Field label="Contact" value={metadata.contactInformation} onChange={(v) => set('contactInformation', v)} placeholder="任意" />
      <Field label="Reference" value={metadata.reference} onChange={(v) => set('reference', v)} placeholder="任意" />
    </div>
  )
}
