import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { parseCardText } from '../../app/packages/shared/customerCard.js'

// Keep this script inline so Nitro's deployment bundle includes the OCR bridge.
const script = `param([string]$ImagePath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\u00601' } | Select-Object -First 1
function Await($op, $type) { $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $task.GetAwaiter().GetResult() }
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try {
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  try {
    $null = [Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
    function ReadText([string]$tag) {
      $language = New-Object Windows.Globalization.Language($tag)
      $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
      if ($null -eq $engine) { return '' }
      $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
      return (($result.Lines | ForEach-Object { $_.Text }) -join "\u0060n")
    }
    $chinese = ReadText 'zh-Hans-CN'
    $english = ReadText 'en-US'
    @{chinese=$chinese;english=$english} | ConvertTo-Json -Compress
  } finally { $bitmap.Dispose() }
} finally { $stream.Dispose() }
`

export async function recognizeCustomerCard(input: Buffer) {
  if (process.platform !== 'win32') throw new Error('当前服务器不支持 Windows 名片识别')
  const dir = await mkdtemp(join(tmpdir(), 'ctk-card-'))
  try {
    const image = join(dir, 'card.png'), bridge = join(dir, 'ocr.ps1')
    await writeFile(image, await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize(2400, 2400, { fit: 'inside', withoutEnlargement: true }).png().toBuffer())
    await writeFile(bridge, '\ufeff' + script, 'utf8')
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', bridge, image], { timeout: 45_000, maxBuffer: 128 * 1024, windowsHide: true })
    const recognized = JSON.parse(stdout.trim())
    const chinese = String(recognized.chinese || ''), english = String(recognized.english || '')
    const text = (chinese.match(/[\u4e00-\u9fff]/g)?.length || 0) >= 4 ? chinese : english || chinese
    if (!text) throw new Error('未识别到文字，请重新拍摄清晰照片')
    const fields = parseCardText(english), chineseFields = parseCardText(chinese)
    for (const [key, value] of Object.entries(chineseFields)) {
      if (!fields[key] || (value.match(/[\u4e00-\u9fff]/g)?.length || 0) >= 2) fields[key] = value
    }
    return { text, fields }
  } finally { await rm(dir, { recursive: true, force: true }) }
}
