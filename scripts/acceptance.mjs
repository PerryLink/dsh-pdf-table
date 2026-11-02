#!/usr/bin/env node
/**
 * Acceptance checks over public/synthetic fixtures. Writes ACCEPTANCE.csv and
 * evidence/<run_id>/result.json. No network, no customer data.
 *
 *   node scripts/acceptance.mjs
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { safeExportPath } from '../lib/core/safe-path.js'
import { createTools } from '../lib/plugin/tools.js'
import { buildNoTextPdf, buildReportPdf, buildTwoPagePdf, writePdfBytes } from '../test/helpers/pdf-fixtures.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const errors = []

async function errorCode(promise) {
  try {
    await promise
    return 'NO_ERROR'
  } catch (error) {
    return error?.code ?? error?.name ?? 'UNKNOWN'
  }
}

async function main() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'dsh-pdf-table-acceptance-'))
  const baseDir = path.join(tempDir, 'store')
  try {
    const tools = Object.fromEntries(createTools({ baseDir }).map((tool) => [tool.name, tool]))
    const exec = { callId: 'acceptance' }

    const report = await writePdfBytes(tempDir, 'report.pdf', await buildReportPdf())
    const twoPage = await writePdfBytes(tempDir, 'two-page.pdf', await buildTwoPagePdf())
    const scanned = await writePdfBytes(tempDir, 'scanned.pdf', await buildNoTextPdf())
    const corrupt = path.join(tempDir, 'corrupt.pdf')
    writeFileSync(corrupt, 'not a PDF at all')
    const empty = path.join(tempDir, 'empty.pdf')
    writeFileSync(empty, '')

    const inspection = await tools['pdf.inspect'].execute({ path: report }, exec)
    const tables = await tools['pdf.tables'].execute({ path: report }, exec)
    const page2 = await tools['pdf.tables'].execute({ path: twoPage, pages: [2] }, exec)
    const exported = await tools['pdf.to_csv'].execute({ path: report, filename: 'acceptance.csv' }, exec)
    const csvText = readFileSync(exported.path, 'utf8')
    const scannedCode = await errorCode(tools['pdf.inspect'].execute({ path: scanned }, exec))
    const corruptCode = await errorCode(tools['pdf.inspect'].execute({ path: corrupt }, exec))
    const emptyCode = await errorCode(tools['pdf.inspect'].execute({ path: empty }, exec))
    const pathCode = await errorCode(safeExportPath(baseDir, '../evil.csv'))
    const quoted = csvText.includes('"South, East"') && csvText.includes('"Q1 ""units"""')

    // ACCEPTANCE.csv uses a simple comma-split schema: keep every field free of commas.
    const metrics = [
      { req_id: 'PDF-A01', metric: 'inspect pages/chars', threshold: 'pages=1 chars>0', actual: `pages=${inspection.pages} chars=${inspection.total_chars}`, pass: inspection.pages === 1 && inspection.total_chars > 0 },
      { req_id: 'PDF-A02', metric: 'table 3x4', threshold: '3 rows x 4 cols', actual: `${tables.rows} rows x ${tables.tables[0]?.rows[0]?.length ?? 0} cols`, pass: tables.rows === 3 && tables.tables[0]?.rows.every((row) => row.length === 4) === true },
      { req_id: 'PDF-A03', metric: 'page filter', threshold: 'page 2 only', actual: `pages=${page2.tables.map((table) => table.page).join('/')}`, pass: page2.tables.length === 1 && page2.tables[0].page === 2 },
      { req_id: 'PDF-A04', metric: 'CSV quoting', threshold: 'comma+quote escaped', actual: quoted ? 'escaped' : 'missing', pass: quoted },
      { req_id: 'PDF-A05', metric: 'CSV sha256', threshold: 'matches file', actual: exported.sha256.slice(0, 12), pass: exported.sha256 === sha256(csvText) && exported.bytes === Buffer.byteLength(csvText, 'utf8') },
      { req_id: 'PDF-A06', metric: 'scanned PDF error', threshold: 'E_PDF_NO_TEXT_LAYER', actual: scannedCode, pass: scannedCode === 'E_PDF_NO_TEXT_LAYER' },
      { req_id: 'PDF-A07', metric: 'corrupt PDF error', threshold: 'E_PDF_CORRUPT', actual: corruptCode, pass: corruptCode === 'E_PDF_CORRUPT' },
      { req_id: 'PDF-A08', metric: 'empty PDF error', threshold: 'E_PDF_EMPTY', actual: emptyCode, pass: emptyCode === 'E_PDF_EMPTY' },
      { req_id: 'PDF-A09', metric: 'export path safety', threshold: 'traversal rejected', actual: pathCode, pass: pathCode === 'E_PDF_PATH_INVALID' },
    ]

    let quickstartPass = true
    try {
      execFileSync(process.execPath, ['samples/quickstart/run.mjs', '--check'], { cwd: root, stdio: 'ignore' })
    } catch {
      quickstartPass = false
    }
    const quickstartHash = sha256(readFileSync(path.join(root, 'samples', 'quickstart', 'expected', 'result.json')))
    const quickstart = { req_id: 'PS1-QS01', metric: 'quickstart golden', threshold: '1/1', actual: quickstartPass ? '1' : '0', pass: quickstartPass, evidence_sha256: quickstartHash }

    const failures = metrics.filter((item) => !item.pass)
    for (const failure of failures) errors.push(`${failure.req_id} ${failure.metric}: ${failure.actual}`)
    if (!quickstartPass) errors.push('PS1-QS01 quickstart golden failed')

    const runId = `pdf-table-${Date.now()}`
    const evidence = {
      run_id: runId,
      scope: 'PDF-TABLE-S1',
      status: failures.length === 0 && quickstartPass ? 'pass' : 'fail',
      counted: false,
      note: 'synthetic PDFs only; no customer data, no OCR',
      metrics,
      pass: failures.length === 0 && quickstartPass,
    }
    const evidenceDir = path.join(root, 'evidence', runId)
    mkdirSync(evidenceDir, { recursive: true })
    const evidenceJson = `${JSON.stringify(evidence, null, 2)}\n`
    writeFileSync(path.join(evidenceDir, 'result.json'), evidenceJson)
    const evidenceHash = sha256(evidenceJson)

    const rows = [
      ...metrics.map((item) => `${item.req_id},${item.metric},${item.threshold},${item.actual},scripts/acceptance.mjs,${evidenceHash},${item.pass},public/synthetic,false`),
      `${quickstart.req_id},${quickstart.metric},${quickstart.threshold},${quickstart.actual},samples/quickstart/run.mjs,${quickstart.evidence_sha256},${quickstart.pass},synthetic/quickstart,true`,
    ]
    writeFileSync(
      path.join(root, 'ACCEPTANCE.csv'),
      `req_id,metric,threshold,actual,script,evidence_sha256,pass,source,counted\n${rows.join('\n')}\n`,
    )

    if (errors.length > 0) {
      for (const error of errors) console.error(`acceptance: ${error}`)
      process.exit(1)
    }
    console.log(`acceptance ok: ${metrics.length + 1} checks`)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

await main()
