import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

/** Every user-facing failure is a stable code plus one human sentence and one next action. */
export type PdfTableErrorCode =
  | 'E_PDF_PATH_INVALID'
  | 'E_PDF_NOT_FOUND'
  | 'E_PDF_EMPTY'
  | 'E_PDF_CORRUPT'
  | 'E_PDF_ENCRYPTED'
  | 'E_PDF_NO_TEXT_LAYER'
  | 'E_PDF_PAGE_RANGE'
  | 'E_PDF_PATH_NOT_ALLOWED'
  | 'E_PDF_EXPORT_FAILED'

interface HumanMessage {
  text: string
  next: string
}

const PDF_HUMAN: Record<PdfTableErrorCode, HumanMessage> = {
  E_PDF_PATH_INVALID: {
    text: 'PDF 路径无效：需要传一个存在的文件，而不是目录或空字符串',
    next: '传一个可读的 .pdf 文件绝对路径，例如 /data/report.pdf',
  },
  E_PDF_NOT_FOUND: {
    text: '找不到这个 PDF 文件',
    next: '确认路径拼写和大小写正确，并且当前用户能读取该文件',
  },
  E_PDF_EMPTY: {
    text: '这个 PDF 是空文件，没有可读内容',
    next: '换一个非空、未损坏的 PDF；扫描件请先 OCR',
  },
  E_PDF_CORRUPT: {
    text: '这个 PDF 打不开，文件可能损坏或被截断',
    next: '先用 PDF 阅读器确认文件能正常打开，再重新导出一次',
  },
  E_PDF_ENCRYPTED: {
    text: '这个 PDF 有密码保护，读不到文本层',
    next: '先用拥有者密码导出无密码副本，再重新运行',
  },
  E_PDF_NO_TEXT_LAYER: {
    text: '这份 PDF 没有文本层；这是扫描件，请先 OCR',
    next: '先用 OCR 工具生成带文本层的 PDF，再运行 pdf.inspect 或 pdf.tables',
  },
  E_PDF_PAGE_RANGE: {
    text: 'pages 里的页码超出范围或不是正整数',
    next: '页码从 1 开始，按 pdf.inspect 返回的 pages 传入',
  },
  E_PDF_PATH_NOT_ALLOWED: {
    text: '导出路径越过了导出目录',
    next: '只传一个文件名，不要带 ../、目录分隔符或符号链接',
  },
  E_PDF_EXPORT_FAILED: {
    text: 'CSV 没写出去',
    next: '确认 $DSH_HOME/dsh-pdf-table 指向可写目录后重试',
  },
}

/** `human sentence（E_CODE）｜Next: one action｜detail` — the only text shown to end users. */
export function pdfErrorMessage(code: PdfTableErrorCode, detail?: string): string {
  const human = PDF_HUMAN[code]
  return `${human.text}（${code}）｜下一步：${human.next}${detail ? `｜细节：${detail}` : ''}`
}

export class PdfTableError extends Error {
  readonly code: PdfTableErrorCode
  constructor(code: PdfTableErrorCode, detail?: string) {
    super(pdfErrorMessage(code, detail))
    this.name = 'PdfTableError'
    this.code = code
  }
}

/** One non-whitespace text item with PDF user-space coordinates (origin bottom-left). */
export interface PdfTextItem {
  text: string
  x: number
  y: number
  width: number
  height: number
}

export interface PdfTable {
  page: number
  rows: string[][]
}

export interface PdfInspection {
  pages: number
  chars_per_page: number[]
  total_chars: number
  has_text_layer: boolean
  pages_without_text: number[]
}

interface PdfPageLike {
  getTextContent(): Promise<{ items: unknown[] }>
  cleanup?(): void
}

interface PdfDocumentLike {
  readonly numPages: number
  getPage(pageNumber: number): Promise<PdfPageLike>
  destroy(): Promise<void>
}

interface PdfJsModule {
  getDocument(params: Record<string, unknown>): { promise: Promise<PdfDocumentLike> }
}

/** An open PDF document. Call `close()` in a `finally` block. */
export interface PdfHandle {
  readonly numPages: number
  readonly sha256: string
  pageItems(pageNumber: number): Promise<PdfTextItem[]>
  close(): Promise<void>
}

