import type { AuthSession } from './auth'
import { hasPermission } from './auth'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { queryK3SqlServer } from './sqlserver'
import { matchMember, prepareDeliveryRows, recipientPlans, type AlertMember, type DeliveryRow } from './sales-delivery-alert-model'

// 数量单位均为销售单位。出库/剩余取金蝶分录反写台账，不把发货通知数量算成已出库。
export const DELIVERY_ALERT_SQL = `
WITH instock AS (
  SELECT i.FMOENTRYID, SUM(i.FBASEREALQTY) baseQty,
         MIN(i.FBASEUNITID) minUnit, MAX(i.FBASEUNITID) maxUnit,
         MIN(i.FMATERIALID) minMaterial, MAX(i.FMATERIALID) maxMaterial
  FROM T_PRD_INSTOCKENTRY i JOIN T_PRD_INSTOCK h ON h.FID=i.FID
  WHERE h.FDOCUMENTSTATUS='C' AND h.FCANCELSTATUS='A' AND i.FINSTOCKTYPE='1'
  GROUP BY i.FMOENTRYID
), productionOrders AS (
  SELECT DISTINCT me.FSALEORDERID saleId, me.FSALEORDERENTRYID saleEntryId,
         me.FMATERIALID materialId, mo.FBILLNO billNo
  FROM T_PRD_MOENTRY me JOIN T_PRD_MO mo ON mo.FID=me.FID
  WHERE mo.FDOCUMENTSTATUS='C' AND mo.FCANCELSTATUS='A'
), production AS (
  SELECT me.FSALEORDERID saleId, me.FSALEORDERENTRYID saleEntryId, me.FMATERIALID materialId,
         COUNT(*) productionCount, MIN(me.FBASEUNITID) minUnit, MAX(me.FBASEUNITID) maxUnit,
         SUM(ISNULL(i.baseQty,0)) instockedBaseQty,
         SUM(CASE WHEN a.FSTATUS IN ('4','5','6','7') OR ISNULL(a.FREPQUAQTY,0)>0 THEN 1 ELSE 0 END) startedCount,
         SUM(CASE WHEN a.FENTRYID IS NULL OR ISNULL(i.baseQty,0)<0
                   OR ABS(ISNULL(i.baseQty,0)-ISNULL(a.FSTOCKINQUAQTY,0))>0.000001
                   OR i.minUnit<>me.FBASEUNITID OR i.maxUnit<>me.FBASEUNITID
                   OR i.minMaterial<>me.FMATERIALID OR i.maxMaterial<>me.FMATERIALID THEN 1 ELSE 0 END) productionIssues
  FROM T_PRD_MOENTRY me JOIN T_PRD_MO mo ON mo.FID=me.FID
  LEFT JOIN T_PRD_MOENTRY_A a ON a.FENTRYID=me.FENTRYID
  LEFT JOIN instock i ON i.FMOENTRYID=me.FENTRYID
  WHERE mo.FDOCUMENTSTATUS='C' AND mo.FCANCELSTATUS='A'
  GROUP BY me.FSALEORDERID,me.FSALEORDERENTRYID,me.FMATERIALID
)
SELECT e.FENTRYID entryId, o.FBILLNO billNo, e.FSEQ seq, cl.FNAME customer,
       m.FNUMBER materialCode, ml.FNAME materialName, ml.FSPECIFICATION specification, ul.FNAME unit,
       STUFF((SELECT N'、' + po.billNo FROM productionOrders po
              WHERE po.saleId=o.FID AND po.saleEntryId=e.FENTRYID AND po.materialId=e.FMATERIALID
              ORDER BY po.billNo FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, N'') productionOrderNos,
       e.FQTY qty, r.FSTOCKOUTQTY shippedQty, r.FRETURNQTY returnedQty, r.FREMAINOUTQTY remainingQty,
       CONVERT(varchar(10), e.F_UNW_DATE_QTR, 120) dueDate,
       sl.FNAME seller, f1.FNAME follow1, f2.FNAME follow2,
       ISNULL(p.productionCount,0) productionCount, ISNULL(p.startedCount,0) startedCount,
       CASE WHEN p.productionCount IS NULL OR e.FBASEUNITQTY<=0 OR e.FQTY<=0
                 OR p.minUnit<>e.FBASEUNITID OR p.maxUnit<>e.FBASEUNITID
                 OR p.productionIssues>0 THEN 0 ELSE 1 END productionReliable,
       p.instockedBaseQty * e.FQTY / NULLIF(e.FBASEUNITQTY,0) instockedQty
FROM T_SAL_ORDER o
JOIN T_SAL_ORDERENTRY e ON e.FID=o.FID
JOIN T_SAL_ORDERENTRY_R r ON r.FENTRYID=e.FENTRYID
LEFT JOIN T_BD_CUSTOMER c ON c.FCUSTID=o.FCUSTID
LEFT JOIN T_BD_CUSTOMER_L cl ON cl.FCUSTID=c.FCUSTID AND cl.FLOCALEID=2052
LEFT JOIN T_BD_MATERIAL m ON m.FMATERIALID=e.FMATERIALID
LEFT JOIN T_BD_MATERIAL_L ml ON ml.FMATERIALID=m.FMATERIALID AND ml.FLOCALEID=2052
LEFT JOIN T_BD_UNIT_L ul ON ul.FUNITID=e.FUNITID AND ul.FLOCALEID=2052
LEFT JOIN T_BD_OPERATORENTRY_L sl ON sl.FENTRYID=o.FSALERID AND sl.FLOCALEID=2052
LEFT JOIN T_HR_EMPINFO_L f1 ON f1.FID=c.F_UNW_BASE_KYB AND f1.FLOCALEID=2052
LEFT JOIN T_HR_EMPINFO_L f2 ON f2.FID=c.F_UNW_BASE_KYB_W5C AND f2.FLOCALEID=2052
LEFT JOIN production p ON p.saleId=o.FID AND p.saleEntryId=e.FENTRYID AND p.materialId=e.FMATERIALID
WHERE o.FDOCUMENTSTATUS='C' AND o.FCANCELSTATUS='A' AND o.FCLOSESTATUS='A'
  AND e.FMRPCLOSESTATUS='A' AND e.FMRPTERMINATESTATUS='A'
  AND r.FREMAINOUTQTY>0
ORDER BY e.FENTRYID`

