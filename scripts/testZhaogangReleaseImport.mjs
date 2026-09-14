import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const source = await readFile(new URL('../src/services/zhaogangReleaseImportPreferences.ts', import.meta.url), 'utf8')
const compiled = await transform(source, { loader: 'ts', format: 'esm', platform: 'node' })
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`
const preferences = await import(moduleUrl)

const rowsSource = await readFile(new URL('../src/services/zhaogangReleaseImportRows.ts', import.meta.url), 'utf8')
const rowsCompiled = await transform(rowsSource, { loader: 'ts', format: 'esm', platform: 'node' })
const rowsModuleUrl = `data:text/javascript;base64,${Buffer.from(rowsCompiled.code).toString('base64')}`
const rowDisplay = await import(rowsModuleUrl)

const taskSource = await readFile(new URL('../src/services/zhaogangReleaseImportTask.ts', import.meta.url), 'utf8')
const taskCompiled = await transform(taskSource, { loader: 'ts', format: 'esm', platform: 'node' })
const taskModuleUrl = `data:text/javascript;base64,${Buffer.from(taskCompiled.code).toString('base64')}`
const taskService = await import(taskModuleUrl)

const connectionTestSource = await readFile(new URL('../src/services/zhaogangAiConnectionTest.ts', import.meta.url), 'utf8')
const connectionTestCompiled = await transform(connectionTestSource, { loader: 'ts', format: 'esm', platform: 'node' })
const connectionTestModuleUrl = `data:text/javascript;base64,${Buffer.from(connectionTestCompiled.code).toString('base64')}`
const connectionTestService = await import(connectionTestModuleUrl)

const values = new Map()
const storage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
}

assert.deepEqual(preferences.loadReleaseImportColumnNames(storage), {
  projectColumnName: '系统所属OPS',
  planColumnName: '系统名字',
})

const saved = preferences.saveReleaseImportColumnNames({
  projectColumnName: '  应用归属  ',
  planColumnName: '  服务名称  ',
}, storage)
assert.deepEqual(saved, { projectColumnName: '应用归属', planColumnName: '服务名称' })
assert.deepEqual(preferences.loadReleaseImportColumnNames(storage), saved)

preferences.saveReleaseImportColumnNames({ projectColumnName: '', planColumnName: 'x'.repeat(80) }, storage)
assert.deepEqual(preferences.loadReleaseImportColumnNames(storage), {
  projectColumnName: '系统所属OPS',
  planColumnName: 'x'.repeat(50),
})

values.set(preferences.RELEASE_IMPORT_COLUMN_NAMES_KEY, '{broken')
assert.deepEqual(preferences.loadReleaseImportColumnNames(storage), {
  projectColumnName: '系统所属OPS',
  planColumnName: '系统名字',
})

const rows = [
  { rowNo: 1, status: 'READY' },
  { rowNo: 2, status: 'ALREADY_ADDED' },
  { rowNo: 3, status: 'PLAN_AMBIGUOUS' },
  { rowNo: 4, status: 'DUPLICATE_IN_IMAGE' },
  { rowNo: 5, status: 'ALREADY_ADDED' },
]
assert.deepEqual(rowDisplay.summarizeCollapsedReleaseImportRows(rows), {
  total: 3,
  alreadyAdded: 2,
  duplicateInImage: 1,
})
assert.deepEqual(rowDisplay.visibleReleaseImportRows(rows, false).map(row => row.rowNo), [1, 3])
assert.deepEqual(rowDisplay.visibleReleaseImportRows(rows, true).map(row => row.rowNo), [1, 2, 3, 4, 5])
assert.equal(rows.filter(row => row.status === 'READY').length, 1)

assert.equal(taskService.isNetworkFailureCode('NETWORK'), true)
assert.equal(taskService.isNetworkFailureCode('401'), false)
assert.equal(taskService.shouldFallbackToLocalAgent('AUTO', 'NETWORK', true), true)
assert.equal(taskService.shouldFallbackToLocalAgent('AUTO', 'FAILED', true), false)
assert.equal(taskService.shouldFallbackToLocalAgent('SERVER', 'NETWORK', true), false)
assert.equal(taskService.shouldFallbackToLocalAgent('AUTO', 'NETWORK', false), false)
assert.equal(taskService.releaseImportTaskPhaseLabel('WAITING_AI'), '正在等待 AI 返回')

let serverTests = 0
let localTests = 0
assert.equal(await connectionTestService.runZhaogangAiConnectionTest('SERVER', async () => {
  serverTests += 1
  return { success: true, executionLocation: 'SERVER', message: 'ok' }
}, async () => { localTests += 1 }), 'SERVER')
assert.equal(serverTests, 1)
assert.equal(localTests, 0)

assert.equal(await connectionTestService.runZhaogangAiConnectionTest('AUTO', async () => ({
  success: false,
  executionLocation: 'SERVER',
  errorCode: 'NETWORK',
  message: 'server unreachable',
}), async () => { localTests += 1 }), 'LOCAL_AGENT')
assert.equal(localTests, 1)

await assert.rejects(() => connectionTestService.runZhaogangAiConnectionTest('AUTO', async () => ({
  success: false,
  executionLocation: 'SERVER',
  errorCode: 'CONFIG',
  message: 'invalid key',
}), async () => { localTests += 1 }), /invalid key/)
assert.equal(localTests, 1)

assert.equal(await connectionTestService.runZhaogangAiConnectionTest('LOCAL_AGENT', async () => {
  serverTests += 1
  return { success: true, executionLocation: 'SERVER', message: 'ok' }
}, async () => { localTests += 1 }), 'LOCAL_AGENT')
assert.equal(serverTests, 1)
assert.equal(localTests, 2)

const taskStorage = new Map()
const taskStorageApi = {
  getItem: key => taskStorage.get(key) ?? null,
  setItem: (key, value) => taskStorage.set(key, value),
  removeItem: key => taskStorage.delete(key),
}
const storedTask = {
  iterationId: 42,
  taskId: 'task-42',
  mode: 'SERVER',
  executionLocation: 'AUTO',
  createdAt: Date.now(),
}
taskService.saveStoredReleaseImportTask(storedTask, taskStorageApi)
assert.deepEqual(taskService.loadStoredReleaseImportTask(42, taskStorageApi), storedTask)
taskService.clearStoredReleaseImportTask(42, taskStorageApi)
assert.equal(taskService.loadStoredReleaseImportTask(42, taskStorageApi), null)

assert.deepEqual(taskService.parseAgentRecognitionRows(JSON.stringify({ rows: [{ '系统所属OPS': 'Order', '系统名字': 'Order API', requirement: 'R1' }] }), '系统所属OPS', '系统名字'), [{
  ops: 'Order',
  systemName: 'Order API',
  requirement: 'R1',
  projectHint: '',
  planHint: '',
}])

let pollCount = 0
const finalTask = await taskService.pollReleaseImportTask(async () => {
  pollCount += 1
  return pollCount < 3
    ? { taskId: 'poll-1', status: 'RUNNING', phase: 'WAITING_AI', progress: 15 }
    : { taskId: 'poll-1', status: 'SUCCEEDED', phase: 'COMPLETED', progress: 100 }
}, { intervalsMs: [0], maxWaitMs: 1000 })
assert.equal(finalTask.status, 'SUCCEEDED')
assert.equal(pollCount, 3)

await assert.rejects(() => taskService.pollReleaseImportTask(async () => ({
  taskId: 'cancel-1',
  status: 'RUNNING',
  phase: 'WAITING_AI',
  progress: 15,
}), { intervalsMs: [0], isCancelled: () => true }), /识别任务已取消/)

console.log('zhaogang release import tests passed')
