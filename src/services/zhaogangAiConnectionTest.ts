import type { ZhaogangAiConnectionTestResult, ZhaogangAiExecutionLocation } from '@/types/zhaogangAi'

export type ZhaogangAiConnectionTestLocation = 'SERVER' | 'LOCAL_AGENT'

export const runZhaogangAiConnectionTest = async (
  executionLocation: ZhaogangAiExecutionLocation,
  testServer: () => Promise<ZhaogangAiConnectionTestResult>,
  testLocalAgent: () => Promise<void>,
): Promise<ZhaogangAiConnectionTestLocation> => {
  if (executionLocation === 'LOCAL_AGENT') {
    await testLocalAgent()
    return 'LOCAL_AGENT'
  }
  const serverResult = await testServer()
  if (serverResult.success) return 'SERVER'
  if (executionLocation === 'AUTO' && serverResult.errorCode === 'NETWORK') {
    await testLocalAgent()
    return 'LOCAL_AGENT'
  }
  throw new Error(serverResult.message || 'AI 连接失败')
}

const transparentPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

export const createZhaogangAiConnectionTestImage = () => {
  const binary = window.atob(transparentPngBase64)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  return new File([bytes], 'ai-connection-test.png', { type: 'image/png' })
}