export async function readAlertMembers(): Promise<AlertMember[]> {
  const [rows] = await getMysqlPool().query<any[]>(mysqlQueryOptions("SELECT userid,name FROM wxuser WHERE status='active'"))
  return rows.map(r => ({ userid: String(r.userid), name: String(r.name).trim() }))
}

export async function readDeliveryAlertSettings() {
  const [rows] = await getMysqlPool().query<any[]>(mysqlQueryOptions(
    "SELECT config_key,config_value FROM sys_config WHERE config_key IN ('tk.deliveryAlert.enabled','tk.deliveryAlert.totalReceivers')",
  ))
  const values = new Map(rows.map(r => [r.config_key, r.config_value]))
  return { enabled: values.get('tk.deliveryAlert.enabled') === '1', time: '08:00',
    totalReceivers: [...new Set(String(values.get('tk.deliveryAlert.totalReceivers') || '').split(',').map(s => s.trim()).filter(Boolean))] }
}

export async function loadDeliveryAlerts(now = new Date()) {
  const [raw, members, settings] = await Promise.all([
    queryK3SqlServer(request => request.query(DELIVERY_ALERT_SQL)), readAlertMembers(), readDeliveryAlertSettings(),
  ])
  const validIds = new Set(members.map(m => m.userid))
  const invalidTotal = settings.totalReceivers.filter(id => !validIds.has(id))
  const rows = prepareDeliveryRows(raw, members, now)
  return { rows, members, settings, invalidTotal, fetchedAt: now.toISOString(),
    plans: recipientPlans(rows, members, settings.totalReceivers.filter(id => validIds.has(id))) }
}

export function scopeDeliveryRows(rows: DeliveryRow[], members: AlertMember[], session: AuthSession) {
  if (hasPermission(session, 'tk_custom:deliveryAlert:all')) return rows
  // 系统账号可能不同于企微 userid；姓名必须唯一，不以账号拼音推算身份。
  const member = matchMember(String(session.user.nickName || '').trim(), members)
  return member ? rows.filter(r => r.recipients.includes(member.userid)) : []
}
