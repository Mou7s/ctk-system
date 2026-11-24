<template>
  <div class="app-container kingdee-maintenance-page absolute inset-0 overflow-y-auto">
    <div class="page-intro">
      <h2 class="page-title">金蝶快捷指令</h2>
      <p class="page-desc">执行金蝶后台维护指令，危险操作会二次确认</p>
    </div>

    <div class="op-grid">
      <div class="op-card">
        <div class="op-header">
          <span class="op-title">更新未领料信息</span>
          <span class="op-tag tag-normal">普通</span>
        </div>
        <p class="op-desc">
          更新指定月份工序流转历史的领料标记，修正未领料数据
        </p>
        <div class="op-actions">
          <div class="inline-flex w-40 max-w-full items-center gap-1">
            <UPopover
              v-model:open="updateMonthOpen"
              class="min-w-0 flex-1"
              :content="{ align: 'start' }"
            >
              <UButton
                type="button"
                color="neutral"
                variant="outline"
                size="md"
                class="w-full justify-between font-normal"
                :aria-label="
                  updateMonthLabel ? `已选择${updateMonthLabel}` : '选择月份'
                "
              >
                <span
                  class="min-w-0 truncate"
                  :class="updateMonthLabel ? 'text-highlighted' : 'text-dimmed'"
                >
                  {{ updateMonthLabel || "选择月份" }}
                </span>
                <UIcon
                  name="i-lucide-calendar-days"
                  class="size-4 shrink-0 opacity-70"
                  aria-hidden="true"
                />
              </UButton>

              <template #content>
                <UCalendar
                  v-model="updateMonthValue"
                  type="month"
                  locale="zh-CN"
                  calendar-label="选择更新月份"
                  prevent-deselect
                  initial-focus
                  class="p-2"
                />
              </template>
            </UPopover>

            <UButton
              v-if="updatelingliaotime"
              type="button"
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-x"
              aria-label="清除月份"
              class="shrink-0 px-1"
              @click.stop="clearUpdateMonth"
            />
          </div>
          <UButton
            color="primary"
            :loading="loadingMap.updateLingliao"
            :disabled="!updatelingliaotime"
            @click="updateLingliao"
            >执行</UButton
          >
        </div>
      </div>

      <div class="op-card">
        <div class="op-header">
          <span class="op-title">反审并删除期末在产品成本调整</span>
          <span class="op-tag tag-danger">危险</span>
        </div>
        <p class="op-desc">
          反审核并删除指定月份的 CB_ENDPROCOSTADJ 调整单，操作不可逆
        </p>
        <div class="op-actions">
          <div class="inline-flex w-40 max-w-full items-center gap-1">
            <UPopover
              v-model:open="deleteMonthOpen"
              class="min-w-0 flex-1"
              :content="{ align: 'start' }"
            >
              <UButton
                type="button"
                color="neutral"
                variant="outline"
                size="md"
                class="w-full justify-between font-normal"
                :aria-label="
                  deleteMonthLabel ? `已选择${deleteMonthLabel}` : '选择月份'
                "
              >
                <span
                  class="min-w-0 truncate"
                  :class="deleteMonthLabel ? 'text-highlighted' : 'text-dimmed'"
                >
                  {{ deleteMonthLabel || "选择月份" }}
                </span>
                <UIcon
                  name="i-lucide-calendar-days"
                  class="size-4 shrink-0 opacity-70"
                  aria-hidden="true"
                />
              </UButton>

              <template #content>
                <UCalendar
                  v-model="deleteMonthValue"
                  type="month"
                  locale="zh-CN"
                  calendar-label="选择删除月份"
                  prevent-deselect
                  initial-focus
                  class="p-2"
                />
              </template>
            </UPopover>

            <UButton
              v-if="deletePZtime"
              type="button"
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-x"
              aria-label="清除月份"
              class="shrink-0 px-1"
              @click.stop="clearDeleteMonth"
            />
          </div>
          <UButton
            color="error"
            :loading="loadingMap.deletePZ"
            :disabled="!deletePZtime"
            @click="confirmDeletePZ"
            >执行</UButton
          >
        </div>
      </div>

      <div class="op-card">
        <div class="op-header">
          <span class="op-title">优化成本数据</span>
          <span class="op-tag tag-slow">耗时</span>
        </div>
        <p class="op-desc">
          重建 20 张成本相关表的索引并更新统计信息，结果通过企微通知
        </p>
        <div class="op-actions">
          <UButton
            color="primary"
            :loading="loadingMap.handleCBData"
            @click="handleCBDataFun"
            >执行</UButton
          >
        </div>
      </div>

      <div class="op-card">
        <div class="op-header">
          <span class="op-title">重建索引</span>
          <span class="op-tag tag-slow">耗时</span>
        </div>
        <p class="op-desc">
          全库（排除临时表）重建索引，提升整体查询性能，结果通过企微通知
        </p>
        <div class="op-actions">
          <UButton
            color="primary"
            :loading="loadingMap.buildIndex"
            @click="buildIndexOfKingdeeFun"
            >执行</UButton
          >
        </div>
      </div>

      <div class="op-card">
        <div class="op-header">
          <span class="op-title">更新工序计划单号 → 生产订单</span>
          <span class="op-tag tag-normal">普通</span>
        </div>
        <p class="op-desc">将工序计划单号反写到生产订单 F_GONGXUHAO 字段</p>
        <div class="op-actions">
          <UButton
            color="primary"
            :loading="loadingMap.writeToMO"
            @click="writeToMOFun"
            >执行</UButton
          >
        </div>
      </div>
    </div>

    <div v-if="historyList.length" class="history-section">
      <div class="history-header">
        <span>执行记录</span>
        <UButton variant="ghost" size="sm" @click="clearHistory">清空</UButton>
      </div>
      <div class="space-y-4 pl-2 mt-4">
        <div
          v-for="(item, idx) in historyList"
          :key="idx"
          class="relative pl-6 pb-4 last:pb-0 border-l border-gray-200 dark:border-gray-800 last:border-transparent"
        >
          <!-- Timeline Dot -->
          <div
            class="absolute -left-[6px] top-1.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900"
            :class="item.success ? 'bg-green-500' : 'bg-red-500'"
          ></div>
          <!-- Time -->
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
            {{ item.time }}
          </div>
          <!-- Content -->
          <div
            class="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2"
          >
            {{ item.name }}
            <span :class="item.success ? 'text-green-500' : 'text-red-500'">
              {{ item.success ? "成功" : "失败" }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup name="kingdeeMaintenance">
import { CalendarDate } from "@internationalized/date";
import { computed, ref } from "vue";
import { createClientRequestId } from "@/utils/requestId";

const toast = useToast();
const { proxy } = getCurrentInstance();

const updatelingliaotime = ref("");
const updateRequestId = ref("");
const deletePZtime = ref("");
const updateMonthOpen = ref(false);
const deleteMonthOpen = ref(false);

function parseMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  if (!match) return undefined;

  try {
    return new CalendarDate(Number(match[1]), Number(match[2]), 1);
  } catch {
    return undefined;
  }
}

