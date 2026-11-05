#!/usr/bin/env python3
"""Generate README image assets for dsh-pdf-table (docs/assets/).

Outputs (idempotent overwrite):
  dsh-pdf-table-flow-light.svg / dsh-pdf-table-flow-dark.svg
      Hero pipeline diagram. Two hand-written SVG files (vector — never
      rasterized to webp). Text inside is command-surface tokens only
      (pdf.inspect, pdf.tables, pdf.to_csv, risk levels, error codes, paths),
      so all five README languages share the same pair.

No raster asset is produced by this repo, so Pillow and the CJK font probe are
not needed here: the SVG carries no CJK glyphs (system-ui/monospace only), and
drawing CJK into a raster chart would require the family font probe. If an
evidence chart is ever added, copy the Pillow skeleton from the family sample
(dsh-mask/scripts/gen-readme-assets.py: palette, CJK probe, webp quality=90).

Existing assets (docs/assets/quickstart.png, quickstart.log,
dsh-pdf-table-flow.svg) are real captured output or the previous single-theme
diagram; they are kept untouched so old external links never 404.

Run once:  python scripts/gen-readme-assets.py
Requires:  Python 3.10+ (standard library only)
"""
from __future__ import annotations

import os
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

# --- palette: PerryLink family (accent) + GitHub page backgrounds ----------
FAMILY = "#4B67B4"   # family accent (badges labelColor family uses #2B3245)
GREEN = {"light": "#16a34a", "dark": "#3fb950"}
ORANGE = {"light": "#bc4c00", "dark": "#d29922"}
SKIN = {
    "light": dict(bg="#ffffff", box="#f6f8fa", border="#d0d7de",
                  text="#1f2328", sub="#57606a"),
    "dark": dict(bg="#0d1117", box="#161b22", border="#30363d",
                 text="#f0f6fc", sub="#8b949e"),
}

# ---------------------------------------------------------------------------
# Hero pipeline SVG (light + dark). Tokens only: tool names, thresholds,
# risk levels, error codes, paths — no natural-language sentences, so the same
# pair of files serves all five README languages.
# ---------------------------------------------------------------------------
FLOW_NODES = [
    ("report.pdf", "text layer only · ≤50 MB"),
    ("pdf.inspect", "pages · chars · R0"),
    ("pdf.tables", "y 3pt · x 6pt · 18pt"),
    ("pdf.to_csv", "RFC 4180 · sha256 · R1"),
    ("exports/*.csv", "sha256 receipt"),
]

STRIP = ("R0: pdf.inspect · pdf.tables ｜ R1: pdf.to_csv (local write under "
         "$DSH_HOME/dsh-pdf-table/exports/)")
FOOT = ("scanned PDF → E_PDF_NO_TEXT_LAYER → OCR first · one network-free "
        "parse, no model call")
FOOT2 = ("rows y≤3pt · cells x-gap>6pt · columns 18pt · pages 1-based · "
         "one column set per page · pdfjs-dist 5.4.394")


def esc(value: str) -> str:
    return (value.replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;"))


def flow_svg(skin: str) -> str:
    s = SKIN[skin]
    w, h = 1200, 400
    nw, nh, gap = 190, 96, 40
    y0 = 150
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}" role="img" aria-label="dsh-pdf-table pipeline">',
        '<title>dsh-pdf-table pipeline</title>',
        f'<rect width="{w}" height="{h}" rx="18" fill="{s["bg"]}"/>',
        f'<text x="60" y="62" fill="{s["text"]}" font-family="ui-sans-serif,'
        f'system-ui,sans-serif" font-size="30" font-weight="700">'
        f'dsh-pdf-table</text>',
        f'<text x="60" y="94" fill="{s["sub"]}" font-family="ui-monospace,'
        f'monospace" font-size="16">pdf.inspect → pdf.tables → pdf.to_csv · '
        f'text-layer extraction, local only</text>',
        f'<line x1="60" y1="116" x2="1140" y2="116" stroke="{s["border"]}"/>',
    ]
    for i, (label, sub) in enumerate(FLOW_NODES):
        x = 60 + i * (nw + gap)
        if i == len(FLOW_NODES) - 1:
            accent = GREEN[skin]
        elif 1 <= i <= 3:
            accent = FAMILY
        else:
            accent = s["border"]
        parts.append(
            f'<rect x="{x}" y="{y0}" width="{nw}" height="{nh}" rx="14" '
            f'fill="{s["box"]}" stroke="{accent}" stroke-width="2"/>')
        parts.append(
            f'<text x="{x + nw // 2}" y="{y0 + 40}" fill="{s["text"]}" '
            f'text-anchor="middle" font-family="ui-monospace,monospace" '
            f'font-size="15" font-weight="700">{esc(label)}</text>')
        parts.append(
            f'<text x="{x + nw // 2}" y="{y0 + 68}" fill="{s["sub"]}" '
            f'text-anchor="middle" font-family="ui-monospace,monospace" '
            f'font-size="11">{esc(sub)}</text>')
        if i < len(FLOW_NODES) - 1:
            ax = x + nw + 6
            ay = y0 + nh // 2
            parts.append(
                f'<path d="M{ax} {ay}h{gap - 12}" stroke="{s["sub"]}" '
                f'stroke-width="3"/>')
            parts.append(
                f'<path d="M{ax + gap - 14} {ay - 7}l10 7-10 7" fill="none" '
                f'stroke="{s["sub"]}" stroke-width="3" '
                f'stroke-linecap="round" stroke-linejoin="round"/>')
    # bottom strip: risk + locality tokens
    parts.append(
        f'<rect x="60" y="286" width="1080" height="54" rx="12" '
        f'fill="{s["box"]}" stroke="{FAMILY}" stroke-width="2"/>')
    parts.append(
        f'<text x="600" y="319" fill="{s["text"]}" text-anchor="middle" '
        f'font-family="ui-monospace,monospace" font-size="13">{esc(STRIP)}'
        f'</text>')
    # failure branch + heuristic tokens, kept out of the happy path
    parts.append(
        f'<text x="60" y="358" fill="{ORANGE[skin]}" font-family="ui-monospace,'
        f'monospace" font-size="13">{esc(FOOT)}</text>')
    parts.append(
        f'<text x="60" y="382" fill="{s["sub"]}" font-family="ui-monospace,'
        f'monospace" font-size="13">{esc(FOOT2)}</text>')
    parts.append('</svg>')
    return "\n".join(parts) + "\n"


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for skin in ("light", "dark"):
        target = os.path.join(OUT, f"dsh-pdf-table-flow-{skin}.svg")
        svg = flow_svg(skin)
        ET.fromstring(svg)  # fail loudly on malformed output
        with open(target, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(svg)
    print("wrote 2 SVG assets to docs/assets/")


if __name__ == "__main__":
    try:
        main()
    except ET.ParseError as error:  # pragma: no cover - defensive
        sys.exit(f"FATAL: generated SVG is not well-formed XML: {error}")
