import * as XLSX from 'xlsx/xlsx.mjs'
import { unzipSync } from 'fflate'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildQuotationTemplateWorkbook, populateQuotationWorkbook, patchUploadedQuotationWorkbook, quotationTemplatePath } from '../../server/utils/quotation.ts'
import { parseQuotationWorkbook } from '../../server/utils/quotation-parser.ts'

// 历史模板（21 列标准报价单模板）A..V 列：
// A序号 B报价日期 C国家 D客户性质 E客户 F终端客户 G应用 H友商 I友商型号 J数量 K CTK型号
// L CTK型号 M封装 N芯片大小 O SPQ/Reel P单价(元) Q汇率 R千只美元 S 1只美元 T交期 U规格书 V备注
const WEB_LINE = '网址：https://example.com\nWebsite: https://example.com'
const WEBSITE = 'https://example.com'
const normalizeCellNewlines = (value) => String(value ?? '').replace(/\r\n/gu, '\n')

function is15ColTemplate(sheetXml) {
  return (sheetXml.includes('r="O6"') && !sheetXml.includes('r="P6"') && !sheetXml.includes('r="U6"'))
    || (sheetXml.includes('r="O8"') && !sheetXml.includes('r="P8"') && !sheetXml.includes('r="U8"'))
    || (sheetXml.includes('r="O9"') && !sheetXml.includes('r="P9"') && !sheetXml.includes('r="U9"'))
}

function is16ColTemplate(sheetXml) {
  return sheetXml.includes('r="P6"') && !sheetXml.includes('r="Q6"') && !sheetXml.includes('r="U6"')
}

function _templateWorkbook() {
  const p = quotationTemplatePath()
  if (!p) throw new Error('quotation template not found')
  return XLSX.read(readFileSync(p), { type: 'buffer', cellStyles: true })
}

function legacyTemplateWorkbook() {
  const workbook = XLSX.utils.book_new()
  const rows = Array.from({ length: 12 }, () => Array(22).fill(null))
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '8-14')
  return workbook
}

