#!/usr/bin/env node
/**
 * dsh-pdf-table quickstart — extracts the bundled synthetic PDF table and
 * exports it as CSV.
 *
 *   node samples/quickstart/run.mjs            # human-readable summary
 *   node samples/quickstart/run.mjs --json     # the golden result on stdout
 *   node samples/quickstart/run.mjs --check    # recompute and diff against the golden file
 *
 * The golden file `expected/result.json` is the stdout of `--json`; it is a real
 * run over the committed PDF, not hand-written output.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTools } from '../../lib/plugin/tools.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const samplePath = path.join(here, 'input', 'table-demo.pdf')
const expectedPath = path.join(here, 'expected', 'result.json')
const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--json') ? 'json' : 'summary'

async function run() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dsh-pdf-table-quickstart-'))
  const realTemp = await realpath(tempDir)
  try {
    const tools = Object.fromEntries(createTools({ baseDir: tempDir }).map((tool) => [tool.name, tool]))
    const exec = { callId: 'quickstart' }

    const inspection = await tools['pdf.inspect'].execute({ path: samplePath }, exec)
    const extracted = await tools['pdf.tables'].execute({ path: samplePath }, exec)
    const exported = await tools['pdf.to_csv'].execute({ path: samplePath, filename: 'table-demo.csv' }, exec)
    const csvText = await readFile(exported.path, 'utf8')

    return {
      sample: 'samples/quickstart/input/table-demo.pdf',
      inspect: inspection,
      tables: extracted.tables,
      table_rows: extracted.rows,
      csv: {
        path: path.relative(realTemp, exported.path).split(path.sep).join('/'),
        sha256: exported.sha256,
        bytes: exported.bytes,
        rows: exported.rows,
        text: csvText,
      },
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

function printSummary(result) {
  const table = result.tables[0]
  const rows = table.rows
  const width = rows[0]?.length ?? 0
  console.log('dsh-pdf-table quickstart - synthetic text-layer PDF (no OCR, not customer data)')
  console.log(`${result.inspect.pages} page, ${result.inspect.total_chars} text chars; text layer ${result.inspect.has_text_layer ? 'yes' : 'no'}`)
  console.log(`table: ${rows.length} rows x ${width} columns on page ${table.page}`)
  console.log(`header: ${rows[0].join(' | ')}`)
  for (const row of rows.slice(1)) console.log(`row: ${row.join(' | ')}`)
  console.log(`CSV ${result.csv.path}: ${result.csv.rows} rows, ${result.csv.bytes} bytes, sha256 ${result.csv.sha256.slice(0, 12)}...`)
  console.log('CSV escaping: comma -> "South, East"; quote -> "Q1 ""units"""')
}

const result = await run()

if (mode === 'json') {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} else if (mode === 'check') {
  const expected = JSON.parse(await readFile(expectedPath, 'utf8'))
  assert.deepEqual(result, expected)
  printSummary(result)
  console.log('golden samples/quickstart/expected/result.json matches')
  console.log('quickstart ok')
} else {
  printSummary(result)
  console.log('run with --check to compare against expected/result.json')
}
