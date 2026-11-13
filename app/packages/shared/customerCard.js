export const customerCardFields = [
  ['country', '国家'], ['nature', '性质'], ['company', '公司名称'], ['shortName', '简称'],
  ['website', '公司网址'], ['address', '地址'], ['contact', '联系人'], ['position', '职务'],
  ['phone', '电话号码'], ['email', '邮箱'], ['whatsapp', 'WhatsApp'], ['remark', '备注'],
];

export function customerKeys(data) {
  const clean = (v) => String(v || '').normalize('NFKC').trim().toLowerCase();
  let website = clean(data.website);
  if (website) {
    try { website = new URL(/^https?:\/\//.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, ''); }
    catch { website = website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]; }
  }
  return {
    company: clean(data.company).replace(/[\s\p{P}]/gu, ''), website,
    email: clean(data.email), phone: clean(data.phone).replace(/[^\d]/g, '').replace(/^00/, ''),
  };
}

export function parseCardText(text) {
  text = String(text || '').replace(/([\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff：:])/gu, '$1');
  const lines = String(text || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean);
  const result = Object.fromEntries(customerCardFields.map(([key]) => [key, '']));
  const labels = { company: '公司名称|公司|Company', contact: '联系人|姓名|Name', position: '职务|职位|Title', address: '地址|Address', country: '国家|Country', nature: '性质', shortName: '简称', whatsapp: 'WhatsApp' };
  for (const [key, label] of Object.entries(labels)) {
    const match = lines.map(line => line.match(new RegExp(`^(?:${label})\\s*[:：]\\s*(.+)$`, 'i'))).find(Boolean);
    if (match) result[key] = match[1].trim();
  }
  result.email = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] || '';
  result.website = text.match(/(?:https?:\/\/|www\.)[^\s,，;；]+/i)?.[0] || lines.filter(line => !line.includes('@')).join('\n').match(/\b[a-z0-9-]+\.(?:com|cn|net|org|io|co)(?:\.[a-z]{2})?\b/i)?.[0] || '';
  result.phone = text.match(/(?:\+?\d[\d ()-]{6,}\d)/)?.[0]?.trim() || '';
  if (!result.company) result.company = lines.find(line => /有限公司|公司$|\b(?:limited|ltd\.?|inc\.?|corporation|gmbh)\b/i.test(line)) || '';
  if (!result.position) result.position = lines.find(line => !line.includes('@') && /经理|总监|工程师|主管|总裁|\b(?:manager|director|engineer|president|sales)\b/i.test(line)) || '';
  if (!result.address) result.address = lines.find(line => /(?:省|市).*(?:路|街|区|号)|\b\d+\s+.*\b(?:street|road|avenue|ave|blvd)\b/i.test(line)) || '';
  if (!result.contact) result.contact = lines.find(line => line !== result.company && line !== result.position && (/^[\u4e00-\u9fff]{2,4}$/.test(line) || /^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(line))) || '';
  return result;
}
