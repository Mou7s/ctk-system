const BILL_SPLIT = /[&\s,，;；\n\r\t]+/;

export function normalizeBillInput(raw) {
  if (!raw || !String(raw).trim()) {
    return [];
  }
  const seen = new Set();
  const result = [];
  for (const part of String(raw).split(BILL_SPLIT)) {
    const bill = part.trim().toUpperCase();
    if (!bill || seen.has(bill)) {
      continue;
    }
    seen.add(bill);
    result.push(bill);
  }
  return result;
}

export function validateBillNo(bill) {
  return /^[A-Za-z0-9_-]{4,40}$/.test(bill);
}

export function findInvalidBillNos(bills) {
  return bills.filter((bill) => !validateBillNo(bill));
}

export function joinBillNos(bills) {
  return bills.join("&");
}

export const WF_EXPORT_HISTORY_KEY = "wf_export_history";
export const WF_EXPORT_HISTORY_LIMIT = 20;

export function loadWfExportHistory() {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(WF_EXPORT_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveWfExportHistory(entry) {
  if (typeof localStorage === "undefined") return;
  const list = loadWfExportHistory();
  list.unshift(entry);
  if (list.length > WF_EXPORT_HISTORY_LIMIT) {
    list.length = WF_EXPORT_HISTORY_LIMIT;
  }
  localStorage.setItem(WF_EXPORT_HISTORY_KEY, JSON.stringify(list));
}

export function clearWfExportHistory() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(WF_EXPORT_HISTORY_KEY);
}