function formatMonthValue(value) {
  if (!value || value.year == null || value.month == null) return "";
  return `${value.year}-${String(value.month).padStart(2, "0")}`;
}

function formatMonthLabel(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  return match ? `${match[1]}年${match[2]}月` : "";
}

function updateMonthValueFor(target, open, value) {
  const nextValue = formatMonthValue(value);
  if (nextValue) {
    if (target === updatelingliaotime && target.value !== nextValue) {
      updateRequestId.value = "";
    }
    target.value = nextValue;
  }
  open.value = false;
}

const updateMonthValue = computed({
  get: () => parseMonth(updatelingliaotime.value),
  set: (value) =>
    updateMonthValueFor(updatelingliaotime, updateMonthOpen, value),
});

const deleteMonthValue = computed({
  get: () => parseMonth(deletePZtime.value),
  set: (value) => updateMonthValueFor(deletePZtime, deleteMonthOpen, value),
});

const updateMonthLabel = computed(() =>
  formatMonthLabel(updatelingliaotime.value),
);
const deleteMonthLabel = computed(() => formatMonthLabel(deletePZtime.value));

function clearUpdateMonth() {
  updatelingliaotime.value = "";
  updateRequestId.value = "";
  updateMonthOpen.value = false;
}

function clearDeleteMonth() {
  deletePZtime.value = "";
  deleteMonthOpen.value = false;
}

const loadingMap = ref({
  updateLingliao: false,
  deletePZ: false,
  handleCBData: false,
  buildIndex: false,
  writeToMO: false,
});

const HISTORY_KEY = "kingdee_execute_history";
const historyList = ref(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"));

function addHistory(name, success) {
  historyList.value.unshift({
    name,
    success,
    time: new Date().toLocaleString("zh-CN"),
  });
  if (historyList.value.length > 20) historyList.value.length = 20;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyList.value));
}

function clearHistory() {
  historyList.value = [];
  localStorage.removeItem(HISTORY_KEY);
}

function responseIsSuccess(response) {
  return response?.code === 200;
}

function responseData(response) {
  return response?.data && typeof response.data === "object"
    ? response.data
    : {};
}

function responseError(error, fallback = "执行失败") {
  return (
    error?.msg ||
    error?.data?.msg ||
    error?.response?._data?.msg ||
    error?.response?.data?.msg ||
    error?.message ||
    fallback
  );
}

