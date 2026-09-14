import type {
  ZhaogangBranch,
  ZhaogangBuild,
  ZhaogangBuildPlan,
  ZhaogangCalendarDayType,
  ZhaogangCalendarMonth,
  ZhaogangPlanCatalog,
  ZhaogangPlanDetail,
  ZhaogangPlanPageSync,
  ZhaogangPlanPageSyncDto,
  ZhaogangProject,
  ZhaogangSessionStatus,
  ZhaogangTokenValue,
  ZhaogangTriggerBuildDto,
  ZhaogangWorklogOptions,
  ZhaogangWorklogScope,
  ZhaogangWorklogStatistics,
  ZhaogangWorklogEntries,
  ZhaogangWorklogAbsence
} from '@/types/zhaogang'
import type { ZhaogangReleaseReceipt } from '@/types/zhaogangRelease'
import type { ZgK8sEnvironment } from '@/types/zhaogangService'
import type { ZhaogangAiConfigCommand, ZhaogangAiConfigStatus, ZhaogangAiConnectionTestResult, ZhaogangAgentTicket } from '@/types/zhaogangAi'
import type {
  ZhaogangReleaseBatchAddResult,
  ZhaogangReleaseImportPreview,
  ZhaogangReleaseImportTask,
  ZhaogangReleaseRecognizedRow,
} from '@/types/zhaogangReleaseImport'
import { dispatchZhaogangPermissionPrompt, permissionPromptFrom } from '@/services/zhaogangPermissionPrompt'

const API_ROOT = `${import.meta.env.VITE_BUILD_ENV === 'prod' ? '//api.itwray.com' : ''}/external-service/api/zhaogang`

interface GeneralResponse<T> {
  code: number
  message: string
  data: T
}

export class ZhaogangRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly missingPermissions: string[] = []
  ) {
    super(message)
  }
}

export const zhaogangRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json;charset=utf-8')
  }
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers,
    credentials: 'include'
  })
  const payload = await response.json().catch(() => undefined) as GeneralResponse<T> | undefined
  if (!response.ok || payload?.code !== 200) {
    const message = payload?.message || '找钢工作台服务暂不可用，请稍后重试'
    const prompt = permissionPromptFrom(payload?.data, message)
    if (prompt) dispatchZhaogangPermissionPrompt(prompt)
    throw new ZhaogangRequestError(message, response.status, payload?.code, prompt?.permissions || [])
  }
  const prompt = permissionPromptFrom(payload.data)
  if (prompt) dispatchZhaogangPermissionPrompt(prompt)
  return payload.data
}

export const bindZhaogangToken = (token: string) => zhaogangRequest<ZhaogangSessionStatus>('/session/bind', {
  method: 'POST',
  headers: { Authorization: `token ${token.trim()}` }
})

export const getZhaogangSession = () => zhaogangRequest<ZhaogangSessionStatus>('/session')

export const getZhaogangToken = () => zhaogangRequest<ZhaogangTokenValue>('/session/token', { method: 'POST' })

export const clearZhaogangSession = () => zhaogangRequest<void>('/session', { method: 'DELETE' })

export const getZhaogangReleaseReceipt = (releaseId: string) => zhaogangRequest<ZhaogangReleaseReceipt>(
  `/release-notes/${encodeURIComponent(releaseId)}/receipt`
)

export const acknowledgeZhaogangRelease = (releaseId: string) => zhaogangRequest<ZhaogangReleaseReceipt>(
  `/release-notes/${encodeURIComponent(releaseId)}/receipt`, { method: 'PUT' }
)

export interface ZhaogangK8sTokenStatus {
  environments: ZgK8sEnvironment[]
  configured: Record<ZgK8sEnvironment, boolean>
}

export const getZhaogangK8sTokenStatus = () => zhaogangRequest<ZhaogangK8sTokenStatus>('/k8s-tokens')

export const saveZhaogangK8sToken = (environment: ZgK8sEnvironment, token: string) => zhaogangRequest<ZhaogangK8sTokenStatus>(
  '/k8s-tokens', { method: 'POST', body: JSON.stringify({ environment, token }) }
)

