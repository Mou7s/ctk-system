-- 1. 从存量 remark 中的「绿盾ID: xxx」提取并回填到 lvdun_id（幂等）
UPDATE tk_it_asset
SET lvdun_id = CAST(
  REGEXP_REPLACE(REGEXP_SUBSTR(remark, '绿盾ID:[[:space:]]*[0-9]+'), '[^0-9]', '')
  AS UNSIGNED
)
WHERE lvdun_id IS NULL
  AND remark IS NOT NULL
  AND remark REGEXP '绿盾ID:[[:space:]]*[0-9]+';

-- 2. 清理 remark 中由同步脚本/绿盾同步自动拼接的技术元数据与同步流水，仅保留人工备注
UPDATE tk_it_asset
SET remark = NULLIF(
  TRIM(
    BOTH ' ' FROM TRIM(
      BOTH '|' FROM REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            remark,
            '(^|\\|)[[:space:]]*(主机名:|绿盾备注:|绿盾ID:|最近在线:|来源:|[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]]+(绿盾同步|同步绿盾)\\()[^|]*',
            ''
          ),
          '[[:space:]]*\\|[[:space:]]*\\|[[:space:]]*',
          ' | '
        ),
        '^[[:space:]]*\\|[[:space:]]*|[[:space:]]*\\|[[:space:]]*$',
        ''
      )
    )
  ),
  ''
)
WHERE remark IS NOT NULL
  AND remark REGEXP '(主机名:|绿盾备注:|绿盾ID:|最近在线:|来源:|[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]]+(绿盾同步|同步绿盾)\\()';
