#!/usr/bin/env node
/**
 * Generate the quickstart PDF with pdf-lib.
 *
 * The PDF is synthetic and contains exactly one 4-column x 3-row table plus one
 * prose line. The prose line must be skipped by the extractor (a single text
 * block has no table structure); the table cells deliberately include a comma
 * and a double quote so the CSV escaping path is exercised end to end.
 *
 *   node scripts/make-sample.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const here = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(here, '..')

export const SAMPLE_RELATIVE_PATH = 'samples/quickstart/input/table-demo.pdf'

/** Deterministic PDF bytes for the bundled quickstart sample. */
export async function buildDemoPdf() {
  const doc = await PDFDocument.create()
  doc.setTitle('dsh-pdf-table quickstart')
  doc.setAuthor('dsh-pdf-table')
  doc.setSubject('Synthetic text-layer table sample; not customer data')
  doc.setCreator('dsh-pdf-table samples/quickstart')
  doc.setProducer('pdf-lib 1.17.1')
  doc.setCreationDate(new Date('2026-01-01T00:00:00.000Z'))
  doc.setModificationDate(new Date('2026-01-01T00:00:00.000Z'))

  const page = doc.addPage([595, 842])
  const body = await doc.embedFont(StandardFonts.Helvetica)
  const black = rgb(0, 0, 0)
  page.drawText('Quarterly widget report', { x: 50, y: 780, size: 16, font: body, color: black })

  const table = [
    ['Region', 'Q1 "units"', 'Q2', 'Q3'],
    ['North', '120', '135', '150'],
    ['South, East', '90', '110', '130'],
  ]
  let y = 720
  for (const row of table) {
    let x = 50
    for (const cell of row) {
      page.drawText(cell, { x, y, size: 11, font: body, color: black })
      x += 110
    }
    y -= 22
  }

  page.drawText('Generated locally for the quickstart; text layer only, no OCR.', {
    x: 50,
    y: 630,
    size: 10,
    font: body,
    color: black,
  })

  return doc.save()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bytes = await buildDemoPdf()
  const target = path.join(packageRoot, SAMPLE_RELATIVE_PATH)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, bytes)
  console.log(`wrote ${SAMPLE_RELATIVE_PATH} (${bytes.length} bytes)`)
}
