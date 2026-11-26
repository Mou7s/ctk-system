<template>
  <div class="it-asset-page absolute inset-0 flex min-h-0 flex-col gap-3 overflow-y-auto lg:overflow-hidden p-4 bg-gray-50/70 dark:bg-gray-900">
    <!-- 顶部标题、状态统计胶囊与核心操作 -->
    <header class="shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-800 px-4 py-3 shadow-xs">
      <div class="flex flex-wrap items-center gap-3 min-w-0">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-monitor" class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-base md:text-lg font-bold text-gray-900 dark:text-white tracking-tight">IT资产管理</h1>
              <UBadge color="primary" variant="soft" size="xs" class="font-mono">70×50mm 标签</UBadge>
            </div>
            <p class="text-[11px] text-gray-500 dark:text-gray-400 hidden sm:block">公司电脑台账登记、企微部门领用关联与 70×50mm 二维码标签打印</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 pl-0 sm:pl-2 sm:border-l border-gray-200 dark:border-gray-700">
          <UButton
            v-for="pill in summaryPills"
            :key="pill.key"
            size="xs"
            :color="pill.filterStatus !== undefined && queryParams.status === pill.filterStatus ? pill.activeColor : 'neutral'"
            :variant="pill.filterStatus !== undefined && queryParams.status === pill.filterStatus ? 'solid' : 'soft'"
            :class="pill.filterStatus === undefined ? 'cursor-default' : 'cursor-pointer'"
            @click="pill.filterStatus !== undefined && applyStatusQuickFilter(pill.filterStatus)"
          >
            <span>{{ pill.label }}</span>
            <span class="ml-1 font-mono font-bold">{{ pill.count }}</span>
          </UButton>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          v-if="can('tk_custom:itAsset:add')"
          size="sm"
          color="primary"
          icon="i-lucide-plus"
          @click="openCreateModal"
        >
          新增电脑
        </UButton>
        <UButton
          v-if="canPrint"
          size="sm"
          color="primary"
          variant="soft"
          icon="i-lucide-printer"
          :disabled="selectedAssets.length === 0"
          @click="handlePrintSelected"
        >
          批量打印标签 ({{ selectedAssets.length }})
        </UButton>
        <UButton
          v-if="can('tk_custom:itAsset:edit') || can('tk_custom:itAsset:import')"
          size="sm"
          color="info"
          variant="soft"
          icon="i-lucide-refresh-cw"
          :loading="lvdunSyncLoading"
          @click="openLvDunSyncModal"
        >
          从绿盾同步
        </UButton>
        <UButton
          v-if="can('tk_custom:itAsset:import')"
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-upload"
          @click="openImportModal"
        >
          导入 Excel
        </UButton>
        <UButton
          v-if="canExport"
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-download"
          :loading="exporting"
          @click="handleExport"
        >
          导出台账
        </UButton>
        <UButton
          v-if="can('tk_custom:itAsset:remove')"
          size="sm"
          color="error"
          variant="soft"
          icon="i-lucide-trash-2"
          :disabled="selectedAssets.length === 0"
          @click="handleDeleteBatch"
        >
          批量删除 ({{ selectedAssets.length }})
        </UButton>
      </div>
    </header>

    <!-- 单行筛选工具栏 -->
    <div class="shrink-0 rounded-xl border border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-800 px-3 py-2.5 shadow-xs flex flex-wrap items-center gap-2">
      <UInput
        v-model="queryParams.keyword"
        size="sm"
        placeholder="编号 / 名称 / 型号 / SN / 使用人 / IP"
        icon="i-lucide-search"
        clearable
        class="w-full sm:w-60"
        @keyup.enter="handleQuery"
      />
      <USelect
        v-model="queryParams.deviceType"
        size="sm"
        :items="deviceTypeFilterItems"
        value-key="value"
        label-key="label"
        class="w-32"
        @update:model-value="handleQuery"
      />
      <USelect
        v-model="queryParams.status"
        size="sm"
        :items="statusFilterItems"
        value-key="value"
        label-key="label"
        class="w-28"
        @update:model-value="handleQuery"
      />
      <USelect
        v-model="queryParams.useDept"
        size="sm"
        :items="deptFilterItems"
        value-key="value"
        label-key="label"
        class="w-36"
        @update:model-value="handleQuery"
      />
      <TkDateRangePicker
        v-model="purchaseDateRange"
        size="sm"
        placeholder="购置日期范围"
        class="w-full sm:w-56"
        @update:model-value="handleQuery"
      />
      <UButton size="sm" color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
      <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
      <span class="ml-auto text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">共 {{ total }} 条</span>
      <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="loading" @click="refreshAll">
        刷新
      </UButton>
    </div>

    <!-- 主体双栏工作台 -->
    <div class="grid grid-cols-1 xl:grid-cols-12 gap-3 min-h-0 flex-1">
      <!-- 左栏：电脑资产列表 -->
      <div class="xl:col-span-8 flex flex-col min-h-[360px] xl:min-h-0 gap-2">
        <div class="flex-1 min-h-0 flex flex-col rounded-xl border border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-800 shadow-xs overflow-hidden">
          <TkUTable
            ref="tableRef"
            v-model:row-selection="rowSelection"
            :data="assetList"
            :columns="assetColumns"
            :loading="loading"
            :sticky="true"
            :get-row-id="(row) => String(row.id)"
            class="flex-1 min-h-0"
            @row-click="handleRowClick"
            @row-open="handleRowOpen"
          >
            <template #assetNo-cell="{ row }">
              <div class="flex flex-col">
                <span
                  class="font-mono font-bold text-xs"
                  :class="previewTarget?.id === row.original.id ? 'text-primary-600 dark:text-primary-400' : 'text-gray-900 dark:text-gray-100'"
                >
                  {{ row.original.assetNo }}
                </span>
                <span v-if="row.original.serialNo" class="font-mono text-[10px] text-gray-400 truncate max-w-[130px]" :title="row.original.serialNo">
                  SN: {{ row.original.serialNo }}
                </span>
              </div>
            </template>

            <template #assetName-cell="{ row }">
              <div class="flex flex-col min-w-0 max-w-[180px]">
                <span class="font-medium text-gray-900 dark:text-gray-100 truncate" :title="row.original.assetName">
                  {{ row.original.assetName }}
                </span>
                <span class="text-[11px] text-gray-500 dark:text-gray-400 truncate" :title="formatItAssetModelText(row.original)">
                  {{ formatItAssetModelText(row.original) || '未填品牌型号' }}
                </span>
              </div>
            </template>

            <template #deviceType-cell="{ row }">
              <UBadge color="neutral" variant="subtle" size="xs">
                {{ getItAssetDeviceTypeLabel(row.original.deviceType) }}
              </UBadge>
            </template>

            <template #useDept-cell="{ row }">
              <div class="flex flex-col min-w-0 max-w-[140px]">
                <span class="text-xs font-medium text-gray-800 dark:text-gray-200 truncate" :title="row.original.userName || '未分配'">
                  {{ row.original.userName || '未分配' }}
                </span>
                <span class="text-[11px] text-gray-500 dark:text-gray-400 truncate" :title="row.original.useDept || '未填部门'">
                  {{ row.original.useDept || '—' }}
                </span>
              </div>
            </template>

            <template #location-cell="{ row }">
              <span class="text-xs text-gray-700 dark:text-gray-300 truncate block max-w-[130px]" :title="row.original.location">
                {{ row.original.location || '—' }}
              </span>
            </template>

            <template #purchaseDate-cell="{ row }">
              <span class="font-mono text-xs text-gray-600 dark:text-gray-300">
                {{ row.original.purchaseDate || '—' }}
              </span>
            </template>

            <template #status-cell="{ row }">
              <UBadge :color="getItAssetStatusMeta(row.original.status).color" variant="soft" size="xs">
                {{ getItAssetStatusMeta(row.original.status).label }}
              </UBadge>
            </template>

            <template #actions-cell="{ row }">
              <div class="inline-flex items-center justify-end gap-1" @click.stop>
                <UTooltip text="预览并打印 70×50mm 标签">
                  <UButton
                    v-if="canPrint"
                    size="xs"
                    color="primary"
                    variant="soft"
                    icon="i-lucide-printer"
                    @click="handlePrintSingle(row.original)"
                  />
                </UTooltip>
                <UTooltip text="编辑">
                  <UButton
                    v-if="can('tk_custom:itAsset:edit')"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-square-pen"
                    @click="openEditModal(row.original)"
                  />
                </UTooltip>
                <UTooltip text="复制新增（沿用型号与配置）">
                  <UButton
                    v-if="can('tk_custom:itAsset:add')"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-copy-plus"
                    @click="openDuplicateModal(row.original)"
                  />
                </UTooltip>
                <UTooltip text="删除">
                  <UButton
                    v-if="can('tk_custom:itAsset:remove')"
                    size="xs"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    @click="handleDeleteSingle(row.original)"
                  />
                </UTooltip>
              </div>
            </template>
          </TkUTable>
        </div>
      </div>

      <!-- 右栏：70×50mm 物理比例标签实时预览与打印 -->
      <aside class="xl:col-span-4 flex flex-col gap-3 min-h-0 overflow-y-auto">
        <div class="rounded-xl border border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-800 p-4 shadow-xs flex flex-col gap-3.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-qr-code" class="w-4 h-4 text-primary-500" />
              <h2 class="text-sm font-bold text-gray-900 dark:text-white">70×50mm 资产标签预览</h2>
            </div>
            <span class="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              70mm × 50mm
            </span>
          </div>

          <!-- 拟真 70:50 实体标签卡片 -->
          <div v-if="previewTarget" class="w-full flex flex-col items-center gap-1.5 bg-gray-100/80 dark:bg-gray-900/60 rounded-lg p-3 border border-dashed border-gray-300 dark:border-gray-700">
            <div class="w-full max-w-[336px] aspect-[70/50] bg-white text-black rounded border border-gray-400 shadow-sm flex flex-col overflow-hidden select-none">
              <!-- 预印 Logo 避让示意区（打印时留白，避免压住纸面 Logo） -->
              <div
                v-if="normalizedTopReserveMm > 0"
                :style="{ height: `${(normalizedTopReserveMm / 50) * 100}%` }"
                class="shrink-0 w-full px-[3.7%] bg-sky-50/70 border-b border-dashed border-sky-400/80 flex items-center justify-between"
              >
                <div class="flex items-center gap-1.5 opacity-80 pointer-events-none">
                  <span class="font-black tracking-tighter text-blue-700 text-[15px] leading-none">
                    CTK<sup class="text-[8px] font-bold">®</sup>
                  </span>
                  <span class="text-[9.5px] font-medium text-sky-700">
                    预印 Logo 留白 ({{ normalizedTopReserveMm }}mm)
                  </span>
                </div>
                <span class="px-1 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-600/70 rounded-[2px] leading-none opacity-80">
                  RoHS
                </span>
              </div>

              <!-- 实际打印内容区 -->
              <div
                class="flex-1 min-h-0 flex flex-col justify-between px-[3.7%] pb-[2.8%]"
                :class="normalizedTopReserveMm === 0 ? 'pt-[3.1%]' : ''"
              >
                <!-- 空白纸模式抬头（仅当顶部避让为 0 时打印） -->
                <div
                  v-if="normalizedTopReserveMm === 0"
                  class="flex items-center justify-between gap-1.5 border-b-[1.5px] border-black pb-1 mb-1 shrink-0"
                >
                  <span class="text-[12px] font-bold text-black truncate">
                    {{ labelPrefs.companyTitle || defaultCompanyTitle }}
                  </span>
                  <span class="text-[9.5px] font-bold text-black border border-black px-1 py-0.5 leading-none whitespace-nowrap shrink-0">
                    {{ labelPrefs.badgeText || IT_ASSET_LABEL_SPEC.defaultBadgeText }}
                  </span>
                </div>

                <!-- 主体双栏 -->
                <div
                  class="grid grid-cols-[minmax(0,1fr)_33.5%] gap-2 flex-1 min-h-0"
                  :class="normalizedTopReserveMm > 0 ? 'border-t-[1.5px] border-black pt-1' : ''"
                >
                  <div class="min-w-0 flex flex-col justify-between">
                    <div class="flex items-center justify-between gap-1.5 pb-0.5 mb-0.5 border-b border-black shrink-0 min-w-0">
                      <span class="font-mono text-[14.5px] font-extrabold text-black leading-none truncate min-w-0 flex-1">
                        {{ previewFields.assetNo }}
                      </span>
                      <span
                        v-if="normalizedTopReserveMm > 0"
                        class="text-[8.5px] font-bold text-black border border-black px-1 py-0.5 leading-none whitespace-nowrap shrink-0"
                      >
                        {{ labelPrefs.badgeText || IT_ASSET_LABEL_SPEC.defaultBadgeText }}
                      </span>
                    </div>

                    <div
                      class="flex flex-col justify-evenly py-0.5 flex-1 min-h-0"
                      :class="previewLabelRows.length >= 5 ? 'text-[10px] leading-[1.2]' : 'text-[11px] leading-[1.28]'"
                    >
                      <div
                        v-for="row in previewLabelRows"
                        :key="row.key"
                        class="flex items-start gap-1 min-w-0"
                      >
                        <span
                          class="shrink-0 font-bold text-black"
                          :class="previewLabelRows.length >= 5 ? 'w-9' : 'w-9.5'"
                        >
                          {{ row.label }}
                        </span>
                        <span
                          class="flex-1 min-w-0 font-normal text-black"
                          :class="[
                            row.multiline ? 'line-clamp-2 break-words' : 'truncate',
                            row.mono ? 'font-mono' : '',
                          ]"
                        >
                          {{ row.value }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- 右侧二维码区 -->
                  <div class="min-w-0 border-l border-black pl-1.5 flex flex-col items-center justify-center text-center">
                    <div class="w-[80px] h-[80px] max-w-full aspect-square flex items-center justify-center [&_svg]:w-full [&_svg]:h-full [&_svg]:block">
                      <div v-if="previewQrSvg" class="w-full h-full" v-html="previewQrSvg"></div>
                      <div v-else class="w-full h-full border border-dashed border-gray-400 flex items-center justify-center text-[9px] text-gray-500">QR</div>
                    </div>
                    <div class="mt-0.5 font-mono text-[9.5px] font-bold text-black truncate max-w-full">
                      {{ previewFields.assetNo }}
                    </div>
                    <div class="text-[8px] font-normal text-black whitespace-nowrap">扫码核对 · 请勿撕毁</div>
                  </div>
                </div>

                <!-- 底部微注条 -->
                <div class="border-t border-black pt-0.5 mt-1 flex items-center justify-between gap-2 text-[8.5px] font-normal leading-tight shrink-0">
                  <span class="truncate text-black">
                    {{ previewFields.serialNo ? `SN: ${previewFields.serialNo}` : `类别: ${previewFields.deviceTypeLabel}` }}
                  </span>
                  <span class="font-bold text-black whitespace-nowrap shrink-0">公司财产 妥善保管</span>
                </div>
              </div>
            </div>
            <p v-if="normalizedTopReserveMm > 0" class="text-[11px] text-gray-500 dark:text-gray-400 text-center">
              蓝色虚线区为预印 Logo 避让示意（打印时不输出），空「位置 / 日期」自动隐藏
            </p>
          </div>

          <div v-else class="w-full aspect-[70/50] rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 flex flex-col items-center justify-center text-gray-400 text-xs p-4 text-center">
            <UIcon name="i-lucide-monitor-off" class="w-7 h-7 mb-2 text-gray-300" />
            <span>暂无电脑资产记录，点击左上角「新增电脑」或导入 Excel</span>
          </div>

          <!-- 标签设置项 -->
          <div class="flex flex-col gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/70 text-xs">
            <div class="grid grid-cols-12 items-center gap-2">
              <span class="col-span-4 text-gray-500 dark:text-gray-400">顶部避让 (mm)</span>
              <div class="col-span-8 flex items-center gap-1.5">
                <UInput
                  v-model.number="labelPrefs.topReserveMm"
                  type="number"
                  min="0"
                  max="22"
                  step="0.5"
                  size="xs"
                  class="w-18"
                  @blur="handleTopReserveBlur"
                />
                <UButton
                  size="xs"
                  :color="normalizedTopReserveMm > 0 ? 'primary' : 'neutral'"
                  :variant="normalizedTopReserveMm === 14 ? 'soft' : 'outline'"
                  @click="setTopReservePreset(14)"
                >
                  预印纸 14mm
                </UButton>
                <UButton
                  size="xs"
                  :color="normalizedTopReserveMm === 0 ? 'primary' : 'neutral'"
                  :variant="normalizedTopReserveMm === 0 ? 'soft' : 'outline'"
                  @click="setTopReservePreset(0)"
                >
                  空白纸 0mm
                </UButton>
              </div>
            </div>
            <div v-if="normalizedTopReserveMm === 0" class="grid grid-cols-12 items-center gap-2">
              <span class="col-span-4 text-gray-500 dark:text-gray-400">公司抬头</span>
              <UInput v-model="labelPrefs.companyTitle" size="xs" class="col-span-8" :placeholder="defaultCompanyTitle" />
            </div>
            <div class="grid grid-cols-12 items-center gap-2">
              <span class="col-span-4 text-gray-500 dark:text-gray-400">徽标文案</span>
              <UInput v-model="labelPrefs.badgeText" size="xs" class="col-span-8" placeholder="IT资产" />
            </div>
            <div class="grid grid-cols-12 items-center gap-2">
              <span class="col-span-4 text-gray-500 dark:text-gray-400">二维码内容</span>
              <USelect
                v-model="labelPrefs.qrMode"
                size="xs"
                :items="IT_ASSET_QR_MODES"
                value-key="value"
                label-key="label"
                class="col-span-8"
              />
            </div>
          </div>

          <!-- 打印按钮组 -->
          <div class="flex flex-col gap-2">
            <UButton
              block
              color="primary"
              icon="i-lucide-printer"
              :disabled="!previewTarget || !canPrint"
              @click="handlePrintSingle(previewTarget)"
            >
              打印当前标签 ({{ previewTarget ? previewTarget.assetNo : '未选' }})
            </UButton>
            <UButton
              block
              color="neutral"
              variant="outline"
              icon="i-lucide-layers"
              :disabled="selectedAssets.length === 0 || !canPrint"
              @click="handlePrintSelected"
            >
              批量打印已选标签 ({{ selectedAssets.length }} 张)
            </UButton>
          </div>

          <!-- 硬件配置速览（当选中设备有配置时展示） -->
          <div v-if="previewTarget && (previewHardwareSummary || previewTarget.ipAddress || previewTarget.osVersion)" class="rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200/70 dark:border-gray-700/70 p-2.5 text-[11px] flex flex-col gap-1">
            <div class="font-semibold text-gray-700 dark:text-gray-300">硬件与网络详情</div>
            <div v-if="previewHardwareSummary" class="text-gray-600 dark:text-gray-400">配置：{{ previewHardwareSummary }}</div>
            <div v-if="previewTarget.osVersion" class="text-gray-600 dark:text-gray-400">系统：{{ previewTarget.osVersion }}</div>
            <div v-if="previewTarget.ipAddress || previewTarget.macAddress" class="font-mono text-gray-600 dark:text-gray-400">
              网络：{{ [previewTarget.ipAddress, previewTarget.macAddress].filter(Boolean).join(' / ') }}
            </div>
          </div>

          <!-- 热敏打印机设置提示 -->
          <div class="rounded-lg bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 p-2.5 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <UIcon name="i-lucide-info" class="w-4 h-4 shrink-0 mt-0.5" />
            <div class="leading-relaxed">
              热敏标签机打印建议：纸张尺寸选 <b>70×50mm</b>，边距选「<b>无</b>」，缩放保持 <b>100%</b>，并取消勾选浏览器「页眉和页脚」。
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- 新增 / 编辑电脑弹窗 -->
    <UModal v-model:open="formOpen" :title="formTitle" :ui="{ content: 'max-w-3xl' }">
      <template #body>
        <UForm :state="form" class="space-y-4">
          <div class="rounded-xl border border-gray-200/80 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 p-3.5 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                <UIcon name="i-lucide-laptop" class="w-4 h-4 text-primary-500" />
                基础台账与领用信息
              </span>
              <div class="flex flex-wrap items-center gap-1">
                <span class="text-[11px] text-gray-400 mr-1">快捷填充:</span>
                <UButton
                  v-for="preset in quickAssetPresets"
                  :key="preset.name"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  @click="applyQuickPreset(preset)"
                >
                  {{ preset.name }}
                </UButton>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <UFormField label="资产编号" help="留空保存时自动生成 TK-PC-xxxx">
                <UInput v-model="form.assetNo" placeholder="例如 TK-PC-0001" class="w-full font-mono" />
              </UFormField>
              <UFormField label="资产名称" required>
                <UInput v-model="form.assetName" placeholder="例如 办公台式机" class="w-full" />
              </UFormField>
              <UFormField label="设备类型" required>
                <USelect
                  v-model="form.deviceType"
                  :items="IT_ASSET_DEVICE_TYPES"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="品牌">
                <UInput v-model="form.brand" placeholder="联想 / 戴尔 / 华为 / 苹果" class="w-full" />
              </UFormField>
              <UFormField label="规格型号">
                <UInput v-model="form.model" placeholder="例如 ThinkCentre M740t" class="w-full" />
              </UFormField>
              <UFormField label="资产状态" required>
                <USelect
                  v-model="form.status"
                  :items="IT_ASSET_STATUSES"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="快速选人（企微通讯录）" class="sm:col-span-2">
                <USelect
                  v-model="selectedWxUserId"
                  :items="employeeSelectItems"
                  value-key="value"
                  label-key="label"
                  placeholder="选择在职员工自动带出姓名与部门"
                  class="w-full"
                  @update:model-value="onSelectWxUser"
                />
              </UFormField>
              <UFormField label="使用人姓名">
                <UInput
                  v-model="form.userName"
                  placeholder="可自动带出或手工填写"
                  class="w-full"
                  @update:model-value="onManualUserNameInput"
                />
              </UFormField>

              <UFormField label="使用部门（快选或手填）">
                <div class="flex flex-col gap-1.5">
                  <USelect
                    v-model="selectedDeptQuick"
                    :items="deptSelectItems"
                    value-key="value"
                    label-key="label"
                    placeholder="从部门列表快选"
                    class="w-full"
                    @update:model-value="onSelectDeptQuick"
                  />
                  <UInput v-model="form.useDept" placeholder="或直接输入部门名称" class="w-full" />
                </div>
              </UFormField>
              <UFormField label="存放地点">
                <UInput v-model="form.location" placeholder="例如 A栋3楼办公区" class="w-full" />
              </UFormField>
              <UFormField label="购置日期">
                <UPopover v-model:open="purchaseDateOpen">
                  <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full justify-between font-normal">
                    <span :class="form.purchaseDate ? 'font-mono' : 'text-dimmed'">{{ form.purchaseDate || '选择购置日期' }}</span>
                  </UButton>
                  <template #content>
                    <div class="p-2">
                      <UCalendar v-model="purchaseDateCalendar" locale="zh-CN" />
                      <div v-if="form.purchaseDate" class="border-t border-gray-100 dark:border-gray-800 pt-2 mt-2 flex justify-end">
                        <UButton size="xs" color="neutral" variant="ghost" @click="form.purchaseDate = ''; purchaseDateOpen = false">清空</UButton>
                      </div>
                    </div>
                  </template>
                </UPopover>
              </UFormField>
            </div>
          </div>

          <div class="rounded-xl border border-gray-200/80 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-3.5 space-y-3">
            <div class="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
              <UIcon name="i-lucide-cpu" class="w-4 h-4 text-primary-500" />
              IT 硬件、网络与维保信息（选填）
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <UFormField label="出厂序列号 SN">
                <UInput v-model="form.serialNo" placeholder="机身标签 SN / Service Tag" class="w-full font-mono" />
              </UFormField>
              <UFormField label="保修到期日">
                <UPopover v-model:open="warrantyDateOpen">
                  <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full justify-between font-normal">
                    <span :class="form.warrantyDate ? 'font-mono' : 'text-dimmed'">{{ form.warrantyDate || '选择保修到期日' }}</span>
                  </UButton>
                  <template #content>
                    <div class="p-2">
                      <UCalendar v-model="warrantyDateCalendar" locale="zh-CN" />
                      <div v-if="form.warrantyDate" class="border-t border-gray-100 dark:border-gray-800 pt-2 mt-2 flex justify-end">
                        <UButton size="xs" color="neutral" variant="ghost" @click="form.warrantyDate = ''; warrantyDateOpen = false">清空</UButton>
                      </div>
                    </div>
                  </template>
                </UPopover>
              </UFormField>
              <UFormField label="操作系统">
                <UInput v-model="form.osVersion" placeholder="例如 Windows 11 专业版" class="w-full" />
              </UFormField>

              <UFormField label="CPU">
                <UInput v-model="form.cpuSpec" placeholder="例如 i5-13400" class="w-full" />
              </UFormField>
              <UFormField label="内存">
                <UInput v-model="form.memorySpec" placeholder="例如 16GB" class="w-full" />
              </UFormField>
              <UFormField label="硬盘">
                <UInput v-model="form.diskSpec" placeholder="例如 512GB SSD" class="w-full" />
              </UFormField>

              <UFormField label="IP 地址">
                <UInput v-model="form.ipAddress" placeholder="例如 192.0.2.55" class="w-full font-mono" />
              </UFormField>
              <UFormField label="MAC 地址" class="sm:col-span-2">
                <UInput v-model="form.macAddress" placeholder="例如 AA-BB-CC-11-22-33" class="w-full font-mono" />
              </UFormField>

              <UFormField label="备注" class="sm:col-span-3">
                <UTextarea v-model="form.remark" :rows="2" placeholder="领用说明、配件清单（显示器/键鼠）或维修记录..." class="w-full" />
              </UFormField>
            </div>
          </div>
        </UForm>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="formOpen = false">取消</UButton>
          <UButton color="primary" :loading="submitting" @click="handleSubmitForm">保存</UButton>
        </div>
      </template>
    </UModal>

    <!-- Excel 批量导入弹窗 -->
    <UModal v-model:open="importOpen" title="Excel 批量导入电脑资产" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div class="space-y-4 text-xs">
          <div class="flex items-center justify-between rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800/50 p-3">
            <div>
              <div class="font-semibold text-blue-900 dark:text-blue-200">第一步：下载标准导入模板</div>
              <div class="text-gray-600 dark:text-gray-400 mt-0.5">资产编号留空时自动按 TK-PC-0001 递增生成；支持企微姓名自动补全部门</div>
            </div>
            <UButton size="xs" color="primary" variant="soft" icon="i-lucide-file-spreadsheet" :loading="downloadingTemplate" @click="handleDownloadTemplate">
              下载模板
            </UButton>
          </div>

          <div class="space-y-2">
            <div class="font-semibold text-gray-800 dark:text-gray-200">第二步：选择资产编号重复时的处理方式</div>
            <USelect
              v-model="importMode"
              :items="[
                { value: 'skip', label: '跳过已有资产编号（推荐，仅导入新设备）' },
                { value: 'update', label: '按资产编号更新已有记录的非空字段' },
              ]"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </div>

          <div class="space-y-2">
            <div class="font-semibold text-gray-800 dark:text-gray-200">第三步：选择填好的 Excel 文件 (.xlsx / .xls)</div>
            <label class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 p-5 cursor-pointer hover:border-primary-400 transition-colors bg-gray-50/60 dark:bg-gray-900/40">
              <UIcon name="i-lucide-file-up" class="w-7 h-7 text-primary-500" />
              <span class="font-medium text-gray-700 dark:text-gray-300">
                {{ importFile ? importFile.name : '点击选择本地 Excel 文件' }}
              </span>
              <span v-if="importFile" class="text-[11px] text-gray-400">
                大小 {{ (importFile.size / 1024).toFixed(1) }} KB
              </span>
              <input ref="importFileInputRef" type="file" accept=".xlsx,.xls" class="hidden" @change="onImportFileChange" />
            </label>
          </div>

          <div v-if="importResult" class="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2 bg-gray-50 dark:bg-gray-900/50">
            <div class="font-semibold text-gray-800 dark:text-gray-200">导入结果</div>
            <div class="grid grid-cols-4 gap-2 text-center">
              <div class="rounded bg-emerald-50 dark:bg-emerald-950/40 p-2">
                <div class="text-[10px] text-emerald-700 dark:text-emerald-400">新增</div>
                <div class="text-base font-bold font-mono text-emerald-700 dark:text-emerald-300">{{ importResult.insertedCount }}</div>
              </div>
              <div class="rounded bg-blue-50 dark:bg-blue-950/40 p-2">
                <div class="text-[10px] text-blue-700 dark:text-blue-400">更新</div>
                <div class="text-base font-bold font-mono text-blue-700 dark:text-blue-300">{{ importResult.updatedCount }}</div>
              </div>
              <div class="rounded bg-gray-100 dark:bg-gray-800 p-2">
                <div class="text-[10px] text-gray-600 dark:text-gray-400">跳过</div>
                <div class="text-base font-bold font-mono text-gray-700 dark:text-gray-300">{{ importResult.skippedCount }}</div>
              </div>
              <div class="rounded bg-rose-50 dark:bg-rose-950/40 p-2">
                <div class="text-[10px] text-rose-700 dark:text-rose-400">失败</div>
                <div class="text-base font-bold font-mono text-rose-700 dark:text-rose-300">{{ importResult.failedCount }}</div>
              </div>
            </div>
            <div v-if="importResult.errors && importResult.errors.length" class="max-h-36 overflow-y-auto space-y-1 pt-1 border-t border-gray-200 dark:border-gray-700">
              <div v-for="(err, idx) in importResult.errors.slice(0, 20)" :key="idx" class="text-[11px] text-rose-600 dark:text-rose-400">
                第 {{ err.rowNo }} 行：{{ err.message }}
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="importOpen = false">关闭</UButton>
          <UButton color="primary" :loading="importing" :disabled="!importFile" @click="handleSubmitImport">开始导入</UButton>
        </div>
      </template>
    </UModal>

    <!-- 从绿盾同步差异预览弹窗 -->
    <UModal v-model:open="lvdunSyncOpen" title="从绿盾同步电脑台账" :ui="{ content: 'max-w-4xl' }">
      <template #body>
        <div class="space-y-4 text-xs">
          <div v-if="lvdunSyncLoading" class="py-12 flex flex-col items-center justify-center gap-2 text-gray-500">
            <UIcon name="i-lucide-loader-circle" class="w-7 h-7 animate-spin text-primary-500" />
            <span>正在连接绿盾服务器采集最新授权终端与分组信息...</span>
          </div>

          <div v-else-if="lvdunSyncError" class="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/80 dark:bg-rose-950/30 p-3 text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
            <span>{{ lvdunSyncError }}</span>
            <UButton size="xs" color="error" variant="soft" @click="loadLvDunSyncPreview">重试</UButton>
          </div>

          <template v-else-if="lvdunSyncPlan">
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-2">
              <div class="flex flex-wrap items-center gap-3 text-gray-600 dark:text-gray-300">
                <span>绿盾已授权：<b class="font-mono text-gray-900 dark:text-white">{{ lvdunSyncPlan.stats.lvdunAuthorized }}</b> 台</span>
                <span>待更新姓名/部门：<b class="font-mono text-blue-600 dark:text-blue-400">{{ lvdunSyncPlan.updates.length }}</b> 台</span>
                <span>待新增：<b class="font-mono text-emerald-600 dark:text-emerald-400">{{ lvdunSyncPlan.inserts.length }}</b> 台</span>
                <span>绿盾已禁用：<b class="font-mono text-amber-600 dark:text-amber-400">{{ lvdunSyncPlan.disabled.length }}</b> 台</span>
              </div>
              <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-refresh-cw" @click="loadLvDunSyncPreview">
                重新拉取
              </UButton>
            </div>

            <div
              v-if="!lvdunSyncPlan.updates.length && !lvdunSyncPlan.inserts.length && !lvdunSyncPlan.disabled.length"
              class="py-10 text-center text-gray-500 dark:text-gray-400 flex flex-col items-center gap-2"
            >
              <UIcon name="i-lucide-check-circle-2" class="w-8 h-8 text-emerald-500" />
              <span>当前台账与绿盾最新授权信息完全一致，无需同步。</span>
            </div>

            <!-- 1. 姓名 / 部门变更 -->
            <div v-if="lvdunSyncPlan.updates.length" class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="font-bold text-gray-800 dark:text-gray-200">使用人 / 部门变更（{{ selectedSyncUpdateIds.length }}/{{ lvdunSyncPlan.updates.length }}）</span>
                <div class="flex items-center gap-2">
                  <button type="button" class="text-primary-600 hover:underline" @click="selectAllSyncUpdates(true)">全选</button>
                  <button type="button" class="text-gray-500 hover:underline" @click="selectAllSyncUpdates(false)">全不选</button>
                </div>
              </div>
              <div class="max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                <label
                  v-for="item in lvdunSyncPlan.updates"
                  :key="item.assetId"
                  class="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :checked="selectedSyncUpdateIds.includes(item.assetId)"
                    class="rounded border-gray-300"
                    @change="toggleSyncUpdateId(item.assetId)"
                  />
                  <span class="font-mono font-bold text-gray-900 dark:text-gray-100 w-24 shrink-0">{{ item.assetNo }}</span>
                  <div class="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
                    <span class="text-gray-500 line-through">{{ item.oldUserName || '未分配' }}（{{ item.oldUseDept || '—' }}）</span>
                    <UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span class="font-semibold text-blue-700 dark:text-blue-300">{{ item.newUserName || '未分配' }}（{{ item.newUseDept || '—' }}）</span>
                  </div>
                </label>
              </div>
            </div>

            <!-- 2. 新增已授权电脑 -->
            <div v-if="lvdunSyncPlan.inserts.length" class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="font-bold text-gray-800 dark:text-gray-200">新增绿盾已授权电脑（{{ selectedSyncInsertIds.length }}/{{ lvdunSyncPlan.inserts.length }}）</span>
                <div class="flex items-center gap-2">
                  <button type="button" class="text-primary-600 hover:underline" @click="selectAllSyncInserts(true)">全选</button>
                  <button type="button" class="text-gray-500 hover:underline" @click="selectAllSyncInserts(false)">全不选</button>
                </div>
              </div>
              <div class="max-h-44 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                <label
                  v-for="item in lvdunSyncPlan.inserts"
                  :key="item.lvdunId"
                  class="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :checked="selectedSyncInsertIds.includes(item.lvdunId)"
                    class="rounded border-gray-300"
                    @change="toggleSyncInsertId(item.lvdunId)"
                  />
                  <span class="font-semibold text-emerald-700 dark:text-emerald-300 w-24 shrink-0 truncate">{{ item.userName || item.assetName }}</span>
                  <span class="text-gray-600 dark:text-gray-300 w-24 shrink-0 truncate">{{ item.useDept || '—' }}</span>
                  <span class="text-gray-500 flex-1 min-w-0 truncate">{{ [item.brand, item.model].filter(Boolean).join(' ') || item.assetName }}</span>
                  <span class="font-mono text-gray-400 shrink-0">{{ item.ipAddress || item.macAddress }}</span>
                </label>
              </div>
            </div>

            <!-- 3. 绿盾已禁用/未授权电脑 -->
            <div v-if="lvdunSyncPlan.disabled.length" class="space-y-1.5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="font-bold text-gray-800 dark:text-gray-200">绿盾已禁用/未授权电脑（{{ selectedSyncDisabledIds.length }}/{{ lvdunSyncPlan.disabled.length }}）</span>
                <div class="flex items-center gap-2">
                  <USelect
                    v-model="lvdunDisabledAction"
                    size="xs"
                    :items="[
                      { value: 'delete', label: '从台账删除' },
                      { value: 'idle', label: '标为闲置' },
                    ]"
                    value-key="value"
                    label-key="label"
                    class="w-32"
                  />
                  <button type="button" class="text-primary-600 hover:underline" @click="selectAllSyncDisabled(true)">全选</button>
                  <button type="button" class="text-gray-500 hover:underline" @click="selectAllSyncDisabled(false)">全不选</button>
                </div>
              </div>
              <div class="max-h-40 overflow-y-auto rounded-lg border border-amber-200/80 dark:border-amber-800/60 divide-y divide-amber-100 dark:divide-amber-900/50">
                <label
                  v-for="item in lvdunSyncPlan.disabled"
                  :key="item.assetId"
                  class="flex items-center gap-2.5 px-3 py-2 hover:bg-amber-50/50 dark:hover:bg-amber-950/30 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :checked="selectedSyncDisabledIds.includes(item.assetId)"
                    class="rounded border-gray-300"
                    @change="toggleSyncDisabledId(item.assetId)"
                  />
                  <span class="font-mono font-bold text-gray-900 dark:text-gray-100 w-24 shrink-0">{{ item.assetNo }}</span>
                  <span class="text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate">{{ item.userName || item.assetName }}（{{ item.useDept || '—' }}）</span>
                  <span class="text-gray-400 font-mono shrink-0">{{ item.ipAddress || '—' }}</span>
                </label>
              </div>
            </div>
          </template>
        </div>
      </template>

      <template #footer>
        <div class="flex items-center justify-between w-full">
          <span class="text-xs text-gray-500">
            已勾选：更新 {{ selectedSyncUpdateIds.length }}、新增 {{ selectedSyncInsertIds.length }}、{{ lvdunDisabledAction === 'delete' ? '删除' : '置闲' }} {{ selectedSyncDisabledIds.length }}
          </span>
          <div class="flex items-center gap-2">
            <UButton color="neutral" variant="ghost" @click="lvdunSyncOpen = false">取消</UButton>
            <UButton
              color="primary"
              icon="i-lucide-check"
              :loading="lvdunSyncApplying"
              :disabled="lvdunSyncLoading || totalSelectedLvDunChanges === 0"
              @click="handleApplyLvDunSync"
            >
              确认同步 ({{ totalSelectedLvDunChanges }})
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import { computed, h, onMounted, ref, resolveComponent, watch } from 'vue'
import { BrowserQRCodeSvgWriter } from '@zxing/browser'
import { saveAs } from 'file-saver'
import { useTkListQuery } from '@ctk-system/composables'
import { TkDateRangePicker, TkUTable } from '@ctk-system/ui'
import {
  IT_ASSET_DEVICE_TYPES,
  IT_ASSET_LABEL_SPEC,
  IT_ASSET_QR_MODES,
  IT_ASSET_STATUSES,
  buildItAssetLabelRows,
  buildItAssetPrintHtml,
  buildItAssetQrPayload,
  calendarToDateString,
  dateStringToCalendar,
  formatItAssetHardwareSummary,
  formatItAssetLabelFields,
  formatItAssetModelText,
  getItAssetDeviceTypeLabel,
  getItAssetStatusMeta,
  normalizeItAssetTopReserveMm,
} from '@ctk-system/shared'
import {
  addItAsset,
  applyItAssetLvDunSync,
  deleteItAssets,
  downloadItAssetTemplate,
  exportItAssets,
  getItAssetOptions,
  getItAssetSummary,
  importItAssets,
  listItAssets,
  previewItAssetLvDunSync,
  updateItAsset,
} from '@/api/tk_custom/itAsset'
import { hasStaticPermission } from '@/router/static-navigation'
import useUserStore from '@/store/modules/user'
import { isJsonBlob, readBlobErrorMessage } from '@/utils/blob-download'

