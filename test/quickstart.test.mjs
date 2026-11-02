import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the bundled quickstart PDF is a real PDF', async () => {
  const bytes = await readFile(path.join(packageRoot, 'samples', 'quickstart', 'input', 'table-demo.pdf'))
  assert.ok(bytes.length > 500)
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-')
})

test('quickstart --check reproduces the committed golden result', () => {
  const result = spawnSync(process.execPath, ['samples/quickstart/run.mjs', '--check'], { cwd: packageRoot, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /table: 3 rows x 4 columns/)
  assert.match(result.stdout, /golden samples\/quickstart\/expected\/result\.json matches/)
  assert.match(result.stdout, /quickstart ok/)
})