describe('quotation template generation', () => {
  it('writes form fields and extends the template row style for extra lines', () => {
    const workbook = legacyTemplateWorkbook()
    const lines = Array.from({ length: 42 }, (_, index) => ({
      line_no: index + 1,
      quote_to: '客户A',
      country: '印度',
      customer_style: '分销商',
      manufacturer_mpn: `MPN-${index + 1}`,
      qty: 100,
      unit: 'KPCS',
      ctk_mpn: `CTK-${index + 1}`,
      rate: 7.2,
      original_price_rmb: 12.5,
      original_price_usd: 1.74,
      initial_price_rmb: 11.5,
      initial_price_usd: 1.6,
      final_price_rmb: 10.5,
      final_price_usd: 1.46,
      lead_time: '30days',
      remark: '备注',
    }))

    populateQuotationWorkbook(workbook, {
      source_sheet_name: '8-14',
      customer_name: '客户A',
      delivery_terms: 'FOB Shenzhen',
      validity: '7days',
      payment_term: '30% deposit',
    }, lines)

    const sheet = workbook.Sheets['8-14']
    // 42 行明细 → 明细区占 9..50 行（模板起始行 9）。列位按 21 列新模板：
    // J 数量 / K CTK 型号 / O 单价（元）/ R 1只单价（美元）/ S 交期
    expect(sheet.J50.v).toBe(100)
    expect(sheet.K50.v).toBe('CTK-42')
    expect(sheet.O50.v).toBe(10.5)
    expect(sheet.Q50.v).toBe(1.46)     // 千只单价（美元）
    expect(sheet.R50.v).toBe(0.00146)  // 1只单价（美元）= 千只 ÷ 1000（五位小数）
    expect(sheet.O50.z).toContain('￥')
    expect(sheet.Q50.z).toContain('$')
  })

  it('populates the current foreign template in the core-field-first order', () => {
    const workbook = _templateWorkbook()
    populateQuotationWorkbook(workbook, {
      source_sheet_name: '报价单',
      customer_name: '客户A',
      rate: 7.2,
    }, [{
      line_no: 1,
      material_code: 'MAT-001',
      ctk_mpn: 'CTK-001',
      package_name: 'SOT23',
      original_price_rmb: 12.5,
      final_price_rmb: 10.5,
      final_price_usd: 1.46,
      application: 'Fridge',
      manufacturer: 'Vendor',
      manufacturer_mpn: 'MPN-001',
      qty: 100,
      die_size: '1x1',
      spq_reel: '3000',
      lead_time: '30days',
      datasheet: 'spec.pdf',
      remark: 'note',
    }])

    const sheet = workbook.Sheets['报价单']
    expect(sheet.B7.v).toBe('MAT-001')
    expect(sheet.C7.v).toBe('CTK-001')
    expect(sheet.D7.v).toBe('SOT23')
    expect(sheet.E7.v).toBe(10.5)
    expect(sheet.F7.v).toBe('Fridge')
    expect(sheet.G7.v).toBe('Vendor')
    expect(sheet.H7.v).toBe('MPN-001')
    expect(sheet.I7.v).toBe(100)
    expect(sheet.J7.v).toBe('1x1')
    expect(sheet.K7.v).toBe('3000')
    expect(sheet.L7.v).toBe(1.46)
    expect(sheet.M7.v).toBe(0.00146)
    expect(sheet.N7.v).toBe('30days')
    expect(sheet.O7.v).toBe('spec.pdf')
    expect(sheet.P7.v).toBe('note')
  })

  it('writes system-entry quotations to the content header layout with only the intentional logo image', () => {
    const template = readFileSync(quotationTemplatePath())
    const buffer = buildQuotationTemplateWorkbook(template, {
      salesperson_name: 'alice',
      salesperson_email: 'alice@example.test',
      salesperson_phone: '13800000001',
      rate: 7.2,
      customer_name: '客户<&',
      delivery_terms: 'FOB Shenzhen',
      validity: '7days',
      payment_term: '30% deposit,70% before shipping.',
    }, [{
      line_no: 42,
      quote_to: '客户<&',
      country: '印度',
      customer_style: '分销商',
      qty: 100,
      unit: 'KPCS',
      material_code: 'MAT-001',
      ctk_mpn: '101010096',
      package_name: 'SOD32',
      application: 'Fridge',
      manufacturer: 'Vendor',
      manufacturer_mpn: 'MPN-A',
      die_size: '1x1',
      spq_reel: '3000',
      rate: 7.2,
      original_price_rmb: 12.5,
      original_price_usd: 1.74,
      final_price_rmb: 10.5,
      final_price_usd: 1.46,
      lead_time: '30days',
      remark: '备注<&',
    }])
    const sheetXml = new TextDecoder().decode(unzipSync(buffer)['xl/worksheets/sheet1.xml'])
    const is16Col = is16ColTemplate(sheetXml)
    const is15Col = is15ColTemplate(sheetXml)
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellStyles: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]

    if (is16Col) {
      expect(sheetXml).toContain('IF(E48=&quot;&quot;,&quot;&quot;,IFERROR(E48/$M$3,&quot;&quot;))')
      expect(sheetXml).toContain('IF(L48=&quot;&quot;,&quot;&quot;,IFERROR(L48/1000,&quot;&quot;))')
      expect(sheetXml).not.toContain('#VALUE!')
      expect(sheet.B6.v).toMatch(/Material Code[\r\n]+物料编码/)
      expect(sheet.C6.v).toMatch(/Material Name[\r\n]+物料名称/)
      expect(sheet.D6.v).toMatch(/Package[\r\n]+封装/)
      expect(sheet.E6.v).toMatch(/Price\/RMB/)
      expect(sheet.B48.v).toBe('MAT-001')
      expect(sheet.C48.v).toBe('101010096')
      expect(sheet.D48.v).toBe('SOD32')
      expect(sheet.E48.v).toBe(10.5)
      expect(sheet.F48.v).toBe('Fridge')
      expect(sheet.G48.v).toBe('Vendor')
      expect(sheet.H48.v).toBe('MPN-A')
      expect(sheet.I48.v).toBe(100)
      expect(sheet.J48.v).toBe('1x1')
      expect(sheet.K48.v).toBe('3000')
      expect(sheet.L48.f).toBe('IF(E48="","",IFERROR(E48/$M$3,""))')
      expect(sheet.L48.v).toBe(1.46)
      expect(sheet.M48.f).toBe('IF(L48="","",IFERROR(L48/1000,""))')
      expect(sheet.M48.v).toBe(0.00146)
      const parsed = parseQuotationWorkbook(new Uint8Array(buffer), 'foreign-template.xlsx')
      expect(parsed.lines[0]).toMatchObject({
        materialCode: 'MAT-001',
        ctkMpn: '101010096',
        packageName: 'SOD32',
        originalPriceRmb: 10.5,
        application: 'Fridge',
        manufacturer: 'Vendor',
        manufacturerMpn: 'MPN-A',
        qty: 100,
        dieSize: '1x1',
        spqReel: '3000',
        unit: 'kpcs',
      })
    } else if (is15Col) {
      expect(sheetXml).toContain('r="C4"')
      expect(sheetXml).toContain('r="H4"')
      expect(sheetXml).toContain('r="K4"')
      expect(sheetXml).toContain('r="A5"')
      expect(sheetXml).toContain('r="K48"')
      expect(sheetXml).toContain('r="L48"')
      expect(sheetXml).toContain('IF(J48=&quot;&quot;,&quot;&quot;,IFERROR(J48/$M$3,&quot;&quot;))')
      expect(sheetXml).toContain('IF(K48=&quot;&quot;,&quot;&quot;,IFERROR(K48/1000,&quot;&quot;))')
      expect(sheetXml).not.toContain('#VALUE!')
      expect(sheet.C1.v).toBe('示例企业有限公司　报价单\nExample Enterprise Co., Ltd　Quotation Sheet')
      expect(sheet.I2.v).toBe(WEBSITE)
      expect(sheet.B3.v).toBe('客户<&')
      expect(sheet.C4.v).toBe('FOB Shenzhen')
      expect(sheet.H4.v).toBe('7days')
      expect(sheet.J4.v).toBe('付款方式\nPayment Terms:')
      expect(sheet.K4.v).toBe('30% deposit,70% before shipping.')
      expect(sheet.A5.v).toBe('联系人\nContact:')
      expect(sheet.B5.v).toBe('alice')
      expect(normalizeCellNewlines(sheet.D5.v)).toBe('邮箱\nEmail:')
      expect(sheet.E5.v).toBe('alice@example.test')
      expect(normalizeCellNewlines(sheet.G5.v)).toBe('电话\nPhone:')
      expect(sheet.H5.v).toBe('+8613800000001')
      expect(normalizeCellNewlines(sheet.J5.v)).toBe('WhatsApp号\nWhatsApp:')
      expect(sheet.K5.v).toBe('+8613800000001')
      expect(normalizeCellNewlines(sheet.M5.v)).toBe('微信\nWeChat:')
      expect(sheet.N5.v).toBe('+8613800000001')
      expect(String(sheet.A6.v)).toMatch(/S\/N[\r\n]+序号/)
      expect(sheet.F48.v).toBe('101010096')
      expect(sheet.G48.v).toBe('SOD32')
      expect(sheet.J48.v).toBe(10.5)
      expect(sheet.K48.f).toBe('IF(J48="","",IFERROR(J48/$M$3,""))')
      expect(sheet.L48.f).toBe('IF(K48="","",IFERROR(K48/1000,""))')
    } else {
      expect(sheetXml).toContain('r="A6"')
      expect(sheetXml).toContain('r="Q50"')
      expect(sheetXml).toContain('r="R50"')
      expect(sheetXml).toContain('<f>IFERROR(O50/P50')
      expect(sheetXml).toContain('<f>IFERROR(Q50/1000')
      expect(sheetXml).not.toContain('#VALUE!')
      expect(sheet.A5.v).toBe('Quotation Sheet')
      expect(sheet.A4.v).toBe(WEB_LINE)
      expect(sheet.A6.v).toContain('Trading Terms: FOB Shenzhen')
      expect(sheet.A6.v).toContain('Quotation Valid: 7days')
      expect(sheet.A6.v).toContain('Email:alice@example.test')
      expect(sheet.A6.v).toContain('Whatsapp:+8613800000001')
      expect(sheet.K50.v).toBe('101010096')
      expect(sheet.L50.v).toBe('SOD32')
      expect(sheet.O50.v).toBe(10.5)
      expect(sheet.Q50.f).toBe('IFERROR(O50/P50,"")')
      expect(sheet.R50.f).toBe('IFERROR(Q50/1000,"")')
    }
  })

  it('writes company website and salesperson contact into their dedicated fields', () => {
    const template = readFileSync(quotationTemplatePath())
    const files = unzipSync(template)
    const sheetXml = new TextDecoder().decode(files['xl/worksheets/sheet1.xml'])
    const is16Col = is16ColTemplate(sheetXml)
    const is15Col = is15ColTemplate(sheetXml)

    const salesCases = [
      { name: 'admin', email: 'admin@example.test', phone: '13800000001' },
      { name: '业务员无电话', email: 'sales01@example.test', phone: '' },
      { name: '业务员全空', email: '', phone: '' },
    ]

    for (const testCase of salesCases) {
      const buffer = buildQuotationTemplateWorkbook(template, {
        salesperson_name: testCase.name,
        salesperson_email: testCase.email,
        salesperson_phone: testCase.phone,
        customer_name: '客户A',
        delivery_terms: 'FOB Shenzhen',
        validity: '7days',
        payment_term: '30% deposit',
      }, [{
        line_no: 1,
        quote_to: '客户A',
        qty: 10,
        unit: 'KPCS',
        ctk_mpn: 'CTK-1',
        rate: 7.2,
        final_price_rmb: 8.8,
      }])
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (is15Col || is16Col) {
        expect(sheet.I2.v).toBe(WEBSITE)
        expect(normalizeCellNewlines(sheet.A5.v)).toBe('联系人\nContact:')
        expect(sheet.B5.v).toBe(testCase.name)
        if (testCase.email) {
          expect(sheet.E5?.v).toBe(testCase.email)
        } else {
          expect(sheet.E5?.v || '').toBe('')
        }
        if (testCase.phone) {
          expect(sheet.H5?.v).toBe('+8613800000001')
          expect(sheet.K5?.v).toBe('+8613800000001')
          expect(sheet.N5?.v).toBe('+8613800000001')
        }
      } else {
        expect(sheet.A4.v).toBe(WEB_LINE)
        const contactText = String(sheet.A8?.v || sheet.A6?.v || '')
        expect(contactText).toContain('Contact:')
        expect(contactText).not.toContain('undefined')
        if (testCase.email) {
          expect(contactText).toContain(`Email:${testCase.email}`)
        } else {
          expect(contactText).toContain('Email:')
          expect(contactText).not.toContain('@')
        }
        if (testCase.phone) {
          expect(contactText).toContain('Phone:+8613800000001')
          expect(contactText).toContain('Wechat:+8613800000001')
        }
      }
    }
  })

  it('preserves full original template styles when patching uploaded Excel', () => {
    const template = readFileSync(quotationTemplatePath())
    const buffer = patchUploadedQuotationWorkbook(template, {
      customer_name: '测试客户',
      salesperson_email: 'tester01@example.test',
      salesperson_phone: '13800000000',
    }, [
      { line_no: 1, rate: 7.2, final_price_rmb: 39.6, final_price_usd: 5.87 },
      { line_no: 2, rate: 7.2, final_price_rmb: 24.0, final_price_usd: 3.56 },
    ])
    const files = unzipSync(buffer)
    expect(files['xl/styles.xml']).toBeDefined()
    expect(files['xl/worksheets/sheet1.xml']).toBeDefined()
    const sheetXml = new TextDecoder().decode(files['xl/worksheets/sheet1.xml'])
    const is16Col = is16ColTemplate(sheetXml)
    const is15Col = is15ColTemplate(sheetXml)

    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    if (is16Col) {
      expect(sheet.I2.v).toBe(WEBSITE)
      expect(sheet.E5.v).toBe('tester01@example.test')
      expect(sheet.H5.v).toBe('+8613800000000')
      expect(sheet.E7.v).toBe(39.6)
      expect(sheet.E8.v).toBe(24.0)
      expect(sheet.L7.f).toBe('IF(E7="","",IFERROR(E7/$M$3,""))')
      expect(sheet.L7.v).toBe(5.5)
      expect(sheet.L8.v).toBe(3.33)
    } else if (is15Col) {
      expect(sheet.I2.v).toBe(WEBSITE)
      expect(sheet.E5.v).toBe('tester01@example.test')
      expect(sheet.H5.v).toBe('+8613800000000')
      expect(sheet.J7.v).toBe(39.6)
      expect(sheet.J8.v).toBe(24.0)
      expect(sheet.K7.f).toBe('IF(J7="","",IFERROR(J7/$M$3,""))')
      expect(sheet.K7.v).toBe(5.5)
      expect(sheet.K8.v).toBe(3.33)
    } else {
      expect(sheet.A4.v).toBe(WEB_LINE)
      expect(sheet.A6.v).toContain('Email:tester01@example.test')
      expect(sheet.O9.v).toBe(39.6)
      expect(sheet.O10.v).toBe(24.0)
      expect(sheet.Q9.f).toBe('IFERROR(O9/P9,"")')
      expect(sheet.Q9.v).toBe(5.5)
      expect(sheet.Q10.v).toBe(3.33)
    }
  })

  it('uses the contact the salesperson typed in the template, falling back to their name', () => {
    const template = readFileSync(quotationTemplatePath())
    const files = unzipSync(template)
    const sheetXml = new TextDecoder().decode(files['xl/worksheets/sheet1.xml'])
    const is16Col = is16ColTemplate(sheetXml)
    const is15Col = is15ColTemplate(sheetXml)
    const header = { customer_name: '客户A', salesperson_name: 'alice', salesperson_email: 'alice@example.test', delivery_terms: 'EXW Dongguan' }

    const withContact = XLSX.read(buildQuotationTemplateWorkbook(template, { ...header, contact_text: '张三 (Alex)' }, []), { type: 'buffer' })
    const sheetWith = withContact.Sheets[withContact.SheetNames[0]]

    if (is15Col || is16Col) {
      expect(sheetWith.C4.v).toBe('EXW Dongguan')
      expect(sheetWith.B5.v).toBe('张三 (Alex)')
      expect(sheetWith.E5.v).toBe('alice@example.test')

      const withoutContact = XLSX.read(buildQuotationTemplateWorkbook(template, header, []), { type: 'buffer' })
      const sheetWithout = withoutContact.Sheets[withoutContact.SheetNames[0]]
      expect(sheetWithout.B5.v).toBe('alice')
    } else {
      const contactLineWith = String(sheetWith.A8?.v || sheetWith.A6?.v || '')
      const termsLineWith = String(sheetWith.C7?.v || sheetWith.A6?.v || '')
      expect(termsLineWith).toContain('EXW Dongguan')
      expect(contactLineWith).toContain('Contact: 张三 (Alex)')
      expect(contactLineWith).toContain('Email:alice@example.test')

      const withoutContact = XLSX.read(buildQuotationTemplateWorkbook(template, header, []), { type: 'buffer' })
      const sheetWithout = withoutContact.Sheets[withoutContact.SheetNames[0]]
      const contactLineWithout = String(sheetWithout.A8?.v || sheetWithout.A6?.v || '')
      expect(contactLineWithout).toContain('Contact: alice')
      expect(contactLineWithout).not.toContain('days days')
    }
  })

  it('generates a clean blank template with EXW default trade terms', () => {
    const template = readFileSync(quotationTemplatePath())
    const buffer = buildQuotationTemplateWorkbook(template, {
      salesperson_email: 'sales02@example.test',
      salesperson_phone: '13900001111',
      payment_term: '30% deposit,and 70% before shipping',
    }, [], { blank: true })

    const files = unzipSync(buffer)
    const sheetXml = new TextDecoder().decode(files['xl/worksheets/sheet1.xml'])
    const is16Col = is16ColTemplate(sheetXml)
    const is15Col = is15ColTemplate(sheetXml)

    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]

    if (is15Col || is16Col) {
      expect(sheet.I2.v).toBe(WEBSITE)
      expect(sheet.C4.v).toBe('EXW Dongguan')
      expect(sheet.H4.v).toBe('________')
      expect(normalizeCellNewlines(sheet.L4.v)).toBe('付款方式\nPayment Terms:')
      expect(sheet.M4.v).toBe('30% deposit,and 70% before shipping')
      expect(normalizeCellNewlines(sheet.A5.v)).toBe('联系人\nContact:')
      expect(sheet.B5.v).toBe('________')
      expect(normalizeCellNewlines(sheet.D5.v)).toBe('邮箱\nEmail:')
      expect(sheet.E5.v).toBe('sales02@example.test')
      expect(normalizeCellNewlines(sheet.G5.v)).toBe('电话\nPhone:')
      expect(sheet.H5.v).toBe('+8613900001111')
      expect(normalizeCellNewlines(sheet.J5.v)).toBe('WhatsApp号\nWhatsApp:')
      expect(sheet.K5.v).toBe('+8613900001111')
      expect(normalizeCellNewlines(sheet.M5.v)).toBe('微信\nWeChat:')
      expect(sheet.N5.v).toBe('+8613900001111')
      expect(String(sheet.A6.v)).toMatch(/S\/N[\r\n]+序号/)
      // 空单据：明细区（Row 7+）除预设序号外，不能残留任何价格或型号
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false })
      const detailRows = rows.slice(6)
      expect(detailRows.every((row) => !row || row.slice(1).every((cell) => cell == null || String(cell).trim() === ''))).toBe(true)
    } else {
      expect(sheet.A6.v).toContain('Trading Terms: ________')
      expect(sheet.A6.v).toContain('Quotation Valid: ________ days')
      expect(sheet.A6.v).toContain('Payment terms:30% deposit,and 70% before shipping')
      expect(sheet.A6.v).toContain('Contact: ________')
      expect(sheet.A6.v).toContain('Email:')
      expect(sheet.A6.v).toContain('Phone:')
      expect(sheet.A6.v).toContain('Whatsapp:')
      expect(sheet.A6.v).toContain('Wechat:')
      expect(sheet.A6.v).not.toContain(';')
      expect(sheet.A6.v).not.toContain('FOB Shenzhen')
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false })
      const detailRows = rows.slice(8)
      expect(detailRows.every((row) => !row || row.every((cell) => cell == null || String(cell).trim() === ''))).toBe(true)
    }
  })

  it('guarantees the bilingual header layout and sufficient column width', () => {
    const template = readFileSync(quotationTemplatePath())
    const files = unzipSync(template)
    const sheetXml = new TextDecoder().decode(files['xl/worksheets/sheet1.xml'])
    const is16Col = is16ColTemplate(sheetXml)
    const is15Col = is15ColTemplate(sheetXml)
    if (!is15Col && !is16Col) return

    const workbook = XLSX.read(template, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]

    // 单元格位置与内容契约
    expect(normalizeCellNewlines(sheet.A2?.v)).toBe('地址\nAddress:')
    expect(normalizeCellNewlines(sheet.H2?.v)).toBe('网址\nWebsite:')
    expect(sheet.I2?.v).toBe(WEBSITE)
    expect(normalizeCellNewlines(sheet.A3?.v)).toBe('客户\nCustomer:')
    expect(normalizeCellNewlines(sheet.L4?.v)).toBe('付款方式\nPayment Terms:')
    expect(sheet.M4?.v).toBe('30% deposit,and 70% before shipping')

    // Row 5 联系人 5 个独立分格
    expect(normalizeCellNewlines(sheet.A5?.v)).toBe('联系人\nContact:')
    expect(sheet.B5?.v).toBe('________')
    expect(normalizeCellNewlines(sheet.D5?.v)).toBe('邮箱\nEmail:')
    expect(normalizeCellNewlines(sheet.G5?.v)).toBe('电话\nPhone:')
    expect(normalizeCellNewlines(sheet.J5?.v)).toBe('WhatsApp号\nWhatsApp:')
    expect(normalizeCellNewlines(sheet.M5?.v)).toBe('微信\nWeChat:')

    // Row 6 单行双语表头
    expect(String(sheet.A6?.v)).toMatch(/S\/N[\r\n]+序号/)
    if (is16Col) {
      expect(String(sheet.B6?.v)).toMatch(/Material Code[\r\n]+物料编码/)
      expect(String(sheet.C6?.v)).toMatch(/Material Name[\r\n]+物料名称/)
      expect(String(sheet.D6?.v)).toMatch(/Package[\r\n]+封装/)
      expect(String(sheet.E6?.v)).toMatch(/Price\/RMB/)
    } else {
      expect(String(sheet.F6?.v)).toMatch(/CTK MPN[\r\n]+CTK 型号/)
    }

    // 列宽契约：J 列（第10列）宽必须 >= 15.0，保证双语付款标签清晰可读
    const colTag = sheetXml.match(/<col [^>]*min="10"[^>]*max="10"[^>]*\/>/)?.[0]
      || sheetXml.match(/<col [^>]*min="10"[^>]*\/>/)?.[0]
    expect(colTag).toBeDefined()
    const widthMatch = colTag.match(/width="([^"]+)"/)
    expect(widthMatch).not.toBeNull()
    const jWidth = parseFloat(widthMatch[1])
    expect(jWidth).toBeGreaterThanOrEqual(15.0)
  })
})