const LABEL_PREFS_STORAGE_KEY = 'tk_it_asset_label_prefs_v2'
const toast = useToast()
const userStore = useUserStore()
const UCheckbox = resolveComponent('UCheckbox')

const can = (perm) => hasStaticPermission(userStore, perm)
const canPrint = computed(() => can('tk_custom:itAsset:print') || can('tk_custom:itAsset:list'))
const canExport = computed(() => can('tk_custom:itAsset:export') || can('tk_custom:itAsset:list'))

const isClientReady = ref(false)
const tableRef = ref(null)
const rowSelection = ref({})
const previewAsset = ref(null)

const summary = ref({
  total: 0,
  inUse: 0,
  idle: 0,
  repair: 0,
  scrapped: 0,
})

const deptOptions = ref([])
const assetDeptOptions = ref([])
const employeeOptions = ref([])
const nextAssetNo = ref('TK-PC-0001')

const purchaseDateRange = ref([])
const queryParams = ref({
  pageNum: 1,
  keyword: '',
  deviceType: 'all',
  status: 'all',
  useDept: 'all',
})

function buildFilterPayload() {
  const [beginPurchaseDate, endPurchaseDate] = Array.isArray(purchaseDateRange.value) ? purchaseDateRange.value : []
  return {
    keyword: queryParams.value.keyword?.trim() || undefined,
    deviceType: queryParams.value.deviceType !== 'all' ? queryParams.value.deviceType : undefined,
    status: queryParams.value.status !== 'all' ? queryParams.value.status : undefined,
    useDept: queryParams.value.useDept !== 'all' ? queryParams.value.useDept : undefined,
    beginPurchaseDate: beginPurchaseDate || undefined,
    endPurchaseDate: endPurchaseDate || undefined,
  }
}

