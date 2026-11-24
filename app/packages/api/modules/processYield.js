export function createProcessYieldApi(request) {
  return {
    getProcessYieldDashboardData(data) {
      return request({
        url: "/kingdee/getProcessYieldDashboard",
        method: "post",
        data: data,
      });
    },
    getProcessYieldDashboardPlanDetails(data) {
      return request({
        url: "/kingdee/getProcessYieldDashboardPlanDetails",
        method: "post",
        data: data,
      });
    },
    getStockInAchievementData(data) {
      return request({
        url: "/kingdee/getStockInAchievement",
        method: "post",
        data: data,
      });
    },
    getProcessYieldData(data) {
      return request({
        url: "/kingdee/getProcessYield",
        method: "post",
        data: data,
      });
    },
  };
}