function operationRequest(reason) {
  return { reason, requestId: createClientRequestId("execute") };
}

function showNotificationStatus(data) {
  if (data?.notificationStatus === "failed") {
    toast.add({
      title: "业务已完成，但企业微信通知失败",
      description: data.notificationMessage || "请检查企业微信配置或通知日志",
      color: "warning",
    });
  }
}

function updateLingliao() {
  if (!updatelingliaotime.value) {
    toast.add({ title: "请选择月份", color: "error" });
    return;
  }
  useModalConfirm()
    .confirm("是否更新未领料信息？", "确认", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      type: "warning",
    })
    .then(() => {
      const dateStr = updatelingliaotime.value;
      const requestId =
        updateRequestId.value || createClientRequestId("execute");
      updateRequestId.value = requestId;
      loadingMap.value.updateLingliao = true;
      updateTimeOfGXLL({
        dateStr,
        reason: "按选择月份重算未领料状态",
        requestId,
      })
        .then((response) => {
          loadingMap.value.updateLingliao = false;
          if (updateRequestId.value === requestId) updateRequestId.value = "";
          const success = responseIsSuccess(response);
          const data = responseData(response);
          addHistory("更新未领料信息 (" + dateStr + ")", success);
          if (!success) {
            toast.add({ title: responseError(response), color: "error" });
            return;
          }
          showNotificationStatus(data);
          toast.add({
            title:
              "执行成功：更新汇报日期 " +
              (data.reportDateUpdated ?? 0) +
              " 条，清空领料标记 " +
              (data.llResetCount ?? 0) +
              " 条，标记未领料 " +
              (data.unpickedMarkedCount ?? 0) +
              " 条",
            color: "success",
          });
        })
        .catch((error) => {
          loadingMap.value.updateLingliao = false;
          if (updateRequestId.value === requestId) updateRequestId.value = "";
          addHistory("更新未领料信息 (" + dateStr + ")", false);
          toast.add({ title: responseError(error), color: "error" });
        });
    });
}

function confirmDeletePZ() {
  if (!deletePZtime.value) {
    toast.add({ title: "请选择月份", color: "error" });
    return;
  }
  useModalConfirm()
    .confirm(
      "此操作将反审核并删除 " +
        deletePZtime.value +
        " 的成本调整单，且不可逆。\n请输入「确认删除」以继续：",
      "危险操作确认",
      {
        confirmButtonText: "确认删除",
        cancelButtonText: "取消",
        type: "warning",
        inputPattern: /^确认删除$/,
        inputErrorMessage: "请输入「确认删除」",
      },
    )
    .then(() => {
      const dateStr = deletePZtime.value;
      loadingMap.value.deletePZ = true;
      deletePZ({
        dateStr,
        ...operationRequest("按选择月份反审核并删除期末成本调整单"),
      })
        .then((response) => {
          loadingMap.value.deletePZ = false;
          const success = responseIsSuccess(response);
          const data = responseData(response);
          addHistory(
            "反审并删除成本调整 (" + dateStr + ")",
            success,
          );
          if (!success) {
            toast.add({
              title: data.status === "partial" ? "部分完成，请人工检查金蝶单据状态" : responseError(response, "删除失败"),
              color: "error",
            });
            return;
          }
          showNotificationStatus(data);
          toast.add({
            title: data.status === "noop"
              ? "指定月份没有期末成本调整单，无需处理"
              : `删除成功：匹配 ${data.matchedBillCount ?? 0} 张，删除 ${data.deletedBillCount ?? 0} 张`,
            color: "success",
          });
        })
        .catch((error) => {
          loadingMap.value.deletePZ = false;
          addHistory("反审并删除成本调整 (" + dateStr + ")", false);
          toast.add({ title: responseError(error, "删除失败"), color: "error" });
        });
    })
    .catch(() => {});
}

function handleCBDataFun() {
  useModalConfirm()
    .confirm(
      "是否执行优化成本数据？该操作耗时较高，结果通过企微通知。",
      "确认",
      {
        confirmButtonText: "确认",
        cancelButtonText: "取消",
        type: "warning",
      },
    )
    .then(() => {
      loadingMap.value.handleCBData = true;
      handleCBData(operationRequest("执行成本数据优化并重建统计信息"))
        .then((response) => {
          loadingMap.value.handleCBData = false;
          const success = responseIsSuccess(response);
          const data = responseData(response);
          addHistory("优化成本数据", success);
          if (!success) {
            toast.add({ title: responseError(response), color: "error" });
            return;
          }
          showNotificationStatus(data);
          toast.add({
            title: `执行成功：${data.steps?.length ?? 0} 个步骤完成`,
            color: "success",
          });
        })
        .catch((error) => {
          loadingMap.value.handleCBData = false;
          addHistory("优化成本数据", false);
          toast.add({ title: responseError(error), color: "error" });
        });
    });
}

