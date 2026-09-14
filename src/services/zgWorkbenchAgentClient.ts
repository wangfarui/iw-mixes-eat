import type {
  ZgK8sAgentHealth,
  ZgK8sAgentSession,
  ZgK8sDeployment,
  ZgK8sDeploymentPage,
  ZgK8sEnvironment,
  ZgK8sNamespace,
  ZgK8sPodPage,
} from '@/types/zhaogangService'

export type ZgWorkbenchAgentTaskStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'EXPIRED'
export type ZgWorkbenchAgentTaskPhase = 'QUEUED' | 'WAITING_AI' | 'MATCHING' | 'COMPLETED'
export interface ZgWorkbenchAgentTaskResult {
  text?: string
  response?: unknown
  model?: string
}
export interface ZgWorkbenchAgentTask {
  taskId: string
  status: ZgWorkbenchAgentTaskStatus
  phase: ZgWorkbenchAgentTaskPhase
  progress: number
  result?: ZgWorkbenchAgentTaskResult | null
  errorCode?: string
  message?: string
  retryable?: boolean
}

export const WORKBENCH_AGENT_PORT_KEY = 'zhaogang:zg-workbench-agent-port'
const LEGACY_PORT_KEY = 'zhaogang:zg-k8s-agent-port'
const DEFAULT_PORT = 28731
export const WORKBENCH_AGENT_DOWNLOAD_PATH = '/downloads/zg-workbench-agent/'
const WORKBENCH_AGENT_DOWNLOAD_INDEX = `${WORKBENCH_AGENT_DOWNLOAD_PATH}index.html`
const WORKBENCH_AGENT_MANIFEST = `${WORKBENCH_AGENT_DOWNLOAD_PATH}latest.json`

type AgentPlatform = 'darwin-arm64' | 'darwin-amd64' | 'windows-arm64' | 'windows-amd64'
export type ZgWorkbenchAgentSystem = 'windows' | 'macos'
type UserAgentDataLike = {
  platform?: string
  architecture?: string
  getHighEntropyValues?: (hints: string[]) => Promise<{ platform?: string; architecture?: string }>
}

export interface ZgWorkbenchAgentHealth extends Omit<ZgK8sAgentHealth, 'agentName'> {
  agentName: string
  protocolVersion?: number
  capabilities?: string[]
}

export type ZgWorkbenchAgentState = {
  installed: boolean
  running: boolean
  compatible: boolean
  health?: ZgWorkbenchAgentHealth
  message?: string
}

export type ZgWorkbenchAgentUpdateInfo = {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  releaseNotes?: string
}

export type ZgWorkbenchAgentUpdateStatus = {
  state: 'IDLE' | 'CHECKING' | 'DOWNLOADING' | 'INSTALLING' | 'FAILED' | string
  message?: string
}

const compareVersion = (left: string, right: string) => {
  const a = left.replace(/^v/i, '').split('.').map(Number)
  const b = right.replace(/^v/i, '').split('.').map(Number)
  for (let index = 0; index < 3; index += 1) if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1
  return 0
}

export const getZgWorkbenchAgentPort = () => {
  const value = Number(localStorage.getItem(WORKBENCH_AGENT_PORT_KEY) || localStorage.getItem(LEGACY_PORT_KEY))
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : DEFAULT_PORT
}

export const saveZgWorkbenchAgentPort = (port: number) => {
  const value = Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT
  localStorage.setItem(WORKBENCH_AGENT_PORT_KEY, String(value))
  return value
}

const detectAgentPlatform = async (requestedSystem?: ZgWorkbenchAgentSystem): Promise<AgentPlatform | null> => {
  const navigatorLike = window.navigator as Navigator & { userAgentData?: UserAgentDataLike }
  const userAgentData = navigatorLike.userAgentData
  let platform = userAgentData?.platform || navigatorLike.platform || ''
  let architecture = userAgentData?.architecture || ''
  if (userAgentData?.getHighEntropyValues) {
    const details = await userAgentData.getHighEntropyValues(['platform', 'architecture'])
      .catch((): { platform?: string; architecture?: string } => ({}))
    platform = details.platform || platform
    architecture = details.architecture || architecture
  }
  const normalizedPlatform = `${platform} ${navigatorLike.userAgent}`.toLowerCase()
  const normalizedArchitecture = architecture.toLowerCase()
  const isArm = normalizedArchitecture.includes('arm') || normalizedArchitecture.includes('aarch')
  const detectedSystem: ZgWorkbenchAgentSystem | null = normalizedPlatform.includes('win')
    ? 'windows'
    : normalizedPlatform.includes('mac') || normalizedPlatform.includes('darwin')
      ? 'macos'
      : null
  if (requestedSystem === 'windows') return detectedSystem === 'windows' && isArm ? 'windows-arm64' : 'windows-amd64'
  if (requestedSystem === 'macos') return detectedSystem === 'macos' && !isArm && normalizedArchitecture ? 'darwin-amd64' : 'darwin-arm64'
  if (detectedSystem === 'windows') return isArm ? 'windows-arm64' : 'windows-amd64'
  if (detectedSystem === 'macos') return isArm || !normalizedArchitecture ? 'darwin-arm64' : 'darwin-amd64'
  return null
}