const {
  loading,
  list: assetList,
  total,
  error: listError,
  getList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => listItAssets({ ...buildFilterPayload(), all: true }),
  beforeReset: () => {
    purchaseDateRange.value = []
    queryParams.value.keyword = ''
    queryParams.value.deviceType = 'all'
    queryParams.value.status = 'all'
    queryParams.value.useDept = 'all'
  },
  afterLoad: () => {
    syncPreviewAfterLoad()
    pruneRowSelection()
  },
})

watch(listError, (msg) => {
  if (msg) toast.add({ title: msg, color: 'error' })
})

const summaryPills = computed(() => [
  { key: 'total', label: '全部', count: summary.value.total, filterStatus: 'all', activeColor: 'primary' },
  { key: 'inUse', label: '在用', count: summary.value.inUse, filterStatus: 'in_use', activeColor: 'success' },
  { key: 'idle', label: '闲置', count: summary.value.idle, filterStatus: 'idle', activeColor: 'info' },
  { key: 'repair', label: '维修中', count: summary.value.repair, filterStatus: 'repair', activeColor: 'warning' },
  { key: 'scrapped', label: '已报废', count: summary.value.scrapped, filterStatus: 'scrapped', activeColor: 'neutral' },
])

const deviceTypeFilterItems = computed(() => [
  { value: 'all', label: '全部类型' },
  ...IT_ASSET_DEVICE_TYPES,
])

