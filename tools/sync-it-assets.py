#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IT 电脑资产增量同步脚本（只读采集 -> 清洗关联 -> 按 MAC 幂等写入 tk_it_asset）

数据源（通过环境变量配置，勿在源码中硬编码内网地址）：
  1. LVDUN_SSH_HOST（天锐绿盾主服务器，LeaderEIS TrDb + 硬件采集 assetinfo_*.db）
  2. FORTIGATE_SSH_HOST（防火墙，DHCP 租约 / ARP 表 / 静态绑定）
  3. IT_ASSET_CORE_SERVERS_JSON（可选：核心服务器 JSON 列表，SSH 免密只读补采配置）

用法：
  python tools/sync-it-assets.py --dry-run   # 默认：仅预览待导入/更新清单，不写库
  python tools/sync-it-assets.py --apply     # 事务执行写入并回查结果
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import struct
import subprocess
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(ROOT / "tools"))


def _load_pymysql():
    import pymysql  # type: ignore

    return pymysql


def get_mysql_config() -> dict[str, Any]:
    try:
        from db_config import get_mysql_config as _local_cfg  # type: ignore

        return _local_cfg()
    except ImportError:
        return {
            "host": os.environ.get("NUXT_MYSQL_HOST", "127.0.0.1"),
            "port": int(os.environ.get("NUXT_MYSQL_PORT", "3306")),
            "user": os.environ.get("NUXT_MYSQL_USER", "root"),
            "password": os.environ.get("NUXT_MYSQL_PASSWORD", ""),
            "database": os.environ.get("NUXT_MYSQL_DATABASE", "ctk_system"),
        }

LVDUN_HOST = os.environ.get("LVDUN_SSH_HOST", "")
FORTIGATE_HOST = os.environ.get("FORTIGATE_SSH_HOST", "")
ERP_SERVER_IP = os.environ.get("IT_ASSET_ERP_SERVER_IP", "")
OPERATOR_NAME = "sync-it-assets"

PLACEHOLDER_VALUES = {
    "to be filled by o.e.m.",
    "to be filled by o.e.m",
    "system product name",
    "system manufacturer",
    "default string",
    "all series",
    "none",
    "not specified",
    "o.e.m.",
    "oem",
    "mb-1234567890",
    "system serial number",
    "chassis serial number",
    "0123456789",
    "123456789",
    "invalid",
    "unknown",
    "n/a",
    "na",
}

BRAND_ALIASES = [
    ("asustek", "华硕"),
    ("asus", "华硕"),
    ("lenovo", "联想"),
    ("thinkpad", "联想"),
    ("dell", "戴尔"),
    ("hewlett-packard", "惠普"),
    ("hp", "惠普"),
    ("apple", "苹果"),
    ("huawei", "华为"),
    ("honor", "荣耀"),
    ("xiaomi", "小米"),
    ("timi", "小米"),
    ("redmi", "小米"),
    ("gigabyte", "技嘉"),
    ("micro-star", "微星"),
    ("msi", "微星"),
    ("asrock", "华擎"),
    ("colorful", "七彩虹"),
    ("maxsun", "铭瑄"),
    ("acer", "宏碁"),
    ("onda", "昂达"),
    ("hasee", "神舟"),
    ("mechrevo", "机械革命"),
    ("microsoft", "微软"),
    ("vmware", "VMware"),
    ("qemu", "QEMU"),
    ("supermicro", "超微"),
    ("inspur", "浪潮"),
]

NON_PC_HOST_PATTERNS = re.compile(
    r"^(?:TL-|TP-LINK|RG-|EW\d+|CVTOUCH|MITV|EPSON|CANON|BROTHER|HIKVISION|DAHUA|EZVIZ|IPHONE|IPAD|ANDROID|VIVO|OPPO|XIAOMI|HUAWEI|HONOR|REDMI)",
    re.I,
)

SPECIAL_DEVICE_KEYWORDS = (
    "公用",
    "测试",
    "产线",
    "固晶",
    "焊线",
    "玻封",
    "塑封",
    "膜压",
    "保安",
    "门岗",
    "前台",
    "会议",
    "推拉力",
    "三次元",
    "显微镜",
    "扫描仪",
    "开票",
    "培训室",
    "服务器",
    "macbook",
    "thinkpad",
)

GROUP_DEPT_MAP = {
    "Default": "",
    "塑封部（只能使用企业微信和邮箱）": "塑封部",
    "玻封部（只能使用企业微信和邮箱）": "玻封部",
    "研发中心工程部": "研发中心",
    "国际部": "国际销售部",
    "国际一部": "国际销售部",
    "国际二部": "国际销售部",
    "国内部": "国内销售部",
    "跟单组": "国内跟单组",
    "允许使用搜索网站": "产品应用",
    "不允许使用搜索网站": "产品应用",
}

CORE_SERVERS: list[dict[str, Any]] = json.loads(os.environ.get("IT_ASSET_CORE_SERVERS_JSON", "[]") or "[]")

# 明确忽略非电脑/非台账主机（如会议大屏 OPS 模块）
IGNORED_LVDUN_NAMES = {"CVTOUCH-597", "CVTOUCH-888"}


def normalize_mac(value: Any) -> str:
    hex_str = re.sub(r"[^0-9a-fA-F]", "", str(value or "")).upper()
    if len(hex_str) != 12 or hex_str == "000000000000":
        return ""
    return ":".join(hex_str[i : i + 2] for i in range(0, 12, 2))


