import { describe, expect, it, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import { useTkListQuery, useTkRowInteraction } from '@ctk-system/composables';

describe('@ctk-system/composables', () => {
  it('useTkListQuery loads rows and resets pageNum on handleQuery', async () => {
    const queryParams = ref({ pageNum: 3, pageSize: 10 });
    const fetchList = vi.fn().mockResolvedValue({ rows: [{ id: 1 }], total: 1 });
    const { list, total, handleQuery } = useTkListQuery({ queryParams, fetchList });

    await handleQuery();
    await nextTick();

    expect(queryParams.value.pageNum).toBe(1);
    expect(list.value).toEqual([{ id: 1 }]);
    expect(total.value).toBe(1);
    expect(fetchList).toHaveBeenCalledTimes(1);
  });

  it('useTkRowInteraction toggles selection on row click', () => {
    const currentRowId = ref(null);
    const ids = ref([]);
    const single = ref(true);
    const multiple = ref(true);
    const table = {
      clearSelection: vi.fn(),
      setCurrentRow: vi.fn(),
      toggleRowSelection: vi.fn(),
    };
    const getTableRef = () => ref(table);
    const { handleRowClick } = useTkRowInteraction({
      getTableRef,
      currentRowId,
      ids,
      single,
      multiple,
    });

    handleRowClick({ id: 9 }, { label: '报告编号' });
    expect(currentRowId.value).toBe(9);
    expect(table.toggleRowSelection).toHaveBeenCalledWith({ id: 9 }, true);

    handleRowClick({ id: 9 }, { label: '报告编号' });
    expect(currentRowId.value).toBe(null);
    expect(table.clearSelection).toHaveBeenCalled();
  });
});