async function readPdfBuffer(filePath: string): Promise<Buffer> {
  if (typeof filePath !== 'string' || filePath.trim() === '') throw new PdfTableError('E_PDF_PATH_INVALID')
  const resolved = path.resolve(filePath)
  let info
  try {
    info = await stat(resolved)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') throw new PdfTableError('E_PDF_NOT_FOUND', resolved)
    throw new PdfTableError('E_PDF_PATH_INVALID', resolved)
  }
  if (!info.isFile()) throw new PdfTableError('E_PDF_PATH_INVALID', resolved)
  if (info.size === 0) throw new PdfTableError('E_PDF_EMPTY', resolved)
  try {
    return await readFile(resolved)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new PdfTableError('E_PDF_NOT_FOUND', resolved)
    throw new PdfTableError('E_PDF_PATH_INVALID', resolved)
  }
}

function loadFailure(error: unknown): PdfTableError {
  const name = (error as { name?: unknown })?.name
  const message = error instanceof Error ? error.message : String(error)
  if (name === 'PasswordException' || /password/i.test(message)) return new PdfTableError('E_PDF_ENCRYPTED')
  return new PdfTableError('E_PDF_CORRUPT', message.slice(0, 160))
}

function toTextItem(raw: unknown): PdfTextItem | undefined {
  const item = raw as { str?: unknown; transform?: unknown; width?: unknown; height?: unknown }
  if (typeof item.str !== 'string' || item.str.trim() === '') return undefined
  const transform = Array.isArray(item.transform) ? item.transform : []
  const x = Number(transform[4])
  const y = Number(transform[5])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined
  const width = Number(item.width)
  const height = Number(item.height)
  return {
    text: item.str,
    x,
    y,
    width: Number.isFinite(width) && width > 0 ? width : 0,
    height: Number.isFinite(height) && height > 0 ? height : 0,
  }
}

/**
 * Open a text-based PDF and expose its page text items.
 * The PDF is parsed locally with pdfjs-dist; no network request is made.
 */
export async function openPdf(filePath: string): Promise<PdfHandle> {
  const buffer = await readPdfBuffer(filePath)
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  let pdfjs: PdfJsModule
  try {
    pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsModule
  } catch (error) {
    throw loadFailure(error)
  }
  let doc: PdfDocumentLike
  try {
    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    })
    doc = await task.promise
  } catch (error) {
    throw loadFailure(error)
  }
  if (!Number.isInteger(doc.numPages) || doc.numPages < 1) {
    await doc.destroy().catch(() => undefined)
    throw new PdfTableError('E_PDF_EMPTY', 'PDF 页数为 0')
  }
  return {
    numPages: doc.numPages,
    sha256,
    async pageItems(pageNumber: number): Promise<PdfTextItem[]> {
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > doc.numPages) {
        throw new PdfTableError('E_PDF_PAGE_RANGE', `page ${pageNumber}; pages=${doc.numPages}`)
      }
      let page: PdfPageLike
      try {
        page = await doc.getPage(pageNumber)
      } catch (error) {
        throw loadFailure(error)
      }
      try {
        const content = await page.getTextContent()
        const items: PdfTextItem[] = []
        for (const raw of content.items) {
          const item = toTextItem(raw)
          if (item) items.push(item)
        }
        return items
      } catch (error) {
        throw loadFailure(error)
      } finally {
        try {
          page.cleanup?.()
        } catch {
          // cleanup is best-effort and must never hide a successful extraction
        }
      }
    },
    async close(): Promise<void> {
      await doc.destroy().catch(() => undefined)
    },
  }
}

/** Count visible text characters per page and fail when the selected PDF has no text layer. */
export async function inspectPdf(filePath: string): Promise<PdfInspection> {
  const pdf = await openPdf(filePath)
  try {
    const charsPerPage: number[] = []
    for (let page = 1; page <= pdf.numPages; page += 1) {
      const items = await pdf.pageItems(page)
      charsPerPage.push(items.reduce((total, item) => total + item.text.length, 0))
    }
    const totalChars = charsPerPage.reduce((total, value) => total + value, 0)
    if (totalChars === 0) throw new PdfTableError('E_PDF_NO_TEXT_LAYER', `${pdf.numPages} 页都没有可提取字符`)
    return {
      pages: pdf.numPages,
      chars_per_page: charsPerPage,
      total_chars: totalChars,
      has_text_layer: true,
      pages_without_text: charsPerPage.flatMap((value, index) => (value === 0 ? [index + 1] : [])),
    }
  } finally {
    await pdf.close()
  }
}

