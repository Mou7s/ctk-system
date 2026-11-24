import mysql, { type Pool } from 'mysql2/promise'
import { getNitroServerConfig, requireConfigValue } from './runtime'
import { isDemoScope } from './data-scope'
import { DemoModeError } from './demo'

const globalState = globalThis as typeof globalThis & { __attendanceMysqlPool?: Pool }

export function getAttendanceMysqlPool(): Pool {
  if (isDemoScope()) throw new DemoModeError('演示账号未接入考勤库，考勤相关页面暂不支持演示。')
  if (globalState.__attendanceMysqlPool) {
    return globalState.__attendanceMysqlPool
  }

  const config = getNitroServerConfig()
  const password = requireConfigValue('NUXT_ATTENDANCE_MYSQL_PASSWORD', config.attendanceMysqlPassword)

  globalState.__attendanceMysqlPool = mysql.createPool({
    host: config.attendanceMysqlHost,
    port: config.attendanceMysqlPort,
    user: config.attendanceMysqlUser,
    password,
    database: config.attendanceMysqlDatabase,
    waitForConnections: true,
    connectionLimit: 5,
    maxIdle: 5,
    idleTimeout: 60000,
    queueLimit: 0,
    connectTimeout: config.mysqlConnectTimeoutMs,
    charset: 'utf8',
  })
  return globalState.__attendanceMysqlPool
}

export function attendanceQueryOptions(sql: string) {
  return {
    sql,
    timeout: getNitroServerConfig().mysqlQueryTimeoutMs,
  }
}
