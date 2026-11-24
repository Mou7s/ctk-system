import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const PYTHON_UNITTEST = `
import importlib.util, json, struct
from datetime import datetime

spec = importlib.util.spec_from_file_location('sync_it_assets', 'tools/sync-it-assets.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

assert mod.normalize_mac('d4-5d-64-02-28-20') == 'D4:5D:64:02:28:20'
assert mod.normalize_mac('000000000000') == ''
assert mod.clean_vendor_brand('ASUSTeK COMPUTER INC.') == '华硕'
assert mod.clean_vendor_brand('To be filled by O.E.M.') == ''
assert mod.clean_model('All Series', 'H310M-D3V') == 'H310M-D3V'
assert mod.clean_cpu('Intel(R) Core(TM) i5-6400 CPU @ 2.70GHz') == 'Intel Core i5-6400 @ 2.70GHz'
assert mod.format_disk_summary([(0, '1TB'), (1, '120GB')], [(0, '机械硬盘'), (1, '固态硬盘')]) == '1TB HDD + 120GB SSD'
assert mod.extract_person_candidate('张三-笔记本') == '张三'
assert mod.extract_person_candidate('李四1 - 固一') == '李四'
assert mod.extract_person_candidate('服务器') == ''
assert mod.extract_person_candidate('扫描仪') == ''
assert mod.extract_person_candidate('国际版公用电脑Macbook') == ''

# Test TrDb decoder (1 active + 1 deleted record)
rec1 = struct.pack('<Ii', 0x7E7E7E7E, 0) + struct.pack('<i', 101) + b'PC-01'.ljust(16, b'\\x00')
rec2 = struct.pack('<Ii', 0x7E7E7E7E, 128) + struct.pack('<i', 102) + b'OLD'.ljust(16, b'\\x00')
decoded = mod.decode_trdb(rec1 + rec2, [('id', 1, 4), ('name', 3, 16)])
assert decoded == [{'id': 101, 'name': 'PC-01'}]

# Test firewall DHCP/ARP parsers
leases = mod.parse_fortigate_leases('  192.0.2.64\t8c:e9:ee:7a:fe:90\tUSER01              MSFT 5.0                                                    1                   Fri Nov 20 17:14:58 2026\\n')
assert leases == [{'ip': '192.0.2.64', 'mac': '8C:E9:EE:7A:FE:90', 'hostname': 'USER01', 'vci': 'MSFT 5.0'}]
arps = mod.parse_fortigate_arp('192.0.2.38      1          20:11:7a:4a:01:3f lan\\n')
assert arps == {'20:11:7A:4A:01:3F': {'ip': '192.0.2.38', 'age': 1}}

# Test build_asset_records: 90d cutoff, MAC dedup, server non-dup, wxuser match, and non-PC filtering
lvdun = {
    'groups': [{'id': 1, 'name': '研发中心工程部', 'pid': 0}],
    'comps': [
        {'id': 10, 'name': 'OLD-PC', 'ip': '192.0.2.10', 'mac': 'aabbccddeeff', 'nick': '王五-笔记本（旧）', 'gid': 1},
        {'id': 11, 'name': 'NEW-PC', 'ip': '169.254.1.2', 'mac': 'aabbccddeeff', 'nick': '王五-笔记本', 'gid': 1},
        {'id': 12, 'name': 'STALE-PC', 'ip': '192.0.2.12', 'mac': '112233445566', 'nick': '离职机', 'gid': 1},
        {'id': 13, 'name': 'CVTOUCH-597', 'ip': '192.0.2.206', 'mac': '209be6312adb', 'nick': 'CVTOUCH-041', 'gid': 1},
        {'id': 14, 'name': 'UNAUTH-PC', 'ip': '192.0.2.99', 'mac': '223344556677', 'nick': '禁用机', 'gid': 1},
    ],
    'clast': [
        {'id': 10, 'lot': '2026-10-01 09:00:00'},
        {'id': 11, 'lot': '2026-11-20 09:00:00'},
        {'id': 12, 'lot': '2025-01-01 09:00:00'},
        {'id': 13, 'lot': '2026-11-20 09:00:00'},
        {'id': 14, 'lot': '2026-11-20 09:00:00'},
    ],
    'mce': [
        {'id': 10, 'ld': 11, 'dk': 127, 'au': 31},
        {'id': 11, 'ld': 11, 'dk': 127, 'au': 31},
        {'id': 12, 'ld': 11, 'dk': 127, 'au': 31},
        {'id': 13, 'ld': 11, 'dk': 127, 'au': 31},
        {'id': 14, 'ld': 0, 'dk': 0, 'au': 0},
    ],
    'hw': {
        '11': {'23001': [{'r': 0, 'v': '1'}], '20202': [{'r': 0, 'v': 'LENOVO'}], '40114': [{'r': 0, 'v': 'ThinkPad X1'}]},
    },
}
fg = {
    'leases': [
        {'ip': '192.0.2.39', 'mac': 'AA:BB:CC:DD:EE:FF', 'hostname': 'NEW-PC', 'vci': 'MSFT 5.0'},
        {'ip': '192.0.2.64', 'mac': '8C:E9:EE:7A:FE:90', 'hostname': 'EXTRA-PC', 'vci': 'MSFT 5.0'},
        {'ip': '192.0.2.114', 'mac': '7C:B5:9B:5C:DA:39', 'hostname': 'TL-WDR5620', 'vci': 'MSFT 5.0'},
    ],
    'arps': {
        'AA:BB:CC:DD:EE:FF': {'ip': '192.0.2.39', 'age': 0},
    },
    'reserved': {},
}
wx = [{'userid': 'WangWu', 'name': '王五', 'dept': '研发中心', 'status': 'active'}]
recs, stats = mod.build_asset_records(lvdun, fg, wx, active_days=90, include_servers=False, now=datetime(2026, 11, 20, 10, 0))
assert len(recs) == 1, f'expected 1, got {len(recs)}'
assert recs[0]['asset_name'] == '办公笔记本'
assert recs[0]['brand'] == '联想'
assert recs[0]['ip_address'] == '192.0.2.39'
assert recs[0]['user_userid'] == 'WangWu'
assert recs[0]['use_dept'] == '研发中心'
assert stats['skipped_unauthorized'] == 1
assert stats['skipped_inactive_over_90d'] == 1
assert stats['skipped_ignored_device'] == 1

recs2, stats2 = mod.build_asset_records(lvdun, fg, wx, active_days=90, include_servers=False, include_unmanaged_fg=True, now=datetime(2026, 11, 20, 10, 0))
assert len(recs2) == 2, f'expected 2 with unmanaged fg, got {len(recs2)}'
assert recs2[1]['ip_address'] == '192.0.2.64'
assert stats2['skipped_fg_non_pc'] == 1
print(json.dumps({'ok': True, 'stats': stats, 'stats2': stats2}))
`

describe('tools/sync-it-assets.py', () => {
  it('cleans LvDun & FortiGate payloads, deduplicates MACs, filters >90d stale and non-PC devices', () => {
    const pyBin = process.platform === 'win32' ? 'python' : 'python3'
    const out = execFileSync(pyBin, ['-c', PYTHON_UNITTEST], { encoding: 'utf8' })
    const parsed = JSON.parse(out.trim())
    expect(parsed.ok).toBe(true)
  }, 15000)
})
