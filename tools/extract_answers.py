"""Build assets/data.js from a test PDF whose correct answers are marked with a green highlighter.

Usage:  python3 tools/extract_answers.py "totalizarea 1.pdf" assets
Needs:  pip install pdfplumber

How it works: the PDF text is read line by line (questions "12. (CM) ...", options "a) ..."),
and every green highlighter stroke in the page drawing is assigned to the text line whose
vertical centre is closest. An option counts as correct when strokes cover >30% of its width.
Pictures inside a question are cropped to <out>/img/q<N>.jpg.
A few source-text glitches and one hand-written correction are patched via FIXES below.
"""
import json
import re
import sys
from pathlib import Path

import pdfplumber

GREEN = (0.6941177, 0.8627451, 0.5490196)  # stroke colour of the iOS highlighter in the PDF
Q_RE = re.compile(r"^(\d+)\.\s*(?:\((C[SM])\))?\s*(.*)$")
O_RE = re.compile(r"^([a-e])\)\s*(.*)$")

# Corrections applied after extraction. Each one was checked against the rendered PDF page;
# the key is the question number, the value a dict of fields to patch.
#   46  - the PDF spells the unit with a Cyrillic "ё" ("Tёrner"); the term is "grade Thörner".
#   139 - the PDF text reads "st[ri" where the glyph for "ă" failed; it is "stări" (see #143).
#   139 - option a) is circled in red with "9,3" written beside it, but b) carries the green
#         highlight. The highlight is kept as the answer and the discrepancy is surfaced as a note.
FIXES = {
    46: {"sub": [("grade Tёrner", "grade Thörner")]},
    143: {"sub": [("st[ri", "stări")]},
    139: {"note": "Atenție: în PDF, varianta a) este încercuită cu roșu și alături scrie de mână "
                  "„9,3”. Răspunsul marcat cu verde este b)."},
}


def duplicate_note(d):
    """A few questions are printed with two identical options (a typo in the test paper).
    Flag them, so it is clear why two rows look the same and why both are accepted."""
    seen = {}
    for i, text in enumerate(d["o"]):
        seen.setdefault(text, []).append(i)
    groups = [ix for ix in seen.values() if len(ix) > 1]
    if not groups:
        return None
    parts = []
    for ix in groups:
        letters = " şi ".join(f"{'abcde'[i]})" for i in ix)
        if any(i in d["a"] for i in ix):
            parts.append(f"variantele {letters} au text identic şi ambele sunt acceptate ca răspuns corect")
        else:
            parts.append(f"variantele {letters} au text identic")
    return "Atenție: în PDF, " + "; ".join(parts) + "."


def apply_fixes(d):
    f = FIXES.get(d["n"])
    if not f:
        return d
    for old, new in f.get("sub", []):
        d["q"] = d["q"].replace(old, new)
        d["o"] = [o.replace(old, new) for o in d["o"]]
    if "note" in f:
        d["note"] = f["note"]
    return d


def add_notes(d):
    dup = duplicate_note(d)
    if dup:
        d["note"] = (d["note"] + " " + dup) if d.get("note") else dup
    return d



def is_green(col):
    return isinstance(col, (tuple, list)) and len(col) == 3 and all(abs(a - b) < 0.02 for a, b in zip(col, GREEN))


def build_lines(page):
    """Group characters into lines, keeping sub/superscripts and underlines as HTML."""
    chars = [c for c in page.chars if c["text"].strip() or c["text"] == " "]
    main = sorted((c for c in chars if c["size"] >= 10), key=lambda c: (round(c["bottom"]), c["x0"]))
    lines = []
    for c in main:
        for ln in lines:
            if abs(ln["bottom"] - c["bottom"]) < 3:
                ln["chars"].append(c)
                ln["top"] = min(ln["top"], c["top"])
                break
        else:
            lines.append({"bottom": c["bottom"], "top": c["top"], "chars": [c]})
    for c in (c for c in chars if c["size"] < 10):
        mid = (c["top"] + c["bottom"]) / 2
        best = min(lines, key=lambda ln: abs((ln["top"] + ln["bottom"]) / 2 - mid))
        best["chars"].append(dict(c, _sub=c["bottom"] > best["bottom"] - 1.5))
    unders = [r for r in page.rects
              if r["bottom"] - r["top"] < 1.5 and r["x1"] - r["x0"] < 300 and r.get("non_stroking_color") in (0, (0,), [0], 0.0)]

    out = []
    for ln in sorted(lines, key=lambda l: l["bottom"]):
        cs = sorted(ln["chars"], key=lambda c: c["x0"])
        html, plain, prev = "", "", None
        for c in cs:
            t = c["text"]
            if prev is not None and c["x0"] - prev["x1"] > 1.5 and not t.isspace() and not plain.endswith(" "):
                html += " "
                plain += " "
            e = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            if "_sub" in c:
                e = f"<sub>{e}</sub>" if c["_sub"] else f"<sup>{e}</sup>"
            cx = (c["x0"] + c["x1"]) / 2
            if not t.isspace() and any(r["x0"] - 1 <= cx <= r["x1"] + 1 and -4 < r["top"] - c["bottom"] < 4 for r in unders):
                e = f"<u>{e}</u>"
            html += e
            plain += t
            prev = c
        html = re.sub(r"</(sub|sup|u)><\1>", "", html)
        out.append({
            "x0": min(c["x0"] for c in cs), "x1": max(c["x1"] for c in cs),
            "top": ln["top"], "bottom": ln["bottom"],
            "text": re.sub(r"\s+", " ", plain).strip(), "html": re.sub(r"\s+", " ", html).strip(),
            "bold": sum("Bold" in c["fontname"] for c in cs) > len(cs) / 2,
        })
    return out