export const getZhaogangK8sToken = (environment: ZgK8sEnvironment) => zhaogangRequest<ZhaogangTokenValue>(
  `/k8s-tokens/${environment}`
)

export const deleteZhaogangK8sToken = (environment: ZgK8sEnvironment) => zhaogangRequest<ZhaogangK8sTokenStatus>(
  `/k8s-tokens/${environment}`, { method: 'DELETE' }
)

export const getZhaogangAiConfig = () => zhaogangRequest<ZhaogangAiConfigStatus>('/ai/config')

export const saveZhaogangAiConfig = (command: ZhaogangAiConfigCommand) => zhaogangRequest<ZhaogangAiConfigStatus>(
  '/ai/config', { method: 'PUT', body: JSON.stringify(command) }
)

export const clearZhaogangAiConfig = () => zhaogangRequest<ZhaogangAiConfigStatus>('/ai/config', { method: 'DELETE' })

export const testZhaogangAiConfig = (command?: ZhaogangAiConfigCommand) => zhaogangRequest<ZhaogangAiConnectionTestResult>('/ai/config/test', {
  method: 'POST', body: command ? JSON.stringify(command) : undefined
})

export const issueZhaogangAiTestTicket = (command?: ZhaogangAiConfigCommand) => zhaogangRequest<ZhaogangAgentTicket>('/ai/config/test-ticket', {
  method: 'POST', body: command ? JSON.stringify(command) : undefined
})

export const issueZhaogangAgentTicket = (iterationId: number, projectColumnName: string, planColumnName: string) => zhaogangRequest<ZhaogangAgentTicket>('/ai/agent-tickets', {
  method: 'POST', body: JSON.stringify({ iterationId, projectColumnName, planColumnName })
})

export const recognizeZhaogangReleaseImage = (
  iterationId: number,
  file: File,
  projectColumnName: string,
  planColumnName: string,
) => {
  const form = new FormData()
  form.append('file', file)
  form.append('projectColumnName', projectColumnName)
  form.append('planColumnName', planColumnName)
  return zhaogangRequest<ZhaogangReleaseImportPreview>(`/iterations/${iterationId}/release-import/recognize`, {
    method: 'POST', body: form
  })
}

export const createZhaogangReleaseImageTask = (
  iterationId: number,
  file: File,
  projectColumnName: string,
  planColumnName: string,
) => {
  const form = new FormData()
  form.append('file', file)
  form.append('projectColumnName', projectColumnName)
  form.append('planColumnName', planColumnName)
  return zhaogangRequest<ZhaogangReleaseImportTask>(`/iterations/${iterationId}/release-import/recognize-tasks`, {
    method: 'POST', body: form
  })
}

export const getZhaogangReleaseImageTask = (iterationId: number, taskId: string) =>
  zhaogangRequest<ZhaogangReleaseImportTask>(`/iterations/${iterationId}/release-import/recognize-tasks/${encodeURIComponent(taskId)}`)

