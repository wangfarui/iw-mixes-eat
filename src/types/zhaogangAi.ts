export type ZhaogangAiExecutionLocation = 'AUTO' | 'SERVER' | 'LOCAL_AGENT'

export interface ZhaogangAiConfigStatus {
  apiUrl: string
  configured: boolean
  apiKeyMasked: string
  model: string
  executionLocation: ZhaogangAiExecutionLocation
}

export interface ZhaogangAiConfigCommand {
  apiUrl: string
  apiKey?: string
  model: string
  executionLocation: ZhaogangAiExecutionLocation
}

export interface ZhaogangAiConnectionTestResult {
  success: boolean
  executionLocation: 'SERVER'
  errorCode?: string
  message: string
}

export interface ZhaogangAgentTicket {
  ticket: string
  recognitionTaskId: string
  backendUrl: string
  expiresInSeconds: number
}
