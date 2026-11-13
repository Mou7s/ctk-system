import { ref } from 'vue';
import { DEFAULT_PAGE_NUM } from '@ctk-system/shared';

/**
 * Standard paginated list query composable.
 *
 * 不变量（2026-09-18 补齐，此前只有 loading/list/total）：
 *  - **并发**：只接受最后一次请求的响应（单调序号），过期响应不写 list/total，也不复位 loading。
 *    Nitro 平均每天重启两次，快切筛选/翻页重查时「旧响应后到」是常态。
 *  - **失败**：`code` 是数字且不等于 200（401/403/429/502…）时记 `error`，**保留上一次的
 *    list/total**（把 401 渲染成空表会让人误以为「本来就没数据」），并跳过 afterLoad。
 *  - **不抛错**：既有页面多数是裸 `getList()`（没有 await/catch），抛错会变成 unhandled
 *    rejection；失败信息通过 `error` 暴露，页面用不用它自己决定，各处现有 toast 保持原样。
 *  - 兼容没有 `code` 字段的响应（按成功处理）。
 *
 * @param {object} options
 * @param {import('vue').Ref<object>} options.queryParams must include pageNum/pageSize
 * @param {() => Promise<{rows: Array, total: number}>} options.fetchList
 * @param {() => void} [options.beforeReset] runs before handleQuery on reset
 * @param {() => void} [options.afterLoad] runs after each successful fetch
 */
export function useTkListQuery({ queryParams, fetchList, beforeReset, afterLoad }) {
  const loading = ref(false);
  const list = ref([]);
  const total = ref(0);
  const error = ref(null);
  let requestSeq = 0;

  async function getList(options = {}) {
    const seq = requestSeq + 1;
    requestSeq = seq;
    const silent = Boolean(options?.silent);
    if (!silent) {
      loading.value = true;
    }
    try {
      const response = await fetchList();
      if (seq !== requestSeq) return;
      const code = response?.code;
      if (typeof code === 'number' && code !== 200) {
        if (!silent) {
          error.value = response?.msg || '查询失败';
        }
        return;
      }
      error.value = null;
      list.value = response?.rows ?? [];
      total.value = response?.total ?? 0;
      afterLoad?.();
    } catch (err) {
      if (seq !== requestSeq) return;
      if (!silent) {
        error.value = (err && err.message) || '查询失败';
      }
    } finally {
      // 静默请求也可能接替正在加载的普通请求，最新请求必须负责收尾。
      if (seq === requestSeq) loading.value = false;
    }
  }

  function handleQuery() {
    queryParams.value.pageNum = DEFAULT_PAGE_NUM;
    return getList();
  }

  function resetQuery() {
    beforeReset?.();
    return handleQuery();
  }

  return {
    loading,
    list,
    total,
    error,
    getList,
    handleQuery,
    resetQuery,
  };
}
