<template>
  <div
    class="absolute inset-0 overflow-y-auto p-6 bg-neutral-50 dark:bg-neutral-950"
  >
    <!-- Dashboard Stats Overview Banner -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
      <UCard
        class="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-2xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
        :ui="{ body: '!p-0 sm:!p-0' }"
      >
        <div class="flex items-center p-5 px-6">
          <div
            class="flex items-center justify-center w-12 h-12 rounded-xl mr-4 shrink-0 text-xl bg-blue-500/10 text-blue-500 dark:bg-blue-500/20"
          >
            <UIcon name="i-lucide-calendar" class="size-5" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-2xl font-extrabold leading-tight text-neutral-900 dark:text-white">
              {{ activityTotal }}
            </div>
            <div class="text-xs font-medium mt-0.5 text-neutral-500 dark:text-neutral-400">
              全部抽奖活动
            </div>
          </div>
        </div>
      </UCard>
      <UCard
        class="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-2xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
        :ui="{ body: '!p-0 sm:!p-0' }"
      >
        <div class="flex items-center p-5 px-6">
          <div
            class="flex items-center justify-center w-12 h-12 rounded-xl mr-4 shrink-0 text-xl bg-amber-500/10 text-amber-500 dark:bg-amber-500/20"
          >
            <UIcon name="i-lucide-gift" class="size-5" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-2xl font-extrabold leading-tight text-neutral-900 dark:text-white">
              {{ selectedActivity ? prizeTotal : "-" }}
            </div>
            <div class="text-xs font-medium mt-0.5 text-neutral-500 dark:text-neutral-400">
              {{ selectedActivity ? "当前活动奖品数" : "暂未选中活动" }}
            </div>
          </div>
        </div>
      </UCard>
      <UCard
        class="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-2xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
        :ui="{ body: '!p-0 sm:!p-0' }"
      >
        <div class="flex items-center p-5 px-6">
          <div
            class="flex items-center justify-center w-12 h-12 rounded-xl mr-4 shrink-0 text-xl bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20"
          >
            <UIcon name="i-lucide-check-circle" class="size-5" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-2xl font-extrabold leading-tight text-neutral-900 dark:text-white">
              {{ recordTotal }}
            </div>
            <div class="text-xs font-medium mt-0.5 text-neutral-500 dark:text-neutral-400">
              累计参与中奖人次
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Row 1: 活动配置 Card -->
    <UCard
      class="mb-5 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-xl"
      :ui="{
        header: 'p-4 border-b border-neutral-200 dark:border-neutral-800',
        body: 'p-5',
      }"
    >
      <template #header>
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-calendar" class="size-5 text-blue-500" />
            <span
              class="text-base font-bold flex items-center gap-2 text-neutral-800 dark:text-neutral-100"
              >抽奖活动配置</span
            >
          </div>
          <span class="text-xs text-neutral-400 dark:text-neutral-500"
            >单击行可选中并管理其奖品池，双击行可编辑活动</span
          >
        </div>
      </template>

      <TkSearchPanel
        :model="activityQueryParams"
        inline
        panel-class="mb-5"
      >
        <UInput
          v-model="activityQueryParams.title"
          placeholder="请输入活动名称"
          class="w-64"
          clearable
          @keyup.enter="handleActivityQuery"
        />
        <USelect
          v-model="activityQueryParams.status"
          placeholder="活动状态"
          class="w-36"
          clearable
          :items="[
            { label: '正常', value: '0' },
            { label: '停用', value: '1' },
          ]"
        />
        <UButton
          color="primary"
          icon="i-lucide-search"
          @click="handleActivityQuery"
          >搜索</UButton
        >
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          @click="resetActivityQuery"
          >重置</UButton
        >
        <template #actions>
          <div class="tk-search-actions">
          <UButton
            color="primary"
            variant="solid"
            icon="i-lucide-plus"
            @click="handleActivityAdd"
            >新增活动</UButton
          >
          </div>
        </template>
      </TkSearchPanel>

      <TkUTable
        v-model:row-selection="activityRowSelection"
        :loading="activityLoading"
        :data="activityList"
        :columns="activityColumns"
        :ui="{ base: 'min-w-[1080px]' }"
        :get-row-id="(row) => String(row.id)"
        @row-click="handleActivityRowClick"
        @row-open="handleActivityRowDbClick"
        class="w-full"
      >
        <template #startTime-cell="{ row }">
          <span class="text-neutral-600 dark:text-neutral-300">{{
            parseTime(row.original.startTime)
          }}</span>
        </template>
        <template #endTime-cell="{ row }">
          <span class="text-neutral-600 dark:text-neutral-300">{{
            parseTime(row.original.endTime)
          }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="row.original.status === '0' ? 'success' : 'error'"
            variant="subtle"
            size="sm"
          >
            {{ row.original.status === "0" ? "开启" : "停用" }}
          </UBadge>
        </template>
        <template #links-cell="{ row }">
          <div class="flex items-center gap-1.5">
            <UButton
              variant="subtle"
              color="neutral"
              size="xs"
              icon="i-lucide-monitor"
              @click.stop="handleOpenScreen(row.original)"
              >大屏</UButton
            >
            <UButton
              variant="subtle"
              color="neutral"
              size="xs"
              icon="i-lucide-copy"
              @click.stop="handleCopyDrawLink(row.original)"
              >复制链接</UButton
            >
            <UButton
              variant="subtle"
              color="neutral"
              size="xs"
              icon="i-lucide-eye"
              @click.stop="handlePreviewDraw(row.original)"
              >预览</UButton
            >
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex items-center gap-1.5">
            <UButton
              variant="ghost"
              color="primary"
              size="xs"
              icon="i-lucide-edit"
              @click.stop="handleActivityUpdate(row.original)"
              >修改</UButton
            >
            <UButton
              variant="ghost"
              color="red"
              size="xs"
              icon="i-lucide-trash-2"
              @click.stop="handleActivityDelete(row.original)"
              >删除</UButton
            >
          </div>
        </template>
      </TkUTable>

      <TkPagination
        v-show="activityTotal > 0"
        :total="activityTotal"
        v-model:page="activityQueryParams.pageNum"
        v-model:page-size="activityQueryParams.pageSize"
        :page-sizes="[10, 20, 50, 100]"
        @pagination="getActivityList"
      />
    </UCard>

    <!-- Row 2: 奖品池配置 Card -->
    <UCard
      class="mb-5 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-xl"
      :ui="{
        header: 'p-4 border-b border-neutral-200 dark:border-neutral-800',
        body: 'p-5',
      }"
    >
      <template #header>
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-gift" class="size-5 text-amber-500" />
            <span
              class="text-base font-bold flex items-center gap-2 text-neutral-800 dark:text-neutral-100"
              >奖品池配置</span
            >
            <UBadge v-if="selectedActivity" color="primary" variant="soft" size="sm">
              当前活动：{{ selectedActivity.title }}
            </UBadge>
          </div>
          <span
            class="text-xs text-neutral-400 dark:text-neutral-500"
            v-if="!selectedActivity"
            >* 请先在上方活动列表中单击选中一个活动</span
          >
        </div>
      </template>

      <div>
        <TkSearchPanel
          :model="prizeQueryParams"
          inline
          panel-class="mb-5"
        >
          <UInput
            v-model="prizeQueryParams.prizeName"
            placeholder="请输入奖品名称"
            class="w-64"
            clearable
            @keyup.enter="handlePrizeQuery"
            :disabled="!selectedActivity"
          />
          <UButton
            color="primary"
            icon="i-lucide-search"
            @click="handlePrizeQuery"
            :disabled="!selectedActivity"
            >搜索</UButton
          >
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            @click="resetPrizeQuery"
            :disabled="!selectedActivity"
            >重置</UButton
          >
          <template #actions>
            <div v-if="selectedActivity" class="tk-search-actions">
            <UButton
              color="primary"
              variant="solid"
              icon="i-lucide-plus"
              @click="handlePrizeAdd"
              >新增奖品</UButton
            >
            <UButton
              color="red"
              variant="outline"
              icon="i-lucide-refresh-ccw"
              @click="handleResetPrizeQty"
              >重置奖品数量</UButton
            >
            </div>
          </template>
        </TkSearchPanel>

        <UAlert
          v-if="selectedActivity"
          color="warning"
          variant="soft"
          icon="i-lucide-info"
          description="点击PK规则：第1~3名按名次发放一~三等奖实物；其余名次及库存不足时均为谢谢参与。"
          class="mb-4"
        />

        <div
          v-if="selectedActivity && prizePreviewText"
          class="mb-4 p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50"
        >
          <div
            class="text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2"
          >
            用户端奖项预览（随奖池自动更新，不展示数量）
          </div>
          <pre
            class="text-xs font-mono text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap m-0 leading-relaxed font-sans"
            >{{ prizePreviewText }}</pre
          >
        </div>

        <TkUTable
          :interactive="false"
          :loading="prizeLoading"
          :data="prizeList"
          :columns="prizeColumns"
          :ui="{ base: 'min-w-[1120px]' }"
          class="w-full"
        >
          <template #activityId-cell="{ row }">
            <span class="text-neutral-600 dark:text-neutral-400">{{
              activityMap[row.original.activityId] || "活动#" + row.original.activityId
            }}</span>
          </template>
          <template #prizeType-cell="{ row }">
            <UBadge
              v-if="row.original.prizeType === '0' || !row.original.prizeType"
              color="primary"
              variant="subtle"
              size="sm"
              >实物奖品</UBadge
            >
            <UBadge
              v-else-if="row.original.prizeType === '2'"
              color="neutral"
              variant="subtle"
              size="sm"
              >谢谢参与</UBadge
            >
            <UBadge v-else color="neutral" variant="outline" size="sm"
              >已停</UBadge
            >
          </template>
          <template #isFallback-cell="{ row }">
            <UBadge
              :color="row.original.isFallback === '1' ? 'error' : 'neutral'"
              variant="subtle"
              size="sm"
            >
              {{ row.original.isFallback === "1" ? "兜底参与奖" : "普通奖项" }}
            </UBadge>
          </template>
          <template #remainQty-cell="{ row }">
            <span
              :class="
                row.original.remainQty <= 5
                  ? 'text-red-500 font-bold'
                  : 'text-emerald-500 font-bold'
              "
              >{{ row.original.remainQty }}</span
            >
          </template>
          <template #prizeIcon-cell="{ row }">
            <div class="flex items-center justify-center gap-2">
              <span
                class="inline-block w-4 h-4 rounded-full border border-neutral-200 dark:border-neutral-700 align-middle"
                :style="{ backgroundColor: row.original.prizeIcon }"
              ></span>
              <span
                class="text-xs font-mono text-neutral-500 dark:text-neutral-400"
                >{{ row.original.prizeIcon }}</span
              >
            </div>
          </template>
          <template #status-cell="{ row }">
            <UBadge
              :color="row.original.status === '0' ? 'success' : 'error'"
              variant="subtle"
              size="sm"
            >
              {{ row.original.status === "0" ? "启用" : "禁用" }}
            </UBadge>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex items-center gap-1.5">
              <UButton
                variant="ghost"
                color="primary"
                size="xs"
                icon="i-lucide-edit"
                @click.stop="handlePrizeUpdate(row.original)"
                >修改</UButton
              >
              <UButton
                variant="ghost"
                color="red"
                size="xs"
                icon="i-lucide-trash-2"
                @click.stop="handlePrizeDelete(row.original)"
                >删除</UButton
              >
            </div>
          </template>
        </TkUTable>

        <TkPagination
          v-show="prizeTotal > 0"
          :total="prizeTotal"
          v-model:page="prizeQueryParams.pageNum"
          v-model:page-size="prizeQueryParams.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          @pagination="getPrizeList"
        />
      </div>
    </UCard>

    <!-- Row 3: 中奖与核销记录 Card -->
    <UCard
      class="mb-5 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-xl"
      :ui="{
        header: 'p-4 border-b border-neutral-200 dark:border-neutral-800',
        body: 'p-5',
      }"
    >
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-list" class="size-5 text-blue-500" />
          <span
            class="text-base font-bold flex items-center gap-2 text-neutral-800 dark:text-neutral-100"
            >中奖与核销记录</span
          >
        </div>
      </template>

      <!-- Coupon Validation Panel -->
      <div
        class="mb-5 p-4 rounded-lg border-l-4 border-blue-500 bg-blue-500/5 dark:bg-blue-500/10"
      >
        <UForm
          :state="redeemForm"
          class="flex flex-wrap items-center gap-3"
        >
          <UInput
            v-model="redeemForm.redeemCode"
            placeholder="扫描或输入核销码(如：1205ABCD)"
            class="w-80"
            size="lg"
            clearable
            @keyup.enter="handleRedeemCode"
          />
          <UButton
            color="primary"
            size="lg"
            icon="i-lucide-check-circle"
            @click="handleRedeemCode"
            >立即兑奖核销</UButton
          >
        </UForm>
      </div>

      <TkSearchPanel
        :model="recordQueryParams"
        inline
        panel-class="mb-5"
      >
        <USelect
          v-model="recordQueryParams.activityId"
          placeholder="选择活动"
          class="w-56"
          clearable
          :items="allActivities.map((a) => ({ label: a.title, value: a.id }))"
        />
        <UInput
          v-model="recordQueryParams.userPhone"
          placeholder="手机号"
          class="w-44"
          clearable
        />
        <USelect
          v-model="recordQueryParams.winStatus"
          placeholder="状态"
          class="w-44"
          clearable
          :items="[
            { label: '未中奖', value: '0' },
            { label: '中奖未兑奖', value: '1' },
            { label: '已核销领奖', value: '2' },
          ]"
        />
        <UInput
          v-model="recordQueryParams.redeemCode"
          placeholder="输入核销兑换码"
          class="w-44"
          clearable
        />
        <UButton
          color="primary"
          icon="i-lucide-search"
          @click="handleRecordQuery"
          >搜索</UButton
        >
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          @click="resetRecordQuery"
          >重置</UButton
        >
        <template #actions>
          <div class="tk-search-actions">
            <UButton
              color="warning"
              variant="outline"
              icon="i-lucide-download"
              @click="handleExport"
              >导出 Excel</UButton
            >
          </div>
        </template>
      </TkSearchPanel>

      <TkUTable
        :interactive="false"
        :loading="recordLoading"
        :data="recordList"
        :columns="recordColumns"
        :ui="{ base: 'min-w-[980px]' }"
        class="w-full"
      >
        <template #activityId-cell="{ row }">
          <span class="text-neutral-600 dark:text-neutral-400">{{
            activityMap[row.original.activityId] || "活动#" + row.original.activityId
          }}</span>
        </template>
        <template #userPhone-cell="{ row }">
          <span
            class="inline-block whitespace-nowrap tabular-nums tracking-wide text-neutral-700 dark:text-neutral-300 font-mono"
            >{{ row.original.userPhone || "-" }}</span
          >
        </template>
        <template #winStatus-cell="{ row }">
          <UBadge
            v-if="row.original.winStatus === '0'"
            color="neutral"
            variant="subtle"
            size="sm"
            >谢谢参与</UBadge
          >
          <UBadge
            v-else-if="row.original.winStatus === '1'"
            color="warning"
            variant="subtle"
            size="sm"
            >已中奖(未领)</UBadge
          >
          <UBadge
            v-else-if="row.original.winStatus === '2'"
            color="success"
            variant="subtle"
            size="sm"
            >已领奖(已核销)</UBadge
          >
        </template>
        <template #redeemCode-cell="{ row }">
          <span
            class="font-mono font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded text-xs dark:bg-red-500/15 dark:text-red-400"
            >{{ row.original.redeemCode || "-" }}</span
          >
        </template>
        <template #drawTime-cell="{ row }">
          <span class="text-xs text-neutral-500 dark:text-neutral-400">{{
            parseTime(row.original.drawTime)
          }}</span>
        </template>
        <template #redeemTime-cell="{ row }">
          <span class="text-xs text-neutral-500 dark:text-neutral-400">{{
            row.original.redeemTime ? parseTime(row.original.redeemTime) : "-"
          }}</span>
        </template>
        <template #updateBy-cell="{ row }">
          <span class="text-xs text-neutral-500 dark:text-neutral-400">{{
            row.original.updateBy || "-"
          }}</span>
        </template>
      </TkUTable>

      <TkPagination
        v-show="recordTotal > 0"
        :total="recordTotal"
        v-model:page="recordQueryParams.pageNum"
        v-model:page-size="recordQueryParams.pageSize"
        :page-sizes="[10, 20, 50, 100]"
        @pagination="getRecordList"
      />
    </UCard>

    <!-- Activity Add/Edit Dialog -->
    <UModal
      v-model:open="activityOpen"
      :title="activityDialogTitle"
      :ui="{ content: 'sm:max-w-[550px]' }"
    >
      <template #body>
        <UForm
          ref="activityFormRef"
          :state="activityForm"
          :validate="validateActivityForm"
          class="space-y-4"
        >
          <UFormField label="活动名称" name="title">
            <UInput v-model="activityForm.title" placeholder="请输入活动名称" />
          </UFormField>
          <UFormField label="开始时间" name="startTime">
            <UInput
              v-model="activityForm.startTime"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>
          <UFormField label="结束时间" name="endTime">
            <UInput
              v-model="activityForm.endTime"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>
          <UFormField label="活动状态" name="status">
            <URadioGroup
              v-model="activityForm.status"
              :items="[
                { label: '正常开启', value: '0' },
                { label: '停用暂停', value: '1' },
              ]"
            />
          </UFormField>
          <UFormField label="参与规则与兑奖说明" name="description">
            <UTextarea
              v-model="activityForm.description"
              :rows="4"
              placeholder="请输入参与规则与兑奖说明；奖项设置由奖池自动生成，无需在此填写数量"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            @click="activityOpen = false"
            >取消</UButton
          >
          <UButton color="primary" @click="submitActivityForm">确定</UButton>
        </div>
      </template>
    </UModal>

    <!-- Prize Add/Edit Dialog -->
    <UModal
      v-model:open="prizeOpen"
      :title="prizeDialogTitle"
      :ui="{ content: 'sm:max-w-[500px]' }"
    >
      <template #body>
        <UForm
          ref="prizeFormRef"
          :state="prizeForm"
          :validate="validatePrizeForm"
          class="space-y-4"
        >
          <UFormField label="所属活动">
            <UInput
              :value="
                activityMap[prizeForm.activityId] ||
                '活动#' + prizeForm.activityId
              "
              disabled
            />
          </UFormField>
          <UFormField label="奖品类型">
            <URadioGroup
              v-model="prizeForm.prizeType"
              :items="[
                { label: '实物奖品', value: '0' },
                { label: '谢谢参与', value: '2' },
              ]"
              @change="handlePrizeTypeChange"
            />
          </UFormField>
          <UFormField label="奖品名称" name="prizeName">
            <UInput
              v-model="prizeForm.prizeName"
              placeholder="例如：无线充、谢谢参与"
            />
          </UFormField>
          <UFormField label="奖品等级" name="prizeLevel">
            <UInput
              v-model="prizeForm.prizeLevel"
              placeholder="一等奖~五等奖，或参与奖"
            />
          </UFormField>
          <UFormField label="兜底机制">
            <URadioGroup
              v-model="prizeForm.isFallback"
              :items="[
                { label: '普通奖项', value: '0' },
                { label: '兜底参与奖', value: '1' },
              ]"
            />
            <div class="text-xs text-amber-500 mt-1 leading-relaxed">
              *
              仅「谢谢参与」需勾选兜底。实物奖发完后，未中奖玩家自动获得该兜底奖。
            </div>
          </UFormField>
          <UFormField label="总数" name="totalQty">
            <UInput
              type="number"
              v-model="prizeForm.totalQty"
              :min="1"
              :max="99999"
              placeholder="奖品总份数"
            />
          </UFormField>
          <UFormField label="剩余库存" name="remainQty" v-if="prizeForm.id">
            <UInput
              type="number"
              v-model="prizeForm.remainQty"
              :min="0"
              :max="prizeForm.totalQty"
              placeholder="当前剩余可用数量"
            />
          </UFormField>
          <UFormField label="展示颜色" name="prizeIcon">
            <div class="flex items-center gap-3">
              <UColorPicker
                v-model="prizeForm.prizeIcon"
              />
              <div class="flex flex-wrap gap-1.5">
                <UButton
                  v-for="color in prizeColorPresets"
                  :key="color"
                  type="button"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="`选择颜色 ${color}`"
                  class="size-6 rounded-full p-0 ring-1 ring-inset ring-neutral-300 dark:ring-neutral-700"
                  :style="{ backgroundColor: color }"
                  @click="prizeForm.prizeIcon = color"
                />
              </div>
              <UInput
                v-model="prizeForm.prizeIcon"
                placeholder="#HEX 颜色编码"
                class="w-40"
              />
            </div>
          </UFormField>
          <UFormField label="启用状态">
            <URadioGroup
              v-model="prizeForm.status"
              :items="[
                { label: '启用', value: '0' },
                { label: '禁用', value: '1' },
              ]"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="prizeOpen = false"
            >取消</UButton
          >
          <UButton color="primary" @click="submitPrizeForm">确定</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import { TkPagination, TkSearchPanel, TkUTable } from "@ctk-system/ui";