export const resolveZgWorkbenchAgentDownloadUrl = async (requestedSystem?: ZgWorkbenchAgentSystem) => {
  const platform = await detectAgentPlatform(requestedSystem)
  if (!platform) return WORKBENCH_AGENT_DOWNLOAD_INDEX
  try {
    const response = await fetch(WORKBENCH_AGENT_MANIFEST, { cache: 'no-store' })
    if (!response.ok) return WORKBENCH_AGENT_DOWNLOAD_INDEX
    const manifest = await response.json() as {
      platforms?: Record<string, { url?: string; downloadUrl?: string; installerUrl?: string }>
    }
    const release = manifest.platforms?.[platform]
    const value = release?.installerUrl || release?.downloadUrl || release?.url
    if (!value) return WORKBENCH_AGENT_DOWNLOAD_INDEX
    return /^https?:\/\//i.test(value) ? value : `${WORKBENCH_AGENT_DOWNLOAD_PATH}${value.replace(/^\/+/, '')}`
  } catch {
    return WORKBENCH_AGENT_DOWNLOAD_INDEX
  }
}

export const zgWorkbenchAgentClient = (port = getZgWorkbenchAgentPort()) => {
  const request = async <T>(path: string, init: RequestInit = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { ...init, credentials: 'omit' })
    const payload = await response.json().catch(() => undefined) as T | { message?: string } | undefined
    if (!response.ok) throw new Error((payload as { message?: string } | undefined)?.message || `Agent 请求失败（${response.status}）`)
    return payload as T
  }
  return {
    port,
    health: () => request<ZgWorkbenchAgentHealth>('/v1/health'),
    session: (environment: ZgK8sEnvironment) => request<ZgK8sAgentSession>(`/v1/session?environment=${environment}`),
    login: (environment: ZgK8sEnvironment, token: string) => request<ZgK8sAgentSession>('/v1/session/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, environment }),
    }),
    logout: (environment: ZgK8sEnvironment) => request<ZgK8sAgentSession>(`/v1/session?environment=${environment}`, { method: 'DELETE' }),
    namespaces: (environment: ZgK8sEnvironment) => request<{ items: ZgK8sNamespace[] }>(`/v1/namespaces?environment=${environment}`).then(value => value.items || []),
    pods: (environment: ZgK8sEnvironment, namespace: string, deployment?: string) => request<ZgK8sPodPage>(`/v1/pods?environment=${environment}&namespace=${encodeURIComponent(namespace)}${deployment ? `&deployment=${encodeURIComponent(deployment)}` : ''}`),
    deployments: (environment: ZgK8sEnvironment, namespace: string, page = 1, pageSize = 20) => request<ZgK8sDeploymentPage>(`/v1/deployments?environment=${environment}&namespace=${encodeURIComponent(namespace)}&page=${page}&pageSize=${pageSize}`),
    aiVisionRecognize: async (ticket: string, file: File) => {
      const form = new FormData()
      form.append('ticket', ticket)
      form.append('image', file)
      const response = await fetch(`http://127.0.0.1:${port}/v1/ai-vision/recognize`, {
        method: 'POST',
        body: form,
        credentials: 'omit',
      })
      const payload = await response.json().catch(() => undefined) as { message?: string; result?: { text?: string } } | undefined
      if (!response.ok) throw new Error(payload?.message || `Agent AI 识别失败（${response.status}）`)
      return payload?.result || {}
    },
    aiVisionStartTask: async (ticket: string, file: File) => {
      const form = new FormData()
      form.append('ticket', ticket)
      form.append('image', file)
      const response = await fetch(`http://127.0.0.1:${port}/v1/ai-vision/tasks`, {
        method: 'POST',
        body: form,
        credentials: 'omit',
      })
      const payload = await response.json().catch(() => undefined) as ZgWorkbenchAgentTask | { message?: string } | undefined
      if (!response.ok) throw new Error((payload as { message?: string } | undefined)?.message || `Agent AI 任务创建失败（${response.status}）`)
      return payload as ZgWorkbenchAgentTask
    },
    aiVisionTask: (taskId: string) => request<ZgWorkbenchAgentTask>(`/v1/ai-vision/tasks/${encodeURIComponent(taskId)}`),
    aiVisionCancelTask: (taskId: string) => request<ZgWorkbenchAgentTask>(`/v1/ai-vision/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' }),
    autostart: (enabled: boolean) => request<{ enabled: boolean }>(`/v1/autostart?enabled=${enabled}`, { method: 'POST' }),
    updateCheck: () => request<ZgWorkbenchAgentUpdateInfo>('/v1/update/check'),
    update: () => request<{ accepted: boolean; status?: string }>('/v1/update', { method: 'POST' }),
    updateStatus: () => request<ZgWorkbenchAgentUpdateStatus>('/v1/update/status')
  }
}

export type ZgWorkbenchAgentClient = ReturnType<typeof zgWorkbenchAgentClient>

export const listAllZgWorkbenchDeployments = async (
  client: ZgWorkbenchAgentClient,
  environment: ZgK8sEnvironment,
  namespace: string,
  pageSize = 100,
): Promise<ZgK8sDeployment[]> => {
  const items: ZgK8sDeployment[] = []
  let page = 1
  let total = 0
  do {
    const result = await client.deployments(environment, namespace, page, pageSize)
    items.push(...(result.items || []))
    total = result.total || items.length
    if (!result.items?.length || items.length >= total) break
    page += 1
  } while (page <= 100)
  return items
}

export const checkZgWorkbenchAgent = async (): Promise<ZgWorkbenchAgentState> => {
  try {
    const health = await zgWorkbenchAgentClient().health()
    const compatible = compareVersion(health.version || '0.0.0', '2.0.0') >= 0 && (health.protocolVersion || 0) >= 2
    return { installed: true, running: true, compatible, health, message: compatible ? undefined : '本机 Agent 版本过旧，请前往设置更新' }
  } catch {
    return { installed: false, running: false, compatible: false, message: '未检测到本机 Agent，请前往设置安装并启动' }
  }
}

export const startZgWorkbenchAgentProtocol = () => {
  const link = document.createElement('a')
  link.href = 'zg-workbench-agent://start'
  link.click()
  window.setTimeout(() => link.remove(), 1000)
}
