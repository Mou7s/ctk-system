/**
 * 102 生产订单结案 -> Nitro（默认关闭，仅dry-run候选）
 * 旧调用：TkTask.ShengChanJieAn() 每天08:00
 * 口径（待业务确认后才可真写）：PRD_MO 已审核、未关闭，
 * 且入库数>=计划数（FStockInQuaAuxQty>=FQty）或 FStatus=完工，
 * 排除有未审核下游单的。
 * 当前只查候选并打日志，不执行 Close/确认操作。
 */
import { executeBillQuery } from './k3'
import { queryK3SqlServer } from './sqlserver'

export type MoCloseCandidate = {
  FID: number
  FBillNo: string
  FQty: number
  FStockInQty: number
  FStatus: string
}

export async function fetchMoCloseCandidates(limit = 200): Promise<MoCloseCandidate[]> {
  // SQL直读最准，走K3 SQL Server只读链路
  const rows = await queryK3SqlServer<any>(req =>
    req.query(`
      SELECT TOP ${Math.max(1, Math.min(1000, limit))}
        FID, FBILLNO, FQTY, FSTOCKINQUAAUXQTY AS FSTOCKINQTY, FSTATUS, FDOCUMENTSTATUS, FCLOSESTATUS
      FROM T_PRD_MO
      WHERE FDOCUMENTSTATUS='C' AND FCLOSESTATUS='A'
        AND (FSTOCKINQUAAUXQTY >= FQTY OR FSTATUS='6')
      ORDER BY FID
    `).catch(() => req.query(`
      SELECT TOP ${Math.max(1, Math.min(1000, limit))}
        FID, FBILLNO, FQTY, FSTATUS
      FROM T_PRD_MO
      WHERE FDOCUMENTSTATUS='C'
      ORDER BY FID
    `))
  )
  return (rows || []).map((r: any) => ({
    FID: Number(r.FID),
    FBillNo: String(r.FBILLNO || '').trim(),
    FQty: Number(r.FQTY || 0),
    FStockInQty: Number(r.FSTOCKINQTY || 0),
    FStatus: String(r.FSTATUS || ''),
  }))
}

export async function fetchMoCloseCandidatesViaK3(limit = 50) {
  const body: any = await executeBillQuery({
    formId: 'PRD_MO',
    fieldKeys: 'FID,FBillNo,FQty,FStockInQuaAuxQty,FStatus,FDocumentStatus',
    filterString: `FDocumentStatus='C'`,
    topRowCount: limit,
    limit,
  })
  return body?.Result?.Rows || body?.rows || []
}

export async function runMoCloseOnce(opts: { dryRun?: boolean } = {}) {
  const dryRun = opts.dryRun !== false // 默认只看不写
  const candidates = await fetchMoCloseCandidates()
  console.info(`[MoClose102] dryRun=${dryRun} candidates=${candidates.length} ${candidates.slice(0, 5).map(c => c.FBillNo).join(',') || '-'}`)
  // 真写分支预留：需业务确认口径 + 金蝶 Close 操作验证后才放开
  // if (!dryRun) { ... }
  return { dryRun, checked: candidates.length, bills: candidates.map(c => c.FBillNo) }
}
