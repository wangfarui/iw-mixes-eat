<template>
  <div class="agent-settings-sections">
    <section v-if="props.activeSection === 'agent'" id="agent" class="settings-section">
      <header class="settings-heading">
        <div>
          <h3>本机 Agent</h3>
          <p>统一管理 K8s、AI 视觉、自更新和开机自启能力。</p>
        </div>
        <el-tag :type="agentState?.compatible ? 'success' : 'warning'" effect="light">
          {{ agentState?.compatible ? '可用' : '需处理' }}
        </el-tag>
      </header>
      <dl class="connection-details">
        <div><dt>状态</dt><dd>{{ agentState?.message || (agentState?.running ? '运行中' : '未运行') }}</dd></div>
        <div><dt>当前版本</dt><dd>{{ agentState?.health?.version ? `v${agentState.health.version}` : '未检测到' }}</dd></div>
        <div><dt>最新版本</dt><dd>{{ latestAgentVersionText }}</dd></div>
        <div><dt>能力</dt><dd>{{ agentCapabilities }}</dd></div>
        <div>
          <dt>端口</dt>
          <dd><el-input-number v-model="agentPort" :min="1" :max="65535" controls-position="right" @change="saveAgentPort" /></dd>
        </div>
      </dl>
      <div class="settings-actions">
        <el-button type="primary" :icon="Refresh" :loading="agentLoading" @click="refreshAgent">刷新状态</el-button>
        <el-button :icon="Promotion" @click="startAgent">启动</el-button>
        <el-button :icon="Reading" @click="openAgentGuide">安装与卸载教程</el-button>
        <el-button
          :icon="Upload"
          :loading="agentUpdating"
          :disabled="!agentUpdateAvailable"
          @click="updateAgent"
        >
          {{ updateInfo?.updateAvailable ? '更新到最新版' : '已是最新版' }}
        </el-button>
        <el-button :icon="Setting" :disabled="!agentState?.compatible" @click="toggleAutostart">
          {{ agentState?.health?.autostartEnabled ? '关闭开机自启' : '开启开机自启' }}
        </el-button>
      </div>
      <p v-if="updateCheckError" class="settings-hint settings-hint--error">版本检查失败：{{ updateCheckError }}</p>
    </section>

    <section v-if="props.activeSection === 'agent-k8s'" id="agent-k8s" class="settings-section">
      <header class="settings-heading">
        <div>
          <h3>K8s Dashboard Token</h3>
          <p>Token 按当前工作台账号和环境保存。新增或更换前会先通过本机 Agent 验证。</p>
        </div>
        <el-tag :type="configuredCount ? 'success' : 'info'" effect="light">已配置 {{ configuredCount }}/3</el-tag>
      </header>
      <div class="k8s-token-list">
        <div class="k8s-token-row k8s-token-row--header" aria-hidden="true">
          <span>环境</span>
          <span>配置状态</span>
          <span>操作</span>
        </div>
        <div
          v-for="item in environments"
          :key="item.value"
          class="k8s-token-row"
          :class="{ 'is-target': targetEnvironment === item.value }"
        >
          <strong>{{ item.label }}</strong>
          <el-tag :type="k8sConfigured[item.value] ? 'success' : 'info'" size="small" effect="light">
            {{ k8sConfigured[item.value] ? '已配置' : '未配置' }}
          </el-tag>
          <div class="k8s-token-actions">
            <el-button
              v-if="k8sConfigured[item.value]"
              link
              type="primary"
              :loading="k8sTesting[item.value]"
              :disabled="!agentState?.compatible"
              @click="testK8s(item.value)"
            >测试连接</el-button>
            <el-button
              link
              type="primary"
              @click="openK8sDialog(item.value)"
            >{{ k8sConfigured[item.value] ? '更换' : '配置' }}</el-button>
            <el-button
              v-if="k8sConfigured[item.value]"
              link
              type="danger"
              @click="deleteK8s(item.value)"
            >删除</el-button>
          </div>
        </div>
      </div>
    </section>

    <section v-if="props.activeSection === 'ai'" id="ai" class="settings-section">
      <header class="settings-heading">
        <div>
          <h3>AI Agent 配置</h3>
        </div>
        <el-tag :type="aiConfig.configured ? 'success' : 'info'" effect="light">
          {{ aiConfig.configured ? '已配置' : '未配置' }}
        </el-tag>
      </header>
      <el-form label-position="top" class="preferences-form">
        <el-form-item label="API URL"><el-input v-model="aiForm.apiUrl" placeholder="https://host" /></el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="aiForm.apiKey"
            type="password"
            show-password
            autocomplete="new-password"
            :placeholder="aiConfig.apiKeyMasked || '请输入 API Key'"
          />
        </el-form-item>
        <el-form-item label="模型名称"><el-input v-model="aiForm.model" placeholder="gpt-5.6-terra" /></el-form-item>
        <el-form-item>
          <template #label>
            <span class="form-label-with-help">
              执行位置
              <el-tooltip placement="top" :show-after="200">
                <template #content>
                  <div class="execution-location-help">
                    <div><strong>AUTO</strong>：优先由服务器调用，仅网络不可达时尝试本机 Agent。</div>
                    <div><strong>SERVER</strong>：始终由工作台服务器访问 AI 服务。</div>
                    <div><strong>LOCAL_AGENT</strong>：通过本机 Agent 从当前电脑访问 AI，适合仅内网可达的服务。</div>
                  </div>
                </template>
                <el-icon class="label-help-icon" aria-label="查看执行位置说明" tabindex="0"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <el-radio-group v-model="aiForm.executionLocation">
            <el-radio-button value="AUTO">AUTO</el-radio-button>
            <el-radio-button value="SERVER">SERVER</el-radio-button>
            <el-radio-button value="LOCAL_AGENT">LOCAL_AGENT</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <div class="settings-actions">
        <el-button :loading="aiTesting" @click="testAi">测试连接</el-button>
        <el-button type="primary" :loading="aiSaving" @click="saveAi">保存</el-button>
        <el-button type="danger" plain :loading="aiClearing" @click="clearAi">清除配置</el-button>
      </div>
    </section>

    <el-dialog
      v-model="k8sDialogVisible"
      :title="`${k8sConfigured[k8sDialogEnvironment] ? '更换' : '配置'} K8s Dashboard Token`"
      width="min(500px, calc(100% - 32px))"
      :close-on-click-modal="false"
      @closed="resetK8sDialog"
    >
      <el-form label-position="top">
        <el-form-item label="环境">
          <el-input :model-value="environmentLabel(k8sDialogEnvironment)" disabled />
        </el-form-item>
        <el-form-item label="Dashboard Token">
          <el-input
            v-model="k8sTokens[k8sDialogEnvironment]"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="粘贴 K8s Dashboard Token"
            @keyup.enter="saveK8s(k8sDialogEnvironment)"
          />
        </el-form-item>
      </el-form>
      <el-alert
        v-if="!agentState?.compatible"
        type="warning"
        :closable="false"
        show-icon
        title="本机 Agent 未就绪，需先完成安装、启动或更新后才能验证 Token。"
      />
      <template #footer>
        <el-button @click="k8sDialogVisible = false">取消</el-button>
        <el-button
          :loading="k8sTesting[k8sDialogEnvironment]"
          :disabled="!agentState?.compatible || !k8sTokens[k8sDialogEnvironment].trim()"
          @click="testK8s(k8sDialogEnvironment, true)"
        >测试连接</el-button>
        <el-button
          type="primary"
          :loading="k8sSaving[k8sDialogEnvironment]"
          :disabled="!agentState?.compatible || !k8sTokens[k8sDialogEnvironment].trim()"
          @click="saveK8s(k8sDialogEnvironment)"
        >{{ k8sConfigured[k8sDialogEnvironment] ? '验证并更换' : '验证并保存' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Promotion, QuestionFilled, Reading, Refresh, Setting, Upload } from '@element-plus/icons-vue'
import {
  clearZhaogangAiConfig,
  deleteZhaogangK8sToken,
  getZhaogangAiConfig,
  getZhaogangK8sToken,
  getZhaogangK8sTokenStatus,
  issueZhaogangAiTestTicket,
  saveZhaogangAiConfig,
  saveZhaogangK8sToken,
  testZhaogangAiConfig
} from '@/api/zhaogang'
import {
  checkZgWorkbenchAgent,
  getZgWorkbenchAgentPort,
  saveZgWorkbenchAgentPort,
  startZgWorkbenchAgentProtocol,
  zgWorkbenchAgentClient,
  type ZgWorkbenchAgentUpdateInfo
} from '@/services/zgWorkbenchAgentClient'
import { canStartZgWorkbenchAgentUpdate, shouldCheckZgWorkbenchAgentUpdate } from '@/services/zgWorkbenchAgentUpdate'
import { createZhaogangAiConnectionTestImage, runZhaogangAiConnectionTest } from '@/services/zhaogangAiConnectionTest'
import type { ZhaogangAiExecutionLocation } from '@/types/zhaogangAi'
import type { ZgK8sEnvironment } from '@/types/zhaogangService'

type ActiveSection = 'agent' | 'agent-k8s' | 'ai' | null
type SummaryTagType = 'success' | 'warning' | 'info'
type AgentSettingsSummary = {
  agent: string
  agentType: SummaryTagType
  k8s: string
  k8sType: SummaryTagType
  ai: string
  aiType: SummaryTagType
}

const props = defineProps<{ activeSection: ActiveSection }>()
const emit = defineEmits<{ 'summary-change': [summary: AgentSettingsSummary] }>()

const route = useRoute()
const router = useRouter()
const environments: Array<{ value: ZgK8sEnvironment; label: string }> = [
  { value: 'test', label: '测试 TEST' },
  { value: 'uat', label: '预发 UAT' },
  { value: 'prd', label: '生产 PRD' }
]
const emptyEnvironmentFlags = (): Record<ZgK8sEnvironment, boolean> => ({ test: false, uat: false, prd: false })
const emptyEnvironmentTokens = (): Record<ZgK8sEnvironment, string> => ({ test: '', uat: '', prd: '' })

const agentState = ref<Awaited<ReturnType<typeof checkZgWorkbenchAgent>> | null>(null)
const updateInfo = ref<ZgWorkbenchAgentUpdateInfo | null>(null)
const agentPort = ref(getZgWorkbenchAgentPort())
const agentLoading = ref(false)
const agentUpdating = ref(false)
const updateCheckError = ref('')
const k8sConfigured = ref(emptyEnvironmentFlags())
const k8sTokens = ref(emptyEnvironmentTokens())
const k8sTesting = ref(emptyEnvironmentFlags())
const k8sSaving = ref(emptyEnvironmentFlags())
const targetEnvironment = ref<ZgK8sEnvironment | null>(null)
const k8sDialogVisible = ref(false)
const k8sDialogEnvironment = ref<ZgK8sEnvironment>('test')
const aiConfig = ref({ apiUrl: '', configured: false, apiKeyMasked: '', model: 'gpt-5.6-terra', executionLocation: 'AUTO' as ZhaogangAiExecutionLocation })
const aiForm = ref({ apiUrl: '', apiKey: '', model: 'gpt-5.6-terra', executionLocation: 'AUTO' as ZhaogangAiExecutionLocation })
const aiSaving = ref(false)
const aiTesting = ref(false)
const aiClearing = ref(false)

const configuredCount = computed(() => environments.filter(item => k8sConfigured.value[item.value]).length)
const agentCapabilities = computed(() => agentState.value?.health?.capabilities?.join('、') || '未检测到')
const agentUpdateAvailable = computed(() => canStartZgWorkbenchAgentUpdate(agentState.value, updateInfo.value))
const latestAgentVersionText = computed(() => {
  if (updateInfo.value?.latestVersion) return `v${updateInfo.value.latestVersion}`
  if (agentLoading.value) return '检测中'
  return updateCheckError.value ? '获取失败' : '暂未获取'
})
const settingsSummary = computed<AgentSettingsSummary>(() => {
  const agent = !agentState.value
    ? '检测中'
    : agentState.value.compatible
      ? updateInfo.value?.updateAvailable ? '需更新' : '可用'
      : agentState.value.running ? '版本过旧' : '未运行'
  return {
    agent,
    agentType: agent === '可用' ? 'success' : agent === '检测中' ? 'info' : 'warning',
    k8s: `${configuredCount.value}/3`,
    k8sType: configuredCount.value === 3 ? 'success' : configuredCount.value ? 'warning' : 'info',
    ai: aiConfig.value.configured ? '已配置' : '未配置',
    aiType: aiConfig.value.configured ? 'success' : 'info'
  }
})
const client = () => zgWorkbenchAgentClient(agentPort.value)

watch(settingsSummary, summary => emit('summary-change', summary), { immediate: true })

const loadK8sStatus = async () => {
  try {
    const result = await getZhaogangK8sTokenStatus()
    k8sConfigured.value = { ...emptyEnvironmentFlags(), ...result.configured }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'K8s Token 状态加载失败')
  }
}

