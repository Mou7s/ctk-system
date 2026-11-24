-- 删除未使用的“客户名片”功能菜单与角色权限关联（保留历史业务表以免误删数据）。
START TRANSACTION;

DELETE rm
FROM sys_role_menu rm
JOIN sys_menu m ON m.menu_id = rm.menu_id
WHERE m.path = 'customerCard'
   OR m.component = 'tk_custom/customerCard/index'
   OR m.perms LIKE 'tk_custom:customerCard:%';

DELETE child
FROM sys_menu child
JOIN sys_menu parent ON child.parent_id = parent.menu_id
WHERE parent.path = 'customerCard'
   OR parent.component = 'tk_custom/customerCard/index'
   OR parent.perms = 'tk_custom:customerCard:list';

DELETE FROM sys_menu
WHERE path = 'customerCard'
   OR component = 'tk_custom/customerCard/index'
   OR perms LIKE 'tk_custom:customerCard:%';

COMMIT;