const statusFilterItems = computed(() => [
  { value: 'all', label: '全部状态' },
  ...IT_ASSET_STATUSES,
])

const deptFilterItems = computed(() => [
  { value: 'all', label: '全部部门' },
  ...assetDeptOptions.value.map((d) => ({ value: d, label: d })),
])

const assetColumns = [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        modelValue: table.getIsAllRowsSelected(),
        'onUpdate:modelValue': (value) => table.toggleAllRowsSelected(!!value),
        onClick: (e) => e.stopPropagation(),
        ariaLabel: '全选当前页',
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        modelValue: row.getIsSelected(),
        'onUpdate:modelValue': (value) => row.toggleSelected(!!value),
        onClick: (e) => e.stopPropagation(),
        ariaLabel: '选择行',
      }),
    enableSorting: false,
    enableHiding: false,
  },
  { accessorKey: 'assetNo', header: '资产编号' },
  { accessorKey: 'assetName', header: '资产名称 / 型号' },
  { accessorKey: 'deviceType', header: '类型' },
  { accessorKey: 'useDept', header: '使用人 / 部门' },
  { accessorKey: 'location', header: '存放地点' },
  { accessorKey: 'purchaseDate', header: '购置日期' },
  { accessorKey: 'status', header: '状态' },
  { id: 'actions', header: '操作' },
]

