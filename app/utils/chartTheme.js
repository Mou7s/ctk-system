export function isDarkMode() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

export function getChartTheme() {
  const dark = isDarkMode();
  return {
    tooltipBg: dark ? "rgba(27, 29, 33, 0.98)" : "rgba(255, 255, 255, 0.98)",
    tooltipBorder: dark ? "#363637" : "#e6ebf5",
    tooltipText: dark ? "#e5eaf3" : "#606266",
    emphasisText: dark ? "#e5eaf3" : "#303133",
    axisText: dark ? "#a3a6ad" : "#909399",
    axisLine: dark ? "#363637" : "#e6ebf5",
    splitLine: dark ? "#2b2b2c" : "#f0f2f5",
    labelText: dark ? "#cfd3dc" : "#606266",
    itemBorder: dark ? "#1b1d21" : "#ffffff",
    legendText: dark ? "#a3a6ad" : "#909399",
  };
}

export function chartTooltip(theme = getChartTheme()) {
  return {
    backgroundColor: theme.tooltipBg,
    borderColor: theme.tooltipBorder,
    borderWidth: 1,
    textStyle: { color: theme.tooltipText, fontSize: 13 },
    shadowColor: "rgba(0,0,0,0.2)",
    shadowBlur: 10,
  };
}