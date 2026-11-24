import type { H3Event } from 'h3'
import { getQuery, getRouterParam } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { apiError } from './response'
import {
  camelizeRows,
  dataResult,
  pageRequest,
  queryPage,
  queryNumber,
  queryText,
  tableResult,
  withReadSession,
} from './read'

export type CustomReadKind =
  | 'dummy-monthly-list' | 'dummy-monthly-detail' | 'dummy-weight-list'
  | 'msgtowx-list' | 'msgtowx-detail'
  | 'process-target-list' | 'process-staff'
  | 'lucky-activity-list' | 'lucky-activity-detail'
  | 'lucky-prize-list' | 'lucky-prize-detail'
  | 'lucky-record-list'
  | 'wxuser-detail'

type Query = Record<string, unknown>

function q(event: H3Event) {
  return getQuery(event) as Query
}

function like(conditions: string[], params: unknown[], column: string, value: unknown) {
  const text = queryText(value)
  if (text) { conditions.push(`${column} LIKE CONCAT('%', ?, '%')`); params.push(text) }
}

function equal(conditions: string[], params: unknown[], column: string, value: unknown) {
  const text = queryText(value)
  if (text) { conditions.push(`${column} = ?`); params.push(text) }
}

function exactIfPresent(conditions: string[], params: unknown[], column: string, value: unknown) {
  if (value !== undefined && value !== null && queryText(value) !== '') { conditions.push(`${column} = ?`); params.push(Array.isArray(value) ? value[0] : value) }
}

function pathId(event: H3Event, name: string) {
  const raw = queryText(getRouterParam(event, name))
  return raw || null
}

function numericPathId(event: H3Event, name: string) {
  const id = queryNumber(getRouterParam(event, name))
  return Number.isInteger(id) && id > 0 ? id : null
}

function sqlWhere(conditions: string[]) {
  return conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
}

function msgtowxRows(rows: unknown[]) {
  return camelizeRows(rows).map((row) => ({
    createBy: null,
    createTime: null,
    updateBy: null,
    updateTime: null,
    ...row,
  }))
}

async function simpleDetail(event: H3Event, label: string, table: string, columns: string, keyColumn: string, key: unknown, failureMessage: string) {
  return withReadSession(event, label, async (_, pool) => {
    const value = typeof key === 'number' ? key : queryText(key)
    if (!value) return apiError('参数不符合规范，不能进行查询', 500)
    const [rows] = await pool.query<RowDataPacket[]>({ sql: `SELECT ${columns} FROM ${table} WHERE ${keyColumn} = ?`, timeout: 10000 }, [value])
    return dataResult(camelizeRows(rows)[0] ?? null)
  }, failureMessage)
}

async function dummyMonthlyList(event: H3Event) {
  return withReadSession(event, 'DummyPieceMonthlyList', async (_, pool) => {
    const query = q(event); const page = pageRequest(query); const conditions: string[] = []; const params: unknown[] = []
    exactIfPresent(conditions, params, 'record_month', query.recordMonth)
    like(conditions, params, 'package_name', query.packageName)
    exactIfPresent(conditions, params, 'piece_type', query.pieceType)
    exactIfPresent(conditions, params, 'material', query.material)
    const where = sqlWhere(conditions)
    const result = await queryPage(pool,
      `SELECT COUNT(*) AS total FROM tk_dummy_piece_monthly${where}`,
      `SELECT id, record_month, package_name, piece_type, material, weight_value, piece_count, create_user_id, create_user_name, create_time, update_user_id, update_user_name, update_time, remark FROM tk_dummy_piece_monthly${where} ORDER BY record_month DESC, package_name ASC, piece_type ASC, material ASC LIMIT ?, ?`,
      params, [...params, page.offset, page.pageSize])
    return tableResult(result.rows, result.total)
  }, '获取假片月度列表失败')
}

async function dummyWeightList(event: H3Event) {
  return withReadSession(event, 'DummyPieceWeightList', async (_, pool) => {
    const query = q(event); const conditions: string[] = []; const params: unknown[] = []
    like(conditions, params, 'package_name', query.packageName)
    exactIfPresent(conditions, params, 'piece_type', query.pieceType)
    exactIfPresent(conditions, params, 'material', query.material)
    equal(conditions, params, 'status', query.status)
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: `SELECT id, package_name, piece_type, material, unit_weight, status, remark, create_by, create_time, update_by, update_time FROM tk_dummy_piece_weight${sqlWhere(conditions)} ORDER BY package_name ASC, piece_type ASC, material ASC`,
      timeout: 10000,
    }, params)
    return dataResult(camelizeRows(rows))
  }, '获取假片单重列表失败')
}