def is_valid_lan_ip(ip: Any) -> bool:
    text = str(ip or "").strip()
    if not re.match(r"^\d{1,3}(?:\.\d{1,3}){3}$", text):
        return False
    if text.startswith("0.") or text.startswith("127.") or text.startswith("169.254."):
        return False
    return True


def is_placeholder(value: Any) -> bool:
    text = str(value or "").strip()
    if not text:
        return True
    lowered = text.lower()
    if lowered in PLACEHOLDER_VALUES:
        return True
    if re.fullmatch(r"[0xX.\-_/\s]+", text):
        return True
    return False


def clean_vendor_brand(raw_vendor: Any) -> str:
    text = str(raw_vendor or "").strip()
    if is_placeholder(text):
        return ""
    lowered = text.lower()
    for prefix, cn_name in BRAND_ALIASES:
        if prefix in lowered:
            return cn_name
    cleaned = re.sub(r"\b(inc\.?|corp\.?|corporation|co\.?,?\s*ltd\.?|computer)\b", "", text, flags=re.I)
    return re.sub(r"\s+", " ", cleaned).strip(" ,.")[:64]


def clean_model(system_model: Any, board_model: Any) -> str:
    for candidate in (system_model, board_model):
        text = str(candidate or "").strip()
        if not is_placeholder(text):
            return text[:120]
    return ""


def clean_serial(bios_sn: Any, board_sn: Any) -> str:
    for candidate in (bios_sn, board_sn):
        text = str(candidate or "").strip()
        if not is_placeholder(text):
            return text[:100]
    return ""


def clean_cpu(raw_cpu: Any) -> str:
    text = str(raw_cpu or "").strip()
    if is_placeholder(text):
        return ""
    text = text.replace("(R)", "").replace("(TM)", "").replace("(tm)", "")
    text = re.sub(r"\s+CPU\s*@", " @", text)
    return re.sub(r"\s+", " ", text).strip()[:100]


def clean_os(raw_os: Any) -> str:
    text = str(raw_os or "").strip()
    if is_placeholder(text):
        return ""
    text = re.sub(r"^Microsoft\s+", "", text, flags=re.I)
    return text.strip()[:80]


def clean_memory(total_mem: Any, slot_mems: list[str]) -> str:
    total = str(total_mem or "").strip()
    if total and not is_placeholder(total):
        return total[:64]
    valid = [m.strip() for m in slot_mems if m and not is_placeholder(m)]
    return "+".join(valid)[:64] if valid else ""


def format_disk_summary(sizes: list[tuple[int, str]], types: list[tuple[int, str]]) -> str:
    type_map = {rec_no: val for rec_no, val in types}
    parts: list[str] = []
    for rec_no, raw_size in sorted(sizes, key=lambda x: x[0]):
        size_txt = str(raw_size or "").strip()
        if not size_txt:
            continue
        raw_type = str(type_map.get(rec_no, "")).strip()
        if "固态" in raw_type or "SSD" in raw_type.upper():
            suffix = " SSD"
        elif "机械" in raw_type or "HDD" in raw_type.upper():
            suffix = " HDD"
        else:
            suffix = ""
        parts.append(f"{size_txt}{suffix}")
    return " + ".join(parts)[:64]


DEPT_UNIFY_MAP = {
    "国际部": "国际销售部",
    "国际一部": "国际销售部",
    "国际二部": "国际销售部",
}


def normalize_dept(dept_name: Any) -> str:
    raw = str(dept_name or "").strip()
    if not raw:
        return ""
    return DEPT_UNIFY_MAP.get(raw, raw)[:100]


def clean_dept(group_name: str, parent_name: str = "") -> str:
    raw = str(group_name or "").strip()
    if raw in GROUP_DEPT_MAP:
        return normalize_dept(GROUP_DEPT_MAP[raw])
    cleaned = re.sub(r"[（(][^）)]*只能使用[^）)]*[）)]", "", raw).strip()
    if not cleaned and parent_name:
        return clean_dept(parent_name, "")
    return normalize_dept(cleaned)


NON_PERSON_LABELS = {
    "服务器",
    "扫描仪",
    "开票电脑",
    "培训室",
    "前台考勤",
    "测试",
    "公用电脑",
    "门岗",
    "未授权",
}


def extract_person_candidate(nickname: str) -> str:
    raw = str(nickname or "").strip()
    if not raw or raw in NON_PERSON_LABELS:
        return ""
    # Skip obvious non-person / machine-like names
    if re.match(r"^(PC-|MS-|WIN-|DESKTOP-|LAPTOP-|\d{6,}|CVTOUCH)", raw, re.I):
        return ""
    if any(k in raw.lower() for k in SPECIAL_DEVICE_KEYWORDS):
        # Might still be "胡金权-笔记本" or "徐广龙-膜压手动" -> strip after '-' if prefix looks like 2-4 Chinese chars
        prefix = re.split(r"[-－(/（\s]", raw, maxsplit=1)[0].strip()
        prefix = re.sub(r"\d+$", "", prefix)
        if re.fullmatch(r"[\u4e00-\u9fa5]{2,4}", prefix) and prefix not in NON_PERSON_LABELS:
            return prefix
        return ""
    head = re.split(r"[-－(/（\s]", raw, maxsplit=1)[0].strip()
    head = re.sub(r"\d+$", "", head)
    if re.fullmatch(r"[\u4e00-\u9fa5]{2,4}", head) and head not in NON_PERSON_LABELS:
        return head
    return ""


