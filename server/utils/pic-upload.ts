import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_THUMBNAIL_BYTES = 500 * 1024
const THUMBNAIL_SIZES = [1280, 960, 720]
const IMAGE_EXTENSIONS = new Set(['bmp', 'gif', 'jpg', 'jpeg', 'png'])

export class PicUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PicUploadError'
  }
}

function normalizeFilename(filename: string): string {
  return String(filename || 'image').replace(/\\/g, '/')
}

function safeStem(filename: string): string {
  const normalized = normalizeFilename(filename)
  const extension = extname(normalized)
  const stem = basename(normalized, extension)
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^[._-]+|[._-]+$/g, '')

  return stem || 'image'
}

function extensionOf(filename: string): string {
  return extname(normalizeFilename(filename)).slice(1).toLowerCase()
}

function datePath(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
}

async function thumbnailBuffer(source: Buffer, extension: string): Promise<Buffer> {
  let output = source

  for (const maxSize of THUMBNAIL_SIZES) {
    let image = sharp(source)
      .rotate()
      .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })

    switch (extension) {
      case 'jpg':
      case 'jpeg':
        image = image.jpeg({ quality: 82 })
        break
      case 'png':
        image = image.png({ compressionLevel: 9, adaptiveFiltering: true })
        break
      case 'gif':
        image = image.gif()
        break
      case 'bmp':
        // sharp can read the common upload formats but does not emit BMP.
        // Keep the original extension/path contract for BMP uploads.
        return source
      default:
        throw new PicUploadError('仅支持 BMP、GIF、JPG、JPEG、PNG 图片')
    }

    output = await image.toBuffer()
    if (output.length <= MAX_THUMBNAIL_BYTES) break
  }

  return output
}

export interface SavedPicUpload {
  originalPath: string
  thumbnailPath: string
  publicPath: string
}

export async function savePicUpload(
  file: { data: Uint8Array; filename?: string },
  profilePath: string,
  now = new Date(),
): Promise<SavedPicUpload> {
  const data = Buffer.from(file.data)
  if (!data.length) throw new PicUploadError('上传图片为空，请重新选择')
  if (data.length > MAX_UPLOAD_BYTES) throw new PicUploadError('上传图片不能超过 10MB')

  const extension = extensionOf(file.filename || '')
  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw new PicUploadError('仅支持 BMP、GIF、JPG、JPEG、PNG 图片')
  }

  const folder = datePath(now)
  const filename = `${safeStem(file.filename || 'image')}_${randomUUID()}.${extension}`
  const baseDirectory = join(profilePath, 'dkPic', folder)
  const thumbnailDirectory = join(profilePath, 'dkPic_zip', folder)
  const originalPath = join(baseDirectory, filename)
  const thumbnailPath = join(thumbnailDirectory, filename)

  await mkdir(baseDirectory, { recursive: true })
  await mkdir(thumbnailDirectory, { recursive: true })

  try {
    await writeFile(originalPath, data, { flag: 'wx' })
    const thumbnail = await thumbnailBuffer(data, extension)
    await writeFile(thumbnailPath, thumbnail, { flag: 'wx' })
  } catch (error) {
    await Promise.allSettled([unlink(originalPath), unlink(thumbnailPath)])
    if (error instanceof PicUploadError) throw error
    throw new PicUploadError('图片处理失败，请确认文件是有效的图片')
  }

  return {
    originalPath,
    thumbnailPath,
    publicPath: `/profile/dkPic_zip/${folder}/${filename}`,
  }
}
