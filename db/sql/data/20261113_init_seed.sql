-- =============================================================================
-- Open-source minimal seed data (sanitized, no real credentials or PII)
-- Target schema: db/sql/schema/20261113_init_schema.sql
--
-- IMPORTANT:
--   Placeholder accounts (`admin`, `demo`) ship with a non-login sentinel
--   password (`__RESET_PASSWORD_BEFORE_LOGIN__`). Before first login, set a
--   bcrypt hash via SQL, for example:
--     bun -e "console.log(await Bun.password.hash('YourStrongPass', { algorithm: 'bcrypt', cost: 10 }))"
--   Then run:
--     UPDATE sys_user SET password = '<bcrypt-hash>' WHERE user_name IN ('admin', 'demo');
-- =============================================================================

SET NAMES utf8mb4;

-- ----------------------------
-- 1. sys_dept (default departments)
-- ----------------------------
INSERT IGNORE INTO `sys_dept` (`dept_id`, `parent_id`, `ancestors`, `dept_name`, `order_num`, `leader`, `phone`, `email`, `status`, `del_flag`, `create_by`, `create_time`) VALUES
  (100, 0,   '0',       '总部',   0, 'Admin', '', 'admin@example.com', '0', '0', 'admin', NOW()),
  (101, 100, '0,100',   '研发部', 1, 'Lead',  '', 'dev@example.com',   '0', '0', 'admin', NOW()),
  (102, 100, '0,100',   '运营部', 2, 'Ops',   '', 'ops@example.com',   '0', '0', 'admin', NOW());

-- ----------------------------
-- 2. sys_post (default posts)
-- ----------------------------
INSERT IGNORE INTO `sys_post` (`post_id`, `post_code`, `post_name`, `post_sort`, `status`, `create_by`, `create_time`, `remark`) VALUES
  (1, 'admin', '系统管理员', 1, '0', 'admin', NOW(), '示例岗位'),
  (2, 'user',  '普通员工',   2, '0', 'admin', NOW(), '示例岗位');

-- ----------------------------
-- 3. sys_role (default roles)
-- ----------------------------
INSERT IGNORE INTO `sys_role` (`role_id`, `role_name`, `role_key`, `role_sort`, `data_scope`, `menu_check_strictly`, `dept_check_strictly`, `status`, `del_flag`, `create_by`, `create_time`, `remark`) VALUES
  (1, '超级管理员', 'admin',  1, '1', 1, 1, '0', '0', 'admin', NOW(), '超级管理员'),
  (2, '普通用户',   'common', 2, '2', 1, 1, '0', '0', 'admin', NOW(), '基础演示角色');

-- ----------------------------
-- 4. sys_user (placeholder accounts - reset password before login)
-- ----------------------------
INSERT IGNORE INTO `sys_user` (`user_id`, `dept_id`, `user_name`, `nick_name`, `user_type`, `email`, `phonenumber`, `sex`, `avatar`, `password`, `status`, `del_flag`, `login_ip`, `login_date`, `create_by`, `create_time`, `remark`) VALUES
  (1, 100, 'admin', '管理员',   '00', 'admin@example.com', '', '0', '', '__RESET_PASSWORD_BEFORE_LOGIN__', '0', '0', '', NULL, 'admin', NOW(), '管理员占位账号，首次登录前请重置密码'),
  (2, 101, 'demo',  '演示用户', '00', 'demo@example.com',  '', '0', '', '__RESET_PASSWORD_BEFORE_LOGIN__', '0', '0', '', NULL, 'admin', NOW(), '普通演示占位账号，首次登录前请重置密码');

-- ----------------------------
-- 5. sys_user_role
-- ----------------------------
INSERT IGNORE INTO `sys_user_role` (`user_id`, `role_id`) VALUES
  (1, 1),
  (2, 2);

