export function createAttendanceApi(request) {
  return {
    listAttendanceRecords(query) {
      return request({ url: '/tk_custom/attendance/records', method: 'get', params: query })
    },
    getAttendanceSummary() {
      return request({ url: '/tk_custom/attendance/summary', method: 'get' })
    },
  }
}
