import { describe, expect, it } from 'vitest';
import { customerKeys, parseCardText } from '../packages/shared/customerCard.js';

describe('名片字段与冲突口径', () => {
  it('忽略网址协议、www和路径以及公司标点、邮箱大小写、电话格式', () => {
    expect(customerKeys({ company: 'ＡＣＭＥ， 有限公司', website: 'https://www.Example.com/about?q=1', email: ' Alice@Example.COM ', phone: '+86 (138) 1234-5678' })).toEqual({ company: 'acme有限公司', website: 'example.com', email: 'alice@example.com', phone: '8613812345678' });
    expect(customerKeys({ website: 'example.com' }).website).toBe('example.com');
    expect(customerKeys({})).toEqual({ company: '', website: '', email: '', phone: '' });
  });
  it('识别原文中的名片字段，不虚构没有提供的性质或国家', () => {
    expect(parseCardText('示 例 有 限 公 司\n联 系 人 ： 张 三\n职 务 ： 销 售 经 理\nsales@example.com')).toMatchObject({ company: '示例有限公司', contact: '张三', position: '销售经理' });
    expect(parseCardText('ACME LIMITED\nName: Alice\nSales Manager\nalice@example.com\nwww.example.com\n+86 138 1234 5678')).toMatchObject({ company: 'ACME LIMITED', contact: 'Alice', position: 'Sales Manager', email: 'alice@example.com', website: 'www.example.com', phone: '+86 138 1234 5678', nature: '', country: '' });
    expect(parseCardText('公司：示例有限公司\n联系人：张三\n地址：上海市\n职务：业务经理\nWhatsApp: +8613812345678')).toMatchObject({ company: '示例有限公司', contact: '张三', address: '上海市', position: '业务经理', whatsapp: '+8613812345678' });
  });
});
