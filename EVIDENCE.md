# Evidence — dsh-pdf-table 0.1.0-alpha.1

All runs are local, over synthetic PDFs. No customer data, no network call, no model call.
No `git commit` and no `npm publish` were performed.

## Environment

- Node `v24.22.1`
- pnpm `11.28.5`
- TypeScript `7.0.2` (NodeNext, strict)
- pdfjs-dist `5.4.394` (runtime), pdf-lib `1.17.1` (dev/sample generation)
- Date: 2026-11-02 (Asia/Shanghai)

## Commands and results

| Command | Result |
|---|---|
| `pnpm build` | exit 0, `tsc -p tsconfig.json` emits `lib/` |
| `pnpm typecheck` | exit 0 |
| `node --test test/*.test.mjs` | 31 tests, 31 pass, 0 fail |
| `node samples/quickstart/run.mjs --check` | golden `expected/result.json` matches |
| `node scripts/gate.mjs` | lint ok, acceptance ok, 10/10 acceptance rows pass |
| `npm pack --dry-run --json` | 28 files, no publish |

## Local Package Standard v1 score

The package is intentionally **not** added to `04-build/dsh-plugins/family.json` (not in the
family yet, so the committed roster does not count it). To verify the standard locally, the
official `04-build/dsh-plugins/scripts/score-packages.mjs` was copied to a temporary path,
pointed at a temporary one-item family file, and run against this checkout:

```
PS1 scores: 1 packages | green 1 / yellow 0 / red 0
10 green  dsh-pdf-table
page=1 sample=2 prompt=1 expected=1 permissions=2 errors=1 evidence=2  total=10
```

Every scored category is non-zero; the score is 10/10 against the same rules the family uses.

## Screenshot / golden hashes

| Artifact | SHA-256 |
|---|---|
| `docs/assets/quickstart.png` | `f9fe399bf2c33becb9c6e0e5841cd9b809441c6f29b9749921faaa7de225a117` |
| `docs/assets/quickstart.log` | `4a97f8b225d5ab9b527a9bb1c10c067424e5c0016ff9ff8195d6500c1e9494ef` |
| `samples/quickstart/expected/result.json` | `7e62cec142a84872a402db255ea3311fbab29ff7e111d8ebdaa30d1ee4b83696` |
| `ACCEPTANCE.csv` quickstart row | uses the `expected/result.json` hash above |

The screenshot was rendered by `04-build/dsh-plugins/scripts/render-capture.py` from the real
captured terminal output in `docs/assets/quickstart.log`; no output text was invented.

## Error-path coverage

- `E_PDF_NO_TEXT_LAYER` — scanned/image-only PDF, message asks for OCR.
- `E_PDF_CORRUPT` — non-PDF bytes / truncated structure.
- `E_PDF_EMPTY` — zero-byte file.
- `E_PDF_NOT_FOUND` / `E_PDF_PATH_INVALID` — missing file or a directory path.
- `E_PDF_PAGE_RANGE` — out-of-range, non-integer or empty `pages`.
- `E_PDF_PATH_INVALID` / `E_PDF_PATH_NOT_ALLOWED` — unsafe export filename or path escape.
- `E_PDF_EXPORT_FAILED` — local CSV write failure.
- `E_PDF_ENCRYPTED` — password-protected PDF.
