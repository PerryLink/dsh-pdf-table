# Changelog

## [0.2.0] — 2026-11-13

### Breaking

- **Tool names no longer contain a dot.** The three tools are now `pdf_inspect`, `pdf_tables` and `pdf_to_csv`. Providers validate `tools[].name` against `^[a-zA-Z0-9_-]+$`; the old dotted names invalidated the whole `tools` array, so the plugin registered but every request carrying its tools was rejected with `Invalid 'tools[N].name'`. Minor bump because tool names are part of the 0.1.0 compatibility promise — update prompts, saved calls and permission rules that still use the old dotted names.
- `test/tool-name-wire.test.mjs` pins the wire pattern so a new tool cannot reintroduce a dot or drop the `pdf_` namespace.
- Earlier changelog entries use the new spelling, so a repository-wide search no longer finds dotted tool names.

## [0.1.0] — 2026-11-03

### Stable

- First non-alpha release: tool names and the CLI surface are covered by a
  compatibility promise (breaking changes require a minor bump).
- Ships a quickstart sample, a one-line prompt, a permission block and real captures.

## 0.1.0-alpha.1 — 2026-11-02

- First public alpha of `dsh-pdf-table`.
- `pdf_inspect`: page count, text characters per page, text-layer presence; scanned PDFs raise `E_PDF_NO_TEXT_LAYER`.
- `pdf_tables`: y-row clustering and x-gap column clustering; optional 1-based `pages`.
- `pdf_to_csv`: RFC 4180 quoting, `safeExportPath` under `$DSH_HOME/dsh-pdf-table/exports/`, returns path + sha256.
- Synthetic quickstart PDF (3×4 table + prose), golden result and real terminal screenshot.
- No OCR by design; image-only PDFs must be OCR'd first.