const loadAiConfig = async () => {
  try {
    aiConfig.value = await getZhaogangAiConfig()
    aiForm.value = {
      apiUrl: aiConfig.value.apiUrl,
      apiKey: '',
      model: aiConfig.value.model || 'gpt-5.6-terra',
      executionLocation: aiConfig.value.executionLocation || 'AUTO'
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'AI 配置加载失败')
  }
}

const refreshAgent = async () => {
  agentLoading.value = true
  updateInfo.value = null
  updateCheckError.value = ''
  try {
    agentState.value = await checkZgWorkbenchAgent()
    if (shouldCheckZgWorkbenchAgentUpdate(agentState.value)) {
      try {
        updateInfo.value = await client().updateCheck()
      } catch (error) {
        updateCheckError.value = error instanceof Error ? error.message : '无法读取 Agent 更新信息'
      }
    }
  } finally {
    agentLoading.value = false
  }
}

const saveAgentPort = (value: number | undefined) => {
  if (!value) return
  agentPort.value = saveZgWorkbenchAgentPort(value)
  void refreshAgent()
}

const startAgent = async () => {
  startZgWorkbenchAgentProtocol()
  await new Promise(resolve => window.setTimeout(resolve, 1200))
  await refreshAgent()
}

const openAgentGuide = () => {
  const guide = window.open(router.resolve('/zhaogang/settings/agent-guide').href, '_blank', 'noopener')
  if (guide) guide.opener = null
}

