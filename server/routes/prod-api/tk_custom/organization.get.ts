import type { RowDataPacket } from 'mysql2/promise'
import { getAuthSession } from '../../../utils/auth'
import { fetchWecomDepartments, loadWecomContactConfig, type WecomContact } from '../../../utils/wecom-contacts'
import { getMysqlPool, mysqlQueryOptions } from '../../../utils/mysql'
import { apiError, apiSuccess, errorMessage } from '../../../utils/response'

type OrganizationDepartment = {
  id: number
  parentId: number
  name: string
  order: number
  directEmployeeCount: number
  employeeCount: number
  employees: WecomContact[]
  children: OrganizationDepartment[]
}

type DepartmentRow = {
  id: number
  parentId: number
  name: string
  order: number
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function departmentNames(value: unknown): string[] {
  return [...new Set(text(value).split(/[、,，]/).map((item) => item.trim()).filter(Boolean))]
}

function employeeSort(left: WecomContact, right: WecomContact): number {
  return text(left.name).localeCompare(text(right.name), 'zh-CN') || left.userid.localeCompare(right.userid)
}

function departmentSort(left: DepartmentRow, right: DepartmentRow): number {
  return left.order - right.order || left.id - right.id
}

function buildNode(
  row: DepartmentRow,
  directEmployees: Map<number, WecomContact[]>,
  childrenByParent: Map<number, DepartmentRow[]>,
): OrganizationDepartment {
  const employees = [...(directEmployees.get(row.id) || [])].sort(employeeSort)
  const children = (childrenByParent.get(row.id) || [])
    .sort(departmentSort)
    .map((child) => buildNode(child, directEmployees, childrenByParent))
  const employeeIds = new Set(employees.map((employee) => employee.userid))
  for (const child of children) {
    for (const employee of child.employees) employeeIds.add(employee.userid)
    for (const descendant of flattenDepartmentEmployees(child)) employeeIds.add(descendant.userid)
  }

  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    order: row.order,
    directEmployeeCount: employees.length,
    employeeCount: employeeIds.size,
    employees,
    children,
  }
}

function flattenDepartmentEmployees(node: OrganizationDepartment): WecomContact[] {
  return node.children.flatMap((child) => [
    ...child.employees,
    ...flattenDepartmentEmployees(child),
  ])
}

export function buildOrganizationTree(
  departmentRows: DepartmentRow[],
  employees: WecomContact[],
): { departments: OrganizationDepartment[]; unassignedEmployees: WecomContact[] } {
  const departments = departmentRows
    .filter((row) => row.id > 0 && row.name)
    .map((row) => ({ ...row, parentId: row.parentId > 0 ? row.parentId : 0 }))
  const byName = new Map(departments.map((department) => [department.name, department]))
  const directEmployees = new Map<number, WecomContact[]>()
  const unassignedEmployees: WecomContact[] = []

  for (const employee of employees) {
    const matched = departmentNames(employee.dept)
      .map((name) => byName.get(name))
      .filter((department): department is DepartmentRow => Boolean(department))
    const uniqueDepartments = [...new Map(matched.map((department) => [department.id, department])).values()]
    if (!uniqueDepartments.length) {
      unassignedEmployees.push(employee)
      continue
    }
    for (const department of uniqueDepartments) {
      const list = directEmployees.get(department.id) || []
      list.push(employee)
      directEmployees.set(department.id, list)
    }
  }

  const knownIds = new Set(departments.map((department) => department.id))
  const childrenByParent = new Map<number, DepartmentRow[]>()
  for (const department of departments) {
    const parentId = knownIds.has(department.parentId) ? department.parentId : 0
    const list = childrenByParent.get(parentId) || []
    list.push(department)
    childrenByParent.set(parentId, list)
  }

  const roots = (childrenByParent.get(0) || [])
    .sort(departmentSort)
    .map((department) => buildNode(department, directEmployees, childrenByParent))

  return {
    departments: roots,
    unassignedEmployees: unassignedEmployees.sort(employeeSort),
  }
}

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)

  try {
    const pool = getMysqlPool()
    const config = await loadWecomContactConfig(pool)
    const [departmentRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT userid, name, dept, position
      FROM wxuser
      WHERE status IS NULL OR status = 'active'
      ORDER BY name, userid
    `))
    const [batchRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT batch_id AS batchId, remote_count AS remoteCount, finished_at AS finishedAt
      FROM wxuser_sync_batch
      WHERE sync_type = 'employee' AND status = 'completed'
      ORDER BY batch_id DESC
      LIMIT 1
    `))
    const departments = await fetchWecomDepartments(config)
    const employees: WecomContact[] = departmentRows.map((row) => ({
      userid: text(row.userid),
      name: text(row.name) || null,
      dept: text(row.dept) || null,
      position: text(row.position) || null,
    })).filter((employee) => employee.userid)
    const tree = buildOrganizationTree(departments, employees)
    const lastSync = batchRows[0]

    return apiSuccess({
      departments: tree.departments,
      unassignedEmployees: tree.unassignedEmployees,
      totalDepartments: departments.length,
      totalEmployees: employees.length,
      lastSync: lastSync
        ? {
            batchId: Number(lastSync.batchId),
            remoteCount: Number(lastSync.remoteCount),
            finishedAt: lastSync.finishedAt,
          }
        : null,
      generatedAt: new Date().toISOString(),
    }, '组织架构加载成功')
  } catch (error) {
    console.error('[NitroOrganization] load failed:', errorMessage(error, '组织架构加载失败'))
    return apiError('获取组织架构失败', 500)
  }
})
