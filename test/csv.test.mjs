import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { csvField, toCsv } from '../lib/core/csv.js'
import { createTools } from '../lib/plugin/tools.js'
import { buildProseOnlyPdf, buildReportPdf, buildTwoPagePdf, writePdfBytes } from './helpers/pdf-fixtures.mjs'

const tools = Object.fromEntries(createTools({ baseDir: path.join(os.tmpdir(), 'dsh-pdf-table-csv-unit') }).map((tool) => [tool.name, tool]))
const exec = { callId: 'csv-test' }
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

async function tempDir(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-pdf-table-csv-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

test('csvField leaves plain fields alone and quotes commas, quotes and newlines', () => {
  assert.equal(csvField('plain'), 'plain')
  assert.equal(csvField('North'), 'North')
  assert.equal(csvField('South, East'), '"South, East"')
  assert.equal(csvField('Q1 "units"'), '"Q1 ""units"""')
  assert.equal(csvField('line1\nline2'), '"line1\nline2"')
  assert.equal(csvField('a\r\nb'), '"a\r\nb"')
})

test('toCsv joins rows with newlines and keeps a trailing newline', () => {
  assert.equal(toCsv([]), '')
  assert.equal(
    toCsv([['Region', 'Q1 "units"', 'Q2', 'Q3'], ['South, East', '90', '110', '130']]),
    'Region,"Q1 ""units""",Q2,Q3\n"South, East",90,110,130\n',
  )
})

test('pdf_to_csv writes a quoted CSV, returns path, sha256, bytes and page list', async (t) => {
  const dir = await tempDir(t)
  const baseDir = path.join(dir, 'store')
  const file = await writePdfBytes(dir, 'report.pdf', await buildReportPdf())
  const local = Object.fromEntries(createTools({ baseDir }).map((tool) => [tool.name, tool]))
  const extracted = await local['pdf_tables'].execute({ path: file }, exec)
  const expectedCsv = toCsv(extracted.tables.flatMap((table) => table.rows))
  const result = await local['pdf_to_csv'].execute({ path: file, filename: 'report.csv' }, exec)
  assert.equal(result.path, path.join(await realpath(baseDir), 'exports', 'report.csv'))
  assert.equal(result.rows, 3)
  assert.equal(result.bytes, Buffer.byteLength(expectedCsv, 'utf8'))
  assert.deepEqual(result.pages, [1])
  assert.equal(result.sha256, sha256(expectedCsv))
  assert.equal(await readFile(result.path, 'utf8'), expectedCsv)
  assert.match(expectedCsv, /"Q1 ""units"""/)
  assert.match(expectedCsv, /"South, East",90,110,130/)
})

test('pdf_to_csv exports only the selected page', async (t) => {
  const dir = await tempDir(t)
  const file = await writePdfBytes(dir, 'two.pdf', await buildTwoPagePdf())
  const local = Object.fromEntries(createTools({ baseDir: path.join(dir, 'store') }).map((tool) => [tool.name, tool]))
  const result = await local['pdf_to_csv'].execute({ path: file, pages: [2], filename: 'page2.csv' }, exec)
  assert.deepEqual(result.pages, [2])
  assert.equal(result.rows, 2)
  assert.equal(await readFile(result.path, 'utf8'), 'Name,Qty\nBolt,7\n')
})

test('pdf_to_csv uses a hash-derived safe filename by default', async (t) => {
  const dir = await tempDir(t)
  const file = await writePdfBytes(dir, 'report.pdf', await buildReportPdf())
  const local = Object.fromEntries(createTools({ baseDir: path.join(dir, 'store') }).map((tool) => [tool.name, tool]))
  const result = await local['pdf_to_csv'].execute({ path: file }, exec)
  assert.match(path.basename(result.path), /^pdf-tables-[0-9a-f]{12}\.csv$/)
})

test('pdf_to_csv rejects a traversal filename without writing outside exports', async (t) => {
  const dir = await tempDir(t)
  const file = await writePdfBytes(dir, 'report.pdf', await buildReportPdf())
  const local = Object.fromEntries(createTools({ baseDir: path.join(dir, 'store') }).map((tool) => [tool.name, tool]))
  await assert.rejects(() => local['pdf_to_csv'].execute({ path: file, filename: '../evil.csv' }, exec), /E_PDF_PATH_INVALID/)
  await assert.rejects(() => local['pdf_to_csv'].execute({ path: file, filename: '/tmp/evil.csv' }, exec), /E_PDF_PATH_INVALID/)
})

test('pdf_to_csv writes an empty file when the PDF has text but no table rows', async (t) => {
  const dir = await tempDir(t)
  const file = await writePdfBytes(dir, 'prose.pdf', await buildProseOnlyPdf())
  const local = Object.fromEntries(createTools({ baseDir: path.join(dir, 'store') }).map((tool) => [tool.name, tool]))
  const result = await local['pdf_to_csv'].execute({ path: file, filename: 'empty.csv' }, exec)
  assert.equal(result.rows, 0)
  assert.equal(result.bytes, 0)
  assert.equal(result.sha256, sha256(''))
  assert.equal(await readFile(result.path, 'utf8'), '')
})
