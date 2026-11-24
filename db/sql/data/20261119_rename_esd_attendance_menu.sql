-- 将原 ESD 防静电门禁刷卡页面菜单（menu_id=2255）由「考勤管理」更名为「ESD门禁记录」，避免与「考勤核算」混淆。
UPDATE sys_menu
SET menu_name = 'ESD门禁记录',
    icon = 'i-lucide-shield-check',
    remark = 'ESD防静电门禁刷卡记录',
    update_by = 'admin',
    update_time = NOW()
WHERE menu_id = 2255 OR (path = 'attendance' AND component = 'tk_custom/attendance/index');
