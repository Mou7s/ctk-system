-- 将 IT 资产台账中的国际销售子部门统一归并到一级部门「国际销售部」
-- 幂等执行：重复运行不会影响已归并记录

UPDATE tk_it_asset
SET use_dept = '国际销售部'
WHERE use_dept IN ('国际一部', '国际二部', '国际部');
