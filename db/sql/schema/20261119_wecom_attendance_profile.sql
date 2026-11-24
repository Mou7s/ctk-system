-- 创建企业微信考勤人员财务档案表（工号与财务分组）
CREATE TABLE IF NOT EXISTS tk_wecom_attendance_profile (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userid VARCHAR(64) NOT NULL COMMENT '企业微信 UserID',
  employee_code VARCHAR(32) NOT NULL DEFAULT '' COMMENT '员工工号（6位）',
  employee_name VARCHAR(64) NOT NULL DEFAULT '' COMMENT '员工姓名',
  finance_group VARCHAR(32) NOT NULL DEFAULT '' COMMENT '财务分组：时薪/计件/月薪/月薪加班/月薪11小时/月薪9.5小时/保安',
  remark VARCHAR(255) NULL COMMENT '备注',
  updated_by VARCHAR(64) NULL COMMENT '最后修改人',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_userid (userid),
  KEY idx_employee_code (employee_code),
  KEY idx_finance_group (finance_group)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业微信考勤人员财务档案（工号与财务分组）';
