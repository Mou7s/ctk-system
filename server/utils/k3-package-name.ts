// 封装名口径统一维护：金蝶物料规格（FSPECIFICATION）首个分隔符前的那一段就是封装名。
// 与生产质量看板（process-yield）共用，避免同一台机器上的封装口径在两张报表里漂移。
// 注意：只做字符串归一，不做封装等价映射（如 PDFN3X3 / PDFN3.3*3.3-8 视为不同封装），
// 合并封装需要业务确认后另行处理。
export function k3PackageNameExpression(alias: string): string {
  return `LTRIM(RTRIM(CASE WHEN LTRIM(RTRIM(COALESCE(${alias}.FSPECIFICATION, ''))) = '' THEN N'未维护封装' WHEN LEFT(LTRIM(RTRIM(${alias}.FSPECIFICATION)), 5) = N'LL-34' THEN N'LL-34' WHEN LEFT(LTRIM(RTRIM(${alias}.FSPECIFICATION)), 5) = N'LL-41' THEN N'LL-41' WHEN CHARINDEX('/', ${alias}.FSPECIFICATION) > 0 THEN LEFT(${alias}.FSPECIFICATION, CHARINDEX('/', ${alias}.FSPECIFICATION) - 1) WHEN CHARINDEX(N'／', ${alias}.FSPECIFICATION) > 0 THEN LEFT(${alias}.FSPECIFICATION, CHARINDEX(N'／', ${alias}.FSPECIFICATION) - 1) ELSE ${alias}.FSPECIFICATION END))`
}

// 封装工艺（玻封 / 塑封）：同样是规格字符串口径——含 LL（玻璃二极管 LL-34 / LL-41）或 DO- 的算玻封，
// 其余（SOD / SOT / PDFN / DFN / TO-252…）算塑封。与生产质量看板共用同一段 CASE，
// 两张报表的玻封/塑封口径不会各写一套。这是「按规格文本分类」，不是按工艺路线分线。
export const K3_PACKAGE_TYPES = ['玻封', '塑封']

export function k3PackageTypeExpression(alias: string): string {
  return `CASE WHEN UPPER(COALESCE(${alias}.FSPECIFICATION, '')) LIKE '%LL%' OR UPPER(COALESCE(${alias}.FSPECIFICATION, '')) LIKE '%DO-%' THEN N'玻封' ELSE N'塑封' END`
}