function buildIndexOfKingdeeFun() {
  useModalConfirm()
    .confirm(
      "是否执行全库索引重建？该操作耗时很高，结果通过企微通知。",
      "确认",
      {
        confirmButtonText: "确认",
        cancelButtonText: "取消",
        type: "warning",
      },
    )
    .then(() => {
      loadingMap.value.buildIndex = true;
      buildIndexOfKingdee(operationRequest("执行全库索引重建维护"))
        .then((response) => {
          loadingMap.value.buildIndex = false;
          const success = responseIsSuccess(response);
          const data = responseData(response);
          addHistory("重建索引", success);
          if (!success) {
            toast.add({ title: responseError(response), color: "error" });
            return;
          }
          showNotificationStatus(data);
          toast.add({
            title: `执行成功：耗时 ${data.durationMs ?? 0} ms`,
            color: "success",
          });
        })
        .catch((error) => {
          loadingMap.value.buildIndex = false;
          addHistory("重建索引", false);
          toast.add({ title: responseError(error), color: "error" });
        });
    });
}

function writeToMOFun() {
  useModalConfirm()
    .confirm("是否执行反写工序计划单号到生产订单？", "确认", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      type: "warning",
    })
    .then(() => {
      loadingMap.value.writeToMO = true;
      writeToMO(operationRequest("反写工序计划单号到生产订单"))
        .then((response) => {
          loadingMap.value.writeToMO = false;
          const success = responseIsSuccess(response);
          const data = responseData(response);
          addHistory("更新工序计划单号→生产订单", success);
          if (!success) {
            toast.add({ title: responseError(response), color: "error" });
            return;
          }
          toast.add({
            title: `执行成功：影响 ${data.affectedRows ?? 0} 行`,
            color: "success",
          });
        })
        .catch((error) => {
          loadingMap.value.writeToMO = false;
          addHistory("更新工序计划单号→生产订单", false);
          toast.add({ title: responseError(error), color: "error" });
        });
    });
}
</script>

<style scoped>
.kingdee-maintenance-page {
  --esql-tag-normal-bg: color-mix(in srgb, #3b82f6 12%, var(--app-surface));
  --esql-tag-normal-text: #2563eb;
  --esql-tag-danger-bg: color-mix(in srgb, #ef4444 12%, var(--app-surface));
  --esql-tag-danger-text: #dc2626;
  --esql-tag-slow-bg: color-mix(in srgb, #f59e0b 12%, var(--app-surface));
  --esql-tag-slow-text: #d97706;
  --esql-success: #16a34a;
  --esql-danger: #dc2626;

  padding: 16px;
  background: var(--app-bg);
  color: var(--app-text);
  min-height: calc(100vh - 84px);
}

.page-intro {
  margin-bottom: 16px;
}

.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: var(--app-text);
}

.page-desc {
  margin: 0;
  font-size: 13px;
  color: var(--app-page-text-muted);
}

.op-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 14px;
}

.op-card {
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 16px 18px;
  box-shadow: 0 1px 2px var(--app-shadow);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.op-card:hover {
  border-color: var(--app-page-accent-border);
  box-shadow: 0 4px 12px var(--app-shadow);
}

.op-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.op-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.op-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
  border: 1px solid transparent;
}

.tag-normal {
  background: var(--esql-tag-normal-bg);
  color: var(--esql-tag-normal-text);
  border-color: color-mix(
    in srgb,
    var(--esql-tag-normal-text) 22%,
    transparent
  );
}

.tag-danger {
  background: var(--esql-tag-danger-bg);
  color: var(--esql-tag-danger-text);
  border-color: color-mix(
    in srgb,
    var(--esql-tag-danger-text) 22%,
    transparent
  );
}

.tag-slow {
  background: var(--esql-tag-slow-bg);
  color: var(--esql-tag-slow-text);
  border-color: color-mix(in srgb, var(--esql-tag-slow-text) 22%, transparent);
}

.op-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--app-page-text-muted);
  line-height: 1.5;
}

.op-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.history-section {
  margin-top: 20px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 16px 18px;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
  margin-bottom: 12px;
}

.history-section :deep(.nuxt-timeline-item__content) {
  color: var(--app-text);
}

.history-section :deep(.nuxt-timeline-item__timestamp) {
  color: var(--app-page-text-muted);
}

.text-success {
  color: var(--esql-success);
  margin-left: 6px;
}

.text-danger {
  color: var(--esql-danger);
  margin-left: 6px;
}

@media (max-width: 767px) {
  .kingdee-maintenance-page {
    padding: 12px;
  }

  .op-grid {
    grid-template-columns: 1fr;
  }
}
</style>