const selectedAssets = computed(() => {
  const selectedIds = new Set(
    Object.entries(rowSelection.value || {})
      .filter(([, checked]) => Boolean(checked))
      .map(([id]) => String(id)),
  )
  return assetList.value.filter((item) => selectedIds.has(String(item.id)))
})

const previewTarget = computed(() => previewAsset.value || assetList.value[0] || null)
const previewFields = computed(() => formatItAssetLabelFields(previewTarget.value || {}))
const previewLabelRows = computed(() => buildItAssetLabelRows(previewTarget.value || {}))
const previewHardwareSummary = computed(() => formatItAssetHardwareSummary(previewTarget.value || {}))

const runtimeConfig = useRuntimeConfig()
const defaultCompanyTitle = computed(
  () => String(runtimeConfig.public?.companyName || '').trim() || IT_ASSET_LABEL_SPEC.defaultCompanyTitle,
)

const labelPrefs = ref({
  companyTitle: defaultCompanyTitle.value,
  badgeText: IT_ASSET_LABEL_SPEC.defaultBadgeText,
  qrMode: 'asset_no',
  topReserveMm: IT_ASSET_LABEL_SPEC.defaultTopReserveMm,
})

const normalizedTopReserveMm = computed(() =>
  normalizeItAssetTopReserveMm(labelPrefs.value.topReserveMm),
)