export const cancelZhaogangReleaseImageTask = (iterationId: number, taskId: string) =>
  zhaogangRequest<ZhaogangReleaseImportTask>(`/iterations/${iterationId}/release-import/recognize-tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE'
  })

export const matchZhaogangReleaseRows = (iterationId: number, items: ZhaogangReleaseRecognizedRow[]) =>
  zhaogangRequest<ZhaogangReleaseImportPreview>(`/iterations/${iterationId}/release-import/match`, {
    method: 'POST', body: JSON.stringify({ items })
  })

export const batchAddZhaogangReleasePlans = (iterationId: number, items: Array<{ rowNo: number; projectId: number; planId: number }>) =>
  zhaogangRequest<ZhaogangReleaseBatchAddResult>(`/iterations/${iterationId}/release-import/batch-add`, {
    method: 'POST', body: JSON.stringify({ items })
  })

export const getZhaogangProjects = () => zhaogangRequest<ZhaogangProject[]>('/projects')

export const getZhaogangPlans = (projectId: number) => zhaogangRequest<ZhaogangBuildPlan[]>(`/projects/${projectId}/build-plans`)

export const getZhaogangPlanCatalog = () => zhaogangRequest<ZhaogangPlanCatalog>('/build-plan-catalog')

export const syncZhaogangPlanPage = (dto: ZhaogangPlanPageSyncDto) => zhaogangRequest<ZhaogangPlanPageSync>(
  '/build-plan-catalog/page-sync', {
    method: 'POST',
    body: JSON.stringify(dto)
  }
)

export const getZhaogangPlanDetail = (projectId: number, planId: number) => zhaogangRequest<ZhaogangPlanDetail>(
  `/projects/${projectId}/build-plans/${planId}`
)

export const searchZhaogangBranches = (projectId: number, planId: number, keyword: string) => zhaogangRequest<ZhaogangBranch[]>(
  `/projects/${projectId}/build-plans/${planId}/branches?keyword=${encodeURIComponent(keyword)}`
)

export const triggerZhaogangBuild = (projectId: number, planId: number, dto: ZhaogangTriggerBuildDto) => zhaogangRequest<ZhaogangBuild>(
  `/projects/${projectId}/build-plans/${planId}/builds`,
  { method: 'POST', body: JSON.stringify(dto) }
)

export const getZhaogangWorklogOptions = () => zhaogangRequest<ZhaogangWorklogOptions>('/worklog-options')

export const getZhaogangCalendarMonth = (month: string) => zhaogangRequest<ZhaogangCalendarMonth>(
  `/calendar?month=${encodeURIComponent(month)}`
)

export const updateZhaogangCalendarDay = (date: string, dayType: ZhaogangCalendarDayType) => zhaogangRequest<ZhaogangCalendarMonth>(
  `/calendar/days/${encodeURIComponent(date)}`,
  { method: 'PUT', body: JSON.stringify({ dayType }) }
)

export const resetZhaogangCalendarDay = (date: string) => zhaogangRequest<ZhaogangCalendarMonth>(
  `/calendar/days/${encodeURIComponent(date)}`,
  { method: 'DELETE' }
)

export const updateZhaogangCalendarLeave = (date: string, leave: boolean) => zhaogangRequest<ZhaogangCalendarMonth>(
  `/calendar/leaves/${encodeURIComponent(date)}?leave=${leave ? 'true' : 'false'}`,
  { method: 'PUT' }
)

export const getZhaogangWorklogStatistics = (
  month: string,
  scope: ZhaogangWorklogScope,
  workbenchTeamId?: number | null,
  refresh = false
) => {
  const params = new URLSearchParams({ month, scope })
  if (scope === 'WORKBENCH_TEAM' && workbenchTeamId) params.set('workbenchTeamId', String(workbenchTeamId))
  if (refresh) params.set('refresh', 'true')
  return zhaogangRequest<ZhaogangWorklogStatistics>(`/worklogs/statistics?${params.toString()}`)
}

export const getZhaogangWorklogEntries = (
  from: string,
  to: string,
  scope: ZhaogangWorklogScope,
  workbenchTeamId?: number | null,
  refresh = false
) => {
  const params = new URLSearchParams({ from, to, scope })
  if (scope === 'WORKBENCH_TEAM' && workbenchTeamId) params.set('workbenchTeamId', String(workbenchTeamId))
  if (refresh) params.set('refresh', 'true')
  return zhaogangRequest<ZhaogangWorklogEntries>(`/worklogs/entries?${params.toString()}`)
}

export const getZhaogangWorklogAbsences = (
  month: string,
  scope: ZhaogangWorklogScope,
  workbenchTeamId?: number | null,
  refresh = false
) => {
  const params = new URLSearchParams({ month, scope })
  if (scope === 'WORKBENCH_TEAM' && workbenchTeamId) params.set('workbenchTeamId', String(workbenchTeamId))
  if (refresh) params.set('refresh', 'true')
  return zhaogangRequest<ZhaogangWorklogAbsence>(`/worklogs/absences?${params.toString()}`)
}
