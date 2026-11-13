import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { toCsv } from '../core/csv.js'
import { inspectPdf, openPdf, PdfTableError, readTables, type PdfInspection, type PdfTable } from '../core/pdf.js'
import { safeExportPath } from '../core/safe-path.js'

export interface ToolDeps {
  /** Local write root; the plugin uses `$DSH_HOME/dsh-pdf-table`. */
  baseDir: string
}

const text = (value: string) => [{ type: 'text' as const, text: value }]
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

export function createTools(deps: ToolDeps) {
  const inspect = defineTool({
    name: 'pdf_inspect',
    description: 'Inspect a text-based PDF: page count, text characters per page, and whether it has a text layer. No OCR; a scanned PDF fails with E_PDF_NO_TEXT_LAYER.',
    parameters: { path: { type: 'string', required: true } },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pages: { type: 'number', required: true },
          chars_per_page: { type: 'array', items: { type: 'number' }, required: true },
          total_chars: { type: 'number', required: true },
          has_text_layer: { type: 'boolean', required: true },
          pages_without_text: { type: 'array', items: { type: 'number' }, required: true },
        },
      },
      render: (_args, value: PdfInspection) => text(`PDF ${value.pages} page(s), ${value.total_chars} text chars, text layer ${value.has_text_layer ? 'yes' : 'no'}`),
    },
    async execute(args) {
      return inspectPdf(args.path)
    },
  })

  const tables = defineTool({
    name: 'pdf_tables',
    description: 'Extract table rows from a text-based PDF. Text items on the same y form a row; x gaps define columns. Returns { page, rows } per selected page (pages are 1-based, default all). No OCR.',
    parameters: {
      path: { type: 'string', required: true },
      pages: { type: 'array', items: { type: 'number' } },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tables: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                page: { type: 'number', required: true },
                rows: { type: 'array', required: true, items: { type: 'array', items: { type: 'string' } } },
              },
            },
          },
          rows: { type: 'number', required: true },
        },
      },
      render: (_args, value: { tables: PdfTable[]; rows: number }) => text(`PDF tables: ${value.tables.length} page(s), ${value.rows} table row(s)`),
    },
    async execute(args) {
      const pdf = await openPdf(args.path)
      try {
        const extracted = await readTables(pdf, args.pages)
        return { tables: extracted, rows: extracted.reduce((total, table) => total + table.rows.length, 0) }
      } finally {
        await pdf.close()
      }
    },
  })

  const exportCsv = defineTool({
    name: 'pdf_to_csv',
    description: 'Extract table rows from a text-based PDF and write one quoted CSV under $DSH_HOME/dsh-pdf-table/exports; returns the path and sha256. No OCR; scanned PDFs fail with E_PDF_NO_TEXT_LAYER.',
    parameters: {
      path: { type: 'string', required: true },
      pages: { type: 'array', items: { type: 'number' } },
      filename: { type: 'string' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          sha256: { type: 'string', required: true },
          rows: { type: 'number', required: true },
          bytes: { type: 'number', required: true },
          pages: { type: 'array', items: { type: 'number' }, required: true },
        },
      },
      render: (_args, value: { path: string; rows: number }) => text(`CSV ${value.rows} row(s) -> ${value.path}`),
    },
    async execute(args) {
      const pdf = await openPdf(args.path)
      try {
        const extracted = await readTables(pdf, args.pages)
        const rows = extracted.flatMap((table) => table.rows)
        const csv = toCsv(rows)
        const filename = args.filename ?? `pdf-tables-${pdf.sha256.slice(0, 12)}.csv`
        let filePath: string
        try {
          filePath = await safeExportPath(path.join(deps.baseDir, 'exports'), filename)
        } catch (error) {
          if (error instanceof PdfTableError) throw error
          throw new PdfTableError('E_PDF_EXPORT_FAILED', String(error))
        }
        try {
          await writeFile(filePath, csv, 'utf8')
        } catch (error) {
          throw new PdfTableError('E_PDF_EXPORT_FAILED', String(error))
        }
        return { path: filePath, sha256: sha256(csv), rows: rows.length, bytes: Buffer.byteLength(csv, 'utf8'), pages: extracted.map((table) => table.page) }
      } finally {
        await pdf.close()
      }
    },
  })

  return [inspect, tables, exportCsv]
}
