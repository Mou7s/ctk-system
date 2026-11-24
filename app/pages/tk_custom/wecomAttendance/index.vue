<template>
  <div class="absolute inset-0 overflow-y-auto bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-white sm:p-6">
    <div class="mx-auto flex min-h-full max-w-[1680px] flex-col gap-4 pb-8">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold">全厂考勤核算与财务导出</h1>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
            自动整合考勤机打卡、企业微信审批与财务分组核算（时薪/计件双休加班、10分钟迟到早退分档、夜班8h补贴门槛）
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UButton color="success" icon="i-lucide-file-spreadsheet" :loading="exporting" @click="handleExport">
            导出财务考勤表（Excel）
          </UButton>
        </div>
      </header>

      <!-- Filter Bar -->
      <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="flex flex-wrap items-end gap-3">
          <UFormField label="统计日期">
            <TkDateRangePicker v-model="dateRange" :clearable="false" class="w-64" />
          </UFormField>

          <UFormField label="统计范围">
            <USelect v-model="filters.scope" :items="scopeItems" class="w-44" />
          </UFormField>

          <UFormField label="财务分组">
            <USelect v-model="filters.financeGroup" :items="financeGroupFilterItems" class="w-40" />
          </UFormField>

          <UFormField label="工号 / 姓名 / 部门">
            <UInput
              v-model="filters.keyword"
              placeholder="输入工号、姓名或部门"
              class="w-48"
              @keyup.enter="loadReport"
            />
          </UFormField>

          <div class="flex items-center gap-2">
            <UButton color="primary" icon="i-lucide-search" :loading="loading" @click="loadReport">查询核算</UButton>
            <UButton color="neutral" variant="outline" @click="resetFilters">本月重置</UButton>
          </div>
        </div>
        <p class="mt-3 text-xs text-slate-400">
          核算口径：时薪/计件周一至周五8h正班+平加（上限3.5h），周六日全计周末加班；月薪11小时（周一至周六）不计平加；夜班首卡≤19:50且满8h计1次补贴；迟到1分钟宽限，迟到/早退按1~10分及11~59分分档。
        </p>
      </section>

      <!-- KPI Cards -->
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="text-xs text-slate-500">统计人数</div>
          <div class="mt-1 text-2xl font-bold">{{ summary.employeeCount }}</div>
          <div class="mt-1 text-xs text-slate-400">车间 {{ summary.workshopCount }} / 固定及保安 {{ summary.officeCount }}</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="text-xs text-slate-500">正班总工时</div>
          <div class="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">{{ summary.totalRegularHours }} <span class="text-sm font-normal">h</span></div>
          <div class="mt-1 text-xs text-slate-400">
            平加 {{ summary.totalWeekdayOvertimeHours }}h / 周末 {{ summary.totalWeekendOvertimeHours }}h / 节假 {{ summary.totalHolidayOvertimeHours }}h
          </div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="text-xs text-slate-500">夜班补贴达标（≤19:50且≥8h）</div>
          <div class="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{ summary.totalNightAllowanceCount }} <span class="text-sm font-normal">次</span></div>
          <div class="mt-1 text-xs text-slate-400">未达标 {{ summary.totalNightAllowanceMissCount }} 次</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="text-xs text-slate-500">企微请假 / 补卡</div>
          <div class="mt-1 text-2xl font-bold text-indigo-600 dark:text-indigo-400">{{ summary.totalLeaveCount }} <span class="text-sm font-normal">人</span></div>
          <div class="mt-1 text-xs text-slate-400">审批补卡合计 {{ summary.totalBukaCount }} 次</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="text-xs text-slate-500">旷工 / 待核漏卡</div>
          <div class="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{{ summary.totalAnomalyDays }} <span class="text-sm font-normal">天待核</span></div>
          <div class="mt-1 text-xs text-slate-400">旷工 {{ summary.totalAbsentDays }} 天（可在「漏卡与异常」复核）</div>
        </div>
      </section>

      <!-- Tabs & Data Table -->
      <section class="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div class="flex items-center gap-2">
            <UButton
              :color="activeTab === 'summary' ? 'primary' : 'neutral'"
              :variant="activeTab === 'summary' ? 'solid' : 'ghost'"
              size="sm"
              @click="activeTab = 'summary'"
            >
              全厂考勤汇总（{{ employees.length }}）
            </UButton>
            <UButton
              :color="activeTab === 'daily' ? 'primary' : 'neutral'"
              :variant="activeTab === 'daily' ? 'solid' : 'ghost'"
              size="sm"
              @click="activeTab = 'daily'"
            >
              每日考勤明细（{{ dailyDetails.length }}）
            </UButton>
            <UButton
              :color="activeTab === 'anomalies' ? 'warning' : 'neutral'"
              :variant="activeTab === 'anomalies' ? 'solid' : 'ghost'"
              size="sm"
              @click="activeTab = 'anomalies'"
            >
              漏卡与异常待核（{{ anomalies.length }}）
            </UButton>
          </div>
          <span v-if="meta.generatedAt" class="text-xs text-slate-400">
            统计区间：{{ meta.startDate }} ~ {{ meta.endDate }}
          </span>
        </div>

        <div v-if="loading" class="px-4 py-16 text-center text-sm text-slate-400">
          正在拉取考勤机与企业微信审批数据并核算工时，请稍候…
        </div>

        <!-- Tab 1: Employee Summary -->
        <div v-else-if="activeTab === 'summary'" class="overflow-x-auto">
          <table class="w-full min-w-[1440px] border-collapse text-sm">
            <thead class="bg-slate-50 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">
              <tr>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">工号</th>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">姓名</th>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">部门</th>
                <th class="border-b border-slate-200 px-3 py-3 text-center font-semibold dark:border-slate-800">财务分组</th>
                <th class="border-b border-slate-200 px-3 py-3 text-center font-semibold dark:border-slate-800">应出/正班/周末/总天</th>
                <th class="border-b border-slate-200 px-3 py-3 text-right font-semibold dark:border-slate-800">正班(h)</th>
                <th class="border-b border-slate-200 px-3 py-3 text-right font-semibold dark:border-slate-800">平加 / 周末 / 节加(h)</th>
                <th class="border-b border-slate-200 px-3 py-3 text-center font-semibold dark:border-slate-800">夜班(可补/总天)</th>
                <th class="border-b border-slate-200 px-3 py-3 text-center font-semibold dark:border-slate-800">迟到(1-10/超10)</th>
                <th class="border-b border-slate-200 px-3 py-3 text-center font-semibold dark:border-slate-800">早退(1-10/超10)</th>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">请假(事/病/带薪)</th>
                <th class="border-b border-slate-200 px-3 py-3 text-center font-semibold dark:border-slate-800">旷工 / 补卡 / 待核</th>
                <th class="border-b border-slate-200 px-3 py-3 text-center font-semibold dark:border-slate-800">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in employees"
                :key="row.userid"
                class="hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <td class="border-b border-slate-100 px-3 py-2 font-mono text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
                  {{ row.employeeCode || '-' }}
                </td>
                <td class="border-b border-slate-100 px-3 py-2 font-medium dark:border-slate-800">
                  <div>{{ row.name }}</div>
                  <div class="text-[11px] font-normal text-slate-400">{{ row.groupName }}</div>
                </td>
                <td class="border-b border-slate-100 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">{{ row.dept }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-center dark:border-slate-800">
                  <button type="button" class="cursor-pointer" title="点击编辑工号与财务分组" @click="openEditProfile(row)">
                    <UBadge :color="financeGroupBadgeColor(row.financeGroup)" variant="subtle" size="xs">
                      {{ row.financeGroup || '-' }}
                    </UBadge>
                  </button>
                </td>
                <td class="border-b border-slate-100 px-3 py-2 text-center font-mono text-xs dark:border-slate-800">
                  <span class="text-slate-400">{{ row.shouldAttendDays }}</span>
                  <span class="mx-0.5 text-slate-300">/</span>
                  <span>{{ row.regularDays }}</span>
                  <span class="mx-0.5 text-slate-300">/</span>
                  <span class="text-blue-600 dark:text-blue-400">{{ row.weekendOvertimeDays }}</span>
                  <span class="mx-0.5 text-slate-300">/</span>
                  <span class="font-semibold">{{ row.totalAttendDays }}</span>
                </td>
                <td class="border-b border-slate-100 px-3 py-2 text-right font-mono dark:border-slate-800">{{ row.regularHours }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-right font-mono text-xs dark:border-slate-800">
                  <span class="text-blue-600 dark:text-blue-400">{{ row.weekdayOvertimeHours }}</span>
                  <span class="mx-0.5 text-slate-300">/</span>
                  <span class="text-emerald-600 dark:text-emerald-400">{{ row.weekendOvertimeHours }}</span>
                  <span class="mx-0.5 text-slate-300">/</span>
                  <span class="text-amber-600 dark:text-amber-400">{{ row.holidayOvertimeHours }}</span>
                </td>
                <td class="border-b border-slate-100 px-3 py-2 text-center text-xs dark:border-slate-800">
                  <span v-if="row.nightShiftDays > 0 || row.nightAllowanceCount > 0">
                    <span class="font-semibold text-emerald-600 dark:text-emerald-400">{{ row.nightAllowanceCount }}</span>
                    <span class="text-slate-400"> / {{ row.nightShiftDays }}</span>
                    <span v-if="row.nightAllowanceMissCount > 0" class="ml-1 text-[11px] text-amber-500">
                      (缺{{ row.nightAllowanceMissCount }})
                    </span>
                  </span>
                  <span v-else class="text-slate-300">-</span>
                </td>
                <td class="border-b border-slate-100 px-3 py-2 text-center font-mono text-xs dark:border-slate-800">
                  <span v-if="row.late1to10Count > 0 || row.lateOver10Count > 0" class="text-rose-600 dark:text-rose-400">
                    {{ row.late1to10Count }} / {{ row.lateOver10Count }}
                    <span class="block text-[11px] text-slate-400">{{ row.lateMinutes }}分</span>
                  </span>
                  <span v-else class="text-slate-300">-</span>
                </td>
                <td class="border-b border-slate-100 px-3 py-2 text-center font-mono text-xs dark:border-slate-800">
                  <span v-if="row.early1to10Count > 0 || row.earlyOver10Count > 0" class="text-orange-600 dark:text-orange-400">
                    {{ row.early1to10Count }} / {{ row.earlyOver10Count }}
                    <span class="block text-[11px] text-slate-400">{{ row.earlyMinutes }}分</span>
                  </span>
                  <span v-else class="text-slate-300">-</span>
                </td>
                <td class="border-b border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
                  <div v-if="row.personalLeaveHours > 0 || row.sickLeaveHours > 0" class="text-rose-600 dark:text-rose-400">
                    <span v-if="row.personalLeaveHours > 0">事{{ row.personalLeaveHours }}h</span>
                    <span v-if="row.personalLeaveHours > 0 && row.sickLeaveHours > 0"> / </span>
                    <span v-if="row.sickLeaveHours > 0">病{{ row.sickLeaveHours }}h</span>
                  </div>
                  <div v-if="row.paidLeaveHours > 0" class="text-indigo-600 dark:text-indigo-400">
                    带薪{{ row.paidLeaveHours }}h
                  </div>
                  <div v-if="!row.personalLeaveHours && !row.sickLeaveHours && !row.paidLeaveHours" class="text-slate-300">-</div>
                </td>
                <td class="border-b border-slate-100 px-3 py-2 text-center font-mono text-xs dark:border-slate-800">
                  <span :class="row.absentDays > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-slate-300'">{{ row.absentDays }}</span>
                  <span class="mx-0.5 text-slate-300">/</span>
                  <span :class="row.bukaCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-300'">{{ row.bukaCount }}</span>
                  <span class="mx-0.5 text-slate-300">/</span>
                  <UBadge v-if="row.anomalyDays > 0" color="warning" variant="subtle" size="xs">{{ row.anomalyDays }}</UBadge>
                  <span v-else class="text-slate-300">0</span>
                </td>
                <td class="border-b border-slate-100 px-3 py-2 text-center dark:border-slate-800">
                  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" @click="openEditProfile(row)">
                    档案
                  </UButton>
                </td>
              </tr>
              <tr v-if="!employees.length">
                <td colspan="13" class="px-4 py-12 text-center text-slate-400">暂无考勤数据</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Tab 2: Daily Details -->
        <div v-else-if="activeTab === 'daily'" class="overflow-x-auto">
          <table class="w-full min-w-[1440px] border-collapse text-sm">
            <thead class="bg-slate-50 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">
              <tr>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">日期</th>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">工号</th>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">姓名</th>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">部门</th>
                <th class="border-b border-slate-200 px-3 py-3 text-center font-semibold dark:border-slate-800">财务分组</th>
                <th class="border-b border-slate-200 px-3 py-3 text-center font-semibold dark:border-slate-800">班别</th>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">原始打卡时间点</th>
                <th class="border-b border-slate-200 px-3 py-3 text-right font-semibold dark:border-slate-800">正班(h)</th>
                <th class="border-b border-slate-200 px-3 py-3 text-right font-semibold dark:border-slate-800">平/周/节加(h)</th>
                <th class="border-b border-slate-200 px-3 py-3 text-center font-semibold dark:border-slate-800">迟到/早退(分)</th>
                <th class="border-b border-slate-200 px-3 py-3 text-center font-semibold dark:border-slate-800">夜班补贴</th>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">企微请假/补卡</th>
                <th class="border-b border-slate-200 px-3 py-3 text-center font-semibold dark:border-slate-800">状态</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(d, idx) in dailyDetails.slice(0, 500)"
                :key="`${d.userid}-${d.date}-${idx}`"
                class="hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <td class="border-b border-slate-100 px-3 py-2 font-mono text-xs dark:border-slate-800">{{ d.date }}</td>
                <td class="border-b border-slate-100 px-3 py-2 font-mono text-xs text-slate-500 dark:border-slate-800">{{ d.employeeCode || '-' }}</td>
                <td class="border-b border-slate-100 px-3 py-2 font-medium dark:border-slate-800">{{ d.name }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-800">{{ d.dept }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-center text-xs dark:border-slate-800">{{ d.financeGroup || '-' }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-center text-xs dark:border-slate-800">{{ d.shiftType }}</td>
                <td class="border-b border-slate-100 px-3 py-2 font-mono text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">{{ d.punchesText || '-' }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-right font-mono dark:border-slate-800">{{ d.regularHours }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-right font-mono text-xs text-blue-600 dark:border-slate-800 dark:text-blue-400">
                  {{ d.weekdayOvertimeHours }} / {{ d.weekendOvertimeHours }} / {{ d.holidayOvertimeHours }}
                </td>
                <td class="border-b border-slate-100 px-3 py-2 text-center font-mono text-xs dark:border-slate-800">
                  <span :class="d.lateMinutes > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-300'">{{ d.lateMinutes || 0 }}</span>
                  <span class="mx-0.5 text-slate-300">/</span>
                  <span :class="d.earlyMinutes > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-300'">{{ d.earlyMinutes || 0 }}</span>
                </td>
                <td class="border-b border-slate-100 px-3 py-2 text-center text-xs dark:border-slate-800">
                  <span v-if="d.nightAllowance === 1" class="font-medium text-emerald-600 dark:text-emerald-400">{{ d.nightAllowanceNote }}</span>
                  <span v-else-if="d.nightAllowanceNote" class="text-slate-400">{{ d.nightAllowanceNote }}</span>
                  <span v-else class="text-slate-300">-</span>
                </td>
                <td class="border-b border-slate-100 px-3 py-2 text-xs text-indigo-600 dark:border-slate-800 dark:text-indigo-400">{{ d.leaveText || '-' }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-center dark:border-slate-800">
                  <UBadge :color="d.status === '正常' ? 'success' : d.status === '请假' ? 'info' : 'warning'" variant="subtle" size="xs">
                    {{ d.status }}
                  </UBadge>
                </td>
              </tr>
              <tr v-if="dailyDetails.length > 500">
                <td colspan="13" class="px-4 py-3 text-center text-xs text-slate-400">
                  页面仅预览前 500 条明细（共 {{ dailyDetails.length }} 条），请点击右上角「导出财务考勤表（Excel）」查看全部明细。
                </td>
              </tr>
              <tr v-if="!dailyDetails.length">
                <td colspan="13" class="px-4 py-12 text-center text-slate-400">暂无明细记录</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Tab 3: Anomalies -->
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[1120px] border-collapse text-sm">
            <thead class="bg-slate-50 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">
              <tr>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">日期</th>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">工号</th>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">姓名</th>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">部门</th>
                <th class="border-b border-slate-200 px-3 py-3 text-center font-semibold dark:border-slate-800">财务分组</th>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">考勤组</th>
                <th class="border-b border-slate-200 px-3 py-3 text-center font-semibold dark:border-slate-800">班别</th>
                <th class="border-b border-slate-200 px-3 py-3 text-center font-semibold dark:border-slate-800">异常说明</th>
                <th class="border-b border-slate-200 px-3 py-3 text-left font-semibold dark:border-slate-800">原始打卡时间点</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, idx) in anomalies" :key="`anom-${d.userid}-${d.date}-${idx}`" class="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <td class="border-b border-slate-100 px-3 py-2 font-mono text-xs dark:border-slate-800">{{ d.date }}</td>
                <td class="border-b border-slate-100 px-3 py-2 font-mono text-xs text-slate-500 dark:border-slate-800">{{ d.employeeCode || '-' }}</td>
                <td class="border-b border-slate-100 px-3 py-2 font-medium dark:border-slate-800">{{ d.name }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-800">{{ d.dept }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-center text-xs dark:border-slate-800">{{ d.financeGroup || '-' }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-800">{{ d.groupName }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-center text-xs dark:border-slate-800">{{ d.shiftType }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-center dark:border-slate-800">
                  <UBadge color="warning" variant="subtle" size="xs">{{ d.status }}</UBadge>
                </td>
                <td class="border-b border-slate-100 px-3 py-2 font-mono text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">{{ d.punchesText || '-' }}</td>
              </tr>
              <tr v-if="!anomalies.length">
                <td colspan="9" class="px-4 py-12 text-center text-slate-400">当前区间无漏卡或异常记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- Edit Employee Finance Profile Modal -->
    <UModal v-model:open="profileModalOpen" title="编辑员工财务档案" :ui="{ content: 'sm:max-w-md' }">
      <template #body>
        <div class="space-y-4">
          <div class="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            <div class="flex justify-between">
              <span class="text-slate-400">员工姓名</span>
              <span class="font-medium">{{ editProfile.employeeName }}</span>
            </div>
            <div class="mt-1 flex justify-between">
              <span class="text-slate-400">企微账号</span>
              <span class="font-mono text-xs">{{ editProfile.userid }}</span>
            </div>
            <div class="mt-1 flex justify-between">
              <span class="text-slate-400">当前企微组</span>
              <span class="text-xs">{{ editProfile.groupName }}</span>
            </div>
          </div>

          <UFormField label="员工工号">
            <UInput v-model="editProfile.employeeCode" placeholder="例如：003911" class="w-full font-mono" />
          </UFormField>

          <UFormField label="财务分组">
            <USelect v-model="editProfile.financeGroup" :items="financeGroupEditItems" class="w-full" />
          </UFormField>

          <UFormField label="备注">
            <UInput v-model="editProfile.remark" placeholder="可选，记录分组调整说明" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="outline" @click="profileModalOpen = false">取消</UButton>
          <UButton color="primary" :loading="savingProfile" @click="saveProfile">保存并重新核算</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import request, { download } from '@/utils/request'

function defaultMonthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return { startDate: `${y}-${m}-01`, endDate: `${y}-${m}-${d}` }
}

const FINANCE_GROUPS = ['时薪', '计件', '月薪', '月薪加班', '月薪11小时', '月薪9.5小时', '保安']

const toast = useToast()
const loading = ref(false)
const exporting = ref(false)
const savingProfile = ref(false)
const profileModalOpen = ref(false)
const activeTab = ref('summary')

const filters = reactive({
  ...defaultMonthRange(),
  scope: 'all',
  financeGroup: 'all',
  keyword: '',
})

const scopeItems = [
  { label: '全厂（255人）', value: 'all' },
  { label: '车间工时制（32+33）', value: 'workshop' },
  { label: '办公室/固定班（22-30）', value: 'office' },
  { label: '保安排班（31）', value: 'guard' },
]

const financeGroupFilterItems = [
  { label: '全部财务分组', value: 'all' },
  ...FINANCE_GROUPS.map((g) => ({ label: g, value: g })),
]

const financeGroupEditItems = [
  { label: '按企微规则组自动兜底', value: '__auto__' },
  ...FINANCE_GROUPS.map((g) => ({ label: g, value: g })),
]

const dateRange = computed({
  get: () => (filters.startDate && filters.endDate ? [filters.startDate, filters.endDate] : []),
  set: (val) => {
    if (Array.isArray(val) && val[0] && val[1]) {
      filters.startDate = String(val[0]).slice(0, 10)
      filters.endDate = String(val[1]).slice(0, 10)
    }
  },
})

const meta = ref({ startDate: '', endDate: '', generatedAt: '' })
const summary = ref({
  employeeCount: 0,
  workshopCount: 0,
  officeCount: 0,
  totalRegularHours: 0,
  totalWeekdayOvertimeHours: 0,
  totalWeekendOvertimeHours: 0,
  totalHolidayOvertimeHours: 0,
  totalOvertimeHours: 0,
  totalNightAllowanceCount: 0,
  totalNightAllowanceMissCount: 0,
  totalLeaveCount: 0,
  totalBukaCount: 0,
  totalAbsentDays: 0,
  totalAnomalyDays: 0,
})
const employees = ref([])
const dailyDetails = ref([])
const anomalies = ref([])

const editProfile = reactive({
  userid: '',
  employeeName: '',
  groupName: '',
  employeeCode: '',
  financeGroup: '__auto__',
  remark: '',
})

function financeGroupBadgeColor(fg) {
  if (fg === '时薪' || fg === '计件') return 'primary'
  if (fg === '月薪加班' || fg === '月薪11小时' || fg === '月薪9.5小时') return 'info'
  if (fg === '保安') return 'warning'
  return 'neutral'
}

function openEditProfile(row) {
  editProfile.userid = row.userid
  editProfile.employeeName = row.name
  editProfile.groupName = row.groupName
  editProfile.employeeCode = row.employeeCode || ''
  editProfile.financeGroup = FINANCE_GROUPS.includes(row.financeGroup) ? row.financeGroup : '__auto__'
  editProfile.remark = row.profileRemark || ''
  profileModalOpen.value = true
}

async function saveProfile() {
  if (savingProfile.value || !editProfile.userid) return
  savingProfile.value = true
  try {
    const res = await request({
      url: '/tk_custom/wecomAttendance/profile',
      method: 'put',
      data: {
        userid: editProfile.userid,
        employeeCode: editProfile.employeeCode,
        employeeName: editProfile.employeeName,
        financeGroup: editProfile.financeGroup === '__auto__' ? '' : editProfile.financeGroup,
        remark: editProfile.remark,
      },
    })
    if (res?.code !== 200) {
      throw new Error(res?.msg || '保存员工财务档案失败')
    }
    toast.add({ title: '财务档案已更新，正在重新核算', color: 'success' })
    profileModalOpen.value = false
    await loadReport()
  } catch (error) {
    toast.add({ title: error?.message || '保存员工财务档案失败', color: 'error' })
  } finally {
    savingProfile.value = false
  }
}

async function loadReport() {
  if (loading.value) return
  loading.value = true
  try {
    const res = await request({
      url: '/tk_custom/wecomAttendance/report',
      method: 'get',
      params: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        scope: filters.scope,
        financeGroup: filters.financeGroup === 'all' ? '' : filters.financeGroup,
        keyword: filters.keyword,
      },
    })
    if (res?.code !== 200 || !res?.data) {
      throw new Error(res?.msg || '查询考勤核算失败')
    }
    meta.value = res.data.meta || {}
    summary.value = res.data.summary || summary.value
    employees.value = res.data.employees || []
    dailyDetails.value = res.data.dailyDetails || []
    anomalies.value = res.data.anomalies || []
  } catch (error) {
    toast.add({ title: error?.message || '查询考勤核算失败', color: 'error' })
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  Object.assign(filters, defaultMonthRange(), { scope: 'all', financeGroup: 'all', keyword: '' })
  loadReport()
}

async function handleExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const scopeLabel = filters.scope === 'workshop' ? '车间' : filters.scope === 'office' ? '办公室' : filters.scope === 'guard' ? '保安' : '全厂'
    await download(
      'tk_custom/wecomAttendance/export',
      {
        startDate: filters.startDate,
        endDate: filters.endDate,
        scope: filters.scope,
        financeGroup: filters.financeGroup === 'all' ? '' : filters.financeGroup,
        keyword: filters.keyword,
      },
      `财务考勤核算_${scopeLabel}_${filters.startDate}_${filters.endDate}.xlsx`,
    )
  } catch (error) {
    toast.add({ title: error?.message || '导出表格失败', color: 'error' })
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  loadReport()
})
</script>