const updateAgent = async () => {
  agentUpdating.value = true
  try {
    await client().update()
    ElMessage.success('Agent 已开始更新')
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 2000))
      const status = await client().updateStatus().catch(() => null)
      if (status?.state === 'FAILED') throw new Error(status.message || 'Agent 更新失败')
      if (status?.state === 'IDLE') break
    }
    await refreshAgent()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'Agent 更新失败')
  } finally {
    agentUpdating.value = false
  }
}

const toggleAutostart = async () => {
  try {
    const result = await client().autostart(!agentState.value?.health?.autostartEnabled)
    if (agentState.value?.health) agentState.value.health.autostartEnabled = result.enabled
    ElMessage.success(result.enabled ? '已开启开机自启' : '已关闭开机自启')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '开机自启设置失败')
  }
}

const environmentLabel = (environment: ZgK8sEnvironment) =>
  environments.find(item => item.value === environment)?.label || environment.toUpperCase()

const openK8sDialog = (environment: ZgK8sEnvironment) => {
  k8sDialogEnvironment.value = environment
  k8sTokens.value[environment] = ''
  k8sDialogVisible.value = true
}

const resetK8sDialog = () => {
  k8sTokens.value[k8sDialogEnvironment.value] = ''
}

const tokenForValidation = async (environment: ZgK8sEnvironment) => {
  const entered = k8sTokens.value[environment].trim()
  if (entered) return entered
  return (await getZhaogangK8sToken(environment)).token
}

