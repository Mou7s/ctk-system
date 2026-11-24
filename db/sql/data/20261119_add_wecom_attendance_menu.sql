-- 在人事/考勤同级菜单（parent_id = 2006）下新增「考勤核算」页面
-- 幂等：重复执行不会产生重复菜单或角色授权。

SET @hr_parent = (
    SELECT parent_id
    FROM sys_menu
    WHERE menu_id IN (2228, 2255)
    ORDER BY menu_id = 2255 DESC
    LIMIT 1
);

INSERT INTO sys_menu (
    menu_name, parent_id, order_num, path, component, query, route_name,
    is_frame, is_cache, menu_type, visible, status, perms, icon,
    create_by, create_time, remark
)
SELECT
    '考勤核算', @hr_parent, 2, 'wecomAttendance',
    'tk_custom/wecomAttendance/index', NULL, 'WecomAttendance',
    1, 0, 'C', '0', '0', 'tk_custom:wecomAttendance:list',
    'i-lucide-calendar-check', 'admin', NOW(), '企业微信考勤与车间工时/夜班补贴核算及财务导出'
FROM DUAL
WHERE @hr_parent IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM sys_menu
      WHERE perms = 'tk_custom:wecomAttendance:list' OR path = 'wecomAttendance'
  );

SET @wecom_att_menu = (
    SELECT menu_id
    FROM sys_menu
    WHERE perms = 'tk_custom:wecomAttendance:list' OR path = 'wecomAttendance'
    ORDER BY menu_id DESC
    LIMIT 1
);

UPDATE sys_menu
SET menu_name = '考勤核算',
    parent_id = @hr_parent,
    order_num = 2,
    path = 'wecomAttendance',
    component = 'tk_custom/wecomAttendance/index',
    route_name = 'WecomAttendance',
    menu_type = 'C',
    visible = '0',
    status = '0',
    perms = 'tk_custom:wecomAttendance:list',
    icon = 'i-lucide-calendar-check',
    update_by = 'admin',
    update_time = NOW()
WHERE menu_id = @wecom_att_menu;

INSERT INTO sys_role_menu (role_id, menu_id)
SELECT DISTINCT role_id, @wecom_att_menu
FROM sys_role_menu
WHERE menu_id IN (2228, 2255)
  AND @wecom_att_menu IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM sys_role_menu existing
      WHERE existing.role_id = sys_role_menu.role_id
        AND existing.menu_id = @wecom_att_menu
  );