function setTopReservePreset(mm) {
  labelPrefs.value.topReserveMm = normalizeItAssetTopReserveMm(mm)
}

function handleTopReserveBlur() {
  labelPrefs.value.topReserveMm = normalizeItAssetTopReserveMm(labelPrefs.value.topReserveMm)
}

watch(
  labelPrefs,
  (val) => {
    if (!import.meta.client) return
    try {
      localStorage.setItem(LABEL_PREFS_STORAGE_KEY, JSON.stringify(val))
    } catch {}
  },
  { deep: true },
)

function createQrSvg(payload, size = 180) {
  if (!import.meta.client || typeof document === 'undefined' || !payload) return ''
  try {
    const writer = new BrowserQRCodeSvgWriter()
    // EncodeHintType.MARGIN === 6：把默认 4 模块静区缩窄为 1 模块，让 19.5mm 区域内的二维码更易识别
    const el = writer.write(payload, size, size, new Map([[6, 1]]))
    el.setAttribute('viewBox', `0 0 ${size} ${size}`)
    el.removeAttribute('width')
    el.removeAttribute('height')
    return el.outerHTML
  } catch {
    return ''
  }
}

const previewQrSvg = computed(() => {
  if (!isClientReady.value || !previewTarget.value) return ''
  const payload = buildItAssetQrPayload(previewTarget.value, labelPrefs.value.qrMode)
  return createQrSvg(payload, 180)
})

function syncPreviewAfterLoad() {
  if (!assetList.value.length) {
    previewAsset.value = null
    return
  }
  if (previewAsset.value) {
    const matched = assetList.value.find((item) => item.id === previewAsset.value.id)
    if (matched) {
      previewAsset.value = matched
      return
    }
  }
  previewAsset.value = assetList.value[0]
}

function pruneRowSelection() {
  const validIds = new Set(assetList.value.map((item) => String(item.id)))
  const next = {}
  let changed = false
  for (const [key, val] of Object.entries(rowSelection.value || {})) {
    if (val && validIds.has(String(key))) {
      next[key] = true
    } else if (val) {
      changed = true
    }
  }
  if (changed) rowSelection.value = next
}

function applyStatusQuickFilter(statusValue) {
  queryParams.value.status = statusValue
  handleQuery()
}

function handleRowClick(rowOriginal) {
  if (rowOriginal) previewAsset.value = rowOriginal
}

function handleRowOpen(rowOriginal) {
  if (!rowOriginal) return
  previewAsset.value = rowOriginal
  if (can('tk_custom:itAsset:edit')) openEditModal(rowOriginal)
}

async function fetchSummary() {
  try {
    const res = await getItAssetSummary()
    if (res?.code === 200 && res.data) {
      summary.value = { ...summary.value, ...res.data }
    }
  } catch {}
}