def infer_device_type(hw_type_23001: str, os_text: str, computer_name: str, nickname: str, model_text: str) -> str:
    if "server" in os_text.lower():
        return "server"
    if hw_type_23001 == "1":
        return "laptop"
    if hw_type_23001 == "2":
        return "desktop"
    joined = f"{computer_name} {nickname} {model_text}".lower()
    if any(k in joined for k in ("笔记本", "laptop", "macbook", "thinkpad", "redmibook", "matebook", "vivobook", "surface")):
        return "laptop"
    return "desktop"


def decode_trdb(raw: bytes, fields: list[tuple[str | None, int, int]]) -> list[dict[str, Any]]:
    body_size = sum(f[2] for f in fields)
    stride = 8 + body_size
    if stride <= 8:
        return []
    rows: list[dict[str, Any]] = []
    for idx in range(len(raw) // stride):
        off = idx * stride
        _, rec_flag = struct.unpack_from("<Ii", raw, off)
        if rec_flag != 0:
            continue
        pos = off + 8
        row: dict[str, Any] = {}
        for name, ftype, fsize in fields:
            if name:
                if ftype == 1:
                    row[name] = struct.unpack_from("<i", raw, pos)[0]
                else:
                    chunk = raw[pos : pos + fsize]
                    nul = chunk.find(b"\x00")
                    if nul != -1:
                        chunk = chunk[:nul]
                    row[name] = chunk.decode("gb18030", errors="replace").strip()
            pos += fsize
        rows.append(row)
    return rows


def parse_fortigate_leases(raw: str) -> list[dict[str, str]]:
    leases: list[dict[str, str]] = []
    for line in raw.splitlines():
        m = re.match(r"^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f:]{17})\s+(.*)$", line, re.I)
        if not m:
            continue
        ip, mac, rest = m.group(1), normalize_mac(m.group(2)), m.group(3)
        exp_m = re.search(r"(\w{3}\s+\w{3}\s+\d+\s+\d+:\d+:\d+\s+\d{4})\s*$", rest)
        prefix = rest[: exp_m.start()].rstrip() if exp_m else rest.rstrip()
        prefix = re.sub(r"\s+\d+\s*$", "", prefix)
        parts = re.split(r"\s{2,}", prefix.strip()) if prefix.strip() else []
        leases.append(
            {
                "ip": ip,
                "mac": mac,
                "hostname": parts[0] if len(parts) >= 1 else "",
                "vci": parts[1] if len(parts) >= 2 else "",
            }
        )
    return leases


def parse_fortigate_arp(raw: str) -> dict[str, dict[str, Any]]:
    arps: dict[str, dict[str, Any]] = {}
    for line in raw.splitlines():
        m = re.match(r"^(\d+\.\d+\.\d+\.\d+)\s+(\d+)\s+([0-9a-f:]{17})\s+(\S+)", line, re.I)
        if m and m.group(4).lower() == "lan":
            mac = normalize_mac(m.group(3))
            if mac:
                arps[mac] = {"ip": m.group(1), "age": int(m.group(2))}
    return arps


def parse_fortigate_reserved(raw: str) -> dict[str, dict[str, str]]:
    reserved: dict[str, dict[str, str]] = {}
    cur_ip = cur_mac = cur_desc = None
    for line in raw.splitlines():
        s = line.strip()
        if s.startswith("set ip "):
            cur_ip = s.split()[2]
        elif s.startswith("set mac "):
            cur_mac = normalize_mac(s.split()[2])
        elif s.startswith("set description "):
            cur_desc = s.split('"', 2)[1] if '"' in s else s.split()[-1]
        elif s == "next":
            if cur_ip and cur_mac:
                reserved[cur_mac] = {"ip": cur_ip, "desc": cur_desc or ""}
            cur_ip = cur_mac = cur_desc = None
    return reserved


def fetch_lvdun_snapshot() -> dict[str, Any]:
    # Pure ASCII script to avoid PowerShell encoding quirks
    ps_script = r'''
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$d0=(Get-ChildItem D:\ -Dir|?{Test-Path "$($_.FullName)\soft\LeaderEIS"}|select -First 1).FullName
$sv=(Get-ChildItem "$d0\soft\LeaderEIS" -Dir|?{Test-Path "$($_.FullName)\LdFileEngine.exe"}|select -First 1).FullName
$en=(Get-ChildItem $sv -Dir|?{Test-Path "$($_.FullName)\LdServer.exe"}|select -First 1).FullName
$dc=(Get-ChildItem $sv -Dir|?{Test-Path "$($_.FullName)\LdData.exe"}|select -First 1).FullName
$rp="$en\Repository\2001-01-01"
$kp=@(20101,20201,20202,20205,20301,20402,20403,20602,20606,20702,20703,22207,23001,40101,40114)
$hw=@{}
$g=[Text.Encoding]::GetEncoding(936)
foreach($f in (Get-ChildItem "$dc\Repository\2001-01-01\assetinfo" -Filter "assetinfo_*.db")){
 if($f.BaseName -match '(\d+)'){
  $cid=$Matches[1];$b=[IO.File]::ReadAllBytes($f.FullName);$bag=@{}
  for($i=0;$i -lt [int]($b.Length/124);$i++){
   $of=$i*124;if([BitConverter]::ToInt32($b,$of+4) -ne 0){continue}
   $pi=[BitConverter]::ToInt32($b,$of+12);if($kp -notcontains $pi){continue}
   $rn=[BitConverter]::ToInt32($b,$of+20);$q=$of+24;$l=0;while($l-lt 100-and $b[$q+$l]-ne 0){$l++}
   $v=$g.GetString($b,$q,$l).Trim();if(-not $v){continue}
   $k="$pi";if(-not $bag.ContainsKey($k)){$bag[$k]=[Collections.Generic.List[object]]::new()}
   $bag[$k].Add(@{r=$rn;v=$v})
  }
  $hw[$cid]=$bag
 }
}
@{
  gr=[Convert]::ToBase64String([IO.File]::ReadAllBytes("$rp\GroupInfo.db"))
  cp=[Convert]::ToBase64String([IO.File]::ReadAllBytes("$rp\ComputerInfo.db"))
  cl=[Convert]::ToBase64String([IO.File]::ReadAllBytes("$rp\Computer_LastInfo.db"))
  mc=if(Test-Path "$rp\module_computerex.db"){[Convert]::ToBase64String([IO.File]::ReadAllBytes("$rp\module_computerex.db"))}else{""}
  hw=$hw
}|ConvertTo-Json -Depth 6 -Compress
'''
    b64 = base64.b64encode(ps_script.encode("utf-16le")).decode("ascii")
    proc = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=12", LVDUN_HOST, f"powershell -NoProfile -EncodedCommand {b64}"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0 or "{" not in proc.stdout:
        raise RuntimeError(f"采集绿盾服务器失败 (exit={proc.returncode}): {proc.stderr[:300]}")
    payload = json.loads(proc.stdout[proc.stdout.find("{") :])
    groups = decode_trdb(
        base64.b64decode(payload["gr"]),
        [("id", 1, 4), ("name", 3, 32), (None, 3, 40), ("pid", 1, 4), (None, 1, 4), (None, 1, 4)],
    )
    comps = decode_trdb(
        base64.b64decode(payload["cp"]),
        [
            ("id", 1, 4),
            ("name", 3, 32),
            ("ip", 3, 15),
            ("mac", 3, 12),
            ("uid", 3, 50),
            (None, 3, 50),
            (None, 1, 4),
            ("nick", 3, 50),
            ("ver", 3, 16),
            (None, 1, 4),
            (None, 1, 4),
            (None, 3, 50),
            ("type", 1, 4),
            ("gid", 1, 4),
            ("utype", 1, 4),
            (None, 1, 4),
        ],
    )
    clast = decode_trdb(
        base64.b64decode(payload["cl"]),
        [("id", 1, 4), ("lot", 3, 20), (None, 3, 200), (None, 1, 4)],
    )
    mce = (
        decode_trdb(
            base64.b64decode(payload["mc"]),
            [("id", 1, 4), ("ld", 1, 4), ("dk", 1, 4), ("au", 1, 4)],
        )
        if payload.get("mc")
        else []
    )
    return {"groups": groups, "comps": comps, "clast": clast, "mce": mce, "hw": payload["hw"]}


def fetch_fortigate_snapshot() -> dict[str, Any]:
    def run_fg(cmd: str) -> str:
        proc = subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", FORTIGATE_HOST, cmd],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if proc.returncode != 0 and not proc.stdout:
            raise RuntimeError(f"采集防火墙失败 ({cmd}): {proc.stderr[:200]}")
        return proc.stdout

    return {
        "leases": parse_fortigate_leases(run_fg("execute dhcp lease-list")),
        "arps": parse_fortigate_arp(run_fg("get system arp")),
        "reserved": parse_fortigate_reserved(run_fg("show system dhcp server")),
    }


def probe_server_hardware(spec: dict[str, Any]) -> dict[str, str]:
    ssh_target = spec.get("ssh")
    if not ssh_target:
        return {}
    if spec.get("os_kind") == "linux":
        cmd = (
            "python3 -c 'import json,platform,shutil; "
            "cpu=next((l.split(\":\",1)[1].strip() for l in open(\"/proc/cpuinfo\") if \"model name\" in l),\"\"); "
            "mem=next((round(int(l.split()[1])/1024/1024) for l in open(\"/proc/meminfo\") if \"MemTotal\" in l),0); "
            "disk=round(shutil.disk_usage(\"/\").total/(1024**3)); "
            "print(json.dumps({\"os\":platform.platform(),\"cpu\":cpu,\"mem\":f\"{mem}GB\" if mem else \"\",\"disk\":f\"{disk}GB\" if disk else \"\"}))' 2>/dev/null || uname -sr"
        )
        proc = subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", ssh_target, cmd],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if proc.returncode == 0 and "{" in proc.stdout:
            try:
                data = json.loads(proc.stdout[proc.stdout.find("{") :])
                return {
                    "os_version": clean_os(data.get("os", "")),
                    "cpu_spec": clean_cpu(data.get("cpu", "")),
                    "memory_spec": str(data.get("mem", "")),
                    "disk_spec": str(data.get("disk", "")),
                }
            except Exception:
                return {}
        return {}

    ps = r'''
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$os=(Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption
if(-not $os){$os=(Get-WmiObject Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption}
$cs=Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
if(-not $cs){$cs=Get-WmiObject Win32_ComputerSystem -ErrorAction SilentlyContinue}
$cpu=(Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue|select -First 1).Name
if(-not $cpu){$cpu=(Get-WmiObject Win32_Processor -ErrorAction SilentlyContinue|select -First 1).Name}
$mem=if($cs.TotalPhysicalMemory){"$([Math]::Round($cs.TotalPhysicalMemory/1GB))GB"}else{""}
$disks=(Get-CimInstance Win32_DiskDrive -ErrorAction SilentlyContinue|ForEach-Object{"$([Math]::Round($_.Size/1GB))GB"}) -join " + "
if(-not $disks){$disks=(Get-WmiObject Win32_DiskDrive -ErrorAction SilentlyContinue|ForEach-Object{"$([Math]::Round($_.Size/1GB))GB"}) -join " + "}
$bios=Get-CimInstance Win32_BIOS -ErrorAction SilentlyContinue
if(-not $bios){$bios=Get-WmiObject Win32_BIOS -ErrorAction SilentlyContinue}
@{os=$os;vendor=$cs.Manufacturer;model=$cs.Model;cpu=$cpu;mem=$mem;disk=$disks;sn=$bios.SerialNumber}|ConvertTo-Json -Compress
'''
    b64 = base64.b64encode(ps.encode("utf-16le")).decode("ascii")
    proc = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=6", ssh_target, f"powershell -NoProfile -EncodedCommand {b64}"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0 or "{" not in proc.stdout:
        return {}
    try:
        data = json.loads(proc.stdout[proc.stdout.find("{") :])
        return {
            "os_version": clean_os(data.get("os", "")),
            "brand": clean_vendor_brand(data.get("vendor", "")),
            "model": clean_model(data.get("model", ""), ""),
            "cpu_spec": clean_cpu(data.get("cpu", "")),
            "memory_spec": str(data.get("mem", "") or ""),
            "disk_spec": str(data.get("disk", "") or "")[:64],
            "serial_no": clean_serial(data.get("sn", ""), ""),
        }
    except Exception:
        return {}


def _hw_list(bag: dict[str, Any], prop_id: int) -> list[tuple[int, str]]:
    items = bag.get(str(prop_id))
    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list):
        return []
    return [(int(x.get("r", 0)), str(x.get("v", "")).strip()) for x in items if str(x.get("v", "")).strip()]


def _hw_first(bag: dict[str, Any], prop_id: int) -> str:
    vals = _hw_list(bag, prop_id)
    return vals[0][1] if vals else ""


def build_asset_records(
    lvdun: dict[str, Any],
    fortigate: dict[str, Any],
    wx_employees: list[dict[str, Any]],
    *,
    active_days: int = 90,
    only_authorized: bool = True,
    include_unmanaged_fg: bool = False,
    include_servers: bool = True,
    server_hw_map: dict[str, dict[str, str]] | None = None,
    now: datetime | None = None,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    now = now or datetime.now()
    stats: dict[str, int] = defaultdict(int)
    server_hw_map = server_hw_map or {}

    wx_active_by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for emp in wx_employees:
        if emp.get("status") == "active" and emp.get("name"):
            wx_active_by_name[str(emp["name"]).strip()].append(emp)

    groups = {g["id"]: g for g in lvdun.get("groups", [])}
    clast = {c["id"]: c.get("lot", "") for c in lvdun.get("clast", [])}
    mce_by_id = {int(r["id"]): r for r in lvdun.get("mce", []) if r.get("id") is not None}
    hw_map = lvdun.get("hw", {})

    arps: dict[str, dict[str, Any]] = fortigate.get("arps", {})
    leases: list[dict[str, str]] = fortigate.get("leases", [])
    reserved: dict[str, dict[str, str]] = fortigate.get("reserved", {})

    lease_by_mac = {l["mac"]: l for l in leases if l.get("mac")}
    arp_mac_by_ip = {info["ip"]: mac for mac, info in arps.items() if is_valid_lan_ip(info.get("ip"))}

    # Step 1: filter & deduplicate LvDun computers by primary MAC
    best_by_mac: dict[str, dict[str, Any]] = {}
    for comp in lvdun.get("comps", []):
        comp_name = str(comp.get("name", "")).strip()
        if comp_name.upper() in IGNORED_LVDUN_NAMES:
            stats["skipped_ignored_device"] += 1
            continue

        if only_authorized and mce_by_id:
            mod = mce_by_id.get(int(comp["id"]))
            if not mod or (not mod.get("ld") and not mod.get("dk") and not mod.get("au")):
                stats["skipped_unauthorized"] += 1
                continue

        mac = normalize_mac(comp.get("mac"))
        if not mac:
            stats["skipped_empty_mac"] += 1
            continue

        lot = str(clast.get(comp["id"], "")).strip()
        is_arp_online = mac in arps or mac in lease_by_mac
        days_offline: int | None = None
        if lot:
            try:
                days_offline = (now - datetime.strptime(lot[:19], "%Y-%m-%d %H:%M:%S")).days
            except ValueError:
                days_offline = None

        if active_days > 0:
            if days_offline is None:
                stats["skipped_no_last_online"] += 1
                continue
            if days_offline > active_days:
                stats["skipped_inactive_over_90d"] += 1
                continue

        prev = best_by_mac.get(mac)
        if prev is not None:
            stats["deduped_duplicate_mac"] += 1
            prev_lot = str(prev.get("_lot") or "")
            if (lot, comp["id"]) <= (prev_lot, prev["id"]):
                continue

        comp_copy = dict(comp)
        comp_copy["_mac"] = mac
        comp_copy["_lot"] = lot
        best_by_mac[mac] = comp_copy

    records: list[dict[str, Any]] = []
    known_macs: set[str] = set()
    known_ips: set[str] = set()

    for mac, comp in sorted(best_by_mac.items(), key=lambda kv: kv[1]["id"]):
        cid = str(comp["id"])
        bag = hw_map.get(cid, {})
        all_macs = {mac}
        for _, mval in _hw_list(bag, 20402):
            nm = normalize_mac(mval)
            if nm:
                all_macs.add(nm)
        known_macs.update(all_macs)

        # Resolve live IP from FortiGate ARP/DHCP first, fallback to LvDun IP
        live_ip = ""
        for m in all_macs:
            if m in arps and is_valid_lan_ip(arps[m]["ip"]):
                live_ip = arps[m]["ip"]
                break
            if m in lease_by_mac and is_valid_lan_ip(lease_by_mac[m]["ip"]):
                live_ip = lease_by_mac[m]["ip"]
                break
        if not live_ip and is_valid_lan_ip(comp.get("ip")):
            live_ip = str(comp["ip"]).strip()
        if live_ip:
            known_ips.add(live_ip)

        os_version = clean_os(_hw_first(bag, 40101))
        brand = clean_vendor_brand(_hw_first(bag, 20202))
        model = clean_model(_hw_first(bag, 40114), _hw_first(bag, 20205))
        serial_no = clean_serial(_hw_first(bag, 20301), _hw_first(bag, 20201))
        cpu_spec = clean_cpu(_hw_first(bag, 20101))
        memory_spec = clean_memory(_hw_first(bag, 20606), [v for _, v in _hw_list(bag, 20602)])
        disk_spec = format_disk_summary(_hw_list(bag, 20702), _hw_list(bag, 20703))
        device_type = infer_device_type(
            _hw_first(bag, 23001),
            os_version,
            str(comp.get("name", "")),
            str(comp.get("nick", "")),
            model,
        )

        # Department & wxuser alignment
        grp = groups.get(comp.get("gid"), {})
        parent_grp = groups.get(grp.get("pid"), {})
        dept_from_lv = clean_dept(grp.get("name", ""), parent_grp.get("name", ""))

        raw_nick = str(comp.get("nick", "")).strip()
        person_cand = extract_person_candidate(raw_nick)
        wx_matches = wx_active_by_name.get(person_cand, []) if person_cand else []
        user_userid = ""
        user_name = ""
        use_dept = dept_from_lv

        if len(wx_matches) == 1:
            emp = wx_matches[0]
            user_userid = str(emp["userid"])
            user_name = str(emp["name"])
            if emp.get("dept"):
                use_dept = normalize_dept(emp["dept"])
            stats["wx_matched"] += 1
        elif person_cand:
            user_name = person_cand
        elif raw_nick and not re.match(r"^(PC-|MS-|WIN-|DESKTOP-|LAPTOP-|\d{6,})", raw_nick, re.I):
            # Preserve meaningful admin-assigned role/device labels (e.g. 扫描仪, 焊线-推拉力) except dedicated servers
            if device_type != "server":
                user_name = raw_nick[:64]

        # Asset name & location hints
        location = ""
        if device_type == "server" and ERP_SERVER_IP and live_ip == ERP_SERVER_IP:
            asset_name = "ERP服务器"
            use_dept = use_dept or "总经办"
            location = "机房"
        elif any(k in raw_nick.lower() for k in SPECIAL_DEVICE_KEYWORDS) and not person_cand:
            asset_name = raw_nick[:120]
            if "机房" in raw_nick or device_type == "server":
                location = "机房"
            elif "门岗" in raw_nick:
                location = "D栋门岗"
            elif "培训室" in raw_nick:
                location = "培训室"
            elif "前台" in raw_nick:
                location = "前台"
        elif device_type == "laptop":
            asset_name = "办公笔记本"
        elif device_type == "server":
            asset_name = "业务服务器"
            location = "机房"
        else:
            asset_name = "办公台式机"

        records.append(
            {
                "asset_name": asset_name[:120],
                "device_type": device_type,
                "brand": brand,
                "model": model,
                "serial_no": serial_no,
                "use_dept": use_dept[:100],
                "user_userid": user_userid[:64],
                "user_name": user_name[:64],
                "location": location,
                "status": "in_use",
                "cpu_spec": cpu_spec,
                "memory_spec": memory_spec,
                "disk_spec": disk_spec,
                "os_version": os_version,
                "ip_address": live_ip[:64],
                "mac_address": mac,
                "lvdun_id": int(comp["id"]) if comp.get("id") else None,
                "remark": "",
                "_source": "lvdun",
            }
        )
        stats["from_lvdun"] += 1

    # Step 2: FortiGate MSFT 5.0 Windows PCs not in LvDun (opt-in only)
    if include_unmanaged_fg:
        for lease in leases:
            mac = lease.get("mac", "")
            ip = lease.get("ip", "")
            hostname = lease.get("hostname", "").strip()
            vci = lease.get("vci", "").upper()
            if not mac or mac in known_macs or (ip and ip in known_ips):
                continue
            if "MSFT" not in vci:
                continue
            if hostname and NON_PC_HOST_PATTERNS.match(hostname):
                stats["skipped_fg_non_pc"] += 1
                continue

            # Try matching hostname to wxuser by pinyin or reserved description
            res_desc = reserved.get(mac, {}).get("desc", "").strip()
            user_userid = ""
            user_name = res_desc if res_desc in wx_active_by_name else ""
            use_dept = ""
            if user_name:
                emp = wx_active_by_name[user_name][0]
                user_userid = emp["userid"]
                use_dept = normalize_dept(emp.get("dept", ""))
            elif hostname:
                # Try exact userid match (case-insensitive)
                for emp in wx_employees:
                    if emp.get("status") == "active" and str(emp.get("userid", "")).lower() == hostname.lower():
                        user_userid = emp["userid"]
                        user_name = emp["name"]
                        use_dept = normalize_dept(emp.get("dept", ""))
                        break

            known_macs.add(mac)
            if ip:
                known_ips.add(ip)

            is_laptop = any(k in hostname.lower() for k in ("laptop", "book", "thinkpad", "mac"))
            records.append(
                {
                    "asset_name": "办公笔记本" if is_laptop else "办公台式机",
                    "device_type": "laptop" if is_laptop else "desktop",
                    "brand": "",
                    "model": "",
                    "serial_no": "",
                    "use_dept": use_dept[:100],
                    "user_userid": user_userid[:64],
                    "user_name": user_name[:64],
                    "location": "",
                    "status": "in_use",
                    "cpu_spec": "",
                    "memory_spec": "",
                    "disk_spec": "",
                    "os_version": "Windows",
                    "ip_address": ip[:64],
                    "mac_address": mac,
                    "remark": f"主机名: {hostname or '未知'} | 来源: 防火墙DHCP(未装绿盾)"[:500],
                    "_source": "fortigate_pc",
                }
            )
            stats["from_fortigate_pc"] += 1

    # Step 3: Core static servers not already in LvDun
    if include_servers:
        for spec in CORE_SERVERS:
            ip = spec["ip"]
            mac = arp_mac_by_ip.get(ip, "")
            if not mac:
                for rm, rinfo in reserved.items():
                    if rinfo.get("ip") == ip:
                        mac = rm
                        break
            if (mac and mac in known_macs) or ip in known_ips:
                continue
            hw = server_hw_map.get(ip, {})
            if mac:
                known_macs.add(mac)
            known_ips.add(ip)
            records.append(
                {
                    "asset_name": spec["asset_name"],
                    "device_type": "server",
                    "brand": hw.get("brand", ""),
                    "model": hw.get("model", ""),
                    "serial_no": hw.get("serial_no", ""),
                    "use_dept": spec["use_dept"],
                    "user_userid": "",
                    "user_name": "",
                    "location": spec["location"],
                    "status": "in_use",
                    "cpu_spec": hw.get("cpu_spec", ""),
                    "memory_spec": hw.get("memory_spec", ""),
                    "disk_spec": hw.get("disk_spec", ""),
                    "os_version": hw.get("os_version", ""),
                    "ip_address": ip,
                    "mac_address": mac,
                    "remark": f"{spec['remark']} | 来源: 防火墙静态ARP+SSH"[:500],
                    "_source": "core_server",
                }
            )
            stats["from_core_server"] += 1

    return records, dict(stats)


def next_asset_no(seq: int) -> str:
    return f"TK-PC-{seq:04d}"


def sync_to_mysql(records: list[dict[str, Any]], apply: bool) -> dict[str, int]:
    pymysql = _load_pymysql()
    config = get_mysql_config()
    conn = pymysql.connect(**config, charset="utf8mb4", autocommit=False)
    inserted = 0
    updated = 0
    unchanged = 0
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            cur.execute("SELECT id, asset_no, mac_address, ip_address, lvdun_id, use_dept, user_userid, user_name, cpu_spec, memory_spec, disk_spec, os_version, brand, model, serial_no FROM tk_it_asset")
            existing_rows = cur.fetchall()
            by_mac: dict[str, dict[str, Any]] = {}
            by_ip: dict[str, dict[str, Any]] = {}
            max_seq = 0
            for row in existing_rows:
                nm = normalize_mac(row.get("mac_address"))
                if nm:
                    by_mac[nm] = row
                if row.get("ip_address"):
                    by_ip[str(row["ip_address"]).strip()] = row
                m = re.match(r"^TK-PC-(\d+)$", str(row.get("asset_no") or ""))
                if m:
                    max_seq = max(max_seq, int(m.group(1)))

            for rec in records:
                mac = rec["mac_address"]
                match = by_mac.get(mac) if mac else by_ip.get(rec["ip_address"])
                if match:
                    sets: list[str] = []
                    params: list[Any] = []
                    # Refresh live network & hardware fields if incoming value is non-empty and changed
                    for col in ("ip_address", "mac_address", "lvdun_id", "brand", "model", "serial_no", "cpu_spec", "memory_spec", "disk_spec", "os_version"):
                        new_val = rec.get(col) or None
                        old_val = match.get(col) or None
                        if new_val and new_val != old_val:
                            sets.append(f"{col} = %s")
                            params.append(new_val)
                    # Backfill empty owner/dept without overwriting manual edits
                    for col in ("use_dept", "user_userid", "user_name"):
                        new_val = rec.get(col) or None
                        old_val = match.get(col) or None
                        if new_val and not old_val:
                            sets.append(f"{col} = %s")
                            params.append(new_val)

                    if sets:
                        updated += 1
                        if apply:
                            sets.append("updated_by_name = %s")
                            params.append(OPERATOR_NAME)
                            params.append(match["id"])
                            cur.execute(f"UPDATE tk_it_asset SET {', '.join(sets)} WHERE id = %s", params)
                    else:
                        unchanged += 1
                else:
                    inserted += 1
                    max_seq += 1
                    asset_no = next_asset_no(max_seq)
                    rec["_assigned_no"] = asset_no
                    if apply:
                        cur.execute(
                            """
                            INSERT INTO tk_it_asset (
                                asset_no, asset_name, device_type, brand, model, serial_no,
                                use_dept, user_userid, user_name, location, status,
                                cpu_spec, memory_spec, disk_spec, os_version, ip_address, mac_address, lvdun_id,
                                remark, created_by_name, updated_by_name
                            ) VALUES (
                                %s, %s, %s, %s, %s, %s,
                                %s, %s, %s, %s, %s,
                                %s, %s, %s, %s, %s, %s, %s,
                                %s, %s, %s
                            )
                            """,
                            (
                                asset_no,
                                rec["asset_name"],
                                rec["device_type"],
                                rec["brand"] or None,
                                rec["model"] or None,
                                rec["serial_no"] or None,
                                rec["use_dept"] or None,
                                rec["user_userid"] or None,
                                rec["user_name"] or None,
                                rec["location"] or None,
                                rec["status"],
                                rec["cpu_spec"] or None,
                                rec["memory_spec"] or None,
                                rec["disk_spec"] or None,
                                rec["os_version"] or None,
                                rec["ip_address"] or None,
                                rec["mac_address"] or None,
                                rec.get("lvdun_id") or None,
                                rec["remark"] or None,
                                OPERATOR_NAME,
                                OPERATOR_NAME,
                            ),
                        )
        if apply:
            conn.commit()
        else:
            conn.rollback()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    return {"inserted": inserted, "updated": updated, "unchanged": unchanged}


def fetch_wx_employees() -> list[dict[str, Any]]:
    pymysql = _load_pymysql()
    config = get_mysql_config()
    conn = pymysql.connect(**config, charset="utf8mb4")
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            cur.execute("SELECT userid, name, dept, status FROM wxuser")
            return list(cur.fetchall())
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="同步绿盾与防火墙电脑资产到 tk_it_asset")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--dry-run", action="store_true", help="仅预览变更，不写数据库（默认）")
    group.add_argument("--apply", action="store_true", help="执行事务写入 MySQL")
    parser.add_argument("--active-days", type=int, default=90, help="绿盾最近活跃天数阈值（默认 90，0 表示不过滤）")
    parser.add_argument("--include-unauthorized", action="store_true", help="同时包含绿盾中未授权/已禁用的终端")
    parser.add_argument("--include-unmanaged", action="store_true", help="同时包含仅在防火墙 DHCP 出现、未装绿盾的终端")
    parser.add_argument("--no-servers", action="store_true", help="不自动补入核心静态服务器")
    args = parser.parse_args()

    apply_mode = bool(args.apply)
    print(f"[1/4] 采集绿盾 ({LVDUN_HOST})...")
    lvdun = fetch_lvdun_snapshot()
    print(f"[2/4] 采集防火墙 ({FORTIGATE_HOST})...")
    fortigate = fetch_fortigate_snapshot()

    server_hw: dict[str, dict[str, str]] = {}
    if not args.no_servers:
        print("[3/4] 探测核心服务器配置 (SSH 只读)...")
        for spec in CORE_SERVERS:
            if spec.get("ssh"):
                server_hw[spec["ip"]] = probe_server_hardware(spec)
    else:
        print("[3/4] 跳过核心服务器补采 (--no-servers)")

    wx_employees = fetch_wx_employees()
    records, stats = build_asset_records(
        lvdun,
        fortigate,
        wx_employees,
        active_days=args.active_days,
        only_authorized=not args.include_unauthorized,
        include_unmanaged_fg=bool(args.include_unmanaged),
        include_servers=not args.no_servers,
        server_hw_map=server_hw,
    )

    print(f"[4/4] 计划结果 ({'APPLY 写入模式' if apply_mode else 'DRY-RUN 预览模式'}):")
    print("  采集与清洗统计:", json.dumps(stats, ensure_ascii=False))
    sync_stats = sync_to_mysql(records, apply=apply_mode)
    print("  数据库同步统计:", json.dumps(sync_stats, ensure_ascii=False))

    if not apply_mode:
        print("\n--- 预览前 20 条记录 ---")
        for rec in records[:20]:
            print(
                f"  {rec.get('_assigned_no', '(update)'):10s} | {rec['device_type']:7s} | {rec['asset_name']:14s} | "
                f"{rec['use_dept'] or '-':10s} | {rec['user_name'] or '-':8s} | {rec['ip_address'] or '-':15s} | "
                f"{rec['brand']} {rec['model']} | {rec['cpu_spec'][:26]}"
            )
        non_lvdun = [r for r in records if r["_source"] != "lvdun"]
        if non_lvdun:
            print(f"\n--- 防火墙补漏与核心服务器 ({len(non_lvdun)} 条) ---")
            for rec in non_lvdun:
                print(
                    f"  {rec.get('_assigned_no', '(update)'):10s} | {rec['device_type']:7s} | {rec['asset_name']:18s} | "
                    f"{rec['ip_address']:15s} | {rec['mac_address'] or '-':17s} | {rec['os_version']} | {rec['cpu_spec']}"
                )


if __name__ == "__main__":
    main()
