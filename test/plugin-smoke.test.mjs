import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as plugin from '../lib/plugin/index.js'
import { createTools } from '../lib/plugin/tools.js'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const samplePath = path.join(packageRoot, 'samples', 'quickstart', 'input', 'table-demo.pdf')

test('createTools exposes the three pdf_* tools with unique names', () => {
  const tools = createTools({ baseDir: path.join(os.tmpdir(), 'dsh-pdf-table-smoke') })
  assert.deepEqual(tools.map((tool) => tool.name), ['pdf_inspect', 'pdf_tables', 'pdf_to_csv'])
  assert.equal(new Set(tools.map((tool) => tool.name)).size, 3)
  for (const tool of tools) {
    assert.ok(tool.name.startsWith('pdf_'))
    assert.ok(tool.description.length > 0)
    assert.equal(typeof tool.execute, 'function')
    assert.equal(typeof tool.output.render, 'function')
  }
})

test('resolveBaseDir defaults to $DSH_HOME/dsh-pdf-table and honors the explicit override', () => {
  assert.equal(plugin.resolveBaseDir({ DSH_HOME: '/tmp/dsh-home' }), path.join('/tmp/dsh-home', 'dsh-pdf-table'))
  assert.equal(
    plugin.resolveBaseDir({ DSH_HOME: '/tmp/dsh-home', DSH_PDF_TABLE_HOME: '/tmp/pdf-table-home' }),
    '/tmp/pdf-table-home',
  )
})

test('apply() registers the tools and wires the documented write root', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-pdf-table-apply-'))
  const previous = process.env.DSH_PDF_TABLE_HOME
  process.env.DSH_PDF_TABLE_HOME = dir
  t.after(async () => {
    if (previous === undefined) delete process.env.DSH_PDF_TABLE_HOME
    else process.env.DSH_PDF_TABLE_HOME = previous
    await rm(dir, { recursive: true, force: true })
  })

  const registered = []
  await plugin.apply({ tools: { register(tool) { registered.push(tool) } } })
  assert.equal(plugin.name, 'dsh-pdf-table')
  assert.deepEqual(plugin.inject, ['tools'])
  assert.equal(registered.length, 3)

  const exportCsv = registered.find((tool) => tool.name === 'pdf_to_csv')
  const result = await exportCsv.execute({ path: samplePath, filename: 'apply.csv' }, { callId: 'apply' })
  assert.ok(result.path.startsWith(`${dir}${path.sep}exports${path.sep}`), result.path)
  assert.equal(result.rows, 3)
})
