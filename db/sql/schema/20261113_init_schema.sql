-- ============================================================
-- Enterprise Operations & ERP System - Initial Database Schema
-- Consolidated DDL only (no DML / seed data)
-- ============================================================

-- ----------------------------
-- 1. Core System & RBAC Tables
-- ----------------------------

CREATE TABLE IF NOT EXISTS sys_dept (
    dept_id     BIGINT       NOT NULL AUTO_INCREMENT COMMENT '部门ID',
    parent_id   BIGINT       DEFAULT 0 COMMENT '父部门ID',
    ancestors   VARCHAR(50)  DEFAULT '' COMMENT '祖级列表',
    dept_name   VARCHAR(30)  DEFAULT '' COMMENT '部门名称',
    order_num   INT          DEFAULT 0 COMMENT '显示顺序',
    leader      VARCHAR(20)  DEFAULT NULL COMMENT '负责人',
    phone       VARCHAR(11)  DEFAULT NULL COMMENT '联系电话',
    email       VARCHAR(50)  DEFAULT NULL COMMENT '邮箱',
    status      CHAR(1)      DEFAULT '0' COMMENT '部门状态（0正常 1停用）',
    del_flag    CHAR(1)      DEFAULT '0' COMMENT '删除标志（0代表存在 2代表删除）',
    create_by   VARCHAR(64)  DEFAULT '' COMMENT '创建者',
    create_time DATETIME     DEFAULT NULL COMMENT '创建时间',
    update_by   VARCHAR(64)  DEFAULT '' COMMENT '更新者',
    update_time DATETIME     DEFAULT NULL COMMENT '更新时间',
    PRIMARY KEY (dept_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='部门表';

CREATE TABLE IF NOT EXISTS sys_user (
    user_id     BIGINT       NOT NULL AUTO_INCREMENT COMMENT '用户ID',
    dept_id     BIGINT       DEFAULT NULL COMMENT '部门ID',
    user_name   VARCHAR(30)  NOT NULL COMMENT '用户账号',
    nick_name   VARCHAR(30)  NOT NULL COMMENT '用户昵称',
    user_type   VARCHAR(2)   DEFAULT '00' COMMENT '用户类型（00系统用户）',
    email       VARCHAR(50)  DEFAULT '' COMMENT '用户邮箱',
    phonenumber VARCHAR(11)  DEFAULT '' COMMENT '手机号码',
    sex         CHAR(1)      DEFAULT '0' COMMENT '用户性别（0男 1女 2未知）',
    avatar      VARCHAR(100) DEFAULT '' COMMENT '头像地址',
    password    VARCHAR(100) DEFAULT '' COMMENT '密码',
    status      CHAR(1)      DEFAULT '0' COMMENT '账号状态（0正常 1停用）',
    del_flag    CHAR(1)      DEFAULT '0' COMMENT '删除标志（0代表存在 2代表删除）',
    login_ip    VARCHAR(128) DEFAULT '' COMMENT '最后登录IP',
    login_date  DATETIME     DEFAULT NULL COMMENT '最后登录时间',
    pwd_update_date DATETIME DEFAULT NULL COMMENT '密码最后更新时间',
    create_by   VARCHAR(64)  DEFAULT '' COMMENT '创建者',
    create_time DATETIME     DEFAULT NULL COMMENT '创建时间',
    update_by   VARCHAR(64)  DEFAULT '' COMMENT '更新者',
    update_time DATETIME     DEFAULT NULL COMMENT '更新时间',
    remark      VARCHAR(500) DEFAULT NULL COMMENT '备注',
    PRIMARY KEY (user_id),
    KEY idx_sys_user_name (user_name),
    KEY idx_sys_user_dept (dept_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户信息表';

CREATE TABLE IF NOT EXISTS sys_user_password_history (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    user_id      BIGINT       NOT NULL,
    user_name    VARCHAR(64)  NOT NULL,
    old_password VARCHAR(200) NOT NULL,
    new_password VARCHAR(200) NOT NULL,
    reason       VARCHAR(500) DEFAULT NULL,
    created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户密码变更历史';

CREATE TABLE IF NOT EXISTS sys_post (
    post_id     BIGINT      NOT NULL AUTO_INCREMENT COMMENT '岗位ID',
    post_code   VARCHAR(64) NOT NULL COMMENT '岗位编码',
    post_name   VARCHAR(50) NOT NULL COMMENT '岗位名称',
    post_sort   INT         NOT NULL COMMENT '显示顺序',
    status      CHAR(1)     NOT NULL COMMENT '状态（0正常 1停用）',
    create_by   VARCHAR(64) DEFAULT '' COMMENT '创建者',
    create_time DATETIME    DEFAULT NULL COMMENT '创建时间',
    update_by   VARCHAR(64) DEFAULT '' COMMENT '更新者',
    update_time DATETIME    DEFAULT NULL COMMENT '更新时间',
    remark      VARCHAR(500) DEFAULT NULL COMMENT '备注',
    PRIMARY KEY (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='岗位信息表';

CREATE TABLE IF NOT EXISTS sys_role (
    role_id             BIGINT       NOT NULL AUTO_INCREMENT COMMENT '角色ID',
    role_name           VARCHAR(30)  NOT NULL COMMENT '角色名称',
    role_key            VARCHAR(100) NOT NULL COMMENT '角色权限字符串',
    role_sort           INT          NOT NULL COMMENT '显示顺序',
    data_scope          CHAR(1)      DEFAULT '1' COMMENT '数据范围（1全部 2自定 3本部门 4本部门及以下 5仅本人）',
    menu_check_strictly TINYINT(1)   DEFAULT 1 COMMENT '菜单树选择项是否关联显示',
    dept_check_strictly TINYINT(1)   DEFAULT 1 COMMENT '部门树选择项是否关联显示',
    status              CHAR(1)      NOT NULL COMMENT '角色状态（0正常 1停用）',
    del_flag            CHAR(1)      DEFAULT '0' COMMENT '删除标志（0代表存在 2代表删除）',
    create_by           VARCHAR(64)  DEFAULT '' COMMENT '创建者',
    create_time         DATETIME     DEFAULT NULL COMMENT '创建时间',
    update_by           VARCHAR(64)  DEFAULT '' COMMENT '更新者',
    update_time         DATETIME     DEFAULT NULL COMMENT '更新时间',
    remark              VARCHAR(500) DEFAULT NULL COMMENT '备注',
    PRIMARY KEY (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色信息表';

CREATE TABLE IF NOT EXISTS sys_menu (
    menu_id     BIGINT       NOT NULL AUTO_INCREMENT COMMENT '菜单ID',
    menu_name   VARCHAR(50)  NOT NULL COMMENT '菜单名称',
    parent_id   BIGINT       DEFAULT 0 COMMENT '父菜单ID',
    order_num   INT          DEFAULT 0 COMMENT '显示顺序',
    path        VARCHAR(200) DEFAULT '' COMMENT '路由地址',
    component   VARCHAR(255) DEFAULT NULL COMMENT '组件路径',
    query       VARCHAR(255) DEFAULT NULL COMMENT '路由参数',
    route_name  VARCHAR(50)  DEFAULT '' COMMENT '路由名称',
    is_frame    INT          DEFAULT 1 COMMENT '是否为外链（0是 1否）',
    is_cache    INT          DEFAULT 0 COMMENT '是否缓存（0缓存 1不缓存）',
    menu_type   CHAR(1)      DEFAULT '' COMMENT '菜单类型（M目录 C菜单 F按钮）',
    visible     CHAR(1)      DEFAULT '0' COMMENT '菜单状态（0显示 1隐藏）',
    status      CHAR(1)      DEFAULT '0' COMMENT '菜单状态（0正常 1停用）',
    perms       VARCHAR(100) DEFAULT NULL COMMENT '权限标识',
    icon        VARCHAR(100) DEFAULT '#' COMMENT '菜单图标',
    create_by   VARCHAR(64)  DEFAULT '' COMMENT '创建者',
    create_time DATETIME     DEFAULT NULL COMMENT '创建时间',
    update_by   VARCHAR(64)  DEFAULT '' COMMENT '更新者',
    update_time DATETIME     DEFAULT NULL COMMENT '更新时间',
    remark      VARCHAR(500) DEFAULT '' COMMENT '备注',
    PRIMARY KEY (menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='菜单权限表';

CREATE TABLE IF NOT EXISTS sys_user_role (
    user_id BIGINT NOT NULL COMMENT '用户ID',
    role_id BIGINT NOT NULL COMMENT '角色ID',
    PRIMARY KEY (user_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户和角色关联表';

CREATE TABLE IF NOT EXISTS sys_role_menu (
    role_id BIGINT NOT NULL COMMENT '角色ID',
    menu_id BIGINT NOT NULL COMMENT '菜单ID',
    PRIMARY KEY (role_id, menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色和菜单关联表';

CREATE TABLE IF NOT EXISTS sys_role_dept (
    role_id BIGINT NOT NULL COMMENT '角色ID',
    dept_id BIGINT NOT NULL COMMENT '部门ID',
    PRIMARY KEY (role_id, dept_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色和部门关联表';

CREATE TABLE IF NOT EXISTS sys_user_post (
    user_id BIGINT NOT NULL COMMENT '用户ID',
    post_id BIGINT NOT NULL COMMENT '岗位ID',
    PRIMARY KEY (user_id, post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户与岗位关联表';

CREATE TABLE IF NOT EXISTS sys_oper_log (
    oper_id        BIGINT        NOT NULL AUTO_INCREMENT COMMENT '日志主键',
    title          VARCHAR(50)   DEFAULT '' COMMENT '模块标题',
    business_type  INT           DEFAULT 0 COMMENT '业务类型（0其它 1新增 2修改 3删除）',
    method         VARCHAR(200)  DEFAULT '' COMMENT '方法名称',
    request_method VARCHAR(10)   DEFAULT '' COMMENT '请求方式',
    operator_type  INT           DEFAULT 0 COMMENT '操作类别（0其它 1后台用户 2手机端用户）',
    oper_name      VARCHAR(50)   DEFAULT '' COMMENT '操作人员',
    dept_name      VARCHAR(50)   DEFAULT '' COMMENT '部门名称',
    oper_url       VARCHAR(255)  DEFAULT '' COMMENT '请求URL',
    oper_ip        VARCHAR(128)  DEFAULT '' COMMENT '主机地址',
    oper_location  VARCHAR(255)  DEFAULT '' COMMENT '操作地点',
    oper_param     VARCHAR(2000) DEFAULT '' COMMENT '请求参数',
    json_result    VARCHAR(2000) DEFAULT '' COMMENT '返回参数',
    status         INT           DEFAULT 0 COMMENT '操作状态（0正常 1异常）',
    error_msg      VARCHAR(2000) DEFAULT '' COMMENT '错误消息',
    oper_time      DATETIME      DEFAULT NULL COMMENT '操作时间',
    cost_time      BIGINT        DEFAULT 0 COMMENT '消耗时间',
    PRIMARY KEY (oper_id),
    KEY idx_sys_oper_log_bt (business_type),
    KEY idx_sys_oper_log_s (status),
    KEY idx_sys_oper_log_ot (oper_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志记录';

CREATE TABLE IF NOT EXISTS sys_dict_type (
    dict_id     BIGINT       NOT NULL AUTO_INCREMENT COMMENT '字典主键',
    dict_name   VARCHAR(100) DEFAULT '' COMMENT '字典名称',
    dict_type   VARCHAR(100) DEFAULT '' COMMENT '字典类型',
    status      CHAR(1)      DEFAULT '0' COMMENT '状态（0正常 1停用）',
    create_by   VARCHAR(64)  DEFAULT '' COMMENT '创建者',
    create_time DATETIME     DEFAULT NULL COMMENT '创建时间',
    update_by   VARCHAR(64)  DEFAULT '' COMMENT '更新者',
    update_time DATETIME     DEFAULT NULL COMMENT '更新时间',
    remark      VARCHAR(500) DEFAULT NULL COMMENT '备注',
    PRIMARY KEY (dict_id),
    UNIQUE KEY uk_sys_dict_type (dict_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='字典类型表';

CREATE TABLE IF NOT EXISTS sys_dict_data (
    dict_code   BIGINT       NOT NULL AUTO_INCREMENT COMMENT '字典编码',
    dict_sort   INT          DEFAULT 0 COMMENT '字典排序',
    dict_label  VARCHAR(100) DEFAULT '' COMMENT '字典标签',
    dict_value  VARCHAR(100) DEFAULT '' COMMENT '字典键值',
    dict_type   VARCHAR(100) DEFAULT '' COMMENT '字典类型',
    css_class   VARCHAR(100) DEFAULT NULL COMMENT '样式属性',
    list_class  VARCHAR(100) DEFAULT NULL COMMENT '表格回显样式',
    is_default  CHAR(1)      DEFAULT 'N' COMMENT '是否默认（Y是 N否）',
    status      CHAR(1)      DEFAULT '0' COMMENT '状态（0正常 1停用）',
    create_by   VARCHAR(64)  DEFAULT '' COMMENT '创建者',
    create_time DATETIME     DEFAULT NULL COMMENT '创建时间',
    update_by   VARCHAR(64)  DEFAULT '' COMMENT '更新者',
    update_time DATETIME     DEFAULT NULL COMMENT '更新时间',
    remark      VARCHAR(500) DEFAULT NULL COMMENT '备注',
    PRIMARY KEY (dict_code),
    KEY idx_sys_dict_data_type (dict_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='字典数据表';

CREATE TABLE IF NOT EXISTS sys_config (
    config_id    INT          NOT NULL AUTO_INCREMENT COMMENT '参数主键',
    config_name  VARCHAR(100) DEFAULT '' COMMENT '参数名称',
    config_key   VARCHAR(100) DEFAULT '' COMMENT '参数键名',
    config_value VARCHAR(500) DEFAULT '' COMMENT '参数键值',
    config_type  CHAR(1)      DEFAULT 'N' COMMENT '系统内置（Y是 N否）',
    create_by    VARCHAR(64)  DEFAULT '' COMMENT '创建者',
    create_time  DATETIME     DEFAULT NULL COMMENT '创建时间',
    update_by    VARCHAR(64)  DEFAULT '' COMMENT '更新者',
    update_time  DATETIME     DEFAULT NULL COMMENT '更新时间',
    remark       VARCHAR(500) DEFAULT NULL COMMENT '备注',
    PRIMARY KEY (config_id),
    KEY idx_sys_config_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='参数配置表';

CREATE TABLE IF NOT EXISTS sys_logininfor (
    info_id        BIGINT       NOT NULL AUTO_INCREMENT COMMENT '访问ID',
    user_name      VARCHAR(50)  DEFAULT '' COMMENT '用户账号',
    ipaddr         VARCHAR(128) DEFAULT '' COMMENT '登录IP地址',
    login_location VARCHAR(255) DEFAULT '' COMMENT '登录地点',
    browser        VARCHAR(50)  DEFAULT '' COMMENT '浏览器类型',
    os             VARCHAR(50)  DEFAULT '' COMMENT '操作系统',
    status         CHAR(1)      DEFAULT '0' COMMENT '登录状态（0成功 1失败）',
    msg            VARCHAR(255) DEFAULT '' COMMENT '提示消息',
    login_time     DATETIME     DEFAULT NULL COMMENT '访问时间',
    PRIMARY KEY (info_id),
    KEY idx_sys_logininfor_s (status),
    KEY idx_sys_logininfor_lt (login_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统访问记录';

CREATE TABLE IF NOT EXISTS sys_job (
    job_id          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '任务ID',
    job_name        VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '任务名称',
    job_group       VARCHAR(64)  NOT NULL DEFAULT 'DEFAULT' COMMENT '任务组名',
    invoke_target   VARCHAR(500) NOT NULL COMMENT '调用目标字符串',
    cron_expression VARCHAR(255) DEFAULT '' COMMENT 'cron执行表达式',
    misfire_policy  VARCHAR(20)  DEFAULT '3' COMMENT '计划执行错误策略（1立即执行 2执行一次 3放弃执行）',
    concurrent      CHAR(1)      DEFAULT '1' COMMENT '是否并发执行（0允许 1禁止）',
    status          CHAR(1)      DEFAULT '0' COMMENT '状态（0正常 1暂停）',
    create_by       VARCHAR(64)  DEFAULT '' COMMENT '创建者',
    create_time     DATETIME     DEFAULT NULL COMMENT '创建时间',
    update_by       VARCHAR(64)  DEFAULT '' COMMENT '更新者',
    update_time     DATETIME     DEFAULT NULL COMMENT '更新时间',
    remark          VARCHAR(500) DEFAULT '' COMMENT '备注信息',
    PRIMARY KEY (job_id, job_name, job_group)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='定时任务调度表';

CREATE TABLE IF NOT EXISTS sys_job_log (
    job_log_id     BIGINT        NOT NULL AUTO_INCREMENT COMMENT '任务日志ID',
    job_name       VARCHAR(64)   NOT NULL COMMENT '任务名称',
    job_group      VARCHAR(64)   NOT NULL COMMENT '任务组名',
    invoke_target  VARCHAR(500)  NOT NULL COMMENT '调用目标字符串',
    job_message    VARCHAR(500)  DEFAULT NULL COMMENT '日志信息',
    status         CHAR(1)       DEFAULT '0' COMMENT '执行状态（0正常 1失败）',
    exception_info VARCHAR(2000) DEFAULT '' COMMENT '异常信息',
    create_time    DATETIME      DEFAULT NULL COMMENT '创建时间',
    PRIMARY KEY (job_log_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='定时任务调度日志表';

CREATE TABLE IF NOT EXISTS sys_notice (
    notice_id      INT         NOT NULL AUTO_INCREMENT COMMENT '公告ID',
    notice_title   VARCHAR(50) NOT NULL COMMENT '公告标题',
    notice_type    CHAR(1)     NOT NULL COMMENT '公告类型（1通知 2公告）',
    notice_content LONGBLOB    DEFAULT NULL COMMENT '公告内容',
    status         CHAR(1)     DEFAULT '0' COMMENT '公告状态（0正常 1关闭）',
    create_by      VARCHAR(64) DEFAULT '' COMMENT '创建者',
    create_time    DATETIME    DEFAULT NULL COMMENT '创建时间',
    update_by      VARCHAR(64) DEFAULT '' COMMENT '更新者',
    update_time    DATETIME    DEFAULT NULL COMMENT '更新时间',
    remark         VARCHAR(255) DEFAULT NULL COMMENT '备注',
    PRIMARY KEY (notice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知公告表';

CREATE TABLE IF NOT EXISTS sys_cache (
    cache_key   VARCHAR(191) NOT NULL COMMENT '键名（含业务前缀）',
    cache_value MEDIUMTEXT   NOT NULL COMMENT '键值',
    expire_time DATETIME     NULL DEFAULT NULL COMMENT '过期时间，NULL 表示永不过期',
    create_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (cache_key),
    KEY idx_sys_cache_expire (expire_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='进程外状态缓存（会话/验证码/登录锁/幂等键）';

-- ----------------------------
-- 2. Enterprise Directory, Approval & Notification Tables
-- ----------------------------

CREATE TABLE IF NOT EXISTS wxuser (
    userid        VARCHAR(128) NOT NULL,
    name          VARCHAR(255) DEFAULT NULL,
    dept          VARCHAR(255) DEFAULT NULL,
    position      VARCHAR(255) DEFAULT NULL,
    leader_dept   VARCHAR(255) DEFAULT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'active',
    first_seen_at DATETIME     NULL,
    last_seen_at  DATETIME     NULL,
    inactive_at   DATETIME     NULL,
    PRIMARY KEY (userid),
    KEY idx_wxuser_status (status),
    KEY idx_wxuser_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='企业通讯录成员';

CREATE TABLE IF NOT EXISTS wxuser_sync_batch (
    batch_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    sync_type         VARCHAR(32)     NOT NULL DEFAULT 'employee',
    status            VARCHAR(20)     NOT NULL DEFAULT 'running',
    requested_by      BIGINT          NULL,
    requested_by_name VARCHAR(64)     NULL,
    remote_count      INT UNSIGNED    NOT NULL DEFAULT 0,
    added_count       INT UNSIGNED    NOT NULL DEFAULT 0,
    updated_count     INT UNSIGNED    NOT NULL DEFAULT 0,
    unchanged_count   INT UNSIGNED    NOT NULL DEFAULT 0,
    missing_count     INT UNSIGNED    NOT NULL DEFAULT 0,
    started_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at       DATETIME        NULL,
    error_message     VARCHAR(1000)   NULL,
    PRIMARY KEY (batch_id),
    KEY idx_wxuser_sync_batch_started (started_at),
    KEY idx_wxuser_sync_batch_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通讯录同步批次';

CREATE TABLE IF NOT EXISTS wxuser_sync_member_snapshot (
    batch_id    BIGINT UNSIGNED NOT NULL,
    userid      VARCHAR(128)    NOT NULL,
    name        VARCHAR(255)    NULL,
    dept        VARCHAR(255)    NULL,
    position    VARCHAR(255)    NULL,
    leader_dept VARCHAR(255)    NULL,
    PRIMARY KEY (batch_id, userid),
    KEY idx_wxuser_sync_snapshot_userid (userid),
    KEY idx_wxuser_sync_snapshot_batch (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通讯录同步成员快照';

CREATE TABLE IF NOT EXISTS wxuser_employment_event (
    event_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    userid            VARCHAR(128)    NOT NULL,
    event_type        VARCHAR(16)     NOT NULL,
    event_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name              VARCHAR(255)    NULL,
    dept              VARCHAR(255)    NULL,
    position          VARCHAR(255)    NULL,
    sync_batch_id     BIGINT UNSIGNED NULL,
    source            VARCHAR(32)     NOT NULL DEFAULT 'wecom_sync',
    created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    leave_reason_code VARCHAR(16)     NULL COMMENT '离职原因编码 R01-R10',
    leave_reason_remark VARCHAR(500)  NULL COMMENT '离职原因备注',
    reason_updated_by VARCHAR(64)     NULL COMMENT '原因最后填写人',
    reason_updated_at DATETIME        NULL COMMENT '原因最后填写时间',
    PRIMARY KEY (event_id),
    KEY idx_wxuser_employment_user_time (userid, event_at),
    KEY idx_wxuser_employment_type_time (event_type, event_at),
    KEY idx_wxuser_employment_batch (sync_batch_id),
    KEY idx_wxuser_employment_reason (event_type, leave_reason_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通讯录入离职观察事件';

CREATE TABLE IF NOT EXISTS wx_approve (
    sp_no               VARCHAR(64)  NOT NULL,
    sp_name             VARCHAR(100) DEFAULT NULL,
    sp_status           INT          DEFAULT NULL,
    template_id         VARCHAR(100) DEFAULT NULL,
    apply_time          DATETIME     DEFAULT NULL,
    applyer_userid      VARCHAR(128) DEFAULT NULL,
    applyer_partyid     VARCHAR(64)  DEFAULT NULL,
    apply_data_contents LONGTEXT     DEFAULT NULL,
    outtime             DATETIME     DEFAULT NULL,
    backtime            DATETIME     DEFAULT NULL,
    auditerid           VARCHAR(500) DEFAULT NULL,
    PRIMARY KEY (sp_no),
    KEY idx_wx_approve_time (apply_time),
    KEY idx_wx_approve_name (sp_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='企业审批单据';

CREATE TABLE IF NOT EXISTS msgtowx (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    type        VARCHAR(64)  DEFAULT NULL,
    isSend      VARCHAR(16)  DEFAULT '0',
    receiverIds VARCHAR(500) DEFAULT NULL,
    createtime  DATETIME     DEFAULT NULL,
    parentid    VARCHAR(100) DEFAULT NULL,
    msg         TEXT         DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_msgtowx_send (isSend),
    KEY idx_msgtowx_time (createtime)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='企业消息发送队列';

-- ----------------------------
-- 3. Inventory, WMS & Material Tables
-- ----------------------------

CREATE TABLE IF NOT EXISTS kucun (
    id              BIGINT         NOT NULL AUTO_INCREMENT,
    kd_billno       VARCHAR(64)    DEFAULT NULL,
    kd_wlbm         VARCHAR(100)   DEFAULT NULL,
    kd_wumc         VARCHAR(255)   DEFAULT NULL,
    kd_ggxh         VARCHAR(255)   DEFAULT NULL,
    kd_cangku_id    VARCHAR(64)    DEFAULT NULL,
    kd_cangku_name  VARCHAR(255)   DEFAULT NULL,
    kd_kuwei_id     VARCHAR(64)    DEFAULT NULL,
    kd_kuwei_name   VARCHAR(255)   DEFAULT NULL,
    kd_chuku_number DECIMAL(18, 6) DEFAULT 0,
    kd_chuku_time   DATETIME       DEFAULT NULL,
    sync_time       DATETIME       DEFAULT NULL,
    status          VARCHAR(16)    DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_kucun_wlbm (kd_wlbm),
    KEY idx_kucun_billno (kd_billno),
    KEY idx_kucun_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ERP库存同步快照';

CREATE TABLE IF NOT EXISTS kucun_warning (
    id                   BIGINT         NOT NULL AUTO_INCREMENT COMMENT '主键',
    stock_org_code       VARCHAR(64)             DEFAULT NULL COMMENT '库存组织编码',
    stock_org_name       VARCHAR(128)            DEFAULT NULL COMMENT '库存组织名称',
    material_code        VARCHAR(64)    NOT NULL COMMENT '物料编码',
    material_name        VARCHAR(200)            DEFAULT NULL COMMENT '物料名称',
    specification        VARCHAR(200)            DEFAULT NULL COMMENT '规格型号',
    unit                 VARCHAR(32)             DEFAULT NULL COMMENT '基本单位',
    safe_stock           DECIMAL(18, 6) NOT NULL DEFAULT 0 COMMENT '安全库存',
    actual_total         DECIMAL(18, 6) NOT NULL DEFAULT 0 COMMENT '即时库存合计',
    safe_warning_enabled TINYINT(1)     NOT NULL DEFAULT 1 COMMENT '是否启用安全库存预警',
    warning_status       VARCHAR(64)    NOT NULL DEFAULT '正常' COMMENT '预警状态',
    sync_time            DATETIME       NOT NULL COMMENT '同步时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_kw_material_org (material_code, stock_org_code),
    KEY idx_kw_material (material_code),
    KEY idx_kw_status (warning_status),
    KEY idx_kw_sync (sync_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库存预警快照';

CREATE TABLE IF NOT EXISTS tk_local_stock (
    id            VARCHAR(36)    NOT NULL COMMENT '主键',
    material_code VARCHAR(64)    NOT NULL COMMENT '物料编码',
    material_name VARCHAR(200)            DEFAULT NULL COMMENT '物料名称',
    package_name  VARCHAR(100)            DEFAULT NULL COMMENT '封装/规格',
    marking       VARCHAR(100)            DEFAULT NULL COMMENT '印字',
    location_code VARCHAR(64)    NOT NULL COMMENT '货架/库位编码',
    qty           DECIMAL(18, 3) NOT NULL DEFAULT 0 COMMENT '库存数量(K)',
    update_by     VARCHAR(64)             DEFAULT NULL COMMENT '最后更新人',
    update_time   DATETIME                DEFAULT NULL COMMENT '最后更新时间',
    create_time   DATETIME                DEFAULT NULL COMMENT '创建时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_local_stock_mat_loc (material_code, location_code),
    KEY idx_local_stock_loc (location_code),
    KEY idx_local_stock_name (material_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='本地仓库即时库存';

CREATE TABLE IF NOT EXISTS tk_local_stock_txn (
    id             VARCHAR(36)    NOT NULL COMMENT '主键',
    projection_key VARCHAR(128)            DEFAULT NULL COMMENT 'ERP调拨本地投影幂等键',
    txn_type       VARCHAR(16)    NOT NULL COMMENT 'IN/OUT/ADJ',
    material_code  VARCHAR(64)    NOT NULL COMMENT '物料编码',
    material_name  VARCHAR(200)            DEFAULT NULL COMMENT '物料名称',
    package_name   VARCHAR(100)            DEFAULT NULL COMMENT '封装/规格',
    marking        VARCHAR(100)            DEFAULT NULL COMMENT '印字',
    location_code  VARCHAR(64)    NOT NULL COMMENT '货架/库位编码',
    qty            DECIMAL(18, 3) NOT NULL COMMENT '本次数量(K)',
    balance_qty    DECIMAL(18, 3)          DEFAULT NULL COMMENT '变动后余额(K)',
    operator       VARCHAR(64)             DEFAULT NULL COMMENT '操作人',
    remark         VARCHAR(500)            DEFAULT NULL COMMENT '备注',
    create_time    DATETIME                DEFAULT NULL COMMENT '创建时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_local_stock_txn_projection (projection_key),
    KEY idx_local_stock_txn_mat (material_code),
    KEY idx_local_stock_txn_loc (location_code),
    KEY idx_local_stock_txn_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='本地仓库出入库流水';

CREATE TABLE IF NOT EXISTS wms_warehouse (
    warehouse_code VARCHAR(32)  NOT NULL COMMENT '仓库编码',
    warehouse_name VARCHAR(100) NOT NULL COMMENT '仓库名称',
    status         CHAR(1)      NOT NULL DEFAULT '0' COMMENT '状态（0正常 1停用）',
    sort_order     INT          NOT NULL DEFAULT 0 COMMENT '排序',
    remark         VARCHAR(500)          DEFAULT NULL COMMENT '备注',
    create_by      VARCHAR(64)           DEFAULT NULL,
    create_time    DATETIME              DEFAULT NULL,
    update_by      VARCHAR(64)           DEFAULT NULL,
    update_time    DATETIME              DEFAULT NULL,
    PRIMARY KEY (warehouse_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='WMS仓库';

CREATE TABLE IF NOT EXISTS wms_zone (
    zone_code      VARCHAR(16)  NOT NULL COMMENT '区域编码',
    warehouse_code VARCHAR(32)  NOT NULL COMMENT '仓库编码',
    zone_name      VARCHAR(100) NOT NULL COMMENT '区域名称',
    status         CHAR(1)      NOT NULL DEFAULT '0' COMMENT '状态（0正常 1停用）',
    sort_order     INT          NOT NULL DEFAULT 0 COMMENT '排序',
    remark         VARCHAR(500)          DEFAULT NULL COMMENT '备注',
    create_by      VARCHAR(64)           DEFAULT NULL,
    create_time    DATETIME              DEFAULT NULL,
    update_by      VARCHAR(64)           DEFAULT NULL,
    update_time    DATETIME              DEFAULT NULL,
    PRIMARY KEY (warehouse_code, zone_code),
    KEY idx_wms_zone_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='WMS仓库区域';

CREATE TABLE IF NOT EXISTS wms_location (
    location_code                 VARCHAR(64) NOT NULL COMMENT '库位编码（区-排）',
    warehouse_code                VARCHAR(32) NOT NULL COMMENT '仓库编码',
    zone_code                     VARCHAR(16) NOT NULL COMMENT '区域编码',
    row_no                        INT         NOT NULL COMMENT '排号',
    location_type                 VARCHAR(16) NOT NULL DEFAULT 'ROW' COMMENT '库位类型（ROW排级）',
    status                        CHAR(1)     NOT NULL DEFAULT '0' COMMENT '状态（0正常 1停用）',
    pick_sequence                 INT         NOT NULL DEFAULT 0 COMMENT '拣货顺序',
    kingdee_stock_number          VARCHAR(32) NULL COMMENT 'ERP目标仓库编码',
    kingdee_stock_location_number VARCHAR(64) NULL COMMENT 'ERP目标仓位编码',
    remark                        VARCHAR(500)         DEFAULT NULL COMMENT '备注',
    create_by                     VARCHAR(64)          DEFAULT NULL,
    create_time                   DATETIME             DEFAULT NULL,
    update_by                     VARCHAR(64)          DEFAULT NULL,
    update_time                   DATETIME             DEFAULT NULL,
    PRIMARY KEY (location_code),
    UNIQUE KEY uk_wms_location_row (warehouse_code, zone_code, row_no),
    KEY idx_wms_location_zone_row (zone_code, row_no),
    KEY idx_wms_location_status_pick (status, pick_sequence)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='WMS排级库位';

CREATE TABLE IF NOT EXISTS tk_staging_transfer (
    request_id                           VARCHAR(64)    NOT NULL COMMENT '客户端幂等请求号',
    label_id                             VARCHAR(64)             NULL COMMENT '关联标签ID',
    source_bill_no                       VARCHAR(50)             NULL COMMENT '生产入库单号（标签直接调拨时为空）',
    source_entry_id                      BIGINT                  NULL COMMENT '生产入库单明细内码（标签直接调拨时为空）',
    source_kingdee_stock_number          VARCHAR(32)             NULL COMMENT 'ERP来源仓库编码',
    source_kingdee_stock_location_number VARCHAR(64)             NULL COMMENT 'ERP来源仓位编码',
    material_code                        VARCHAR(80)    NOT NULL COMMENT '物料编码',
    material_name                        VARCHAR(255)            DEFAULT NULL COMMENT '物料名称',
    specification                        VARCHAR(500)            DEFAULT NULL COMMENT '规格型号',
    package_name                         VARCHAR(120)            DEFAULT NULL COMMENT '封装',
    marking                              VARCHAR(255)            DEFAULT NULL COMMENT '印字',
    lot_number                           VARCHAR(80)             DEFAULT NULL COMMENT '批号',
    unit_number                          VARCHAR(32)    NOT NULL COMMENT 'ERP单位编码',
    receipt_qty                          DECIMAL(18, 3) NOT NULL COMMENT '生产入库实收数量',
    transfer_qty                         DECIMAL(18, 3) NOT NULL COMMENT '本次调拨数量',
    location_code                        VARCHAR(64)    NOT NULL COMMENT '本地实际排位',
    kingdee_stock_number                 VARCHAR(32)    NOT NULL COMMENT 'ERP目标仓库编码',
    kingdee_stock_location_number        VARCHAR(64)    NOT NULL COMMENT 'ERP目标仓位编码',
    kingdee_bill_id                      BIGINT                  DEFAULT NULL COMMENT 'ERP直接调拨单内码',
    kingdee_bill_no                      VARCHAR(50)             DEFAULT NULL COMMENT 'ERP直接调拨单号',
    status                               VARCHAR(20)    NOT NULL COMMENT 'PROCESSING/K3_SAVED/K3_SUCCESS/SUCCESS/FAILED',
    error_message                        VARCHAR(1000)           DEFAULT NULL COMMENT '最近失败原因',
    operator                             VARCHAR(64)             DEFAULT NULL COMMENT '操作人',
    remark                               VARCHAR(500)            DEFAULT NULL COMMENT '备注',
    create_time                          DATETIME       NOT NULL,
    update_time                          DATETIME       NOT NULL,
    PRIMARY KEY (request_id),
    KEY idx_staging_transfer_label (label_id, status, create_time),
    KEY idx_staging_source_entry (source_entry_id, status),
    KEY idx_staging_kingdee_bill (kingdee_bill_no),
    KEY idx_staging_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='待交接仓到成品仓直接调拨流水';

CREATE TABLE IF NOT EXISTS tk_inbound_label (
    label_id             VARCHAR(64)    NOT NULL COMMENT '标签唯一ID',
    plan_no              VARCHAR(80)    NOT NULL COMMENT '生产计划号',
    material_code        VARCHAR(80)    NOT NULL COMMENT '物料编码',
    source_material_code VARCHAR(80)             NULL COMMENT '原生产入库物料编码',
    assembly_bill_no     VARCHAR(50)             NULL COMMENT '组装拆卸单号',
    assembly_entry_id    BIGINT                  NULL COMMENT '组装拆卸单分录内码',
    product_name         VARCHAR(255)            DEFAULT NULL COMMENT '产品名称',
    specification        VARCHAR(500)            DEFAULT NULL COMMENT '规格型号',
    label_qty            DECIMAL(18, 3) NOT NULL COMMENT '标签数量(K)',
    label_seq            INT            NOT NULL DEFAULT 1 COMMENT '标签序号',
    lot_number           VARCHAR(80)             DEFAULT NULL COMMENT '批号',
    status               VARCHAR(20)    NOT NULL COMMENT 'PRINTED, USED, or VOID',
    printed_by           VARCHAR(64)             DEFAULT NULL,
    printed_time         DATETIME                DEFAULT NULL,
    used_by              VARCHAR(64)             DEFAULT NULL,
    used_time            DATETIME                DEFAULT NULL,
    source_bill_no       VARCHAR(50)             DEFAULT NULL COMMENT '匹配的生产入库单号',
    source_entry_id      BIGINT                  DEFAULT NULL COMMENT '匹配的生产入库单明细内码',
    kingdee_bill_no      VARCHAR(50)             DEFAULT NULL COMMENT '生成的调拨单号',
    location_code        VARCHAR(64)             DEFAULT NULL COMMENT '实际库位',
    create_time          DATETIME       NOT NULL,
    update_time          DATETIME       NOT NULL,
    PRIMARY KEY (label_id),
    KEY idx_inbound_label_plan_material (plan_no, material_code),
    KEY idx_inbound_label_assembly (assembly_bill_no, assembly_entry_id),
    KEY idx_inbound_label_status (status),
    KEY idx_inbound_label_printed_time (printed_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='入库标签登记表';

CREATE TABLE IF NOT EXISTS tk_wms_outbound_pick (
    bill_no           VARCHAR(64)  NOT NULL COMMENT 'ERP销售出库单号',
    request_id        VARCHAR(64)  NOT NULL COMMENT '客户端一次提交请求号',
    status            VARCHAR(20)  NOT NULL COMMENT 'PROCESSING/SUCCESS/FAILED',
    request_payload   LONGTEXT              COMMENT '本次拣货提交内容(JSON)',
    conversion_result LONGTEXT     NULL     COMMENT '销售出库组装拆卸结果(JSON)',
    error_message     VARCHAR(1000)         COMMENT '最近失败原因',
    operator          VARCHAR(64)           COMMENT '操作人',
    create_time       DATETIME     NOT NULL,
    update_time       DATETIME     NOT NULL,
    PRIMARY KEY (bill_no),
    KEY idx_wms_outbound_pick_status (status),
    KEY idx_wms_outbound_pick_request (request_id),
    KEY idx_wms_outbound_pick_time (update_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='WMS销售出库拣货提交记录';

CREATE TABLE IF NOT EXISTS tk_material_request (
    id                  BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'ID',
    material_group_id   VARCHAR(100) NOT NULL COMMENT '物料分组编码',
    material_group_name VARCHAR(255) NOT NULL COMMENT '物料分组名称',
    specification       VARCHAR(500) NOT NULL COMMENT '规格型号',
    name                VARCHAR(255) NOT NULL COMMENT '物料名称',
    status              VARCHAR(20)  DEFAULT '0' COMMENT '状态: 0申请中, 1已完成',
    material_code       VARCHAR(100) DEFAULT NULL COMMENT '物料编码',
    apply_user_id       BIGINT       NOT NULL COMMENT '申请人ID',
    apply_user_name     VARCHAR(100) DEFAULT NULL COMMENT '申请人姓名',
    apply_time          DATETIME     DEFAULT NULL COMMENT '申请时间',
    complete_user_id    BIGINT       DEFAULT NULL COMMENT '完成人ID',
    complete_user_name  VARCHAR(100) DEFAULT NULL COMMENT '完成人姓名',
    complete_time       DATETIME     DEFAULT NULL COMMENT '完成时间',
    remark              VARCHAR(500) DEFAULT NULL COMMENT '备注',
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物料新建申请表';

-- ----------------------------
-- 4. Production, Quality & Workshop Tables
-- ----------------------------

CREATE TABLE IF NOT EXISTS pd (
    id             BIGINT         NOT NULL AUTO_INCREMENT,
    pdDate         VARCHAR(32)    DEFAULT NULL,
    process        VARCHAR(100)   DEFAULT NULL,
    flowNo         VARCHAR(100)   DEFAULT NULL,
    productId      VARCHAR(100)   DEFAULT NULL,
    productName    VARCHAR(255)   DEFAULT NULL,
    specification  VARCHAR(500)   DEFAULT NULL,
    lot            VARCHAR(100)   DEFAULT NULL,
    number         DECIMAL(18, 4) DEFAULT NULL,
    pd_number      DECIMAL(18, 4) DEFAULT NULL,
    remark         VARCHAR(500)   DEFAULT NULL,
    process_status VARCHAR(64)    DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_pd_date (pdDate),
    KEY idx_pd_flow (flowNo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='在制盘点记录';

CREATE TABLE IF NOT EXISTS dk_pic (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    flowno       VARCHAR(100) DEFAULT NULL,
    materialno   VARCHAR(100) DEFAULT NULL,
    materialname VARCHAR(255) DEFAULT NULL,
    specification VARCHAR(500) DEFAULT NULL,
    remark       VARCHAR(500) DEFAULT NULL,
    imgPaths     TEXT         DEFAULT NULL,
    mechineName  VARCHAR(100) DEFAULT NULL,
    createdate   DATETIME     DEFAULT NULL,
    modifydate   DATETIME     DEFAULT NULL,
    xpdm         VARCHAR(100) DEFAULT NULL,
    xpph         VARCHAR(100) DEFAULT NULL,
    khdm         VARCHAR(100) DEFAULT NULL,
    handler      VARCHAR(64)  DEFAULT NULL,
    creator      VARCHAR(64)  DEFAULT NULL,
    updater      VARCHAR(64)  DEFAULT NULL,
    result       VARCHAR(64)  DEFAULT NULL,
    testNumber   VARCHAR(64)  DEFAULT NULL,
    testCharge   VARCHAR(64)  DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_dk_pic_flow (flowno),
    KEY idx_dk_pic_createdate (createdate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='检验拍照记录';

CREATE TABLE IF NOT EXISTS tk_exception_report (
    id                    BIGINT         NOT NULL AUTO_INCREMENT,
    report_no             VARCHAR(64)    DEFAULT NULL,
    plan_no               VARCHAR(80)    DEFAULT NULL,
    report_date           DATE           DEFAULT NULL,
    shift_name            VARCHAR(64)    DEFAULT NULL,
    finder_name           VARCHAR(64)    DEFAULT NULL,
    send_dept             VARCHAR(100)   DEFAULT NULL,
    generate_process_name VARCHAR(100)   DEFAULT NULL,
    process_name          VARCHAR(100)   DEFAULT NULL,
    occur_date            DATE           DEFAULT NULL,
    product_name          VARCHAR(255)   DEFAULT NULL,
    product_spec          VARCHAR(255)   DEFAULT NULL,
    mo_number             VARCHAR(80)    DEFAULT NULL,
    chip_code             VARCHAR(100)   DEFAULT NULL,
    chip_no               VARCHAR(100)   DEFAULT NULL,
    risk_batch            VARCHAR(100)   DEFAULT NULL,
    batch_defect_total    DECIMAL(18, 4) DEFAULT NULL,
    batch_unit            VARCHAR(32)    DEFAULT NULL,
    processing_method     VARCHAR(255)   DEFAULT NULL,
    machine_no            VARCHAR(100)   DEFAULT NULL,
    sample_qty            DECIMAL(18, 4) DEFAULT NULL,
    sample_unit           VARCHAR(32)    DEFAULT NULL,
    defect_qty            DECIMAL(18, 4) DEFAULT NULL,
    defect_unit           VARCHAR(32)    DEFAULT NULL,
    defect_rate           DECIMAL(18, 4) DEFAULT NULL,
    defect_item           VARCHAR(255)   DEFAULT NULL COMMENT '不良项目',
    defect_desc           TEXT           DEFAULT NULL,
    defect_images         TEXT           DEFAULT NULL,
    report_images         TEXT           DEFAULT NULL,
    defect_category       VARCHAR(100)   DEFAULT NULL,
    operator_name         VARCHAR(64)    DEFAULT NULL,
    technician_name       VARCHAR(64)    DEFAULT NULL,
    quality_name          VARCHAR(64)    DEFAULT NULL,
    cause_analysis        TEXT           DEFAULT NULL,
    reason_analysis       TEXT           DEFAULT NULL,
    corrective_action     TEXT           DEFAULT NULL,
    preventive_action     TEXT           DEFAULT NULL,
    handler_name          VARCHAR(64)    DEFAULT NULL,
    qc_confirm            VARCHAR(64)    DEFAULT NULL,
    status                VARCHAR(32)    DEFAULT '0',
    del_flag              CHAR(1)        DEFAULT '0',
    remark                VARCHAR(500)   DEFAULT NULL,
    create_by             VARCHAR(64)    DEFAULT NULL,
    create_time           DATETIME       DEFAULT NULL,
    update_by             VARCHAR(64)    DEFAULT NULL,
    update_time           DATETIME       DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_exception_report_no (report_no),
    KEY idx_exception_report_date (report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='生产异常报告';

CREATE TABLE IF NOT EXISTS tk_process_output_target (
    id              VARCHAR(64)    NOT NULL,
    package_name    VARCHAR(100)   NOT NULL,
    process_name    VARCHAR(100)   NOT NULL,
    target_capacity DECIMAL(18, 4) NOT NULL,
    sort_no         BIGINT         DEFAULT 0,
    status          CHAR(1)        DEFAULT '0',
    remark          VARCHAR(500)   DEFAULT NULL,
    create_by       VARCHAR(64)    DEFAULT NULL,
    create_time     DATETIME       DEFAULT NULL,
    update_by       VARCHAR(64)    DEFAULT NULL,
    update_time     DATETIME       DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_process_output_target (package_name, process_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工序产量目标产能';

CREATE TABLE IF NOT EXISTS tk_process_output_staff (
    id           VARCHAR(64)    NOT NULL,
    report_date  DATE           NOT NULL,
    process_name VARCHAR(100)   NOT NULL,
    staff_count  DECIMAL(18, 4) NOT NULL,
    remark       VARCHAR(500)   DEFAULT NULL,
    create_by    VARCHAR(64)    DEFAULT NULL,
    create_time  DATETIME       DEFAULT NULL,
    update_by    VARCHAR(64)    DEFAULT NULL,
    update_time  DATETIME       DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_process_output_staff (report_date, process_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工序产量人员数量';

CREATE TABLE IF NOT EXISTS tk_dummy_piece_weight (
    id           BIGINT         NOT NULL AUTO_INCREMENT COMMENT 'ID',
    package_name VARCHAR(100)   NOT NULL COMMENT '封装',
    piece_type   VARCHAR(20)    NOT NULL COMMENT '胶体类型：空片/有黑胶',
    material     VARCHAR(20)    NOT NULL COMMENT '材质：铜/铁',
    unit_weight  DECIMAL(18, 4) NOT NULL COMMENT '单重(g)',
    status       CHAR(1)        NOT NULL DEFAULT '0' COMMENT '状态：0启用 1停用',
    remark       VARCHAR(500)            DEFAULT NULL COMMENT '备注',
    create_by    VARCHAR(64)             DEFAULT '' COMMENT '创建者',
    create_time  DATETIME                DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_by    VARCHAR(64)             DEFAULT '' COMMENT '更新者',
    update_time  DATETIME                DEFAULT NULL COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_dummy_piece_weight (package_name, piece_type, material)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='假片单重基础资料';

CREATE TABLE IF NOT EXISTS tk_dummy_piece_monthly (
    id               BIGINT         NOT NULL AUTO_INCREMENT COMMENT 'ID',
    record_month     CHAR(7)        NOT NULL COMMENT '月份 yyyy-MM',
    package_name     VARCHAR(100)   NOT NULL COMMENT '封装',
    piece_type       VARCHAR(20)    NOT NULL COMMENT '胶体类型：空片/有黑胶',
    material         VARCHAR(20)    NOT NULL COMMENT '材质：铜/铁',
    weight_value     DECIMAL(18, 4) NOT NULL COMMENT '重量(g)',
    piece_count      DECIMAL(18, 4)          DEFAULT NULL COMMENT '条数',
    create_user_id   BIGINT                  DEFAULT NULL COMMENT '录入人ID',
    create_user_name VARCHAR(100)            DEFAULT NULL COMMENT '录入人',
    create_time      DATETIME                DEFAULT NULL COMMENT '录入时间',
    update_user_id   BIGINT                  DEFAULT NULL COMMENT '更新人ID',
    update_user_name VARCHAR(100)            DEFAULT NULL COMMENT '更新人',
    update_time      DATETIME                DEFAULT NULL COMMENT '更新时间',
    remark           VARCHAR(500)            DEFAULT NULL COMMENT '备注',
    PRIMARY KEY (id),
    UNIQUE KEY uk_dummy_piece_monthly (record_month, package_name, piece_type, material),
    KEY idx_dummy_piece_monthly_month (record_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='假片重量月度录入';

CREATE TABLE IF NOT EXISTS tk_machine_credential (
    id           INT         NOT NULL AUTO_INCREMENT,
    userid       VARCHAR(64) NOT NULL COMMENT '成员UserID',
    password     VARCHAR(64) NOT NULL COMMENT '机台登录密码',
    machine_type VARCHAR(32) NOT NULL DEFAULT 'wire_bond' COMMENT '机台类型',
    status       VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT '状态: active/disabled',
    remark       VARCHAR(255) NULL COMMENT '备注',
    created_by   VARCHAR(64)  NULL COMMENT '创建人',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_userid_machine (userid, machine_type),
    KEY idx_machine_type (machine_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='车间机台员工登录凭证表';

-- ----------------------------
-- 5. Sales, Quotation, Customer & Alert Tables
-- ----------------------------

CREATE TABLE IF NOT EXISTS tk_quotation (
    id                   BIGINT        NOT NULL AUTO_INCREMENT,
    business_type        VARCHAR(16)   NOT NULL DEFAULT 'FOREIGN' COMMENT '报价业务类型：FOREIGN外贸 / DOMESTIC内贸',
    quote_no             VARCHAR(64)   NOT NULL,
    input_mode           VARCHAR(16)   NOT NULL DEFAULT 'UPLOAD',
    original_name        VARCHAR(255)  NOT NULL,
    storage_path         VARCHAR(500)  NOT NULL,
    source_sheet_name    VARCHAR(128)  NOT NULL DEFAULT '',
    quote_date           DATE                   DEFAULT NULL,
    customer_name        VARCHAR(255)  NOT NULL DEFAULT '',
    country              VARCHAR(64)            NULL COMMENT '国家',
    city                 VARCHAR(128)           NULL COMMENT '城市',
    customer_style       VARCHAR(32)            NULL COMMENT '客户性质：分销商/终端/EMS/品牌商/其他',
    rate                 DECIMAL(12, 4)         NULL COMMENT '整单基准汇率（人民币兑美元）',
    end_user             VARCHAR(255)           NULL COMMENT '终端客户（整单共用）',
    customer_application VARCHAR(255)           NULL COMMENT '客户应用',
    customer_address     VARCHAR(500)           NULL COMMENT '客户地址',
    customer_phone       VARCHAR(64)            NULL COMMENT '客户电话',
    delivery_terms       VARCHAR(255)  NOT NULL DEFAULT '',
    lead_time            VARCHAR(255)  NOT NULL DEFAULT '',
    warranty             VARCHAR(255)  NOT NULL DEFAULT '',
    validity             VARCHAR(255)  NOT NULL DEFAULT '',
    payment_term         VARCHAR(500)  NOT NULL DEFAULT '',
    contact_text         VARCHAR(128)           NULL COMMENT '业务员在模板抬头填写的联系人',
    salesperson_id       BIGINT        NOT NULL,
    salesperson_name     VARCHAR(64)   NOT NULL DEFAULT '',
    status               VARCHAR(32)   NOT NULL DEFAULT 'PENDING_INITIAL' COMMENT 'DRAFT草稿 PENDING_INITIAL待初审 PENDING_SECOND待二审 PENDING_FINAL待终审 RETURNED已退回 APPROVED已通过',
    line_count           INT           NOT NULL DEFAULT 0,
    initial_reviewer_id  BIGINT                 DEFAULT NULL,
    initial_reviewer_name VARCHAR(64)           DEFAULT NULL,
    initial_review_time  DATETIME               DEFAULT NULL,
    initial_comment      VARCHAR(2000)          DEFAULT NULL,
    second_reviewer_id   BIGINT                 DEFAULT NULL,
    second_reviewer_name VARCHAR(64)            DEFAULT NULL,
    second_review_time   DATETIME               DEFAULT NULL,
    second_comment       VARCHAR(2000)          DEFAULT NULL,
    final_reviewer_id    BIGINT                 DEFAULT NULL,
    final_reviewer_name  VARCHAR(64)            DEFAULT NULL,
    final_review_time    DATETIME               DEFAULT NULL,
    final_comment        VARCHAR(2000)          DEFAULT NULL,
    create_time          DATETIME      NOT NULL,
    update_time          DATETIME      NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tk_quotation_no (quote_no),
    KEY idx_tk_quotation_status_time (status, update_time),
    KEY idx_tk_quotation_business_status_time (business_type, status, update_time),
    KEY idx_tk_quotation_salesperson (salesperson_id, update_time),
    KEY idx_tk_quotation_customer_date (customer_name, quote_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报价单审批主表';

CREATE TABLE IF NOT EXISTS tk_quotation_line (
    id                     BIGINT         NOT NULL AUTO_INCREMENT,
    quotation_id           BIGINT         NOT NULL,
    line_no                INT            NOT NULL,
    quote_date             DATE                    NULL COMMENT '行级报价日期',
    country                VARCHAR(64)             NULL COMMENT '国家',
    customer_style         VARCHAR(32)             NULL COMMENT '客户性质：分销商/终端/EMS/品牌商/其他',
    quote_to               VARCHAR(255)   NOT NULL DEFAULT '',
    end_user               VARCHAR(255)   NOT NULL DEFAULT '',
    application            VARCHAR(255)   NOT NULL DEFAULT '',
    manufacturer           VARCHAR(255)   NOT NULL DEFAULT '',
    manufacturer_mpn       VARCHAR(255)            NULL COMMENT '友商型号',
    description            VARCHAR(500)   NOT NULL DEFAULT '',
    qty                    DECIMAL(18, 6)          DEFAULT NULL,
    unit                   VARCHAR(64)    NOT NULL DEFAULT '',
    ctk_mpn                VARCHAR(255)   NOT NULL DEFAULT '',
    material_code          VARCHAR(255)   NOT NULL DEFAULT '' COMMENT 'ERP物料编码',
    customer_material_name VARCHAR(255)   NOT NULL DEFAULT '' COMMENT '客户物料名称',
    min_pack_count         DECIMAL(18, 6)          NULL COMMENT '最小包装数(KPCS)',
    package_name           VARCHAR(255)   NOT NULL DEFAULT '',
    die_size               VARCHAR(255)   NOT NULL DEFAULT '',
    spq_reel               VARCHAR(255)   NOT NULL DEFAULT '',
    original_price_rmb     DECIMAL(18, 6)          DEFAULT NULL,
    rate                   DECIMAL(12, 4)          NULL COMMENT '汇率（人民币兑美元）',
    original_price_usd     DECIMAL(18, 6)          DEFAULT NULL,
    lead_time              VARCHAR(64)             NULL COMMENT '行级交期',
    remark                 VARCHAR(500)            NULL COMMENT '行级备注',
    initial_price_rmb      DECIMAL(18, 6)          DEFAULT NULL,
    initial_price_usd      DECIMAL(18, 6)          DEFAULT NULL,
    final_price_rmb        DECIMAL(18, 6)          DEFAULT NULL,
    final_price_usd        DECIMAL(18, 6)          DEFAULT NULL,
    datasheet              VARCHAR(500)   NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tk_quotation_line (quotation_id, line_no),
    KEY idx_tk_quotation_line_mpn (ctk_mpn),
    CONSTRAINT fk_tk_quotation_line_header FOREIGN KEY (quotation_id) REFERENCES tk_quotation (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报价单明细及三阶段价格';

CREATE TABLE IF NOT EXISTS tk_quotation_revision (
    id            BIGINT        NOT NULL AUTO_INCREMENT,
    quotation_id  BIGINT        NOT NULL,
    stage         VARCHAR(32)   NOT NULL,
    action        VARCHAR(64)   NOT NULL,
    comment_text  VARCHAR(2000) NOT NULL DEFAULT '',
    snapshot_json LONGTEXT      NOT NULL,
    operator_id   BIGINT        NOT NULL,
    operator_name VARCHAR(64)   NOT NULL DEFAULT '',
    create_time   DATETIME      NOT NULL,
    PRIMARY KEY (id),
    KEY idx_tk_quotation_revision_quote_time (quotation_id, create_time),
    CONSTRAINT fk_tk_quotation_revision_header FOREIGN KEY (quotation_id) REFERENCES tk_quotation (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报价单审批版本快照';

CREATE TABLE IF NOT EXISTS tk_quotation_monthly_run (
    report_month    CHAR(7)      NOT NULL PRIMARY KEY,
    period_from     DATE         NOT NULL,
    period_to       DATE         NOT NULL,
    status          VARCHAR(16)  NOT NULL,
    recipient_name  VARCHAR(100) NULL,
    row_count       INT          NOT NULL DEFAULT 0,
    quotation_count INT          NOT NULL DEFAULT 0,
    error_message   VARCHAR(500) NULL,
    started_at      DATETIME     NOT NULL,
    finished_at     DATETIME     NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内贸月度授信报价单发送台账';

CREATE TABLE IF NOT EXISTS tk_quotation_sequence (
    number_date    CHAR(8)      NOT NULL PRIMARY KEY,
    sequence_value INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报价单号日序列表';

CREATE TABLE IF NOT EXISTS tk_quotation_number_sequence (
    number_date    CHAR(8)      NOT NULL,
    business_type  VARCHAR(16)  NOT NULL,
    sequence_value INT UNSIGNED NOT NULL,
    PRIMARY KEY (number_date, business_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报价单号分业务日序列表';

CREATE TABLE IF NOT EXISTS tk_quotation_daily_number (
    number_date    CHAR(8)      NOT NULL,
    business_type  VARCHAR(16)  NOT NULL,
    sequence_value INT UNSIGNED NOT NULL,
    PRIMARY KEY (number_date, business_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报价单号每日两位分段计数表';

CREATE TABLE IF NOT EXISTS tk_quotation_reminder (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    dedupe_key    VARCHAR(160)    NOT NULL,
    quotation_id  BIGINT          NOT NULL,
    business_type VARCHAR(16)     NOT NULL,
    stage         VARCHAR(16)     NOT NULL,
    revision_id   BIGINT          NOT NULL DEFAULT 0,
    source        VARCHAR(16)     NOT NULL,
    operator_id   BIGINT          NULL,
    status        VARCHAR(16)     NOT NULL DEFAULT 'sending',
    create_time   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finish_time   DATETIME        NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_quotation_reminder_dedupe (dedupe_key),
    KEY idx_quotation_reminder_cooldown (quotation_id, stage, revision_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报价单审批催办记录';

CREATE TABLE IF NOT EXISTS tk_sample_progress (
    id                   BIGINT        NOT NULL AUTO_INCREMENT,
    customer_received    VARCHAR(16)   DEFAULT NULL COMMENT '客户是否收样',
    salesperson          VARCHAR(100)  DEFAULT NULL COMMENT '业务员',
    country              VARCHAR(100)  DEFAULT NULL COMMENT '国家',
    city                 VARCHAR(100)  DEFAULT NULL COMMENT '城市',
    customer_name        VARCHAR(255)  DEFAULT NULL COMMENT '客户名称',
    customer_type        VARCHAR(100)  DEFAULT NULL COMMENT '客户类型',
    product_application  VARCHAR(255)  DEFAULT NULL COMMENT '产品应用',
    brand_requirement    VARCHAR(100)  DEFAULT NULL COMMENT '品牌要求',
    grade_requirement    VARCHAR(100)  DEFAULT NULL COMMENT '等级需求',
    part_no              VARCHAR(255)  DEFAULT NULL COMMENT '内部料号',
    package_name         VARCHAR(100)  DEFAULT NULL COMMENT '封装',
    quantity             VARCHAR(100)  DEFAULT NULL COMMENT '数量',
    unit                 VARCHAR(32)   DEFAULT NULL COMMENT '单位',
    datasheet            VARCHAR(500)  DEFAULT NULL COMMENT '规格书',
    sample_order_date    DATE          DEFAULT NULL COMMENT '样品下单日期',
    sample_required_date DATE          DEFAULT NULL COMMENT '样品需求日',
    buyer                VARCHAR(100)  DEFAULT NULL COMMENT '采购员',
    supplier_code        VARCHAR(100)  DEFAULT NULL COMMENT '供应商代码',
    chip_size            VARCHAR(100)  DEFAULT NULL COMMENT '芯片尺寸',
    wafer_factory_code   VARCHAR(100)  DEFAULT NULL COMMENT '晶圆厂代码',
    sample_due_date      DATE          DEFAULT NULL COMMENT '样品交期',
    merchandiser         VARCHAR(100)  DEFAULT NULL COMMENT '跟单员',
    actual_arrival_qty   VARCHAR(100)  DEFAULT NULL COMMENT '实际到样数量',
    delivery_status      VARCHAR(100)  DEFAULT NULL COMMENT '样品交付情况',
    actual_delivery_date DATE          DEFAULT NULL COMMENT '实际交期',
    test_qty             VARCHAR(100)  DEFAULT NULL COMMENT '测样数量',
    retained_qty         VARCHAR(100)  DEFAULT NULL COMMENT '留样数量',
    shipping_status      VARCHAR(100)  DEFAULT NULL COMMENT '发走情况',
    test_owner           VARCHAR(100)  DEFAULT NULL COMMENT '检测负责人',
    test_result          VARCHAR(255)  DEFAULT NULL COMMENT '检测结果',
    order_status         VARCHAR(100)  DEFAULT NULL COMMENT '订单情况',
    progress_status      VARCHAR(32)   NOT NULL DEFAULT 'registered' COMMENT 'registered/purchasing/waiting_sample/received/testing/shipped/converted/closed/abnormal',
    remark               VARCHAR(1000) DEFAULT NULL COMMENT '备注',
    source_file          VARCHAR(255)  DEFAULT NULL COMMENT '导入文件名',
    source_row           INT           DEFAULT NULL COMMENT '导入文件行号',
    source_key           VARCHAR(200)  DEFAULT NULL COMMENT '导入幂等键',
    created_by_id        BIGINT        DEFAULT NULL,
    created_by_name      VARCHAR(100)  DEFAULT NULL,
    created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id        BIGINT        DEFAULT NULL,
    updated_by_name      VARCHAR(100)  DEFAULT NULL,
    updated_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tk_sample_progress_source (source_key),
    KEY idx_tk_sample_progress_customer (customer_name),
    KEY idx_tk_sample_progress_part (part_no),
    KEY idx_tk_sample_progress_salesperson (salesperson),
    KEY idx_tk_sample_progress_status (progress_status),
    KEY idx_tk_sample_progress_order_date (sample_order_date),
    KEY idx_tk_sample_progress_required_date (sample_required_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户样品需求及跟进进度';

CREATE TABLE IF NOT EXISTS tk_customer_card (
    id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
    salesperson     VARCHAR(100)  DEFAULT NULL,
    country         VARCHAR(50)   DEFAULT NULL,
    customer_nature VARCHAR(50)   DEFAULT NULL,
    company_name    VARCHAR(255)  DEFAULT NULL,
    short_name      VARCHAR(100)  DEFAULT NULL,
    website         VARCHAR(255)  DEFAULT NULL,
    address         VARCHAR(500)  DEFAULT NULL,
    contact_name    VARCHAR(100)  DEFAULT NULL,
    job_title       VARCHAR(100)  DEFAULT NULL,
    phone           VARCHAR(100)  DEFAULT NULL,
    email           VARCHAR(255)  DEFAULT NULL,
    whatsapp        VARCHAR(100)  DEFAULT NULL,
    remark          VARCHAR(2000) DEFAULT NULL,
    card_images     TEXT          DEFAULT NULL,
    photo_images    TEXT          DEFAULT NULL,
    review_status   VARCHAR(20)   DEFAULT 'active',
    conflict_note   VARCHAR(1000) DEFAULT NULL,
    review_by_id    BIGINT        DEFAULT NULL,
    review_by_name  VARCHAR(100)  DEFAULT NULL,
    review_at       DATETIME      DEFAULT NULL,
    review_comment  VARCHAR(2000) DEFAULT NULL,
    company_norm    VARCHAR(255)  DEFAULT NULL,
    website_norm    VARCHAR(255)  DEFAULT NULL,
    email_norm      VARCHAR(255)  DEFAULT NULL,
    phone_norm      VARCHAR(64)   DEFAULT NULL,
    created_by_id   BIGINT        DEFAULT NULL,
    created_by_name VARCHAR(100)  DEFAULT NULL,
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_by_id   BIGINT        DEFAULT NULL,
    updated_by_name VARCHAR(100)  DEFAULT NULL,
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户档案卡';

CREATE TABLE IF NOT EXISTS tk_customer_weekly (
    id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
    customer_id     BIGINT        DEFAULT NULL,
    week_start      DATE          DEFAULT NULL,
    week_no         SMALLINT      DEFAULT NULL,
    content         VARCHAR(2000) DEFAULT NULL,
    created_by_id   BIGINT        DEFAULT NULL,
    created_by_name VARCHAR(100)  DEFAULT NULL,
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_by_id   BIGINT        DEFAULT NULL,
    updated_by_name VARCHAR(100)  DEFAULT NULL,
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tk_customer_weekly (customer_id, week_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户跟进周报';

CREATE TABLE IF NOT EXISTS tk_customer_card_workflow (
    customer_id BIGINT      NOT NULL PRIMARY KEY,
    dept_id     BIGINT      NULL,
    reviewer_id BIGINT      NULL,
    conflicts   JSON        NOT NULL,
    request_id  CHAR(36)    NOT NULL UNIQUE,
    photo_data  MEDIUMBLOB  NULL COMMENT '名片原图',
    photo_type  VARCHAR(32) NULL COMMENT '图片MIME类型',
    INDEX idx_reviewer (reviewer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户档案审批与附件扩展';

CREATE TABLE IF NOT EXISTS tk_customer_weekly_meta (
    weekly_id  BIGINT        NOT NULL PRIMARY KEY,
    next_plan  VARCHAR(2000) NOT NULL,
    request_id CHAR(36)      NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户周报下周计划扩展';

CREATE TABLE IF NOT EXISTS tk_customer_weekly_request (
    request_id CHAR(36)      NOT NULL PRIMARY KEY,
    weekly_id  BIGINT        NOT NULL,
    week_start CHAR(10)      NOT NULL,
    content    VARCHAR(2000) NOT NULL,
    next_plan  VARCHAR(2000) NOT NULL,
    created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_weekly (weekly_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户周报幂等请求日志';

CREATE TABLE IF NOT EXISTS tk_delivery_alert_run (
    run_date    DATE         NOT NULL PRIMARY KEY,
    status      VARCHAR(16)  NOT NULL,
    summary     VARCHAR(500) NULL,
    started_at  DATETIME     NOT NULL,
    finished_at DATETIME     NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='销售交期预警执行台账';

CREATE TABLE IF NOT EXISTS tk_delivery_alert_delivery (
    run_date       DATE         NOT NULL,
    userid         VARCHAR(128) NOT NULL,
    recipient_name VARCHAR(100) NOT NULL,
    is_total       TINYINT      NOT NULL DEFAULT 0,
    row_count      INT          NOT NULL,
    status         VARCHAR(16)  NOT NULL,
    error_message  VARCHAR(500) NULL,
    finished_at    DATETIME     NULL,
    PRIMARY KEY (run_date, userid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='销售交期预警发送明细';

CREATE TABLE IF NOT EXISTS tk_overdue_ar_alert_run (
    run_date    DATE         NOT NULL PRIMARY KEY,
    status      VARCHAR(16)  NOT NULL,
    summary     VARCHAR(500) NULL,
    started_at  DATETIME     NOT NULL,
    finished_at DATETIME     NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='逾期应收预警执行台账';

CREATE TABLE IF NOT EXISTS tk_overdue_ar_alert_delivery (
    run_date       DATE         NOT NULL,
    userid         VARCHAR(128) NOT NULL,
    recipient_name VARCHAR(100) NOT NULL,
    is_total       TINYINT      NOT NULL DEFAULT 0,
    row_count      INT          NOT NULL,
    status         VARCHAR(16)  NOT NULL,
    error_message  VARCHAR(500) NULL,
    finished_at    DATETIME     NULL,
    PRIMARY KEY (run_date, userid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='逾期应收预警发送明细';

-- ----------------------------
-- 6. Procurement & NPI Tables
-- ----------------------------

CREATE TABLE IF NOT EXISTS tk_supplier_access (
    id                  BIGINT        NOT NULL AUTO_INCREMENT,
    access_no           VARCHAR(32)   NOT NULL COMMENT '准入单号',
    supplier_name       VARCHAR(255)  NOT NULL COMMENT '供应商名称',
    contact_name        VARCHAR(100)  DEFAULT NULL COMMENT '联系人',
    contact_phone       VARCHAR(100)  DEFAULT NULL COMMENT '联系电话',
    contact_email       VARCHAR(255)  DEFAULT NULL COMMENT '邮箱',
    main_materials      VARCHAR(500)  DEFAULT NULL COMMENT '主营物料/类别',
    address             VARCHAR(500)  DEFAULT NULL COMMENT '地址',
    business_license_no VARCHAR(100)  DEFAULT NULL COMMENT '营业执照号',
    certificates        VARCHAR(1000) DEFAULT NULL COMMENT '体系证书',
    supply_capacity     VARCHAR(500)  DEFAULT NULL COMMENT '产能/供货能力',
    apply_date          DATE          DEFAULT NULL COMMENT '申请日期',
    applicant           VARCHAR(100)  DEFAULT NULL COMMENT '申请人',
    purchaser_opinion   TEXT          DEFAULT NULL,
    purchaser_by        VARCHAR(100)  DEFAULT NULL,
    purchaser_by_id     BIGINT        DEFAULT NULL,
    purchaser_at        DATETIME      DEFAULT NULL,
    quality_opinion     TEXT          DEFAULT NULL,
    quality_by          VARCHAR(100)  DEFAULT NULL,
    quality_by_id       BIGINT        DEFAULT NULL,
    quality_at          DATETIME      DEFAULT NULL,
    engineer_opinion    TEXT          DEFAULT NULL,
    engineer_by         VARCHAR(100)  DEFAULT NULL,
    engineer_by_id      BIGINT        DEFAULT NULL,
    engineer_at         DATETIME      DEFAULT NULL,
    manager_opinion     TEXT          DEFAULT NULL COMMENT '终审意见',
    manager_by          VARCHAR(100)  DEFAULT NULL COMMENT '终审人',
    manager_by_id       BIGINT        DEFAULT NULL COMMENT '终审人ID',
    manager_at          DATETIME      DEFAULT NULL COMMENT '终审时间',
    final_result        VARCHAR(32)   DEFAULT NULL COMMENT '准入结果 准入/不准入/有条件准入',
    is_avl              TINYINT       DEFAULT 0 COMMENT '是否纳入AVL 0/1',
    status              VARCHAR(32)   NOT NULL DEFAULT 'draft' COMMENT 'draft/pending/reviewing/approved/rejected',
    attachments         TEXT          NULL COMMENT '附件URLs逗号分隔',
    remark              TEXT          DEFAULT NULL,
    created_by_id       BIGINT        DEFAULT NULL,
    created_by_name     VARCHAR(100)  DEFAULT NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id       BIGINT        DEFAULT NULL,
    updated_by_name     VARCHAR(100)  DEFAULT NULL,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tk_supplier_access_no (access_no),
    KEY idx_tk_supplier_access_status (status),
    KEY idx_tk_supplier_access_supplier (supplier_name),
    KEY idx_tk_supplier_access_apply_date (apply_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商准入申请';

CREATE TABLE IF NOT EXISTS tk_sample_test (
    id                 BIGINT       NOT NULL AUTO_INCREMENT,
    test_no            VARCHAR(32)  NOT NULL COMMENT '试验单号',
    product_name       VARCHAR(255) DEFAULT NULL COMMENT '产品名称',
    material_name_spec VARCHAR(255) DEFAULT NULL COMMENT '物料名称及规格',
    supplier_id        INT          NULL COMMENT '关联供应商准入ID',
    material_id        BIGINT       NULL COMMENT 'ERP物料内码',
    material_number    VARCHAR(50)  NULL COMMENT '物料编码',
    material_name      VARCHAR(255) NULL COMMENT '物料名称',
    material_spec      VARCHAR(500) NULL COMMENT '规格型号',
    supplier_name      VARCHAR(255) DEFAULT NULL COMMENT '供应商',
    material_model     VARCHAR(255) DEFAULT NULL COMMENT '物料型号',
    test_qty           VARCHAR(100) DEFAULT NULL COMMENT '试验数量',
    test_qty_unit      VARCHAR(32)  DEFAULT NULL COMMENT '试验数量单位',
    test_dept          VARCHAR(100) DEFAULT NULL COMMENT '试验部门',
    apply_date         DATE         DEFAULT NULL COMMENT '申请日期',
    reply_date         DATE         DEFAULT NULL COMMENT '回复报告日期',
    applicant          VARCHAR(100) DEFAULT NULL COMMENT '申请人',
    tester_target_qty  VARCHAR(100) DEFAULT NULL COMMENT '目标产量',
    tester_actual_qty  VARCHAR(100) DEFAULT NULL COMMENT '实际产量',
    tester_usage       VARCHAR(100) DEFAULT NULL COMMENT '用量',
    tester_remark      TEXT         DEFAULT NULL COMMENT '测试情况',
    tester_name        VARCHAR(100) DEFAULT NULL COMMENT '测试人',
    tester_by          VARCHAR(100) DEFAULT NULL,
    tester_by_id       BIGINT       DEFAULT NULL,
    tester_at          DATETIME     DEFAULT NULL,
    ipqc_opinion       TEXT         DEFAULT NULL,
    ipqc_by            VARCHAR(100) DEFAULT NULL,
    ipqc_by_id         BIGINT       DEFAULT NULL,
    ipqc_at            DATETIME     DEFAULT NULL,
    team_leader_opinion TEXT        DEFAULT NULL,
    team_leader_by     VARCHAR(100) DEFAULT NULL,
    team_leader_by_id  BIGINT       DEFAULT NULL,
    team_leader_at     DATETIME     DEFAULT NULL,
    supervisor_opinion TEXT         DEFAULT NULL,
    supervisor_by      VARCHAR(100) DEFAULT NULL,
    supervisor_by_id   BIGINT       DEFAULT NULL,
    supervisor_at      DATETIME     DEFAULT NULL,
    approver_opinion   TEXT         DEFAULT NULL,
    approver_by        VARCHAR(100) DEFAULT NULL,
    reviewer_name      VARCHAR(100) DEFAULT NULL COMMENT '审核人',
    reviewer_at        DATETIME     DEFAULT NULL COMMENT '审核时间',
    approver_by_id     BIGINT       DEFAULT NULL,
    approver_at        DATETIME     DEFAULT NULL,
    final_result       VARCHAR(32)  DEFAULT NULL COMMENT '合格/不合格/特采',
    status             VARCHAR(32)  NOT NULL DEFAULT 'draft' COMMENT 'draft/testing/ipqc_review/leader_review/supervisor_review/approved/rejected',
    attachments        TEXT         NULL COMMENT '附件URLs逗号分隔',
    remark             TEXT         DEFAULT NULL COMMENT '备注',
    created_by_id      BIGINT       DEFAULT NULL,
    created_by_name    VARCHAR(100) DEFAULT NULL,
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id      BIGINT       DEFAULT NULL,
    updated_by_name    VARCHAR(100) DEFAULT NULL,
    updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tk_sample_test_no (test_no),
    KEY idx_tk_sample_test_status (status),
    KEY idx_tk_sample_test_supplier (supplier_name),
    KEY idx_tk_sample_test_supplier_id (supplier_id),
    KEY idx_tk_sample_test_material (material_number),
    KEY idx_tk_sample_test_product (product_name),
    KEY idx_tk_sample_test_apply_date (apply_date),
    KEY idx_tk_sample_test_reply_date (reply_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='样品试验单';

CREATE TABLE IF NOT EXISTS tk_npi (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    npi_no              VARCHAR(32)  NOT NULL COMMENT 'NPI单号',
    supplier_name       VARCHAR(255) NOT NULL COMMENT '供应商名称',
    contact_name        VARCHAR(100) DEFAULT NULL COMMENT '联系人',
    contact_phone       VARCHAR(100) DEFAULT NULL COMMENT '联系电话',
    contact_email       VARCHAR(255) DEFAULT NULL COMMENT '邮箱',
    main_materials      VARCHAR(500) DEFAULT NULL COMMENT '主营物料/类别',
    address             VARCHAR(500) DEFAULT NULL COMMENT '地址',
    business_license_no VARCHAR(100) DEFAULT NULL COMMENT '营业执照号',
    certificates        VARCHAR(1000) DEFAULT NULL COMMENT '体系证书',
    supply_capacity     VARCHAR(500) DEFAULT NULL COMMENT '产能/供货能力',
    product_name        VARCHAR(255) DEFAULT NULL COMMENT '产品名称',
    material_name_spec  VARCHAR(255) DEFAULT NULL COMMENT '物料名称及规格',
    material_id         BIGINT       DEFAULT NULL COMMENT 'ERP物料内码',
    material_number     VARCHAR(255) DEFAULT NULL COMMENT '料号',
    material_name       VARCHAR(255) DEFAULT NULL COMMENT '物料名称',
    material_spec       VARCHAR(500) DEFAULT NULL COMMENT '规格型号',
    material_model      VARCHAR(255) DEFAULT NULL COMMENT '物料型号',
    test_qty            VARCHAR(100) DEFAULT NULL COMMENT '试验数量',
    test_qty_unit       VARCHAR(32)  DEFAULT NULL COMMENT '试验数量单位',
    test_dept           VARCHAR(100) DEFAULT NULL COMMENT '试验部门',
    apply_date          DATE         DEFAULT NULL COMMENT '申请日期',
    reply_date          DATE         DEFAULT NULL COMMENT '回复报告日期',
    applicant           VARCHAR(100) DEFAULT NULL COMMENT '申请人',
    tester_name         VARCHAR(100) DEFAULT NULL,
    tester_target_qty   VARCHAR(100) DEFAULT NULL,
    tester_actual_qty   VARCHAR(100) DEFAULT NULL,
    tester_usage        VARCHAR(100) DEFAULT NULL,
    tester_remark       TEXT         DEFAULT NULL,
    tester_by           VARCHAR(100) DEFAULT NULL,
    tester_by_id        BIGINT       DEFAULT NULL,
    tester_at           DATETIME     DEFAULT NULL,
    ipqc_opinion        TEXT         DEFAULT NULL,
    ipqc_by             VARCHAR(100) DEFAULT NULL,
    ipqc_by_id          BIGINT       DEFAULT NULL,
    ipqc_at             DATETIME     DEFAULT NULL,
    team_leader_opinion TEXT         DEFAULT NULL,
    team_leader_by      VARCHAR(100) DEFAULT NULL,
    team_leader_by_id   BIGINT       DEFAULT NULL,
    team_leader_at      DATETIME     DEFAULT NULL,
    supervisor_opinion  TEXT         DEFAULT NULL,
    supervisor_by       VARCHAR(100) DEFAULT NULL,
    supervisor_by_id    BIGINT       DEFAULT NULL,
    supervisor_at       DATETIME     DEFAULT NULL,
    assistant_opinion   TEXT         NULL COMMENT '复核助理意见',
    assistant_by        VARCHAR(100) NULL,
    assistant_by_id     BIGINT       NULL,
    assistant_at        DATETIME     NULL,
    approver_opinion    TEXT         DEFAULT NULL,
    approver_by         VARCHAR(100) DEFAULT NULL,
    approver_by_id      BIGINT       DEFAULT NULL,
    approver_at         DATETIME     DEFAULT NULL,
    final_result        VARCHAR(32)  DEFAULT NULL COMMENT '测试结论 合格/不合格/特采',
    access_result       VARCHAR(32)  DEFAULT NULL COMMENT '准入结论 准入/有条件准入/不准入',
    access_id           BIGINT       DEFAULT NULL COMMENT '生成的供应商准入记录ID',
    status              VARCHAR(32)  NOT NULL DEFAULT 'draft' COMMENT 'draft/testing/ipqc_review/leader_review/supervisor_review/assistant_review/manager_review/approved/rejected',
    attachments         TEXT         DEFAULT NULL COMMENT '附件URLs逗号分隔',
    remark              TEXT         DEFAULT NULL COMMENT '备注',
    created_by_id       BIGINT       DEFAULT NULL,
    created_by_name     VARCHAR(100) DEFAULT NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_id       BIGINT       DEFAULT NULL,
    updated_by_name     VARCHAR(100) DEFAULT NULL,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tk_npi_no (npi_no),
    KEY idx_tk_npi_status (status),
    KEY idx_tk_npi_supplier (supplier_name),
    KEY idx_tk_npi_apply_date (apply_date),
    KEY idx_tk_npi_access_id (access_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NPI统一申请';

-- ----------------------------
-- 7. HR, Knowledge Base, Media & Engagement Tables
-- ----------------------------

CREATE TABLE IF NOT EXISTS talent_lib (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    name          VARCHAR(100) NOT NULL,
    birthDate     DATETIME     DEFAULT NULL,
    gender        VARCHAR(16)  DEFAULT NULL,
    schoolName    VARCHAR(255) DEFAULT NULL,
    eduId         VARCHAR(32)  DEFAULT NULL,
    isMarriedId   VARCHAR(16)  DEFAULT NULL,
    position      VARCHAR(100) DEFAULT NULL,
    phoneNumber   VARCHAR(32)  DEFAULT NULL,
    attachments   TEXT         DEFAULT NULL,
    recordStatus  VARCHAR(32)  DEFAULT NULL,
    isDel         INT          NOT NULL DEFAULT 0,
    creator       VARCHAR(64)  DEFAULT NULL,
    createTime    DATETIME     DEFAULT NULL,
    modifier      VARCHAR(64)  DEFAULT NULL,
    updateTime    DATETIME     DEFAULT NULL,
    remark        VARCHAR(500) DEFAULT NULL,
    nativePlace   VARCHAR(255) DEFAULT NULL,
    interviewTime DATETIME     DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_talent_del (isDel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='人才库';

CREATE TABLE IF NOT EXISTS tk_suggest (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    suggest_text TEXT         DEFAULT NULL,
    suggest_time DATETIME     DEFAULT NULL,
    ipAdress     VARCHAR(128) DEFAULT NULL,
    noSend       VARCHAR(16)  DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_suggest_time (suggest_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='员工意见建议';

CREATE TABLE IF NOT EXISTS tk_video_library (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    title            VARCHAR(128) NOT NULL,
    category         VARCHAR(64)  DEFAULT '',
    description      VARCHAR(2000) DEFAULT '',
    original_name    VARCHAR(255) NOT NULL,
    storage_path     VARCHAR(500) NOT NULL,
    cover_path       VARCHAR(500) DEFAULT NULL,
    content_type     VARCHAR(100) NOT NULL DEFAULT 'video/mp4',
    size_bytes       BIGINT       NOT NULL,
    duration_seconds INT          DEFAULT NULL,
    uploader_id      BIGINT       NOT NULL,
    uploader_name    VARCHAR(64)  DEFAULT '',
    status           CHAR(1)      NOT NULL DEFAULT '0' COMMENT '0正常 1已删除',
    create_time      DATETIME     NOT NULL,
    update_time      DATETIME     NOT NULL,
    PRIMARY KEY (id),
    KEY idx_tk_video_status_time (status, create_time),
    KEY idx_tk_video_category (category),
    KEY idx_tk_video_uploader (uploader_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='员工视频知识库';

CREATE TABLE IF NOT EXISTS tk_music_album (
    album_id    BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    description VARCHAR(500) DEFAULT NULL,
    source_type VARCHAR(20)  NOT NULL DEFAULT 'manual' COMMENT 'youtube_playlist|bilibili_playlist|manual|local',
    source_url  VARCHAR(500) DEFAULT NULL,
    track_count INT          NOT NULL DEFAULT 0,
    status      CHAR(1)      NOT NULL DEFAULT '0' COMMENT '0-active 1-disabled',
    create_by   VARCHAR(64)  DEFAULT NULL,
    create_time DATETIME     DEFAULT NULL,
    update_by   VARCHAR(64)  DEFAULT NULL,
    update_time DATETIME     DEFAULT NULL,
    remark      VARCHAR(500) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Workshop music album / collection';

CREATE TABLE IF NOT EXISTS tk_music_media (
    media_id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    sha256             CHAR(64)     CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    file_name          VARCHAR(255) NOT NULL,
    file_ext           VARCHAR(12)  NOT NULL,
    mime_type          VARCHAR(100) DEFAULT NULL,
    file_size          BIGINT       NOT NULL,
    duration_ms        BIGINT       NOT NULL,
    codec              VARCHAR(40)  NOT NULL,
    storage_key        VARCHAR(255) NOT NULL,
    backup_sha256      CHAR(64)     CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    player_sha256      CHAR(64)     CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    player_path        VARCHAR(255) DEFAULT NULL,
    sync_status        VARCHAR(24)  NOT NULL DEFAULT 'pending_sync' COMMENT 'pending_sync|ready|failed',
    last_sync_error    VARCHAR(500) DEFAULT NULL,
    player_verified_at DATETIME     DEFAULT NULL,
    create_time        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tk_music_media_sha256 (sha256),
    KEY idx_tk_music_media_sync_status (sync_status, update_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Local audio resources for workshop broadcast';

CREATE TABLE IF NOT EXISTS tk_music_track (
    track_id    BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    album_id    BIGINT       NOT NULL,
    video_id    VARCHAR(50)  DEFAULT NULL,
    media_id    BIGINT       DEFAULT NULL,
    title       VARCHAR(300) NOT NULL,
    url         VARCHAR(500) DEFAULT NULL,
    channel     VARCHAR(200) DEFAULT NULL,
    thumbnail   VARCHAR(500) DEFAULT NULL,
    duration    INT          DEFAULT 0 COMMENT 'seconds',
    sort_order  INT          NOT NULL DEFAULT 0,
    create_time DATETIME     DEFAULT NULL,
    update_time DATETIME     DEFAULT NULL,
    KEY idx_track_album (album_id, sort_order),
    KEY idx_track_media (media_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tracks within an album';

CREATE TABLE IF NOT EXISTS tk_music_schedule (
    schedule_id   BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    album_id      BIGINT       NOT NULL,
    schedule_type VARCHAR(20)  NOT NULL DEFAULT 'daily' COMMENT 'daily|weekdays|weekends|custom',
    weekdays      VARCHAR(20)  DEFAULT NULL COMMENT 'comma-separated 1-7 for Mon-Sun',
    start_time    VARCHAR(5)   NOT NULL COMMENT 'HH:mm',
    end_time      VARCHAR(5)   DEFAULT NULL COMMENT 'HH:mm, null = play until done',
    play_order    INT          NOT NULL DEFAULT 0,
    `loop`        CHAR(1)      NOT NULL DEFAULT '0' COMMENT '0-play once 1-loop',
    enabled       CHAR(1)      NOT NULL DEFAULT '1' COMMENT '0-disabled 1-enabled',
    last_played   DATETIME     DEFAULT NULL,
    create_by     VARCHAR(64)  DEFAULT NULL,
    create_time   DATETIME     DEFAULT NULL,
    update_by     VARCHAR(64)  DEFAULT NULL,
    update_time   DATETIME     DEFAULT NULL,
    remark        VARCHAR(500) DEFAULT NULL,
    KEY idx_schedule_enabled (enabled, schedule_type, start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Scheduled album playback';

CREATE TABLE IF NOT EXISTS tk_music_broadcast_schedule (
    broadcast_schedule_id BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name                  VARCHAR(255) NOT NULL,
    schedule_type         VARCHAR(20)  NOT NULL DEFAULT 'daily' COMMENT 'daily|weekdays|weekends|custom',
    weekdays              VARCHAR(20)  DEFAULT NULL COMMENT 'comma-separated ISO weekdays 1-7',
    start_time            VARCHAR(5)   NOT NULL COMMENT 'HH:mm',
    end_time              VARCHAR(5)   DEFAULT NULL COMMENT 'HH:mm; null means play once',
    play_order            INT          NOT NULL DEFAULT 0,
    `loop`                CHAR(1)      NOT NULL DEFAULT '0' COMMENT '0-play once 1-loop to cutoff',
    enabled               CHAR(1)      NOT NULL DEFAULT '1',
    last_played           DATETIME     DEFAULT NULL,
    legacy_schedule_id    BIGINT       DEFAULT NULL,
    create_by             VARCHAR(64)  DEFAULT NULL,
    create_time           DATETIME     DEFAULT NULL,
    update_by             VARCHAR(64)  DEFAULT NULL,
    update_time           DATETIME     DEFAULT NULL,
    remark                VARCHAR(500) DEFAULT NULL,
    UNIQUE KEY uk_music_broadcast_legacy_schedule (legacy_schedule_id),
    KEY idx_music_broadcast_enabled (enabled, schedule_type, start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Independent workshop broadcast plans';

CREATE TABLE IF NOT EXISTS tk_music_broadcast_schedule_album (
    broadcast_schedule_id BIGINT NOT NULL,
    album_id              BIGINT NOT NULL,
    sort_order            INT    NOT NULL DEFAULT 0,
    PRIMARY KEY (broadcast_schedule_id, album_id),
    KEY idx_music_broadcast_album (album_id, broadcast_schedule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Albums selected by a workshop broadcast plan';

CREATE TABLE IF NOT EXISTS tk_lucky_activity (
    id          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '活动ID',
    title       VARCHAR(100) NOT NULL COMMENT '活动名称',
    description TEXT         COMMENT '活动规则描述',
    start_time  DATETIME     NOT NULL COMMENT '开始时间',
    end_time    DATETIME     NOT NULL COMMENT '结束时间',
    draw_limit  INT          DEFAULT 99 COMMENT '抽奖次数限制',
    status      CHAR(1)      DEFAULT '0' COMMENT '状态（0正常 1停用）',
    create_by   VARCHAR(64)  DEFAULT '' COMMENT '创建者',
    create_time DATETIME     DEFAULT NULL COMMENT '创建时间',
    update_by   VARCHAR(64)  DEFAULT '' COMMENT '更新者',
    update_time DATETIME     DEFAULT NULL COMMENT '更新时间',
    remark      VARCHAR(500) DEFAULT NULL COMMENT '备注',
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖活动表';

CREATE TABLE IF NOT EXISTS tk_lucky_prize (
    id          BIGINT         NOT NULL AUTO_INCREMENT COMMENT '奖品ID',
    activity_id BIGINT         NOT NULL COMMENT '活动ID',
    prize_name  VARCHAR(100)   NOT NULL COMMENT '奖品名称',
    prize_level VARCHAR(50)    DEFAULT '' COMMENT '奖品等级',
    total_qty   INT            DEFAULT 0 COMMENT '奖品总数量',
    remain_qty  INT            DEFAULT 0 COMMENT '剩余数量',
    probability INT            DEFAULT 0 COMMENT '权重/概率',
    prize_icon  VARCHAR(255)   DEFAULT '' COMMENT '奖品图标/颜色',
    status      CHAR(1)        DEFAULT '0' COMMENT '状态（0正常 1停用）',
    prize_type  CHAR(1)        DEFAULT '0' COMMENT '奖品类型（0实物 1现金 2谢谢参与）',
    is_fallback CHAR(1)        DEFAULT '0' COMMENT '是否兜底参与奖（0否 1是）',
    cash_amount DECIMAL(10, 2) DEFAULT NULL COMMENT '现金面额（元）',
    create_by   VARCHAR(64)    DEFAULT '' COMMENT '创建者',
    create_time DATETIME       DEFAULT NULL COMMENT '创建时间',
    update_by   VARCHAR(64)    DEFAULT '' COMMENT '更新者',
    update_time DATETIME       DEFAULT NULL COMMENT '更新时间',
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='奖品配置表';

CREATE TABLE IF NOT EXISTS tk_lucky_record (
    id           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '记录ID',
    activity_id  BIGINT       NOT NULL COMMENT '活动ID',
    user_phone   VARCHAR(20)  NOT NULL COMMENT '抽奖人手机号',
    user_name    VARCHAR(100) DEFAULT '' COMMENT '姓名/昵称',
    user_company VARCHAR(200) DEFAULT NULL COMMENT '公司名称',
    user_job     VARCHAR(100) DEFAULT NULL COMMENT '职务',
    openid       VARCHAR(128) DEFAULT NULL COMMENT 'OpenID',
    prize_id     BIGINT       DEFAULT NULL COMMENT '中奖奖品ID',
    prize_name   VARCHAR(100) DEFAULT NULL COMMENT '奖品名称',
    win_status   CHAR(1)      DEFAULT '0' COMMENT '中奖状态（0未中奖 1已中奖 2已兑奖核销）',
    redeem_code  VARCHAR(64)  DEFAULT NULL COMMENT '兑奖码',
    draw_time    DATETIME     NOT NULL COMMENT '抽奖时间',
    redeem_time  DATETIME     DEFAULT NULL COMMENT '兑奖时间',
    update_by    VARCHAR(64)  DEFAULT '' COMMENT '核销更新人',
    PRIMARY KEY (id),
    KEY idx_phone_activity (user_phone, activity_id),
    KEY idx_code (redeem_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖记录表';
