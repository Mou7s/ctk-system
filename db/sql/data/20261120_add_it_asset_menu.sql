-- 在「TK内部管理」（parent_id = 2006）下新增「IT资产管理」页面与按钮权限
-- 幂等：重复执行不会产生重复菜单或重复授权；仅默认授权给管理员角色（role_id = 1），后续可按角色分配。

SET @internal_parent := (
    SELECT menu_id
    FROM sys_menu
    WHERE menu_id = 2006
       OR (parent_id = 0 AND (path = 'tk_custom' OR menu_name = 'TK内部管理'))
    ORDER BY menu_id = 2006 DESC, menu_id ASC
    LIMIT 1
);

INSERT INTO sys_menu (
    menu_name, parent_id, order_num, path, component, query, route_name,
    is_frame, is_cache, menu_type, visible, status, perms, icon,
    create_by, create_time, remark
)
SELECT
    'IT资产管理', @internal_parent, 10, 'itAsset',
    'tk_custom/itAsset/index', NULL, 'ItAsset',
    1, 0, 'C', '0', '0', 'tk_custom:itAsset:list',
    'i-lucide-monitor', 'admin', NOW(), '公司电脑IT资产台账、70×50mm二维码标签预览与打印'
FROM DUAL
WHERE @internal_parent IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM sys_menu
      WHERE perms = 'tk_custom:itAsset:list' OR path = 'itAsset'
  );

SET @it_asset_menu := (
    SELECT menu_id
    FROM sys_menu
    WHERE perms = 'tk_custom:itAsset:list' OR path = 'itAsset'
    ORDER BY menu_id DESC
    LIMIT 1
);

UPDATE sys_menu
SET menu_name = 'IT资产管理',
    parent_id = @internal_parent,
    order_num = 10,
    path = 'itAsset',
    component = 'tk_custom/itAsset/index',
    route_name = 'ItAsset',
    menu_type = 'C',
    visible = '0',
    status = '0',
    perms = 'tk_custom:itAsset:list',
    icon = 'i-lucide-monitor',
    update_by = 'admin',
    update_time = NOW()
WHERE menu_id = @it_asset_menu;

INSERT INTO sys_menu (
    menu_name, parent_id, order_num, path, component, query, route_name,
    is_frame, is_cache, menu_type, visible, status, perms, icon,
    create_by, create_time, remark
)
SELECT
    p.menu_name, @it_asset_menu, p.order_num, '#', NULL, NULL, '',
    1, 0, 'F', '0', '0', p.perms, '#',
    'admin', NOW(), p.remark
FROM (
    SELECT 'IT资产查询' AS menu_name, 1 AS order_num, 'tk_custom:itAsset:query' AS perms, '查询电脑资产台账与统计' AS remark
    UNION ALL SELECT 'IT资产新增', 2, 'tk_custom:itAsset:add', '新增电脑资产记录'
    UNION ALL SELECT 'IT资产编辑', 3, 'tk_custom:itAsset:edit', '编辑电脑资产记录'
    UNION ALL SELECT 'IT资产删除', 4, 'tk_custom:itAsset:remove', '删除电脑资产记录'
    UNION ALL SELECT 'IT资产导入', 5, 'tk_custom:itAsset:import', 'Excel批量导入电脑资产'
    UNION ALL SELECT 'IT资产导出', 6, 'tk_custom:itAsset:export', '导出电脑资产台账Excel'
    UNION ALL SELECT 'IT资产打印标签', 7, 'tk_custom:itAsset:print', '打印70×50mm资产标签'
) p
WHERE @it_asset_menu IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM sys_menu existing
      WHERE existing.perms = p.perms
  );

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT 1, m.menu_id
FROM sys_menu m
WHERE (m.menu_id = @it_asset_menu OR m.parent_id = @it_asset_menu)
  AND m.perms LIKE 'tk_custom:itAsset:%'
  AND NOT EXISTS (
      SELECT 1 FROM sys_role_menu existing
      WHERE existing.role_id = 1
        AND existing.menu_id = m.menu_id
  );