const validateK8s = async (environment: ZgK8sEnvironment, token: string) => {
  const state = await checkZgWorkbenchAgent()
  agentState.value = state
  if (!state.compatible) throw new Error(state.message || '本机 Agent 未就绪')
  await client().login(environment, token)
  await client().namespaces(environment)
}

const testK8s = async (environment: ZgK8sEnvironment, requireEnteredToken = false) => {
  k8sTesting.value[environment] = true
  try {
    if (requireEnteredToken && !k8sTokens.value[environment].trim()) return
    const token = await tokenForValidation(environment)
    await validateK8s(environment, token)
    ElMessage.success(`${environmentLabel(environment)} 连接成功`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'K8s 连接失败')
  } finally {
    k8sTesting.value[environment] = false
  }
}

const saveK8s = async (environment: ZgK8sEnvironment) => {
  const token = k8sTokens.value[environment].trim()
  if (!token) return
  k8sSaving.value[environment] = true
  try {
    await validateK8s(environment, token)
    const result = await saveZhaogangK8sToken(environment, token)
    k8sConfigured.value = { ...emptyEnvironmentFlags(), ...result.configured }
    k8sTokens.value[environment] = ''
    k8sDialogVisible.value = false
    ElMessage.success('Token 已验证并保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'Token 验证或保存失败')
  } finally {
    k8sSaving.value[environment] = false
  }
}

const deleteK8s = async (environment: ZgK8sEnvironment) => {
  try {
    await ElMessageBox.confirm('删除后该环境的 K8s 页面将无法查询，确认继续？', '删除 K8s Token', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const result = await deleteZhaogangK8sToken(environment)
    await client().logout(environment).catch(() => undefined)
    k8sConfigured.value = { ...emptyEnvironmentFlags(), ...result.configured }
    k8sTokens.value[environment] = ''
    ElMessage.success('Token 已删除')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : 'Token 删除失败')
  }
}

const testAi = async () => {
  aiTesting.value = true
  try {
    const command = { ...aiForm.value }
    const location = await runZhaogangAiConnectionTest(
      command.executionLocation,
      () => testZhaogangAiConfig(command),
      async () => {
        const state = await checkZgWorkbenchAgent()
        agentState.value = state
        if (!state.running || !state.compatible || !state.health?.capabilities?.includes('ai-vision')) {
          throw new Error('本机 Agent 未运行、版本过旧或不支持 AI 识别，请先处理本机 Agent')
        }
        const ticket = await issueZhaogangAiTestTicket(command)
        await client().aiVisionRecognize(ticket.ticket, createZhaogangAiConnectionTestImage())
      },
    )
    ElMessage.success(`AI 连接成功（${location === 'SERVER' ? '服务器' : '本机 Agent'}）`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'AI 连接失败')
  } finally {
    aiTesting.value = false
  }
}

const saveAi = async () => {
  aiSaving.value = true
  try {
    aiConfig.value = await saveZhaogangAiConfig({ ...aiForm.value })
    aiForm.value.apiKey = ''
    ElMessage.success('AI 配置已保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'AI 配置保存失败')
  } finally {
    aiSaving.value = false
  }
}

const clearAi = async () => {
  aiClearing.value = true
  try {
    await ElMessageBox.confirm('确认删除当前账号的 AI URL、API Key、模型和执行位置配置？', '清除 AI 配置', {
      confirmButtonText: '清除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    aiConfig.value = await clearZhaogangAiConfig()
    aiForm.value = { apiUrl: '', apiKey: '', model: 'gpt-5.6-terra', executionLocation: 'AUTO' }
    ElMessage.success('AI 配置已清除')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : 'AI 配置清除失败')
  } finally {
    aiClearing.value = false
  }
}

const syncTargetEnvironment = () => {
  const environment = typeof route.query.environment === 'string' ? route.query.environment : ''
  targetEnvironment.value = environment === 'test' || environment === 'uat' || environment === 'prd' ? environment : null
}

watch(() => route.query.environment, syncTargetEnvironment)
onMounted(async () => {
  await Promise.all([refreshAgent(), loadK8sStatus(), loadAiConfig()])
  syncTargetEnvironment()
})
</script>

<style scoped>
.agent-settings-sections { min-width: 0; }
.settings-section { min-width: 0; padding: 20px; background: #fff; border: 1px solid #e4e9f1; border-radius: 8px; }
.settings-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid #edf0f5; }
.settings-heading h3 { margin: 0; font-size: 17px; }
.settings-heading p { margin: 6px 0 0; color: #7d899c; font-size: 13px; line-height: 1.5; }
.connection-details { margin: 0 0 18px; }
.connection-details > div { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 11px 0; border-bottom: 1px solid #edf0f5; }
.connection-details dt { color: #7c899c; font-size: 13px; }
.connection-details dd { min-width: 0; margin: 0; color: #344158; font-weight: 600; text-align: right; overflow-wrap: anywhere; }
.settings-actions { display: flex; gap: 9px; flex-wrap: wrap; }
.settings-hint { margin: 13px 0 0; color: #7c899c; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.settings-hint--error { color: #c45656; }
.preferences-form { padding-top: 18px; }
.preferences-form :deep(.el-form-item) { padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid #edf0f5; }
.preferences-form :deep(.el-form-item__label) { color: #4f5e74; }
.form-label-with-help { display: inline-flex; align-items: center; gap: 5px; }
.label-help-icon { color: #909399; cursor: help; outline: none; }
.label-help-icon:hover, .label-help-icon:focus { color: #409eff; }
.execution-location-help { max-width: 360px; line-height: 1.7; }
.execution-location-help div + div { margin-top: 4px; }
.k8s-token-list { overflow: hidden; margin-top: 16px; border: 1px solid #e4e9f1; border-radius: 6px; }
.k8s-token-row { display: grid; min-height: 54px; grid-template-columns: minmax(130px, 1fr) minmax(110px, .8fr) minmax(220px, auto); align-items: center; gap: 16px; padding: 8px 14px; border-bottom: 1px solid #edf0f5; transition: background-color .2s; }
.k8s-token-row:last-child { border-bottom: 0; }
.k8s-token-row--header { min-height: 38px; color: #7d899c; background: #f7f9fc; font-size: 12px; }
.k8s-token-row.is-target { border-color: #7aa7f5; background: #f5f8ff; }
.k8s-token-row > strong { color: #344158; font-size: 14px; }
.k8s-token-row > .el-tag { justify-self: start; }
.k8s-token-actions { display: flex; align-items: center; gap: 4px; }
.k8s-token-actions { justify-content: flex-end; flex-wrap: wrap; }
@media (max-width: 900px) {
  .k8s-token-row { grid-template-columns: minmax(120px, 1fr) 100px minmax(200px, auto); }
}
@media (max-width: 640px) {
  .settings-section { padding: 16px; }
  .settings-heading { flex-direction: column; gap: 10px; }
  .connection-details > div { align-items: flex-start; flex-direction: column; gap: 7px; }
  .connection-details dd { width: 100%; text-align: left; }
  .k8s-token-row { grid-template-columns: minmax(92px, 1fr) auto; gap: 8px; padding: 10px 12px; }
  .k8s-token-row--header { display: none; }
  .k8s-token-actions { grid-column: 1 / -1; justify-content: flex-start; }
  .k8s-token-actions .el-button { margin-left: 0; }
}
</style>
