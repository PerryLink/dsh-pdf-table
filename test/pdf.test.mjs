import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createTools } from '../lib/plugin/tools.js'
import { buildNoTextPdf, buildProseOnlyPdf, buildReportPdf, buildTwoPagePdf, buildZeroPagePdf, writePdfBytes } from './helpers/pdf-fixtures.mjs'

const tools = Object.fromEntries(createTools({ baseDir: path.join(os.tmpdir(), 'dsh-pdf-table-unit') }).map((tool) => [tool.name, tool]))
const exec = { callId: 'pdf-test' }

async function tempDir(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-pdf-table-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

test('pdf_inspect reports page count, per-page characters and a text layer', async (t) => {
  const dir = await tempDir(t)
  const file = await writePdfBytes(dir, 'report.pdf', await buildReportPdf())
  const result = await tools['pdf_inspect'].execute({ path: file }, exec)
  assert.equal(result.pages, 1)
  assert.equal(result.chars_per_page.length, 1)
  assert.ok(result.chars_per_page[0] > 100)
  assert.equal(result.total_chars, result.chars_per_page[0])
  assert.equal(result.has_text_layer, true)
  assert.deepEqual(result.pages_without_text, [])
})

test('pdf_inspect rejects a scanned PDF with E_PDF_NO_TEXT_LAYER and an OCR hint', async (t) => {
  const dir = await tempDir(t)
  const file = await writePdfBytes(dir, 'scan.pdf', await buildNoTextPdf())
  await assert.rejects(
    () => tools['pdf_inspect'].execute({ path: file }, exec),
    (error) => {
      assert.equal(error.code, 'E_PDF_NO_TEXT_LAYER')
      assert.match(error.message, /这是扫描件，请先 OCR/)
      return true
    },
  )
})

test('pdf_inspect reports a blank page inside an otherwise textual PDF', async (t) => {
  const dir = await tempDir(t)
  const file = await writePdfBytes(dir, 'mixed.pdf', await buildTwoPagePdf({ blankSecondPage: true }))
  const result = await tools['pdf_inspect'].execute({ path: file }, exec)
  assert.equal(result.pages, 2)
  assert.equal(result.chars_per_page[1], 0)
  assert.deepEqual(result.pages_without_text, [2])
  assert.equal(result.has_text_layer, true)
})

test('pdf_inspect rejects a corrupt PDF with E_PDF_CORRUPT', async (t) => {
  const dir = await tempDir(t)
  const file = path.join(dir, 'broken.pdf')
  await writeFile(file, 'this is definitely not a PDF')
  await assert.rejects(() => tools['pdf_inspect'].execute({ path: file }, exec), /E_PDF_CORRUPT/)
})

test('pdf_inspect rejects a zero-byte file with E_PDF_EMPTY', async (t) => {
  const dir = await tempDir(t)
  const file = path.join(dir, 'empty.pdf')
  await writeFile(file, '')
  await assert.rejects(() => tools['pdf_inspect'].execute({ path: file }, exec), /E_PDF_EMPTY/)
})

test('pdf_inspect rejects a missing file with E_PDF_NOT_FOUND', async (t) => {
  const dir = await tempDir(t)
  await assert.rejects(() => tools['pdf_inspect'].execute({ path: path.join(dir, 'absent.pdf') }, exec), /E_PDF_NOT_FOUND/)
})

test('pdf_inspect rejects a directory with E_PDF_PATH_INVALID', async (t) => {
  const dir = await tempDir(t)
  await assert.rejects(() => tools['pdf_inspect'].execute({ path: dir }, exec), /E_PDF_PATH_INVALID/)
})

test('pdf_tables extracts 3 rows x 4 columns and skips the prose line', async (t) => {
  const dir = await tempDir(t)
  const file = await writePdfBytes(dir, 'report.pdf', await buildReportPdf())
  const result = await tools['pdf_tables'].execute({ path: file }, exec)
  assert.equal(result.rows, 3)
  assert.equal(result.tables.length, 1)
  assert.equal(result.tables[0].page, 1)
  assert.equal(result.tables[0].rows.length, 3)
  for (const row of result.tables[0].rows) assert.equal(row.length, 4)
  assert.deepEqual(result.tables[0].rows[0], ['Region', 'Q1 "units"', 'Q2', 'Q3'])
  assert.equal(result.tables[0].rows[2][0], 'South, East')
})

test('pdf_tables honors a 1-based page selection', async (t) => {
  const dir = await tempDir(t)
  const file = await writePdfBytes(dir, 'two.pdf', await buildTwoPagePdf())
  const all = await tools['pdf_tables'].execute({ path: file }, exec)
  assert.deepEqual(all.tables.map((table) => table.page), [1, 2])
  assert.deepEqual(all.tables[1].rows, [['Name', 'Qty'], ['Bolt', '7']])
  const second = await tools['pdf_tables'].execute({ path: file, pages: [2] }, exec)
  assert.deepEqual(second.tables.map((table) => table.page), [2])
  assert.equal(second.rows, 2)
  assert.deepEqual(second.tables[0].rows[0], ['Name', 'Qty'])
  const sorted = await tools['pdf_tables'].execute({ path: file, pages: [2, 1, 2] }, exec)
  assert.deepEqual(sorted.tables.map((table) => table.page), [1, 2])
})

test('pdf_tables rejects out-of-range and empty page selections', async (t) => {
  const dir = await tempDir(t)
  const file = await writePdfBytes(dir, 'two.pdf', await buildTwoPagePdf())
  await assert.rejects(() => tools['pdf_tables'].execute({ path: file, pages: [3] }, exec), /E_PDF_PAGE_RANGE/)
  await assert.rejects(() => tools['pdf_tables'].execute({ path: file, pages: [0] }, exec), /E_PDF_PAGE_RANGE/)
  await assert.rejects(() => tools['pdf_tables'].execute({ path: file, pages: [1.5] }, exec), /E_PDF_PAGE_RANGE/)
  await assert.rejects(() => tools['pdf_tables'].execute({ path: file, pages: [] }, exec), /E_PDF_PAGE_RANGE/)
})

test('pdf_tables rejects a scanned PDF with E_PDF_NO_TEXT_LAYER', async (t) => {
  const dir = await tempDir(t)
  const file = await writePdfBytes(dir, 'scan.pdf', await buildNoTextPdf())
  await assert.rejects(() => tools['pdf_tables'].execute({ path: file }, exec), /E_PDF_NO_TEXT_LAYER/)
})

test('pdf_tables returns no rows for a text-only page without a table', async (t) => {
  const dir = await tempDir(t)
  const file = await writePdfBytes(dir, 'prose.pdf', await buildProseOnlyPdf())
  const result = await tools['pdf_tables'].execute({ path: file }, exec)
  assert.equal(result.rows, 0)
  assert.deepEqual(result.tables, [{ page: 1, rows: [] }])
})

test('a zero-page PDF is treated as having no usable text', async (t) => {
  const dir = await tempDir(t)
  const file = await writePdfBytes(dir, 'zero.pdf', await buildZeroPagePdf())
  await assert.rejects(() => tools['pdf_inspect'].execute({ path: file }, exec), /E_PDF_NO_TEXT_LAYER|E_PDF_EMPTY/)
})
