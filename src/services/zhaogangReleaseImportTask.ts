import type {
  ZhaogangReleaseImportTask,
  ZhaogangReleaseImportTaskPhase,
  ZhaogangReleaseRecognizedRow,
} from '@/types/zhaogangReleaseImport'

export const RELEASE_IMPORT_TASK_STORAGE_PREFIX = 'zhaogang:release-import-task:'

export type ReleaseImportTaskMode = 'SERVER' | 'LOCAL_AGENT'

export interface StoredReleaseImportTask {
  iterationId: number
  taskId: string
  mode: ReleaseImportTaskMode
  executionLocation: 'AUTO' | 'SERVER' | 'LOCAL_AGENT'
  createdAt: number
}

const terminalStatuses = new Set<ZhaogangReleaseImportTask['status']>([
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
])

export const isReleaseImportTaskTerminal = (task: Pick<ZhaogangReleaseImportTask, 'status'>) =>
  terminalStatuses.has(task.status)

export const releaseImportTaskPhaseLabel = (phase?: ZhaogangReleaseImportTaskPhase) => {
  switch (phase) {
    case 'WAITING_AI': return '正在等待 AI 返回'
    case 'MATCHING': return '正在匹配 CODING 项目和构建计划'
    case 'COMPLETED': return '识别任务已完成'
    default: return '任务已提交，正在排队'
  }
}

export const isNetworkFailureCode = (errorCode?: string) => errorCode?.toUpperCase() === 'NETWORK'

export const shouldFallbackToLocalAgent = (
  executionLocation: 'AUTO' | 'SERVER' | 'LOCAL_AGENT',
  errorCode: string | undefined,
  hasImage: boolean,
) => executionLocation === 'AUTO' && hasImage && isNetworkFailureCode(errorCode)

export const releaseImportTaskStorageKey = (iterationId: number) =>
  `${RELEASE_IMPORT_TASK_STORAGE_PREFIX}${iterationId}`

export const loadStoredReleaseImportTask = (
  iterationId: number,
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): StoredReleaseImportTask | null => {
  try {
    const raw = storage.getItem(releaseImportTaskStorageKey(iterationId))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<StoredReleaseImportTask>
    if (value.iterationId !== iterationId || !value.taskId || !value.mode) return null
    return {
      iterationId,
      taskId: value.taskId,
      mode: value.mode === 'LOCAL_AGENT' ? 'LOCAL_AGENT' : 'SERVER',
      executionLocation: value.executionLocation === 'LOCAL_AGENT' || value.executionLocation === 'SERVER'
        ? value.executionLocation
        : 'AUTO',
      createdAt: Number(value.createdAt) || Date.now(),
    }
  } catch {
    return null
  }
}

export const saveStoredReleaseImportTask = (
  value: StoredReleaseImportTask,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
) => {
  storage.setItem(releaseImportTaskStorageKey(value.iterationId), JSON.stringify(value))
}

export const clearStoredReleaseImportTask = (
  iterationId: number,
  storage: Pick<Storage, 'removeItem'> = window.localStorage,
) => {
  storage.removeItem(releaseImportTaskStorageKey(iterationId))
}

export const parseAgentRecognitionRows = (
  text: string,
  projectColumnName: string,
  planColumnName: string,
): ZhaogangReleaseRecognizedRow[] => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('本机 Agent 返回的 AI 识别结果不是有效 JSON')
  }
  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown[] }).rows)
      ? (parsed as { rows: unknown[] }).rows
      : []
  if (!items.length) throw new Error('AI 未识别到可用的发布项目行')
  return items.map(item => {
    const row = item as Record<string, unknown>
    const value = (...keys: string[]) => {
      for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null && String(row[key]).trim()) return String(row[key])
      }
      return ''
    }
    return {
      requirement: value('requirement', 'project'),
      ops: value('ops', 'systemOps', projectColumnName, '系统所属OPS'),
      systemName: value('systemName', 'system', planColumnName, '系统名字'),
      projectHint: value('projectHint', 'codingProject', 'projectName'),
      planHint: value('planHint', 'buildPlan', 'planName'),
    }
  })
}

export const pollReleaseImportTask = async <T extends ZhaogangReleaseImportTask>(
  read: () => Promise<T>,
  options: {
    onSnapshot?: (task: T) => void
    isCancelled?: () => boolean
    intervalsMs?: number[]
    maxWaitMs?: number
  } = {},
): Promise<T> => {
  const intervals = options.intervalsMs?.length ? options.intervalsMs : [0, 1000, 2000, 3000, 5000]
  const startedAt = Date.now()
  let index = 0
  while (true) {
    if (options.isCancelled?.()) throw new Error('识别任务已取消')
    const task = await read()
    options.onSnapshot?.(task)
    if (isReleaseImportTaskTerminal(task)) return task
    if (options.maxWaitMs && Date.now() - startedAt >= options.maxWaitMs) {
      throw new Error('识别等待时间过长，请稍后重新识别')
    }
    const delay = intervals[Math.min(index, intervals.length - 1)]
    index += 1
    if (delay > 0) await new Promise(resolve => globalThis.setTimeout(resolve, delay))
  }
}
