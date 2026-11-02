# Changelog

## 0.1.0-alpha.1 — 2026-11-02

- First public alpha of `dsh-pdf-table`.
- `pdf.inspect`: page count, text characters per page, text-layer presence; scanned PDFs raise `E_PDF_NO_TEXT_LAYER`.
- `pdf.tables`: y-row clustering and x-gap column clustering; optional 1-based `pages`.
- `pdf.to_csv`: RFC 4180 quoting, `safeExportPath` under `$DSH_HOME/dsh-pdf-table/exports/`, returns path + sha256.
- Synthetic quickstart PDF (3×4 table + prose), golden result and real terminal screenshot.
- No OCR by design; image-only PDFs must be OCR'd first.