/** Validate a 1-based page selection; `undefined` means every page in page order. */
export function normalizePages(pages: number[] | undefined, numPages: number): number[] {
  if (pages === undefined) return Array.from({ length: numPages }, (_, index) => index + 1)
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new PdfTableError('E_PDF_PAGE_RANGE', 'pages 不能为空数组')
  }
  const unique = new Set<number>()
  for (const page of pages) {
    if (!Number.isInteger(page) || page < 1 || page > numPages) {
      throw new PdfTableError('E_PDF_PAGE_RANGE', `page ${page}; pages=${numPages}`)
    }
    unique.add(page)
  }
  return [...unique].sort((a, b) => a - b)
}

const ROW_TOLERANCE = 3
const CELL_GAP = 6
const COLUMN_TOLERANCE = 18

interface Cell {
  x: number
  right: number
  text: string
}

function groupRows(items: readonly PdfTextItem[]): PdfTextItem[][] {
  const sorted = [...items]
    .filter((item) => item.text.trim() !== '')
    .sort((a, b) => (b.y - a.y) || (a.x - b.x))
  const rows: PdfTextItem[][] = []
  let current: PdfTextItem[] = []
  let currentY = 0
  for (const item of sorted) {
    if (current.length === 0) {
      current = [item]
      currentY = item.y
      continue
    }
    if (Math.abs(item.y - currentY) <= ROW_TOLERANCE) {
      current.push(item)
    } else {
      rows.push(current)
      current = [item]
      currentY = item.y
    }
  }
  if (current.length > 0) rows.push(current)
  return rows
}

function groupCells(row: readonly PdfTextItem[]): Cell[] {
  const cells: Cell[] = []
  for (const item of [...row].sort((a, b) => a.x - b.x)) {
    const previous = cells[cells.length - 1]
    const gap = previous ? item.x - previous.right : Number.POSITIVE_INFINITY
    if (previous && gap <= CELL_GAP) {
      const needsSpace = gap > 0.5 && !/\s$/.test(previous.text) && !/^\s/.test(item.text)
      previous.text += `${needsSpace ? ' ' : ''}${item.text}`
      previous.right = Math.max(previous.right, item.x + item.width)
    } else {
      cells.push({ x: item.x, right: item.x + item.width, text: item.text })
    }
  }
  return cells.map((cell) => ({ ...cell, text: cell.text.trim() })).filter((cell) => cell.text !== '')
}

function columnStarts(rows: readonly Cell[][]): number[] {
  const starts = rows.flatMap((row) => row.map((cell) => cell.x)).sort((a, b) => a - b)
  const clusters: number[] = []
  for (const x of starts) {
    const last = clusters[clusters.length - 1]
    if (last === undefined || x - last > COLUMN_TOLERANCE) clusters.push(x)
  }
  return clusters
}

function nearestColumn(clusters: readonly number[], x: number): number {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (const [index, start] of clusters.entries()) {
    const distance = Math.abs(start - x)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  }
  return best
}

/**
 * Cluster page text items into table rows.
 *
 * 1. items sharing the same baseline (within {@link ROW_TOLERANCE}) form a row;
 * 2. within a row, x gaps above {@link CELL_GAP} start a new cell;
 * 3. cell starts across the page are clustered into columns (tolerance
 *    {@link COLUMN_TOLERANCE}); short rows are padded so every row has the same
 *    column count.
 *
 * Rows with a single text block are treated as prose and dropped: they carry no
 * table structure. This is a text-layer heuristic, not a layout analysis engine.
 */
export function extractRows(items: readonly PdfTextItem[]): string[][] {
  const rows = groupRows(items)
  const cellRows = rows
    .map((row) => groupCells(row))
    .filter((cells) => cells.length >= 2)
  if (cellRows.length === 0) return []
  const clusters = columnStarts(cellRows)
  if (clusters.length === 0) return []
  return cellRows.map((cells) => {
    const values = Array.from({ length: clusters.length }, () => '')
    for (const cell of cells) {
      const column = nearestColumn(clusters, cell.x)
      values[column] = values[column] ? `${values[column]} ${cell.text}` : cell.text
    }
    return values
  })
}

/** Extract table rows for the selected 1-based pages (default: every page). */
export async function readTables(pdf: PdfHandle, pages?: number[]): Promise<PdfTable[]> {
  const selected = normalizePages(pages, pdf.numPages)
  const tables: PdfTable[] = []
  let textItems = 0
  for (const page of selected) {
    const items = await pdf.pageItems(page)
    textItems += items.length
    tables.push({ page, rows: extractRows(items) })
  }
  if (textItems === 0) throw new PdfTableError('E_PDF_NO_TEXT_LAYER', `选中 ${selected.length} 页都没有可提取字符`)
  return tables
}
