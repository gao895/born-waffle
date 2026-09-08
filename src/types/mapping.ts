export type PipelineStep = 'load' | 'analyze' | 'bones' | 'vrm' | 'export'

export interface StepState {
  step: PipelineStep
  label: string
  status: 'pending' | 'active' | 'done' | 'error'
}

export type ToastKind = 'success' | 'warning' | 'error' | 'info'

export interface ToastMessage {
  id: string
  kind: ToastKind
  text: string
}