// 消息提示桥接
function nuxtMsg(message, color = "neutral") {
  const t = typeof window !== "undefined" ? window.__nuxt_ui_toast__ : null;
  if (t) t.add({ title: String(message), color, duration: 4000 });
}
function nuxtConfirm(content, title) {
  return new Promise((resolve, reject) => {
    if (
      typeof window !== "undefined" &&
      window.confirm(String(content || title))
    ) {
      resolve("confirm");
    } else {
      reject(new Error("cancel"));
    }
  });
}


// System utilities
// Date formatting helper
const parseTime = (time) => {
  if (!time) return "";
  const date = new Date(time);
  const format = (n) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${format(date.getMonth() + 1)}-${format(date.getDate())} ${format(date.getHours())}:${format(date.getMinutes())}:${format(date.getSeconds())}`;
};

const prizeColorPresets = [
  "#e84118",
  "#fbc531",
  "#ffeaa7",
  "#f85c5c",
  "#f5f6fa",
  "#70a1ff",
  "#2ed573",
];

const activityColumns = [
  { accessorKey: "title", header: "活动名称" },
  { accessorKey: "startTime", header: "开始时间" },
  { accessorKey: "endTime", header: "结束时间" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "links", header: "链接入口" },
  { accessorKey: "actions", header: "操作" },
];

const prizeColumns = [
  { accessorKey: "activityId", header: "所属活动" },
  { accessorKey: "prizeName", header: "奖品名称" },
  { accessorKey: "prizeLevel", header: "奖品等级" },
  { accessorKey: "prizeType", header: "奖品类型" },
  { accessorKey: "isFallback", header: "是否兜底" },
  { accessorKey: "remainQty", header: "剩余库存" },
  { accessorKey: "prizeIcon", header: "展示颜色" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "actions", header: "操作" },
];

const recordColumns = [
  { accessorKey: "activityId", header: "活动" },
  { accessorKey: "userPhone", header: "手机号" },
  { accessorKey: "winStatus", header: "中奖状态" },
  { accessorKey: "redeemCode", header: "核销码" },
  { accessorKey: "drawTime", header: "抽奖时间" },
  { accessorKey: "redeemTime", header: "核销时间" },
  { accessorKey: "updateBy", header: "核销人" },
];

// State
const allActivities = ref([]);
const selectedActivity = ref(null);
const activityRowSelection = ref({});

// Computed dictionary of activity title by ID for instant O(1) lookups
const activityMap = computed(() => {
  const map = {};
  allActivities.value.forEach((act) => {
    map[act.id] = act.title;
  });
  return map;
});

const prizePreviewText = computed(() => {
  const enabledPrizes = (prizePreviewList.value || []).filter(
    (p) => p.status === "0" && p.prizeType !== "1",
  );
  if (enabledPrizes.length === 0) {
    return "";
  }
  return buildPrizeSettingsText(enabledPrizes);
});

// Activity table row click (select / deselect)
const handleActivityRowClick = (row) => {
  if (selectedActivity.value && selectedActivity.value.id === row.id) {
    // Deselect
    selectedActivity.value = null;
    activityRowSelection.value = {};
    prizeQueryParams.value.activityId = undefined;
    prizeList.value = [];
    prizeTotal.value = 0;
  } else {
    // Select
    selectedActivity.value = row;
    activityRowSelection.value = { [String(row.id)]: true };
    prizeQueryParams.value.activityId = row.id;
    getPrizeList();
  }
};

// Activity table row double click (edit dialog)
const handleActivityRowDbClick = (row) => {
  handleActivityUpdate(row);
};

// ------------------------------------------
// 1. 活动管理 (Activity Tab)
// ------------------------------------------
const activityList = ref([]);
const activityTotal = ref(0);
const activityLoading = ref(false);
const activityOpen = ref(false);
const activityDialogTitle = ref("");
const activityForm = ref({
  id: undefined,
  title: "",
  startTime: "",
  endTime: "",
  drawLimit: 99,
  status: "0",
  description: "",
});
const activityQueryParams = ref({
  pageNum: 1,
  pageSize: 10,
  title: "",
  status: "",
});
const activityFormRef = ref(null);

const validateActivityForm = (state) => {
  const errors = [];
  if (!String(state.title || "").trim()) {
    errors.push({ name: "title", message: "活动名称不能为空" });
  }
  if (!state.startTime) {
    errors.push({ name: "startTime", message: "请选择开始时间" });
  }
  if (!state.endTime) {
    errors.push({ name: "endTime", message: "请选择结束时间" });
  }
  return errors;
};

const getActivityList = async () => {
  activityLoading.value = true;
  try {
    const res = await listActivity(activityQueryParams.value);
    activityList.value = res.rows;
    activityTotal.value = res.total;

    // Auto-select first activity by default if none is currently selected
    if (activityList.value && activityList.value.length > 0) {
      const stillExists =
        selectedActivity.value &&
        activityList.value.some((a) => a.id === selectedActivity.value.id);
      if (!stillExists) {
        const firstRow = activityList.value[0];
        selectedActivity.value = firstRow;
        prizeQueryParams.value.activityId = firstRow.id;
        getPrizeList();
        activityRowSelection.value = { [String(firstRow.id)]: true };
      }
      if (stillExists) {
        activityRowSelection.value = { [String(selectedActivity.value.id)]: true };
      }
    } else {
      selectedActivity.value = null;
      activityRowSelection.value = {};
      prizeQueryParams.value.activityId = undefined;
      prizeList.value = [];
      prizeTotal.value = 0;
    }
  } catch (e) {
    console.error(e);
  } finally {
    activityLoading.value = false;
  }
};

// Fetch all activities helper (for dropdown filters)
const getAllActivitiesDropdown = async () => {
  try {
    const res = await listActivity({ pageNum: 1, pageSize: 100 });
    allActivities.value = res.rows;
  } catch (e) {
    console.error(e);
  }
};

const handleActivityQuery = () => {
  activityQueryParams.value.pageNum = 1;
  getActivityList();
};

const resetActivityQuery = () => {
  activityQueryParams.value = {
    pageNum: 1,
    pageSize: 10,
    title: "",
    status: "",
  };
  handleActivityQuery();
};

const resetActivityForm = () => {
  activityForm.value = {
    id: undefined,
    title: "",
    startTime: "",
    endTime: "",
    drawLimit: 99,
    status: "0",
    description: "",
  };
  activityFormRef.value?.clear();
};

const toDateTimeInputValue = (value) => {
  if (!value) return "";
  return String(value).replace(" ", "T").slice(0, 16);
};

const toApiDateTimeValue = (value) => {
  if (!value) return "";
  const normalized = String(value).replace("T", " ");
  return normalized.length === 16 ? `${normalized}:00` : normalized;
};

const handleActivityAdd = () => {
  resetActivityForm();
  activityDialogTitle.value = "添加抽奖活动";
  activityOpen.value = true;
};

const handleOpenScreen = (row) => {
  const url = window.location.origin + "/lucky-screen?activityId=" + row.id;
  window.open(url, "_blank");
};

const handlePreviewDraw = (row) => {
  const url = window.location.origin + "/lucky-draw?activityId=" + row.id;
  window.open(url, "_blank");
};

const handleCopyDrawLink = (row) => {
  const url =
    window.location.origin +
    "/prod-api/tk_custom/lucky/public/loginByWx?activityId=" +
    row.id;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        nuxtMsg("微信菜单入口链接已成功复制到剪贴板！", "success");
      })
      .catch((err) => {
        console.error(err);
        fallbackCopyText(url);
      });
  } else {
    fallbackCopyText(url);
  }
};

const fallbackCopyText = (text) => {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand("copy");
    nuxtMsg("微信菜单入口链接已复制到剪贴板！", "success");
  } catch (err) {
    nuxtMsg("复制失败，请手动选择复制：" + text, "error");
  }
  document.body.removeChild(textArea);
};

const handleActivityUpdate = async (row) => {
  resetActivityForm();
  try {
    const res = await getActivity(row.id);
    activityForm.value = {
      ...res.data,
      startTime: toDateTimeInputValue(res.data?.startTime),
      endTime: toDateTimeInputValue(res.data?.endTime),
    };
    activityDialogTitle.value = "修改抽奖活动";
    activityOpen.value = true;
  } catch (e) {
    console.error(e);
  }
};

const submitActivityForm = async () => {
  try {
    await activityFormRef.value?.validate();
    const payload = {
      ...activityForm.value,
      startTime: toApiDateTimeValue(activityForm.value.startTime),
      endTime: toApiDateTimeValue(activityForm.value.endTime),
    };
    const res = payload.id !== undefined
      ? await updateActivity(payload)
      : await addActivity(payload);
    if (res.code === 200) {
      nuxtMsg(payload.id !== undefined ? "修改成功" : "新增成功", "success");
      activityOpen.value = false;
      getActivityList();
      getAllActivitiesDropdown();
    }
  } catch (e) {
    console.error(e);
  }
};

const handleActivityDelete = (row) => {
  nuxtConfirm(
    '是否确认删除活动名称丟"' + row.title + '" 的抽奖活动数损',
    "警告",
    {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    },
  )
    .then(async () => {
      try {
        const res = await delActivity(row.id);
        if (res.code === 200) {
          nuxtMsg("删除成功", "success");
          getActivityList();
          getAllActivitiesDropdown();
        }
      } catch (e) {
        console.error(e);
      }
    })
    .catch(() => {});
};

// ------------------------------------------
// 2. 奖品管理 (Prize Tab)
// ------------------------------------------
const prizeList = ref([]);
const prizePreviewList = ref([]);
const prizeTotal = ref(0);
const prizeLoading = ref(false);
const prizeOpen = ref(false);
const prizeDialogTitle = ref("");
const prizeForm = ref({
  id: undefined,
  activityId: undefined,
  prizeName: "",
  prizeLevel: "",
  cashAmount: undefined,
  totalQty: 10,
  remainQty: 10,
  probability: 0,
  prizeIcon: "#fbc531",
  status: "0",
  prizeType: "0",
  isFallback: "0",
});
const prizeQueryParams = ref({
  pageNum: 1,
  pageSize: 10,
  activityId: undefined,
  prizeName: "",
});
const prizeFormRef = ref(null);

const validatePrizeForm = (state) => {
  const errors = [];
  if (!String(state.prizeName || "").trim()) {
    errors.push({ name: "prizeName", message: "奖品名称不能为空" });
  }
  if (!String(state.prizeLevel || "").trim()) {
    errors.push({ name: "prizeLevel", message: "奖品等级不能为空" });
  }
  const totalQty = Number(state.totalQty);
  if (!Number.isInteger(totalQty) || totalQty < 1 || totalQty > 99999) {
    errors.push({ name: "totalQty", message: "总数必须是 1~99999 的整数" });
  }
  if (state.id) {
    const remainQty = Number(state.remainQty);
    if (!Number.isInteger(remainQty) || remainQty < 0 || remainQty > totalQty) {
      errors.push({ name: "remainQty", message: "剩余库存必须介于 0 和总数之间" });
    }
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(String(state.prizeIcon || ""))) {
    errors.push({ name: "prizeIcon", message: "请输入有效的 HEX 颜色编码" });
  }
  return errors;
};

const loadPrizePreviewList = async (activityId) => {
  if (!activityId) {
    prizePreviewList.value = [];
    return;
  }
  try {
    const res = await listPrize({
      pageNum: 1,
      pageSize: 200,
      activityId,
    });
    prizePreviewList.value = res.rows || [];
  } catch (e) {
    console.error(e);
    prizePreviewList.value = [];
  }
};

const getPrizeList = async () => {
  if (!prizeQueryParams.value.activityId) {
    prizeList.value = [];
    prizePreviewList.value = [];
    prizeTotal.value = 0;
    return;
  }
  prizeLoading.value = true;
  try {
    const res = await listPrize(prizeQueryParams.value);
    prizeList.value = res.rows;
    prizeTotal.value = res.total;
    await loadPrizePreviewList(prizeQueryParams.value.activityId);
  } catch (e) {
    console.error(e);
  } finally {
    prizeLoading.value = false;
  }
};

const handlePrizeQuery = () => {
  prizeQueryParams.value.pageNum = 1;
  getPrizeList();
};

const resetPrizeQuery = () => {
  const currentActId = prizeQueryParams.value.activityId;
  prizeQueryParams.value = {
    pageNum: 1,
    pageSize: 10,
    activityId: currentActId,
    prizeName: "",
  };
  handlePrizeQuery();
};

const handlePrizeTypeChange = (type) => {
  if (type === "2") {
    prizeForm.value.prizeLevel = "参与奖";
    prizeForm.value.prizeName = "谢谢参与";
    prizeForm.value.isFallback = "1";
    prizeForm.value.cashAmount = undefined;
  } else if (type === "0" && !prizeForm.value.prizeLevel) {
    prizeForm.value.prizeLevel = "一等奖";
  }
};

const resetPrizeForm = () => {
  prizeForm.value = {
    id: undefined,
    activityId: prizeQueryParams.value.activityId,
    prizeName: "",
    prizeLevel: "",
    cashAmount: undefined,
    totalQty: 10,
    remainQty: 10,
    probability: 0,
    prizeIcon: "#fbc531",
    status: "0",
    prizeType: "0",
    isFallback: "0",
  };
  prizeFormRef.value?.clear();
};

const handlePrizeAdd = () => {
  if (!prizeQueryParams.value.activityId) {
    nuxtMsg("请先选择一个所属活动再进行奖品新增", "warning");
    return;
  }
  resetPrizeForm();
  prizeDialogTitle.value = "新增奖品配置";
  prizeOpen.value = true;
};

const handlePrizeUpdate = async (row) => {
  resetPrizeForm();
  if (!row || !row.id) {
    nuxtMsg("无法修改：奖品ID为空", "error");
    return;
  }
  try {
    const res = await getPrize(row.id);
    if (res && res.code === 200) {
      const data = res.data || {};
      if (
        data.prizeType === null ||
        data.prizeType === undefined ||
        data.prizeType === "1"
      ) {
        data.prizeType = data.prizeType === "2" ? "2" : "0";
      }
      if (data.isFallback === null || data.isFallback === undefined) {
        data.isFallback = "0";
      }
      prizeForm.value = data;
      prizeDialogTitle.value = "修改奖品配置";
      prizeOpen.value = true;
    } else {
      nuxtMsg("获取奖品详情失败：" + (res ? res.msg : "未知错误"), "error");
    }
  } catch (e) {
    console.error("getPrize error:", e);
    nuxtMsg("获取奖品详情异常：" + (e.message || e), "error");
  }
};

const submitPrizeForm = async () => {
  if (prizeForm.value.prizeType === "2") {
    prizeForm.value.isFallback = "1";
    if (!prizeForm.value.prizeName) {
      prizeForm.value.prizeName = "谢谢参与";
    }
    if (!prizeForm.value.prizeLevel) {
      prizeForm.value.prizeLevel = "参与奖";
    }
  }
  try {
    await prizeFormRef.value?.validate();
  } catch {
    return;
  }

  try {
    if (prizeForm.value.id !== undefined) {
      const res = await updatePrize(prizeForm.value);
      if (res.code === 200) {
        nuxtMsg("修改成功", "success");
        prizeOpen.value = false;
        getPrizeList();
      }
    } else {
      const res = await addPrize(prizeForm.value);
      if (res.code === 200) {
        nuxtMsg("新增成功", "success");
        prizeOpen.value = false;
        getPrizeList();
      }
    }
  } catch (e) {
    console.error(e);
  }
};

const handlePrizeDelete = (row) => {
  const isFallbackPrize = row.isFallback === "1";
  const message = isFallbackPrize
    ? `？{row.prizeName}」是兜底参与奖，实物奖发完后会自动发放。每个活动至少需保留一个启用的兜底奖，确定删除吗？`
    : `是否确认删除奖品？{row.prizeName}」？`;
  nuxtConfirm(message, "警告", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(async () => {
      try {
        const res = await delPrize(row.id);
        if (res.code === 200) {
          nuxtMsg("删除成功", "success");
          getPrizeList();
        }
      } catch (e) {
        console.error(e);
      }
    })
    .catch(() => {});
};

const handleResetPrizeQty = () => {
  if (!selectedActivity.value) {
    nuxtMsg("请先选择一个所属活动", "warning");
    return;
  }
  nuxtConfirm(
    "确定要重置当前活动「" +
      selectedActivity.value.title +
      "」的所有奖品剩余数量为初始总数量吗？",
    "警告",
    {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    },
  )
    .then(async () => {
      try {
        const res = await resetPrizeQty(selectedActivity.value.id);
        if (res.code === 200) {
          nuxtMsg(res.msg || "重置成功", "success");
          getPrizeList();
        } else {
          nuxtMsg(res.msg || "重置失败", "error");
        }
      } catch (e) {
        console.error(e);
      }
    })
    .catch(() => {});
};

// ------------------------------------------
// 3. 中奖核销记录 (Record Tab)
// ------------------------------------------
const recordList = ref([]);
const recordTotal = ref(0);
const recordLoading = ref(false);
const recordQueryParams = ref({
  pageNum: 1,
  pageSize: 10,
  activityId: undefined,
  userPhone: "",
  winStatus: "",
  redeemCode: "",
});
const redeemForm = ref({
  redeemCode: "",
});

const getRecordList = async () => {
  recordLoading.value = true;
  try {
    const res = await listRecord(recordQueryParams.value);
    recordList.value = res.rows;
    recordTotal.value = res.total;
  } catch (e) {
    console.error(e);
  } finally {
    recordLoading.value = false;
  }
};

const handleRecordQuery = () => {
  recordQueryParams.value.pageNum = 1;
  getRecordList();
};

const resetRecordQuery = () => {
  recordQueryParams.value = {
    pageNum: 1,
    pageSize: 10,
    activityId: undefined,
    userPhone: "",
    winStatus: "",
    redeemCode: "",
  };
  handleRecordQuery();
};

// Execution of Coupon validation
const handleRedeemCode = async () => {
  const code = redeemForm.value.redeemCode;
  if (!code || code.trim() === "") {
    nuxtMsg("请先输入兑换码进行核销", "warning");
    return;
  }

  nuxtConfirm(
    '确认要对兑奖码为 "' + code + '" 的中奖记录进行核销兑奖吟',
    "确认兑换",
    {
      confirmButtonText: "确定核销",
      cancelButtonText: "取消",
      type: "info",
    },
  )
    .then(async () => {
      try {
        const res = await redeemPrize({ redeemCode: code });
        if (res.code === 200) {
          nuxtMsg("兑换核销成功！奖品已成功派发", "success");
          redeemForm.value.redeemCode = "";
          getRecordList();
          // If prize list tab is open, reload it too
          getPrizeList();
        } else {
          nuxtMsg(res.msg || "核销失败", "error");
        }
      } catch (e) {
        console.error(e);
      }
    })
    .catch(() => {});
};

// Export excel handler
const handleExport = () => {
  nuxtMsg("正在导出中奖核销记录，请稍候..", "info");
  import("@/utils/request").then(({ download }) => {
    download(
      "tk_custom/lucky/admin/record/export",
      { ...recordQueryParams.value },
      `lucky_records_${Date.now()}.xlsx`,
    )
      .then(() => nuxtMsg("导出成功", "success"))
      .catch((err) => {
        console.error(err);
        nuxtMsg("导出失败", "error");
      });
  });
};

onMounted(() => {
  getAllActivitiesDropdown();
  getActivityList();
  getRecordList();
});
</script>
