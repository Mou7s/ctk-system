import { readFileSync, statSync } from 'node:fs'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { getQuery, readBody, setResponseHeader, type H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { getXlsxSync } from './lazy-deps'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { mysqlQueryOptions } from './mysql'
import { getNitroServerConfig } from './runtime'
import type { AuthSession } from './auth'
import { camelizeRows, queryText, withReadSession } from './read'
import { pdExportRows, queryPdExportRows, type PdReadKind } from './pd-read'

const PIC_COL_START = 15 // 第16列“弹坑图”（0-indexed = 15）
const PIC_COL_WCH = 23 // 对应退役 Java POI setColumnWidth(columnIndex, 6000)
const PIC_ROW_HPT = 150 // 对应退役 Java POI setHeight((short) 3000)

function resolvePicLocalFile(rawPath: string, profileRoot: string): string | null {
  const cleaned = String(rawPath || '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+(?:prod-api\/|dev-api\/)?profile\//i, '')
    .replace(/^\/+/, '')
  if (!cleaned || cleaned.includes('\0') || cleaned.split('/').some((part) => part === '..')) return null

  const variants = cleaned.startsWith('dkPic_zip/')
    ? [cleaned.replace(/^dkPic_zip\//, 'dkPic/'), cleaned]
    : cleaned.startsWith('dkPic/')
      ? [cleaned, cleaned.replace(/^dkPic\//, 'dkPic_zip/')]
      : [cleaned]

  const roots = [resolve(profileRoot)]

  for (const root of roots) {
    for (const relCandidate of variants) {
      const target = resolve(root, relCandidate)
      const rel = relative(root, target)
      if (!rel || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
        continue
      }
      try {
        if (statSync(target).isFile()) return target
      } catch {
        // ignore missing candidate
      }
    }
  }
  return null
}

function getProfileRootPath(): string {
  try {
    return getNitroServerConfig().profilePath
  } catch {
    return String(process.env.NUXT_PROFILE_PATH || join(process.cwd(), 'runtime', 'uploadPath'))
  }
}

function sendPicExcel(event: H3Event, kind: 'pic' | 'pic-select', rows: RowDataPacket[] | Array<Record<string, unknown>>) {
  const schema = schemas[kind]
  const camelRows = camelizeRows<Record<string, unknown>>(rows)
  const profileRoot = getProfileRootPath()

  type EmbeddedImage = {
    row: number
    col: number
    data: Uint8Array
    ext: string
  }

  const embeddedImages: EmbeddedImage[] = []
  let maxImagesInRow = 1

  const outputRows = camelRows.map((row, rowIndex) => {
    const rawImgPaths = String(row.imgPaths ?? '')
    const pathList = rawImgPaths
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    const loadedForRow: Array<{ data: Uint8Array; ext: string }> = []
    for (const item of pathList) {
      const localFile = resolvePicLocalFile(item, profileRoot)
      if (!localFile) continue
      try {
        const data = new Uint8Array(readFileSync(localFile))
        if (!data.length) continue
        const ext = extname(localFile).slice(1).toLowerCase() || 'png'
        loadedForRow.push({ data, ext: ext === 'jpeg' ? 'jpg' : ext })
      } catch {
        // skip unreadable image file
      }
    }

    if (loadedForRow.length > 0) {
      maxImagesInRow = Math.max(maxImagesInRow, loadedForRow.length)
      loadedForRow.forEach((img, idx) => {
        embeddedImages.push({
          row: rowIndex + 1,
          col: PIC_COL_START + idx,
          data: img.data,
          ext: img.ext,
        })
      })
    }

    return Object.fromEntries(
      schema.columns.map(([label, field]) => {
        if (field === 'imgPaths') {
          // 成功读取到图片文件时单元格置空并内嵌图片；若文件缺失则保留原路径文本兜底
          return [label, loadedForRow.length > 0 ? '' : rawImgPaths]
        }
        return [label, row[field] ?? '']
      }),
    )
  })

  const XLSX = getXlsxSync()
  const worksheet = XLSX.utils.json_to_sheet(outputRows, {
    header: schema.columns.map(([label]) => label),
  })

  if (embeddedImages.length > 0) {
    const cols: Array<{ wch: number }> = schema.columns.map(([label], idx) => {
      if (idx === PIC_COL_START) return { wch: PIC_COL_WCH }
      if (label.includes('时间')) return { wch: 20 }
      return { wch: 16 }
    })
    for (let i = 1; i < maxImagesInRow; i++) {
      cols[PIC_COL_START + i] = { wch: PIC_COL_WCH }
    }
    worksheet['!cols'] = cols

    const rowsWithImages = new Set(embeddedImages.map((img) => img.row))
    const wsRows: Array<{ hpt?: number }> = [{ hpt: 22 }]
    for (let r = 1; r <= outputRows.length; r++) {
      wsRows[r] = rowsWithImages.has(r) ? { hpt: PIC_ROW_HPT } : { hpt: 20 }
    }
    worksheet['!rows'] = wsRows

    if (maxImagesInRow > 1) {
      worksheet['!merges'] = [
        ...(worksheet['!merges'] || []),
        { s: { r: 0, c: PIC_COL_START }, e: { r: 0, c: PIC_COL_START + maxImagesInRow - 1 } },
      ]
    }
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, schema.sheetName)
  let buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer

  if (embeddedImages.length > 0) {
    const files = unzipSync(new Uint8Array(buffer))
    const anchors: string[] = []
    const rels: string[] = []

    embeddedImages.forEach((img, index) => {
      const id = index + 1
      const rId = `rId${id}`
      const mediaName = `image${id}.${img.ext}`
      files[`xl/media/${mediaName}`] = img.data
      rels.push(
        `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>`,
      )
      anchors.push(
        `<twoCellAnchor><from><col>${img.col}</col><colOff>0</colOff><row>${img.row}</row><rowOff>0</rowOff></from><to><col>${img.col + 1}</col><colOff>0</colOff><row>${img.row + 1}</row><rowOff>0</rowOff></to><pic><nvPicPr><cNvPr id="${id}" name="Picture ${id}"/><cNvPicPr><a:picLocks noChangeAspect="1"/></cNvPicPr></nvPicPr><blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></blipFill><spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></spPr></pic><clientData/></twoCellAnchor>`,
      )
    })

    files['xl/drawings/drawing1.xml'] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><wsDr xmlns="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join('')}</wsDr>`,
    )
    files['xl/drawings/_rels/drawing1.xml.rels'] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`,
    )
    files['xl/worksheets/_rels/sheet1.xml.rels'] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`,
    )

    const contentTypes = strFromU8(files['[Content_Types].xml']!)
    if (!contentTypes.includes('/xl/drawings/drawing1.xml')) {
      files['[Content_Types].xml'] = strToU8(
        contentTypes.replace(
          '</Types>',
          '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>',
        ),
      )
    }

    const sheet1Xml = strFromU8(files['xl/worksheets/sheet1.xml']!)
    if (!sheet1Xml.includes('<drawing ')) {
      let updatedSheet = sheet1Xml
      if (maxImagesInRow > 1) {
        const lastColName = XLSX.utils.encode_col(PIC_COL_START + maxImagesInRow - 1)
        updatedSheet = updatedSheet.replace(
          /<dimension ref="A1:[A-Z]+(\d+)"\/>/,
          `<dimension ref="A1:${lastColName}$1"/>`,
        )
      }
      files['xl/worksheets/sheet1.xml'] = strToU8(
        updatedSheet.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>'),
      )
    }

    buffer = Buffer.from(zipSync(files, { level: 6 }))
  }

  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(schema.fileName)}`)
  setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition')
  return buffer
}

type Query = Record<string, unknown>
type ExportKind = 'wxuser' | 'msgtowx' | 'dummy-monthly' | 'pd' | 'pd-ck' | 'wx-approve' | 'pic' | 'pic-select'
type ExportSchema = {
  sheetName: string
  fileName: string
  columns: Array<[string, string]>
}

const schemas: Record<ExportKind, ExportSchema> = {
  wxuser: {
    sheetName: '企业微信成员表数据',
    fileName: '企业微信成员表数据.xlsx',
    columns: [['姓名', 'name'], ['部门', 'dept'], ['职位', 'position']],
  },
  msgtowx: {
    sheetName: '发送到企微的消息队列数据',
    fileName: '发送到企微的消息队列数据.xlsx',
    columns: [
      ['类型', 'type'], ['是否已发送', 'isSend'], ['接收人ID集合', 'receiverIds'],
      ['源单id', 'parentid'], ['消息内容', 'msg'], ['创建时间', 'createtime'],
    ],
  },
  'dummy-monthly': {
    sheetName: '假片重量月度录入',
    fileName: '假片重量月度录入.xlsx',
    columns: [
      ['月份', 'recordMonth'], ['封装', 'packageName'],
      ['空片-铜(g)', 'emptyCopper'], ['空片-铁(g)', 'emptyIron'],
      ['有黑胶-铜(g)', 'glueCopper'], ['有黑胶-铁(g)', 'glueIron'],
      ['小计(g)', 'rowTotal'], ['条数', 'pieceCount'],
    ],
  },
  pd: {
    sheetName: '盘点数据',
    fileName: '盘点数据.xlsx',
    columns: [
      ['盘点时间', '盘点时间'], ['盘点工序', '盘点工序'], ['流程单号', '流程单号'],
      ['产品编码', '产品编码'], ['产品名称', '产品名称'], ['规格型号', '规格型号'],
      ['批号', '批号'], ['库存数量', '库存数量'], ['盘点数量', '盘点数量'], ['工序状态', '工序状态'],
    ],
  },
  'pd-ck': {
    sheetName: '盘点_仓库数据',
    fileName: '盘点_仓库数据.xlsx',
    columns: [
      ['物料编码', '物料编码'], ['物料名称', '物料名称'], ['封装', '封装'], ['印字', '印字'],
      ['库位', '库位'], ['数量', '数量'], ['盘点日期', '盘点日期'], ['盘点人', '盘点人'], ['备注', '备注'],
    ],
  },
  'wx-approve': {
    sheetName: '微信审批数据',
    fileName: '微信审批数据.xlsx',
    columns: [
      ['审批申请类型名称', 'spName'], ['申请单状态：1-审批中；2-已通过；3-已驳回；4-已撤销；6-通过后撤销；7-已删除；10-已支付', 'spStatus'],
      ['审批模板id', 'templateId'], ['审批申请提交时间', 'applyTime'], ['申请人id', 'applyerUserid'],
      ['申请人所在部门id', 'applyerPartyid'], ['审批申请详情', 'applyDataContents'], ['出厂时间', 'outtime'],
      ['返厂时间', 'backtime'], ['审批人id', 'auditerid'],
    ],
  },
  pic: {
    sheetName: '弹坑图片数据',
    fileName: '弹坑图片数据.xlsx',
    columns: [
      ['流程单号', 'flowno'], ['客户代码', 'khdm'], ['成品型号', 'materialname'],
      ['封装', 'specification'], ['WB机台号', 'mechineName'], ['芯片代码', 'xpdm'],
      ['芯片批号', 'xpph'], ['操作/技术员', 'handler'], ['判定结果', 'result'],
      ['试验数量', 'testNumber'], ['试验时机', 'testCharge'], ['创建时间', 'createdate'],
      ['创建人', 'creator'], ['最后修改时间', 'modifydate'], ['最后修改人', 'updater'],
      ['弹坑图', 'imgPaths'],
    ],
  },
  'pic-select': {
    sheetName: '弹坑图片数据',
    fileName: '弹坑图片数据.xlsx',
    columns: [
      ['流程单号', 'flowno'], ['客户代码', 'khdm'], ['成品型号', 'materialname'],
      ['封装', 'specification'], ['WB机台号', 'mechineName'], ['芯片代码', 'xpdm'],
      ['芯片批号', 'xpph'], ['操作/技术员', 'handler'], ['判定结果', 'result'],
      ['试验数量', 'testNumber'], ['试验时机', 'testCharge'], ['创建时间', 'createdate'],
      ['创建人', 'creator'], ['最后修改时间', 'modifydate'], ['最后修改人', 'updater'],
      ['弹坑图', 'imgPaths'],
    ],
  },
}

function equal(conditions: string[], params: unknown[], column: string, value: unknown) {
  const text = queryText(value)
  if (text) {
    conditions.push(`${column} = ?`)
    params.push(text)
  }
}

function like(conditions: string[], params: unknown[], column: string, value: unknown) {
  const text = queryText(value)
  if (text) {
    conditions.push(`${column} LIKE CONCAT('%', ?, '%')`)
    params.push(text)
  }
}

function where(conditions: string[]) {
  return conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
}

function queryValue(query: Query, key: string) {
  const direct = query[key]
  if (direct !== undefined) return direct

  const bracketed = query[`params[${key}]`]
  if (bracketed !== undefined) return bracketed

  const nested = query.params
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return (nested as Record<string, unknown>)[key]
  }

  return undefined
}

// 日期只有 YYYY-MM-DD 时补全为当天起止，避免 BETWEEN 漏掉当天 00:00 之后的数据
function dateTimeBound(value: unknown, endOfDay: boolean): string | null {
  const text = queryText(value)
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return endOfDay ? `${text} 23:59:59` : `${text} 00:00:00`
  return text
}

async function requestQuery(event: H3Event): Promise<Query> {
  const query = { ...(getQuery(event) as Query) }
  const body = await readBody<Record<string, unknown> | string>(event).catch(() => null)
  if (typeof body === 'string' && body) {
    for (const [key, value] of new URLSearchParams(body).entries()) query[key] = value
  } else if (body && typeof body === 'object') {
    Object.assign(query, body)
  }
  return query
}

// 与假片页面 packageOrder 保持一致
const DUMMY_PACKAGE_ORDER = [
  'SOD-323', 'SOD-123', 'SOT-23/6R', 'SOT-23/26', 'SOD-523',
  'SOT-23/27R', 'TO-252', 'DFN', 'PDFN/5*6', 'PDFN/3*3',
]

function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function dummyMonthlyMatrix(baseRows: RowDataPacket[], monthRows: RowDataPacket[], recordMonth: string) {
  const monthMap = new Map(monthRows.map((row) => [`${row.package_name}||${row.piece_type}||${row.material}`, row]))
  const packages = [...new Set(baseRows.map((row) => String(row.package_name)).filter(Boolean))]
  packages.sort((a, b) => {
    const ia = DUMMY_PACKAGE_ORDER.indexOf(a)
    const ib = DUMMY_PACKAGE_ORDER.indexOf(b)
    return (ia === -1 ? DUMMY_PACKAGE_ORDER.length : ia) - (ib === -1 ? DUMMY_PACKAGE_ORDER.length : ib) || (a < b ? -1 : a > b ? 1 : 0)
  })
  const num = (value: unknown) => {
    if (value === null || value === undefined || value === '') return ''
    const n = Number(value)
    return Number.isNaN(n) ? '' : n
  }
  return packages.map((packageName) => {
    const base = (pieceType: string, material: string) => baseRows.find((row) => String(row.package_name) === packageName && row.piece_type === pieceType && row.material === material)
    const month = (pieceType: string, material: string) => monthMap.get(`${packageName}||${pieceType}||${material}`)
    const glueCopper = num(month('有黑胶', '铜')?.weight_value)
    const glueIron = num(month('有黑胶', '铁')?.weight_value)
    const pieceCount = num(month('有黑胶', '铜')?.piece_count ?? month('有黑胶', '铁')?.piece_count)
    return {
      recordMonth,
      packageName,
      emptyCopper: num(base('空片', '铜')?.unit_weight),
      emptyIron: num(base('空片', '铁')?.unit_weight),
      glueCopper,
      glueIron,
      rowTotal: (typeof glueCopper === 'number' ? glueCopper : 0) + (typeof glueIron === 'number' ? glueIron : 0),
      pieceCount,
    }
  })
}

async function queryExportRows(pool: Pool, kind: ExportKind, query: Query) {
  const conditions: string[] = []
  const params: unknown[] = []
  let sql = ''

  if (kind === 'wxuser') {
    like(conditions, params, 'name', query.name)
    equal(conditions, params, 'dept', query.dept)
    equal(conditions, params, 'position', query.position)
    conditions.unshift("(status IS NULL OR status = 'active')")
    sql = `SELECT userid, name, dept, position FROM wxuser${where(conditions)}`
  } else if (kind === 'msgtowx') {
    equal(conditions, params, 'type', query.type)
    equal(conditions, params, 'isSend', query.isSend)
    equal(conditions, params, 'receiverIds', query.receiverIds)
    equal(conditions, params, 'createtime', query.createtime)
    equal(conditions, params, 'parentid', query.parentid)
    equal(conditions, params, 'msg', query.msg)
    sql = `SELECT id, type, isSend, receiverIds, DATE_FORMAT(createtime, '%Y-%m-%d %H:%i:%s') AS createtime, parentid, msg FROM msgtowx${where(conditions)} ORDER BY id DESC`
  } else if (kind === 'dummy-monthly') {
    // 宽表导出，与页面矩阵一致：空片取单重基础资料，有黑胶取当月录入，空月也有行
    const monthText = queryText(query.recordMonth)
    const recordMonth = /^\d{4}-\d{2}$/.test(monthText) ? monthText : currentYearMonth()
    const baseConditions = [`status = '0'`]
    const baseParams: unknown[] = []
    like(baseConditions, baseParams, 'package_name', query.packageName)
    const [baseRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
      `SELECT package_name, piece_type, material, unit_weight FROM tk_dummy_piece_weight${where(baseConditions)} ORDER BY package_name ASC, piece_type ASC, material ASC`
    ), baseParams)
    const [monthRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
      `SELECT package_name, piece_type, material, weight_value, piece_count FROM tk_dummy_piece_monthly WHERE record_month = ?`
    ), [recordMonth])
    return dummyMonthlyMatrix(baseRows, monthRows, recordMonth)
  } else if (kind === 'pd' || kind === 'pd-ck') {
    throw new Error('pd export requires a session-aware query')
  } else if (kind === 'wx-approve') {
    conditions.push("sp_name = '外出放行条'")
    conditions.push('(outtime IS NULL OR backtime IS NULL)')
    like(conditions, params, 'sp_name', query.spName)
    equal(conditions, params, 'sp_status', query.spStatus)
    equal(conditions, params, 'template_id', query.templateId)
    equal(conditions, params, 'apply_time', query.applyTime)
    equal(conditions, params, 'applyer_userid', query.applyerUserid)
    equal(conditions, params, 'applyer_partyid', query.applyerPartyid)
    equal(conditions, params, 'apply_data_contents', query.applyDataContents)
    equal(conditions, params, 'outtime', query.outtime)
    equal(conditions, params, 'backtime', query.backtime)
    equal(conditions, params, 'auditerid', query.auditerid)
    // Java's ExcelUtil applies readConverterExp="审=批模板名称" on spName.
    // The fixed query scope is "外出放行条", which does not match "审", so Java exports this cell as blank.
    sql = `SELECT '' AS spName, sp_status AS spStatus, template_id AS templateId, DATE_FORMAT(apply_time, '%Y-%m-%d %H:%i:%s') AS applyTime, applyer_userid AS applyerUserid, applyer_partyid AS applyerPartyid, apply_data_contents AS applyDataContents, DATE_FORMAT(outtime, '%Y-%m-%d %H:%i:%s') AS outtime, DATE_FORMAT(backtime, '%Y-%m-%d %H:%i:%s') AS backtime, auditerid FROM wx_approve${where(conditions)}`
  } else if (kind === 'pic' || kind === 'pic-select') {
    if (kind === 'pic-select') {
      // 前端传 ids，兼容历史 remark 传参
      const rawIds = query.ids !== undefined ? query.ids : query.remark
      const ids = queryText(rawIds)
        .split(',')
        .map((value) => value.trim())
        .filter((value) => /^\d+$/.test(value))

      if (!ids.length) return []

      const placeholders = ids.map(() => '?').join(', ')
      sql = `SELECT flowno, khdm, materialname, specification, mechineName, xpdm, xpph, handler, result, testNumber, testCharge, DATE_FORMAT(createdate, '%Y-%m-%d %H:%i:%s') AS createdate, creator, DATE_FORMAT(modifydate, '%Y-%m-%d %H:%i:%s') AS modifydate, updater, REPLACE(imgPaths, '/dkPic_zip/', '/dkPic/') AS imgPaths FROM dk_pic WHERE id IN (${placeholders}) ORDER BY id ASC`
      params.push(...ids)
    } else {
      like(conditions, params, 'flowno', queryValue(query, 'flowno'))
      equal(conditions, params, 'materialno', queryValue(query, 'materialno'))
      like(conditions, params, 'materialname', queryValue(query, 'materialname'))
      like(conditions, params, 'specification', queryValue(query, 'specification'))
      equal(conditions, params, 'imgPaths', queryValue(query, 'imgPaths'))
      like(conditions, params, 'mechineName', queryValue(query, 'mechineName'))
      const beginCreatedate = dateTimeBound(queryValue(query, 'beginCreatedate'), false)
      const endCreatedate = dateTimeBound(queryValue(query, 'endCreatedate'), true)
      if (beginCreatedate && endCreatedate) {
        conditions.push('createdate BETWEEN ? AND ?')
        params.push(beginCreatedate, endCreatedate)
      }
      const beginModifydate = dateTimeBound(queryValue(query, 'beginModifydate'), false)
      const endModifydate = dateTimeBound(queryValue(query, 'endModifydate'), true)
      if (beginModifydate && endModifydate) {
        conditions.push('modifydate BETWEEN ? AND ?')
        params.push(beginModifydate, endModifydate)
      }
      like(conditions, params, 'xpdm', queryValue(query, 'xpdm'))
      like(conditions, params, 'xpph', queryValue(query, 'xpph'))
      like(conditions, params, 'khdm', queryValue(query, 'khdm'))
      like(conditions, params, 'handler', queryValue(query, 'handler'))
      like(conditions, params, 'creator', queryValue(query, 'creator'))
      like(conditions, params, 'updater', queryValue(query, 'updater'))
      equal(conditions, params, 'result', queryValue(query, 'result'))
      equal(conditions, params, 'testNumber', queryValue(query, 'testNumber'))
      like(conditions, params, 'testCharge', queryValue(query, 'testCharge'))
      sql = `SELECT flowno, khdm, materialname, specification, mechineName, xpdm, xpph, handler, result, testNumber, testCharge, DATE_FORMAT(createdate, '%Y-%m-%d %H:%i:%s') AS createdate, creator, DATE_FORMAT(modifydate, '%Y-%m-%d %H:%i:%s') AS modifydate, updater, REPLACE(imgPaths, '/dkPic_zip/', '/dkPic/') AS imgPaths FROM dk_pic${where(conditions)} ORDER BY createdate DESC LIMIT 200`
    }
  }

  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(sql), params)
  return rows
}

function sendExcel(event: H3Event, kind: ExportKind, rows: RowDataPacket[] | Array<Record<string, unknown>>, alreadyFormatted = false) {
  const schema = schemas[kind]
  const outputRows = alreadyFormatted
    ? rows
    : camelizeRows<Record<string, unknown>>(rows).map((row) => Object.fromEntries(
      schema.columns.map(([label, field]) => [label, row[field] ?? '']),
    ))
  const XLSX = getXlsxSync()
  const worksheet = XLSX.utils.json_to_sheet(outputRows, {
    header: schema.columns.map(([label]) => label),
  })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, schema.sheetName)
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(schema.fileName)}`)
  setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition')
  return buffer
}

export async function exportCustom(event: H3Event, kind: ExportKind) {
  const query = await requestQuery(event)
  const schema = schemas[kind]
  return withReadSession(event, `Export:${kind}`, async (session, pool) => {
    const rows = kind === 'pd' || kind === 'pd-ck'
      ? await queryPdExportRows(pool, kind as PdReadKind, query)
      : await queryExportRows(pool, kind, query)
    if (kind === 'pd' || kind === 'pd-ck') return sendExcel(event, kind, pdExportRows(kind, rows), true)
    if (kind === 'pic' || kind === 'pic-select') return sendPicExcel(event, kind, rows)
    return sendExcel(event, kind, rows)
  }, `导出${schema.sheetName}失败`)
}