async function fetchOptions() {
  try {
    const res = await getItAssetOptions()
    if (res?.code === 200 && res.data) {
      deptOptions.value = Array.isArray(res.data.deptOptions) ? res.data.deptOptions : []
      assetDeptOptions.value = Array.isArray(res.data.assetDeptOptions)
        ? res.data.assetDeptOptions
        : deptOptions.value
      employeeOptions.value = Array.isArray(res.data.employeeOptions) ? res.data.employeeOptions : []
      if (res.data.nextAssetNo) nextAssetNo.value = String(res.data.nextAssetNo)
      if (
        queryParams.value.useDept !== 'all'
        && assetDeptOptions.value.length > 0
        && !assetDeptOptions.value.includes(queryParams.value.useDept)
      ) {
        queryParams.value.useDept = 'all'
      }
    }
  } catch {}
}

async function refreshAll() {
  await Promise.all([getList(), fetchSummary(), fetchOptions()])
}

// ---------- 打印 ----------
async function printAssets(items) {
  if (!Array.isArray(items) || !items.length) return
  const popup = window.open('', '_blank')
  if (!popup) {
    toast.add({
      title: '浏览器阻止了打印窗口',
      description: '请允许当前站点弹出窗口后重试',
      color: 'warning',
    })
    return
  }
  popup.opener = null

  const qrSvgs = items.map((asset) => {
    const payload = buildItAssetQrPayload(asset, labelPrefs.value.qrMode)
    return createQrSvg(payload, 180)
  })
  const html = buildItAssetPrintHtml(items, {
    companyTitle: labelPrefs.value.companyTitle,
    badgeText: labelPrefs.value.badgeText,
    topReserveMm: normalizedTopReserveMm.value,
    qrSvgs,
    title: items.length === 1 ? `IT资产标签 - ${items[0].assetNo}` : `IT资产标签 (${items.length}张)`,
  })
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
}

function handlePrintSingle(asset) {
  if (!asset) return
  previewAsset.value = asset
  printAssets([asset])
}

function handlePrintSelected() {
  if (!selectedAssets.value.length) return
  printAssets(selectedAssets.value)
}

// ---------- 新增 / 编辑 / 复制 ----------
const formOpen = ref(false)
const formMode = ref('create') // 'create' | 'edit'
const submitting = ref(false)
const purchaseDateOpen = ref(false)
const warrantyDateOpen = ref(false)
const selectedWxUserId = ref(undefined)
const selectedDeptQuick = ref(undefined)

const quickAssetPresets = [
  { name: '办公台式机', deviceType: 'desktop' },
  { name: '办公笔记本', deviceType: 'laptop' },
  { name: '研发工作站', deviceType: 'workstation' },
  { name: '办公显示器', deviceType: 'monitor' },
]

function createBlankForm(presetNo = '') {
  return {
    id: null,
    assetNo: presetNo || '',
    assetName: '',
    deviceType: 'desktop',
    brand: '',
    model: '',
    serialNo: '',
    useDept: '',
    userUserid: '',
    userName: '',
    location: '',
    purchaseDate: '',
    status: 'in_use',
    cpuSpec: '',
    memorySpec: '',
    diskSpec: '',
    osVersion: '',
    ipAddress: '',
    macAddress: '',
    warrantyDate: '',
    remark: '',
  }
}

const form = ref(createBlankForm())
const formTitle = computed(() => (formMode.value === 'edit' ? `编辑电脑资产 - ${form.value.assetNo}` : '新增电脑资产'))

const employeeSelectItems = computed(() =>
  employeeOptions.value.map((emp) => ({
    value: emp.userid,
    label: `${emp.name}${emp.dept ? ` (${emp.dept})` : ''}`,
  })),
)

const deptSelectItems = computed(() =>
  deptOptions.value.map((d) => ({ value: d, label: d })),
)

const purchaseDateCalendar = computed({
  get: () => dateStringToCalendar(form.value.purchaseDate),
  set: (val) => {
    form.value.purchaseDate = calendarToDateString(val) || ''
    purchaseDateOpen.value = false
  },
})

const warrantyDateCalendar = computed({
  get: () => dateStringToCalendar(form.value.warrantyDate),
  set: (val) => {
    form.value.warrantyDate = calendarToDateString(val) || ''
    warrantyDateOpen.value = false
  },
})

function applyQuickPreset(preset) {
  form.value.assetName = preset.name
  form.value.deviceType = preset.deviceType
}

function onSelectWxUser(userid) {
  const emp = employeeOptions.value.find((item) => item.userid === userid)
  if (!emp) return
  form.value.userUserid = emp.userid
  form.value.userName = emp.name
  if (emp.dept) {
    form.value.useDept = emp.dept
    selectedDeptQuick.value = deptOptions.value.includes(emp.dept) ? emp.dept : undefined
  }
}

function onManualUserNameInput() {
  form.value.userUserid = ''
  selectedWxUserId.value = undefined
}

function onSelectDeptQuick(dept) {
  if (dept) form.value.useDept = dept
}

async function openCreateModal() {
  formMode.value = 'create'
  await fetchOptions()
  form.value = createBlankForm(nextAssetNo.value)
  selectedWxUserId.value = undefined
  selectedDeptQuick.value = undefined
  formOpen.value = true
}

function openEditModal(row) {
  formMode.value = 'edit'
  form.value = {
    id: row.id,
    assetNo: row.assetNo || '',
    assetName: row.assetName || '',
    deviceType: row.deviceType || 'desktop',
    brand: row.brand || '',
    model: row.model || '',
    serialNo: row.serialNo || '',
    useDept: row.useDept || '',
    userUserid: row.userUserid || '',
    userName: row.userName || '',
    location: row.location || '',
    purchaseDate: row.purchaseDate || '',
    status: row.status || 'in_use',
    cpuSpec: row.cpuSpec || '',
    memorySpec: row.memorySpec || '',
    diskSpec: row.diskSpec || '',
    osVersion: row.osVersion || '',
    ipAddress: row.ipAddress || '',
    macAddress: row.macAddress || '',
    warrantyDate: row.warrantyDate || '',
    remark: row.remark || '',
  }
  selectedWxUserId.value = row.userUserid || undefined
  selectedDeptQuick.value = deptOptions.value.includes(row.useDept) ? row.useDept : undefined
  formOpen.value = true
}

async function openDuplicateModal(row) {
  formMode.value = 'create'
  await fetchOptions()
  form.value = {
    ...createBlankForm(nextAssetNo.value),
    assetName: row.assetName || '',
    deviceType: row.deviceType || 'desktop',
    brand: row.brand || '',
    model: row.model || '',
    useDept: row.useDept || '',
    location: row.location || '',
    purchaseDate: row.purchaseDate || '',
    status: 'in_use',
    cpuSpec: row.cpuSpec || '',
    memorySpec: row.memorySpec || '',
    diskSpec: row.diskSpec || '',
    osVersion: row.osVersion || '',
    warrantyDate: row.warrantyDate || '',
    remark: row.remark || '',
  }
  selectedWxUserId.value = undefined
  selectedDeptQuick.value = deptOptions.value.includes(row.useDept) ? row.useDept : undefined
  formOpen.value = true
}

async function handleSubmitForm() {
  if (!String(form.value.assetName || '').trim()) {
    toast.add({ title: '请填写资产名称', color: 'warning' })
    return
  }
  if (formMode.value === 'edit' && !String(form.value.assetNo || '').trim()) {
    toast.add({ title: '编辑时资产编号不能为空', color: 'warning' })
    return
  }
  submitting.value = true
  try {
    const payload = { ...form.value }
    const res = formMode.value === 'edit'
      ? await updateItAsset(payload)
      : await addItAsset(payload)
    if (res?.code === 200) {
      toast.add({ title: res.msg || '保存成功', color: 'success' })
      formOpen.value = false
      await refreshAll()
      const savedId = res.data?.id
      if (savedId) {
        const matched = assetList.value.find((item) => item.id === savedId)
        if (matched) previewAsset.value = matched
      }
    } else {
      toast.add({ title: res?.msg || '保存失败', color: 'error' })
    }
  } catch (err) {
    toast.add({ title: err?.message || '保存请求失败', color: 'error' })
  } finally {
    submitting.value = false
  }
}