async function msgtowxList(event: H3Event) {
  return withReadSession(event, 'MsgtowxList', async (_, pool) => {
    const query = q(event); const page = pageRequest(query); const conditions: string[] = []; const params: unknown[] = []
    exactIfPresent(conditions, params, 'type', query.type)
    exactIfPresent(conditions, params, 'isSend', query.isSend)
    exactIfPresent(conditions, params, 'receiverIds', query.receiverIds)
    exactIfPresent(conditions, params, 'createtime', query.createtime)
    exactIfPresent(conditions, params, 'parentid', query.parentid)
    exactIfPresent(conditions, params, 'msg', query.msg)
    const where = sqlWhere(conditions)
    const result = await queryPage(pool,
      `SELECT COUNT(*) AS total FROM msgtowx${where}`,
      `SELECT id, type, isSend, receiverIds, createtime, parentid, msg FROM msgtowx${where} ORDER BY id DESC LIMIT ?, ?`,
      params, [...params, page.offset, page.pageSize])
    return tableResult(msgtowxRows(result.rows), result.total)
  }, '获取企微消息队列失败')
}

async function processTargetList(event: H3Event) {
  return withReadSession(event, 'ProcessOutputTargetList', async (_, pool) => {
    const query = q(event); const page = pageRequest(query); const conditions: string[] = []; const params: unknown[] = []
    like(conditions, params, 'package_name', query.packageName)
    exactIfPresent(conditions, params, 'process_name', query.processName)
    equal(conditions, params, 'status', query.status)
    const where = sqlWhere(conditions)
    const result = await queryPage(pool,
      `SELECT COUNT(*) AS total FROM tk_process_output_target${where}`,
      `SELECT id, package_name, process_name, target_capacity, sort_no, status, remark, create_by, create_time, update_by, update_time FROM tk_process_output_target${where} ORDER BY sort_no ASC, process_name ASC, package_name ASC LIMIT ?, ?`,
      params, [...params, page.offset, page.pageSize])
    return tableResult(result.rows, result.total)
  }, '获取工序产能目标列表失败')
}

async function processStaff(event: H3Event) {
  return withReadSession(event, 'ProcessOutputStaff', async (_, pool) => {
    const reportDate = queryText(q(event).reportDate)
    if (!reportDate) return apiError('统计日期不能为空', 500)
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: 'SELECT id, report_date, process_name, staff_count, remark, create_by, create_time, update_by, update_time FROM tk_process_output_staff WHERE report_date = ? ORDER BY process_name ASC',
      timeout: 10000,
    }, [reportDate])
    return dataResult(camelizeRows(rows))
  }, '获取工序人员数量失败')
}

async function luckyActivityList(event: H3Event) {
  return withReadSession(event, 'LuckyActivityList', async (_, pool) => {
    const query = q(event); const page = pageRequest(query); const conditions: string[] = []; const params: unknown[] = []
    like(conditions, params, 'title', query.title)
    if (query.startTime != null && queryText(query.startTime) !== '') { conditions.push('start_time >= ?'); params.push(query.startTime) }
    if (query.endTime != null && queryText(query.endTime) !== '') { conditions.push('end_time <= ?'); params.push(query.endTime) }
    equal(conditions, params, 'status', query.status)
    const where = sqlWhere(conditions)
    const result = await queryPage(pool,
      `SELECT COUNT(*) AS total FROM tk_lucky_activity${where}`,
      `SELECT id, title, description, start_time, end_time, draw_limit, status, create_by, create_time, update_by, update_time, remark FROM tk_lucky_activity${where} ORDER BY id DESC LIMIT ?, ?`,
      params, [...params, page.offset, page.pageSize])
    return tableResult(result.rows, result.total)
  }, '获取抽奖活动列表失败')
}

async function luckyPrizeList(event: H3Event) {
  return withReadSession(event, 'LuckyPrizeList', async (_, pool) => {
    const query = q(event); const page = pageRequest(query); const conditions: string[] = []; const params: unknown[] = []
    const activityId = queryNumber(query.activityId); if (activityId) { conditions.push('activity_id = ?'); params.push(activityId) }
    like(conditions, params, 'prize_name', query.prizeName)
    exactIfPresent(conditions, params, 'prize_level', query.prizeLevel)
    equal(conditions, params, 'status', query.status)
    exactIfPresent(conditions, params, 'is_fallback', query.isFallback)
    exactIfPresent(conditions, params, 'prize_type', query.prizeType)
    const where = sqlWhere(conditions)
    const result = await queryPage(pool,
      `SELECT COUNT(*) AS total FROM tk_lucky_prize${where}`,
      `SELECT id, activity_id, prize_name, prize_level, total_qty, remain_qty, probability, prize_icon, status, prize_type, is_fallback, cash_amount, create_by, create_time, update_by, update_time FROM tk_lucky_prize${where}
       ORDER BY CASE WHEN prize_type = '2' OR prize_name LIKE '%谢谢%' THEN 3 WHEN prize_type = '1' THEN 2 ELSE 1 END ASC, CASE prize_level WHEN '一等奖' THEN 1 WHEN '二等奖' THEN 2 WHEN '三等奖' THEN 3 WHEN '四等奖' THEN 4 WHEN '五等奖' THEN 5 ELSE 6 END ASC, cash_amount DESC, id ASC LIMIT ?, ?`,
      params, [...params, page.offset, page.pageSize])
    return tableResult(result.rows, result.total)
  }, '获取抽奖奖品列表失败')
}

