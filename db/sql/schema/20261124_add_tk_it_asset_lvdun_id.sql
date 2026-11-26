-- 为 tk_it_asset 新增内部关联字段 lvdun_id，替代原先拼接在 remark 中的「绿盾ID: xxx」
-- 幂等执行：列和索引已存在时自动跳过

SET @has_lvdun_id := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tk_it_asset'
    AND COLUMN_NAME = 'lvdun_id'
);
SET @sql_add_col := IF(
  @has_lvdun_id = 0,
  'ALTER TABLE tk_it_asset ADD COLUMN lvdun_id INT UNSIGNED DEFAULT NULL COMMENT ''绿盾设备ID（内部同步关联）'' AFTER mac_address',
  'SELECT 1'
);
PREPARE stmt_add_col FROM @sql_add_col;
EXECUTE stmt_add_col;
DEALLOCATE PREPARE stmt_add_col;

SET @has_lvdun_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tk_it_asset'
    AND INDEX_NAME = 'idx_tk_it_asset_lvdun_id'
);
SET @sql_add_idx := IF(
  @has_lvdun_idx = 0,
  'ALTER TABLE tk_it_asset ADD KEY idx_tk_it_asset_lvdun_id (lvdun_id)',
  'SELECT 1'
);
PREPARE stmt_add_idx FROM @sql_add_idx;
EXECUTE stmt_add_idx;
DEALLOCATE PREPARE stmt_add_idx;