// ---------- 删除 ----------
async function handleDeleteSingle(row) {
  if (!row) return
  if (!window.confirm(`确认删除资产 ${row.assetNo}（${row.assetName}）吗？删除后无法恢复。`)) return
  try {
    const res = await deleteItAssets([row.id])
    if (res?.code === 200) {
      toast.add({ title: res.msg || '已删除', color: 'success' })
      rowSelection.value = {}
      await refreshAll()
    } else {
      toast.add({ title: res?.msg || '删除失败', color: 'error' })
    }
  } catch (err) {
    toast.add({ title: err?.message || '删除失败', color: 'error' })
  }
}

async function handleDeleteBatch() {
  const targets = selectedAssets.value
  if (!targets.length) return
  if (!window.confirm(`确认批量删除选中的 ${targets.length} 条电脑资产记录吗？删除后无法恢复。`)) return
  try {
    const res = await deleteItAssets(targets.map((item) => item.id))
    if (res?.code === 200) {
      toast.add({ title: res.msg || '批量删除成功', color: 'success' })
      rowSelection.value = {}
      await refreshAll()
    } else {
      toast.add({ title: res?.msg || '批量删除失败', color: 'error' })
    }
  } catch (err) {
    toast.add({ title: err?.message || '批量删除失败', color: 'error' })
  }
}

// ---------- 导出与导入 ----------
const exporting = ref(false)
const importOpen = ref(false)
const importMode = ref('skip')
const importFile = ref(null)
const importFileInputRef = ref(null)
const importing = ref(false)
const downloadingTemplate = ref(false)
const importResult = ref(null)

async function handleExport() {
  exporting.value = true
  try {
    const blob = await exportItAssets(buildFilterPayload())
    if (isJsonBlob(blob)) {
      const msg = await readBlobErrorMessage(blob, '导出台账失败')
      toast.add({ title: msg || '导出台账失败', color: 'error' })
      return
    }
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(/-/g, '')
    saveAs(blob, `IT电脑资产台账_${today}.xlsx`)
  } catch (err) {
    toast.add({ title: err?.message || '导出台账失败', color: 'error' })
  } finally {
    exporting.value = false
  }
}

function openImportModal() {
  importFile.value = null
  importResult.value = null
  importMode.value = 'skip'
  if (importFileInputRef.value) importFileInputRef.value.value = ''
  importOpen.value = true
}

function onImportFileChange(event) {
  const file = event?.target?.files?.[0] || null
  importFile.value = file
  importResult.value = null
}

async function handleDownloadTemplate() {
  downloadingTemplate.value = true
  try {
    const blob = await downloadItAssetTemplate()
    if (isJsonBlob(blob)) {
      const msg = await readBlobErrorMessage(blob, '下载模板失败')
      toast.add({ title: msg || '下载模板失败', color: 'error' })
      return
    }
    saveAs(blob, 'IT资产导入模板.xlsx')
  } catch (err) {
    toast.add({ title: err?.message || '下载模板失败', color: 'error' })
  } finally {
    downloadingTemplate.value = false
  }
}

async function handleSubmitImport() {
  if (!importFile.value) return
  importing.value = true
  try {
    const res = await importItAssets(importFile.value, { mode: importMode.value })
    if (res?.code === 200) {
      importResult.value = res.data || null
      toast.add({ title: res.msg || '导入完成', color: 'success' })
      await refreshAll()
    } else {
      toast.add({ title: res?.msg || '导入失败', color: 'error' })
    }
  } catch (err) {
    toast.add({ title: err?.message || '导入请求失败', color: 'error' })
  } finally {
    importing.value = false
  }
}

// ---------- 从绿盾同步 ----------
const lvdunSyncOpen = ref(false)
const lvdunSyncLoading = ref(false)
const lvdunSyncApplying = ref(false)
const lvdunSyncError = ref('')
const lvdunSyncPlan = ref(null)
const selectedSyncUpdateIds = ref([])
const selectedSyncInsertIds = ref([])
const selectedSyncDisabledIds = ref([])
const lvdunDisabledAction = ref('delete')

const totalSelectedLvDunChanges = computed(
  () => selectedSyncUpdateIds.value.length + selectedSyncInsertIds.value.length + selectedSyncDisabledIds.value.length,
)

function toggleIdInList(listRef, id) {
  if (listRef.value.includes(id)) {
    listRef.value = listRef.value.filter((item) => item !== id)
  } else {
    listRef.value = [...listRef.value, id]
  }
}

function toggleSyncUpdateId(id) {
  toggleIdInList(selectedSyncUpdateIds, id)
}
function toggleSyncInsertId(id) {
  toggleIdInList(selectedSyncInsertIds, id)
}
function toggleSyncDisabledId(id) {
  toggleIdInList(selectedSyncDisabledIds, id)
}
function selectAllSyncUpdates(all) {
  selectedSyncUpdateIds.value = all && lvdunSyncPlan.value ? lvdunSyncPlan.value.updates.map((i) => i.assetId) : []
}
function selectAllSyncInserts(all) {
  selectedSyncInsertIds.value = all && lvdunSyncPlan.value ? lvdunSyncPlan.value.inserts.map((i) => i.lvdunId) : []
}
function selectAllSyncDisabled(all) {
  selectedSyncDisabledIds.value = all && lvdunSyncPlan.value ? lvdunSyncPlan.value.disabled.map((i) => i.assetId) : []
}

async function loadLvDunSyncPreview() {
  lvdunSyncLoading.value = true
  lvdunSyncError.value = ''
  lvdunSyncPlan.value = null
  try {
    const res = await previewItAssetLvDunSync()
    if (res?.code === 200 && res.data) {
      lvdunSyncPlan.value = res.data
      selectedSyncUpdateIds.value = (res.data.updates || []).map((i) => i.assetId)
      selectedSyncInsertIds.value = (res.data.inserts || []).map((i) => i.lvdunId)
      selectedSyncDisabledIds.value = (res.data.disabled || []).map((i) => i.assetId)
    } else {
      lvdunSyncError.value = res?.msg || '采集绿盾数据失败'
    }
  } catch (err) {
    lvdunSyncError.value = err?.message || '连接绿盾服务器失败'
  } finally {
    lvdunSyncLoading.value = false
  }
}

function openLvDunSyncModal() {
  lvdunSyncOpen.value = true
  loadLvDunSyncPreview()
}

async function handleApplyLvDunSync() {
  if (!lvdunSyncPlan.value || totalSelectedLvDunChanges.value === 0) return
  lvdunSyncApplying.value = true
  try {
    const updateSet = new Set(selectedSyncUpdateIds.value)
    const insertSet = new Set(selectedSyncInsertIds.value)
    const payload = {
      updates: (lvdunSyncPlan.value.updates || []).filter((i) => updateSet.has(i.assetId)),
      inserts: (lvdunSyncPlan.value.inserts || []).filter((i) => insertSet.has(i.lvdunId)),
      disabledIds: [...selectedSyncDisabledIds.value],
      disabledAction: lvdunDisabledAction.value,
    }
    const res = await applyItAssetLvDunSync(payload)
    if (res?.code === 200) {
      toast.add({ title: res.msg || '绿盾同步成功', color: 'success' })
      lvdunSyncOpen.value = false
      await refreshAll()
    } else {
      toast.add({ title: res?.msg || '绿盾同步失败', color: 'error' })
    }
  } catch (err) {
    toast.add({ title: err?.message || '绿盾同步请求失败', color: 'error' })
  } finally {
    lvdunSyncApplying.value = false
  }
}

onMounted(() => {
  isClientReady.value = true
  try {
    const saved = localStorage.getItem(LABEL_PREFS_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed && typeof parsed === 'object') {
        labelPrefs.value = {
          companyTitle: parsed.companyTitle || defaultCompanyTitle.value,
          badgeText: parsed.badgeText || IT_ASSET_LABEL_SPEC.defaultBadgeText,
          qrMode: parsed.qrMode === 'summary' ? 'summary' : 'asset_no',
          topReserveMm: normalizeItAssetTopReserveMm(parsed.topReserveMm),
        }
      }
    }
  } catch {}
  refreshAll()
})
</script>