def mark_coverage(page, lines):
    """Fraction of each line's width covered by green strokes."""
    for ln in lines:
        ln["segs"] = []
    for o in page.lines + page.curves + page.rects:
        if not (is_green(o.get("stroking_color")) or (o.get("fill") and is_green(o.get("non_stroking_color")))):
            continue
        cy = (o["top"] + o["bottom"]) / 2
        cands = [ln for ln in lines if ln["text"] and o["x1"] > ln["x0"] - 15 and o["x0"] < ln["x1"] + 15]
        if not cands:
            continue
        best = min(cands, key=lambda ln: abs((ln["top"] + ln["bottom"]) / 2 - cy))
        if abs((best["top"] + best["bottom"]) / 2 - cy) < 8:
            best["segs"].append((max(o["x0"], best["x0"]), min(o["x1"], best["x1"])))
    for ln in lines:
        tot, end = 0.0, -1e9
        for a, b in sorted(s for s in ln["segs"] if s[1] > s[0]):
            a = max(a, end)
            if b > a:
                tot += b - a
                end = b
        ln["cov"] = tot / max(1.0, ln["x1"] - ln["x0"])


def tidy(s):
    s = re.sub(r"<sup>o\s*</sup>", "°", s).replace("° C", "°C")
    s = re.sub(r"<sup>\s*</sup>", "", s)
    s = re.sub(r"<sub>(\w+):</sub>", r"<sub>\1</sub>:", s)
    return re.sub(r"\s+", " ", s).strip()


def main(pdf_path, out_dir):
    out_dir = Path(out_dir)
    (out_dir / "img").mkdir(parents=True, exist_ok=True)
    questions, section, cur, last = [], None, None, None
    with pdfplumber.open(pdf_path) as pdf:
        for pi, page in enumerate(pdf.pages):
            lines = build_lines(page)
            mark_coverage(page, lines)
            for ln in lines:
                t, h = ln["text"], ln["html"]
                if not t:
                    continue
                m = Q_RE.match(t)
                if ln["bold"] and not m and ln["x0"] > 150:
                    if not t.startswith("TESTE"):
                        section = t
                    continue
                if m and ln["x0"] < 82:
                    cur = {"n": int(m.group(1)), "type": m.group(2), "section": section, "page": pi, "top": ln["top"],
                           "q": re.sub(r"^\d+\.\s*(\(C[SM]\))?\s*", "", h), "options": []}
                    questions.append(cur)
                    last = cur
                    continue
                mo = O_RE.match(t)
                if mo and cur is not None:
                    last = {"k": mo.group(1), "t": re.sub(r"^[a-e]\)\s*", "", h), "cov": ln["cov"]}
                    cur["options"].append(last)
                elif last is cur and cur is not None:
                    cur["q"] += " " + h
                elif last is not None:
                    last["t"] += " " + h
                    last["cov"] = max(last["cov"], ln["cov"])
            for im in page.images:
                cy = (im["top"] + im["bottom"]) / 2
                owners = [q for q in questions if q["page"] == pi and q["top"] <= cy]
                if owners:
                    q = owners[-1]
                    box = (max(0, im["x0"]), max(0, im["top"]), min(page.width, im["x1"]), min(page.height, im["bottom"]))
                    page.crop(box).to_image(resolution=200).original.convert("RGB").save(out_dir / "img" / f"q{q['n']}.jpg", quality=85)
                    # Paths are written relative to index.html, which sits one level above <out>.
                    q["img"] = f"{out_dir.name}/img/q{q['n']}.jpg"

    data, sections = [], []
    for q in questions:
        answers = ["abcde".index(o["k"]) for o in q["options"] if o["cov"] > 0.3]
        if len(q["options"]) < 5 or not answers:
            print(f"skipped #{q['n']}: {len(q['options'])} options, {len(answers)} marked", file=sys.stderr)
            continue
        if q["type"] == "CS" and len(answers) > 1:
            print(f"note #{q['n']}: marked CS but {len(answers)} answers are highlighted", file=sys.stderr)
        d = {"n": q["n"], "s": q["section"], "t": "CM" if len(answers) > 1 else "CS",
             "q": tidy(q["q"]), "o": [tidy(o["t"]) for o in q["options"]], "a": answers}
        if q.get("img"):
            d["img"] = q["img"]
        data.append(add_notes(apply_fixes(d)))
        if d["s"] not in sections:
            sections.append(d["s"])

    js = "// Generat automat din „" + Path(pdf_path).name + "” (răspunsurile corecte = evidențiate cu verde).\n"
    js += "window.QUIZ_SECTIONS = " + json.dumps(sections, ensure_ascii=False) + ";\n"
    js += "window.QUIZ_DATA = [\n" + ",\n".join(json.dumps(d, ensure_ascii=False) for d in data) + "\n];\n"
    (out_dir / "data.js").write_text(js, encoding="utf-8")
    print(f"{len(data)} questions -> {out_dir / 'data.js'}", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "assets")