async function luckyRecordList(event: H3Event) {
  return withReadSession(event, 'LuckyRecordList', async (_, pool) => {
    const query = q(event); const page = pageRequest(query); const conditions: string[] = []; const params: unknown[] = []
    const activityId = queryNumber(query.activityId); if (activityId) { conditions.push('activity_id = ?'); params.push(activityId) }
    like(conditions, params, 'user_phone', query.userPhone)
    like(conditions, params, 'user_name', query.userName)
    like(conditions, params, 'prize_name', query.prizeName)
    exactIfPresent(conditions, params, 'win_status', query.winStatus)
    exactIfPresent(conditions, params, 'redeem_code', query.redeemCode)
    const where = sqlWhere(conditions)
    const result = await queryPage(pool,
      `SELECT COUNT(*) AS total FROM tk_lucky_record${where}`,
      `SELECT id, activity_id, user_phone, user_name, user_company, user_job, openid, prize_id, prize_name, win_status, redeem_code, draw_time, redeem_time, update_by FROM tk_lucky_record${where} ORDER BY id DESC LIMIT ?, ?`,
      params, [...params, page.offset, page.pageSize])
    return tableResult(result.rows, result.total)
  }, '获取中奖记录列表失败')
}

export function createCustomReadHandler(kind: CustomReadKind) {
  return (event: H3Event) => {
    switch (kind) {
      case 'dummy-monthly-list': return dummyMonthlyList(event)
      case 'dummy-monthly-detail': return simpleDetail(event, 'DummyPieceMonthlyDetail', 'tk_dummy_piece_monthly', 'id, record_month, package_name, piece_type, material, weight_value, piece_count, create_user_id, create_user_name, create_time, update_user_id, update_user_name, update_time, remark', 'id', numericPathId(event, 'id'), '获取假片月度详情失败')
      case 'dummy-weight-list': return dummyWeightList(event)
      case 'msgtowx-list': return msgtowxList(event)
      case 'msgtowx-detail': return withReadSession(event, 'MsgtowxDetail', async (_, pool) => {
        const id = numericPathId(event, 'id')
        if (!id) return apiError('参数不符合规范，不能进行查询', 500)
        const [rows] = await pool.query<RowDataPacket[]>({
          sql: 'SELECT id, type, isSend, receiverIds, createtime, parentid, msg FROM msgtowx WHERE id = ?',
          timeout: 10000,
        }, [id])
        return dataResult(msgtowxRows(rows)[0] ?? null)
      }, '获取企微消息详情失败')
      case 'process-target-list': return processTargetList(event)
      case 'process-staff': return processStaff(event)
      case 'lucky-activity-list': return luckyActivityList(event)
      case 'lucky-activity-detail': return simpleDetail(event, 'LuckyActivityDetail', 'tk_lucky_activity', 'id, title, description, start_time, end_time, draw_limit, status, create_by, create_time, update_by, update_time, remark', 'id', numericPathId(event, 'id'), '获取抽奖活动详情失败')
      case 'lucky-prize-list': return luckyPrizeList(event)
      case 'lucky-prize-detail': return simpleDetail(event, 'LuckyPrizeDetail', 'tk_lucky_prize', 'id, activity_id, prize_name, prize_level, total_qty, remain_qty, probability, prize_icon, status, prize_type, is_fallback, cash_amount, create_by, create_time, update_by, update_time', 'id', numericPathId(event, 'id'), '获取抽奖奖品详情失败')
      case 'lucky-record-list': return luckyRecordList(event)
      case 'wxuser-detail': return simpleDetail(event, 'WxuserDetail', 'wxuser', 'userid, name, dept, position', 'userid', pathId(event, 'userid'), '获取企业微信成员详情失败')
      default: return apiError('接口尚未迁移', 501)
    }
  }
}
