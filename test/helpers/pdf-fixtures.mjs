import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const black = rgb(0, 0, 0)

async function newDocument() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  return { doc, font }
}

function drawTable(page, font, rows, startY) {
  let y = startY
  for (const row of rows) {
    let x = 50
    for (const cell of row) {
      page.drawText(cell, { x, y, size: 11, font, color: black })
      x += 110
    }
    y -= 22
  }
}

/** One page: a 4x3 table plus a prose line that must not become a table row. */
export async function buildReportPdf() {
  const { doc, font } = await newDocument()
  const page = doc.addPage([595, 842])
  page.drawText('Quarterly widget report', { x: 50, y: 780, size: 16, font, color: black })
  drawTable(page, font, [
    ['Region', 'Q1 "units"', 'Q2', 'Q3'],
    ['North', '120', '135', '150'],
    ['South, East', '90', '110', '130'],
  ], 720)
  page.drawText('Generated locally for tests; text layer only, no OCR.', { x: 50, y: 630, size: 10, font, color: black })
  return doc.save()
}

/** Page 1 has a 3x2 table; page 2 has a 2x2 table. A page can also be blank. */
export async function buildTwoPagePdf({ blankSecondPage = false } = {}) {
  const { doc, font } = await newDocument()
  const first = doc.addPage([595, 842])
  first.drawText('Page one', { x: 50, y: 780, size: 14, font, color: black })
  drawTable(first, font, [['Code', 'Value'], ['A-1', '10']], 720)
  const second = doc.addPage([595, 842])
  if (blankSecondPage) {
    second.drawRectangle({ x: 60, y: 60, width: 200, height: 100, color: rgb(0.9, 0.9, 0.9) })
  } else {
    second.drawText('Page two', { x: 50, y: 780, size: 14, font, color: black })
    drawTable(second, font, [['Name', 'Qty'], ['Bolt', '7']], 720)
  }
  return doc.save()
}

/** A valid PDF page with no text layer at all (the scanner-shaped case). */
export async function buildNoTextPdf() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([300, 300])
  page.drawRectangle({ x: 20, y: 20, width: 260, height: 120, color: rgb(0.2, 0.4, 0.8) })
  return doc.save()
}

/** Text exists but every row is prose, so no table rows can be extracted. */
export async function buildProseOnlyPdf() {
  const { doc, font } = await newDocument()
  const page = doc.addPage([595, 842])
  page.drawText('This page has text but no table at all.', { x: 50, y: 760, size: 12, font, color: black })
  page.drawText('Every line is one text block, so it is prose and is skipped.', { x: 50, y: 738, size: 12, font, color: black })
  return doc.save()
}

/** A PDF with zero pages as written by pdf-lib (PDF.js may report one blank page). */
export async function buildZeroPagePdf() {
  const doc = await PDFDocument.create()
  return doc.save()
}

export async function writePdfBytes(dir, name, bytes) {
  const file = path.join(dir, name)
  await writeFile(file, bytes)
  return file
}
