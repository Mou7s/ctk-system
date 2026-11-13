import type { H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { getQuery, getRouterParam } from 'h3'
import { mysqlQueryOptions } from './mysql'
import { apiSuccess } from './response'
import { camelizeRows, pageRequest, queryPage, queryText, withReadSession } from './read'

type Query = Record<string, unknown>

// Talent extends BaseEntity; Java serializes the unmapped createBy/updateBy fields as null.
const talentColumns = `
  NULL AS create_by,
  NULL AS update_by,
  id,
  \`name\` AS name,
  DATE_FORMAT(
    CASE
      WHEN HOUR(birthDate) = 23 AND MINUTE(birthDate) = 0 AND SECOND(birthDate) = 0
        THEN DATE_ADD(birthDate, INTERVAL 1 HOUR)
      ELSE birthDate
    END,
    '%Y-%m-%d %H:%i:%s'
  ) AS birthDate,
  gender,
  schoolName,
  eduId,
  isMarriedId,
  \`position\` AS position,
  phoneNumber,
  attachments,
  recordStatus,
  isDel,
  creator,
  createTime,
  modifier,
  updateTime,
  \`remark\` AS remark,
  nativePlace,
  interviewTime
`

function talentFilter(query: Query) {
  const conditions = ['isDel = 0']
  const params: unknown[] = []
  const like = (column: string, value: unknown) => {
    const text = queryText(value)
    if (text) {
      conditions.push(`${column} LIKE CONCAT('%', ?, '%')`)
      params.push(text)
    }
  }

  like('`name`', query.name)
  const eduId = queryText(query.eduId)
  if (eduId) {
    conditions.push('eduId = ?')
    params.push(eduId)
  }
  like('schoolName', query.schoolName)
  like('`position`', query.position)
  return { sql: ` WHERE ${conditions.join(' AND ')}`, params }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDateTime(value: unknown): unknown {
  if (value == null || value === '') return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  }
  const text = String(value)
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(text) ? text.slice(0, 19).replace('T', ' ') : text
}

function normalizeTalentRow(row: Record<string, unknown>): Record<string, unknown> {
  for (const field of ['birthDate', 'createTime', 'interviewTime', 'updateTime']) {
    row[field] = formatDateTime(row[field])
  }
  if (row.gender != null && row.gender !== '') row.gender = Number(row.gender)
  return row
}

function normalizeTalentRows(rows: unknown[]): Record<string, unknown>[] {
  return camelizeRows<Record<string, unknown>>(rows).map(normalizeTalentRow)
}

export function queryTalentRows(pool: Pool, query: Query): Promise<[RowDataPacket[], unknown[]]> {
  const filter = talentFilter(query)
  return pool.query<RowDataPacket[]>(mysqlQueryOptions(
    `SELECT ${talentColumns} FROM talent_lib${filter.sql} ORDER BY interviewTime DESC, createTime DESC`,
  ), filter.params) as Promise<[RowDataPacket[], unknown[]]>
}

export async function listTalent(event: H3Event) {
  return withReadSession(event, 'TalentList', async (_, pool) => {
    const query = getQuery(event) as Query
    const page = pageRequest(query)
    const filter = talentFilter(query)
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM talent_lib${filter.sql}`,
      `SELECT ${talentColumns} FROM talent_lib${filter.sql} ORDER BY interviewTime DESC, createTime DESC LIMIT ?, ?`,
      filter.params,
      [...filter.params, page.offset, page.pageSize],
    )
    return { code: 200, msg: '查询成功', rows: normalizeTalentRows(result.rows), total: Number(result.total || 0) }
  }, '获取人才列表失败')
}

export async function getTalent(event: H3Event) {
  return withReadSession(event, 'TalentDetail', async (_, pool) => {
    const id = queryText(getRouterParam(event, 'id') || (getQuery(event) as Query).id).trim()
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
      `SELECT ${talentColumns} FROM talent_lib WHERE id = ? AND isDel = 0 LIMIT 1`,
    ), [id])
    return apiSuccess(rows[0] ? normalizeTalentRows(rows)[0] : null)
  }, '获取人才信息失败')
}