-- ----------------------------
-- 6. sys_menu (minimal runnable System & Monitor menus + permissions)
-- ----------------------------
INSERT IGNORE INTO `sys_menu` (`menu_id`, `menu_name`, `parent_id`, `order_num`, `path`, `component`, `query`, `route_name`, `is_frame`, `is_cache`, `menu_type`, `visible`, `status`, `perms`, `icon`, `create_by`, `create_time`, `remark`) VALUES
  -- Top directories
  (1, '系统管理', 0, 1, 'system',  NULL, '', '', 1, 0, 'M', '0', '0', '', 'system',  'admin', NOW(), '系统管理目录'),
  (2, '系统监控', 0, 2, 'monitor', NULL, '', '', 1, 0, 'M', '0', '0', '', 'monitor', 'admin', NOW(), '系统监控目录'),

  -- System pages
  (100, '用户管理', 1, 1, 'user',   'system/user/index',   '', '', 1, 0, 'C', '0', '0', 'system:user:list',   'user',      'admin', NOW(), '用户管理菜单'),
  (101, '角色管理', 1, 2, 'role',   'system/role/index',   '', '', 1, 0, 'C', '0', '0', 'system:role:list',   'peoples',   'admin', NOW(), '角色管理菜单'),
  (102, '菜单管理', 1, 3, 'menu',   'system/menu/index',   '', '', 1, 0, 'C', '0', '0', 'system:menu:list',   'tree-table','admin', NOW(), '菜单管理菜单'),
  (103, '部门管理', 1, 4, 'dept',   'system/dept/index',   '', '', 1, 0, 'C', '0', '0', 'system:dept:list',   'tree',      'admin', NOW(), '部门管理菜单'),
  (104, '岗位管理', 1, 5, 'post',   'system/post/index',   '', '', 1, 0, 'C', '0', '0', 'system:post:list',   'post',      'admin', NOW(), '岗位管理菜单'),
  (105, '字典管理', 1, 6, 'dict',   'system/dict/index',   '', '', 1, 0, 'C', '0', '0', 'system:dict:list',   'dict',      'admin', NOW(), '字典管理菜单'),
  (106, '参数设置', 1, 7, 'config', 'system/config/index', '', '', 1, 0, 'C', '0', '0', 'system:config:list', 'edit',      'admin', NOW(), '参数设置菜单'),
  (107, '通知公告', 1, 8, 'notice', 'system/notice/index', '', '', 1, 0, 'C', '0', '0', 'system:notice:list', 'message',   'admin', NOW(), '通知公告菜单'),
  (108, '日志管理', 1, 9, 'log',    '',                    '', '', 1, 0, 'M', '0', '0', '',                   'log',       'admin', NOW(), '日志管理目录'),

  -- Monitor pages
  (109, '在线用户', 2, 1, 'online', 'monitor/online/index', '', '', 1, 0, 'C', '0', '0', 'monitor:online:list', 'online', 'admin', NOW(), '在线用户菜单'),
  (110, '定时任务', 2, 2, 'job',    'monitor/job/index',    '', '', 1, 0, 'C', '0', '0', 'monitor:job:list',    'job',    'admin', NOW(), '定时任务菜单'),
  (111, '服务监控', 2, 3, 'server', 'monitor/server/index', '', '', 1, 0, 'C', '0', '0', 'monitor:server:list', 'server', 'admin', NOW(), '服务监控菜单'),
  (112, '缓存监控', 2, 4, 'cache',  'monitor/cache/index',  '', '', 1, 0, 'C', '0', '0', 'monitor:cache:list',  'redis',  'admin', NOW(), '缓存监控菜单'),

  -- Log sub-pages
  (500, '操作日志', 108, 1, 'operlog',    'monitor/operlog/index',    '', '', 1, 0, 'C', '0', '0', 'monitor:operlog:list',    'form',      'admin', NOW(), '操作日志菜单'),
  (501, '登录日志', 108, 2, 'logininfor', 'monitor/logininfor/index', '', '', 1, 0, 'C', '0', '0', 'monitor:logininfor:list', 'logininfor','admin', NOW(), '登录日志菜单'),

  -- Action permissions (F)
  (1000, '用户查询', 100, 1, '', '', '', '', 1, 0, 'F', '0', '0', 'system:user:query',    '#', 'admin', NOW(), ''),
  (1001, '用户新增', 100, 2, '', '', '', '', 1, 0, 'F', '0', '0', 'system:user:add',      '#', 'admin', NOW(), ''),
  (1002, '用户修改', 100, 3, '', '', '', '', 1, 0, 'F', '0', '0', 'system:user:edit',     '#', 'admin', NOW(), ''),
  (1003, '用户删除', 100, 4, '', '', '', '', 1, 0, 'F', '0', '0', 'system:user:remove',   '#', 'admin', NOW(), ''),
  (1004, '用户导出', 100, 5, '', '', '', '', 1, 0, 'F', '0', '0', 'system:user:export',   '#', 'admin', NOW(), ''),
  (1005, '重置密码', 100, 6, '', '', '', '', 1, 0, 'F', '0', '0', 'system:user:resetPwd', '#', 'admin', NOW(), ''),

  (1006, '角色查询', 101, 1, '', '', '', '', 1, 0, 'F', '0', '0', 'system:role:query',  '#', 'admin', NOW(), ''),
  (1007, '角色新增', 101, 2, '', '', '', '', 1, 0, 'F', '0', '0', 'system:role:add',    '#', 'admin', NOW(), ''),
  (1008, '角色修改', 101, 3, '', '', '', '', 1, 0, 'F', '0', '0', 'system:role:edit',   '#', 'admin', NOW(), ''),
  (1009, '角色删除', 101, 4, '', '', '', '', 1, 0, 'F', '0', '0', 'system:role:remove', '#', 'admin', NOW(), ''),
  (1010, '角色导出', 101, 5, '', '', '', '', 1, 0, 'F', '0', '0', 'system:role:export', '#', 'admin', NOW(), ''),

  (1011, '菜单查询', 102, 1, '', '', '', '', 1, 0, 'F', '0', '0', 'system:menu:query',  '#', 'admin', NOW(), ''),
  (1012, '菜单新增', 102, 2, '', '', '', '', 1, 0, 'F', '0', '0', 'system:menu:add',    '#', 'admin', NOW(), ''),
  (1013, '菜单修改', 102, 3, '', '', '', '', 1, 0, 'F', '0', '0', 'system:menu:edit',   '#', 'admin', NOW(), ''),
  (1014, '菜单删除', 102, 4, '', '', '', '', 1, 0, 'F', '0', '0', 'system:menu:remove', '#', 'admin', NOW(), ''),

  (1015, '部门查询', 103, 1, '', '', '', '', 1, 0, 'F', '0', '0', 'system:dept:query',  '#', 'admin', NOW(), ''),
  (1016, '部门新增', 103, 2, '', '', '', '', 1, 0, 'F', '0', '0', 'system:dept:add',    '#', 'admin', NOW(), ''),
  (1017, '部门修改', 103, 3, '', '', '', '', 1, 0, 'F', '0', '0', 'system:dept:edit',   '#', 'admin', NOW(), ''),
  (1018, '部门删除', 103, 4, '', '', '', '', 1, 0, 'F', '0', '0', 'system:dept:remove', '#', 'admin', NOW(), ''),

  (1019, '岗位查询', 104, 1, '', '', '', '', 1, 0, 'F', '0', '0', 'system:post:query',  '#', 'admin', NOW(), ''),
  (1020, '岗位新增', 104, 2, '', '', '', '', 1, 0, 'F', '0', '0', 'system:post:add',    '#', 'admin', NOW(), ''),
  (1021, '岗位修改', 104, 3, '', '', '', '', 1, 0, 'F', '0', '0', 'system:post:edit',   '#', 'admin', NOW(), ''),
  (1022, '岗位删除', 104, 4, '', '', '', '', 1, 0, 'F', '0', '0', 'system:post:remove', '#', 'admin', NOW(), ''),
  (1023, '岗位导出', 104, 5, '', '', '', '', 1, 0, 'F', '0', '0', 'system:post:export', '#', 'admin', NOW(), ''),

  (1024, '字典查询', 105, 1, '', '', '', '', 1, 0, 'F', '0', '0', 'system:dict:query',  '#', 'admin', NOW(), ''),
  (1025, '字典新增', 105, 2, '', '', '', '', 1, 0, 'F', '0', '0', 'system:dict:add',    '#', 'admin', NOW(), ''),
  (1026, '字典修改', 105, 3, '', '', '', '', 1, 0, 'F', '0', '0', 'system:dict:edit',   '#', 'admin', NOW(), ''),
  (1027, '字典删除', 105, 4, '', '', '', '', 1, 0, 'F', '0', '0', 'system:dict:remove', '#', 'admin', NOW(), ''),
  (1028, '字典导出', 105, 5, '', '', '', '', 1, 0, 'F', '0', '0', 'system:dict:export', '#', 'admin', NOW(), ''),

  (1029, '参数查询', 106, 1, '', '', '', '', 1, 0, 'F', '0', '0', 'system:config:query',  '#', 'admin', NOW(), ''),
  (1030, '参数新增', 106, 2, '', '', '', '', 1, 0, 'F', '0', '0', 'system:config:add',    '#', 'admin', NOW(), ''),
  (1031, '参数修改', 106, 3, '', '', '', '', 1, 0, 'F', '0', '0', 'system:config:edit',   '#', 'admin', NOW(), ''),
  (1032, '参数删除', 106, 4, '', '', '', '', 1, 0, 'F', '0', '0', 'system:config:remove', '#', 'admin', NOW(), ''),
  (1033, '参数导出', 106, 5, '', '', '', '', 1, 0, 'F', '0', '0', 'system:config:export', '#', 'admin', NOW(), ''),

  (1034, '公告查询', 107, 1, '', '', '', '', 1, 0, 'F', '0', '0', 'system:notice:query',  '#', 'admin', NOW(), ''),
  (1035, '公告新增', 107, 2, '', '', '', '', 1, 0, 'F', '0', '0', 'system:notice:add',    '#', 'admin', NOW(), ''),
  (1036, '公告修改', 107, 3, '', '', '', '', 1, 0, 'F', '0', '0', 'system:notice:edit',   '#', 'admin', NOW(), ''),
  (1037, '公告删除', 107, 4, '', '', '', '', 1, 0, 'F', '0', '0', 'system:notice:remove', '#', 'admin', NOW(), ''),

  (1038, '操作查询', 500, 1, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:operlog:query',  '#', 'admin', NOW(), ''),
  (1039, '操作删除', 500, 2, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:operlog:remove', '#', 'admin', NOW(), ''),
  (1040, '日志导出', 500, 3, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:operlog:export', '#', 'admin', NOW(), ''),

  (1041, '登录查询', 501, 1, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:logininfor:query',  '#', 'admin', NOW(), ''),
  (1042, '登录删除', 501, 2, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:logininfor:remove', '#', 'admin', NOW(), ''),
  (1043, '日志导出', 501, 3, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:logininfor:export', '#', 'admin', NOW(), ''),
  (1044, '账户解锁', 501, 4, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:logininfor:unlock', '#', 'admin', NOW(), ''),

  (1045, '在线查询', 109, 1, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:online:query',       '#', 'admin', NOW(), ''),
  (1046, '批量强退', 109, 2, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:online:batchLogout', '#', 'admin', NOW(), ''),
  (1047, '单条强退', 109, 3, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:online:forceLogout', '#', 'admin', NOW(), ''),

  (1048, '任务查询', 110, 1, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:job:query',        '#', 'admin', NOW(), ''),
  (1049, '任务新增', 110, 2, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:job:add',          '#', 'admin', NOW(), ''),
  (1050, '任务修改', 110, 3, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:job:edit',         '#', 'admin', NOW(), ''),
  (1051, '任务删除', 110, 4, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:job:remove',       '#', 'admin', NOW(), ''),
  (1052, '状态修改', 110, 5, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:job:changeStatus', '#', 'admin', NOW(), ''),
  (1053, '任务导出', 110, 6, '', '', '', '', 1, 0, 'F', '0', '0', 'monitor:job:export',       '#', 'admin', NOW(), '');

-- ----------------------------
-- 7. sys_role_menu (role_id=1 admin has full system/monitor; role_id=2 common has read-only view)
-- ----------------------------
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`) VALUES
  (1, 1), (1, 2),
  (1, 100), (1, 101), (1, 102), (1, 103), (1, 104), (1, 105), (1, 106), (1, 107), (1, 108),
  (1, 109), (1, 110), (1, 111), (1, 112), (1, 500), (1, 501),
  (1, 1000), (1, 1001), (1, 1002), (1, 1003), (1, 1004), (1, 1005),
  (1, 1006), (1, 1007), (1, 1008), (1, 1009), (1, 1010),
  (1, 1011), (1, 1012), (1, 1013), (1, 1014),
  (1, 1015), (1, 1016), (1, 1017), (1, 1018),
  (1, 1019), (1, 1020), (1, 1021), (1, 1022), (1, 1023),
  (1, 1024), (1, 1025), (1, 1026), (1, 1027), (1, 1028),
  (1, 1029), (1, 1030), (1, 1031), (1, 1032), (1, 1033),
  (1, 1034), (1, 1035), (1, 1036), (1, 1037),
  (1, 1038), (1, 1039), (1, 1040),
  (1, 1041), (1, 1042), (1, 1043), (1, 1044),
  (1, 1045), (1, 1046), (1, 1047),
  (1, 1048), (1, 1049), (1, 1050), (1, 1051), (1, 1052), (1, 1053),
  (2, 1), (2, 107), (2, 1034);

-- ----------------------------
-- 8. sys_dict_type
-- ----------------------------
INSERT IGNORE INTO `sys_dict_type` (`dict_id`, `dict_name`, `dict_type`, `status`, `create_by`, `create_time`, `remark`) VALUES
  (1,  '用户性别', 'sys_user_sex',       '0', 'admin', NOW(), '用户性别列表'),
  (2,  '菜单状态', 'sys_show_hide',      '0', 'admin', NOW(), '菜单状态列表'),
  (3,  '系统开关', 'sys_normal_disable', '0', 'admin', NOW(), '系统开关列表'),
  (4,  '任务状态', 'sys_job_status',     '0', 'admin', NOW(), '任务状态列表'),
  (5,  '任务分组', 'sys_job_group',      '0', 'admin', NOW(), '任务分组列表'),
  (6,  '系统是否', 'sys_yes_no',         '0', 'admin', NOW(), '系统是否列表'),
  (7,  '通知类型', 'sys_notice_type',    '0', 'admin', NOW(), '通知类型列表'),
  (8,  '通知状态', 'sys_notice_status',  '0', 'admin', NOW(), '通知状态列表'),
  (9,  '操作类型', 'sys_oper_type',      '0', 'admin', NOW(), '操作类型列表'),
  (10, '系统状态', 'sys_common_status',  '0', 'admin', NOW(), '登录状态列表');

-- ----------------------------
-- 9. sys_dict_data
-- ----------------------------
INSERT IGNORE INTO `sys_dict_data` (`dict_code`, `dict_sort`, `dict_label`, `dict_value`, `dict_type`, `css_class`, `list_class`, `is_default`, `status`, `create_by`, `create_time`, `remark`) VALUES
  (1,  1, '男',   '0', 'sys_user_sex',       '', '',        'Y', '0', 'admin', NOW(), '性别男'),
  (2,  2, '女',   '1', 'sys_user_sex',       '', '',        'N', '0', 'admin', NOW(), '性别女'),
  (3,  3, '未知', '2', 'sys_user_sex',       '', '',        'N', '0', 'admin', NOW(), '性别未知'),
  (4,  1, '显示', '0', 'sys_show_hide',      '', 'primary', 'Y', '0', 'admin', NOW(), '显示菜单'),
  (5,  2, '隐藏', '1', 'sys_show_hide',      '', 'danger',  'N', '0', 'admin', NOW(), '隐藏菜单'),
  (6,  1, '正常', '0', 'sys_normal_disable', '', 'primary', 'Y', '0', 'admin', NOW(), '正常状态'),
  (7,  2, '停用', '1', 'sys_normal_disable', '', 'danger',  'N', '0', 'admin', NOW(), '停用状态'),
  (8,  1, '正常', '0', 'sys_job_status',     '', 'primary', 'Y', '0', 'admin', NOW(), '正常状态'),
  (9,  2, '暂停', '1', 'sys_job_status',     '', 'danger',  'N', '0', 'admin', NOW(), '停用状态'),
  (10, 1, '默认', 'DEFAULT', 'sys_job_group', '', '',       'Y', '0', 'admin', NOW(), '默认分组'),
  (11, 2, '系统', 'SYSTEM',  'sys_job_group', '', '',       'N', '0', 'admin', NOW(), '系统分组'),
  (12, 1, '是',   'Y', 'sys_yes_no',         '', 'primary', 'Y', '0', 'admin', NOW(), '系统默认是'),
  (13, 2, '否',   'N', 'sys_yes_no',         '', 'danger',  'N', '0', 'admin', NOW(), '系统默认否'),
  (14, 1, '通知', '1', 'sys_notice_type',    '', 'warning', 'Y', '0', 'admin', NOW(), '通知'),
  (15, 2, '公告', '2', 'sys_notice_type',    '', 'success', 'N', '0', 'admin', NOW(), '公告'),
  (16, 1, '正常', '0', 'sys_notice_status',  '', 'primary', 'Y', '0', 'admin', NOW(), '正常状态'),
  (17, 2, '关闭', '1', 'sys_notice_status',  '', 'danger',  'N', '0', 'admin', NOW(), '关闭状态'),
  (18, 9, '其它', '0', 'sys_oper_type',      '', 'info',    'N', '0', 'admin', NOW(), '其他操作'),
  (19, 1, '新增', '1', 'sys_oper_type',      '', 'info',    'N', '0', 'admin', NOW(), '新增操作'),
  (20, 2, '修改', '2', 'sys_oper_type',      '', 'info',    'N', '0', 'admin', NOW(), '修改操作'),
  (21, 3, '删除', '3', 'sys_oper_type',      '', 'danger',  'N', '0', 'admin', NOW(), '删除操作'),
  (22, 4, '授权', '4', 'sys_oper_type',      '', 'primary', 'N', '0', 'admin', NOW(), '授权操作'),
  (23, 5, '导出', '5', 'sys_oper_type',      '', 'warning', 'N', '0', 'admin', NOW(), '导出操作'),
  (24, 6, '导入', '6', 'sys_oper_type',      '', 'warning', 'N', '0', 'admin', NOW(), '导入操作'),
  (25, 7, '强退', '7', 'sys_oper_type',      '', 'danger',  'N', '0', 'admin', NOW(), '强退操作'),
  (26, 8, '清空数据', '9', 'sys_oper_type',  '', 'danger',  'N', '0', 'admin', NOW(), '清空操作'),
  (27, 1, '成功', '0', 'sys_common_status',  '', 'primary', 'N', '0', 'admin', NOW(), '正常状态'),
  (28, 2, '失败', '1', 'sys_common_status',  '', 'danger',  'N', '0', 'admin', NOW(), '停用状态');

-- ----------------------------
-- 10. sys_config (core auth & security settings)
-- ----------------------------
INSERT IGNORE INTO `sys_config` (`config_id`, `config_name`, `config_key`, `config_value`, `config_type`, `create_by`, `create_time`, `remark`) VALUES
  (1, '账号自助-验证码开关',   'sys.account.captchaEnabled', 'true',        'Y', 'admin', NOW(), '是否开启验证码功能（true开启，false关闭）'),
  (2, '账号自助-是否开启用户注册', 'sys.account.registerUser',   'false',       'Y', 'admin', NOW(), '是否开启注册用户功能（true开启，false关闭）'),
  (3, '用户管理-账号初始密码', 'sys.user.initPassword',      'ChangeMe@123', 'Y', 'admin', NOW(), '新建用户默认初始密码，请按需修改'),
  (4, '账号登录-黑名单IP列表', 'sys.login.blackIPList',      '',            'Y', 'admin', NOW(), '设置登录IP黑名单限制，多个匹配项以;分隔');
