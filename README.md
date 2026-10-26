# Igiena generală — Totalizarea 1

A Quizlet-style flashcard site for studying **totalizarea 1**, built from the questions and
highlighted answers in [`totalizarea 1.pdf`](totalizarea%201.pdf).

**268 questions** across three chapters, with the correct answers taken from the green
highlighter marks in the PDF.

| | |
|---|---|
| Chapters | Întroducere în igienă (40) · Igiena alimentaţiei (148) · Patologii şi intoxicaţii alimentare (80) |
| Question types | CS — one correct answer (116) · CM — several correct answers (152) |
| With images | 5 (questions 264–268) |

## Running it

The site is plain HTML, CSS and JavaScript — no build step, no dependencies.

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly in a browser also works, since nothing is loaded with `fetch`.

## Deploying

It is a static site, so any static host works. For **GitHub Pages**:

1. Repository → **Settings** → **Pages**
2. *Source*: **Deploy from a branch**
3. Branch: `main`, folder: `/ (root)` → **Save**

The site is then served at `https://<user>.github.io/<repo>/`. Netlify, Vercel or
Cloudflare Pages work the same way — point them at the repository root with no build command.

## How to use it

1. **Pick the chapters** you want to practise.
2. **Pick how many questions** — 10, 20, 30, 50, 100, *all of them*, or type an exact number.
3. Optionally turn on **Amestecă variantele** (shuffles the answer options, so you cannot
   memorise letter positions) or **Ascunde variantele** (hard mode: the front shows only the
   question).
4. For each card: read the question, hit **Arată răspunsul**, then mark **Am știut** or
   **Nu am știut**.
5. At the end you get your **percentage**, how many you knew and how many you missed. From
   there you can **repeat just the ones you missed**, **review them** with the correct answers,
   or start a fresh session.

Questions are reshuffled every session, so repeating the same selection gives a new order.

**Keyboard:** <kbd>Space</kbd> reveal · <kbd>1</kbd> didn't know · <kbd>2</kbd> knew ·
<kbd>Esc</kbd> end the session.

Chapter selection, session size, the two options and the light/dark theme are remembered in the
browser. Nothing is uploaded anywhere.

## Files

```
index.html               the page
assets/style.css         styles (light + dark)
assets/app.js            session logic, flashcards, scoring
assets/data.js           generated — the 268 questions and their answers
assets/img/q264–268.jpg  generated — pictures cropped out of the PDF
tools/extract_answers.py generated the two above from the PDF
```

## Regenerating the question bank

`assets/data.js` is generated, not hand-written. If the PDF changes:

```sh
pip install pdfplumber
python3 tools/extract_answers.py "totalizarea 1.pdf" assets
```

The script reads the PDF line by line, matches every green highlighter stroke to the answer
option it covers, and crops any picture inside a question. An option counts as correct when the
green strokes cover more than 30% of its width.

### Notes on the source PDF

* **Question 269 is not included.** The PDF ends in the middle of it — a new chapter
  (*Igiena aerului*) starts, question 269 is printed with only its first option and nothing is
  highlighted. The 268 complete questions before it are all included.
* **Question 51** is labelled `(CS)` in the PDF but has four options highlighted. It asks which
  methods are *not* used, so four answers are right; it is treated as a CM question.
* **Question 139** has option a) circled in red with "9,3" written next to it by hand, while
  b) carries the green highlight. The green answer is used and the card shows a note about the
  handwritten correction.
* Two typographic glitches in the PDF text are corrected: `grade Tёrner` → `grade Thörner`
  (#46) and `st[ri` → `stări` (#143). Both are listed in `FIXES` in the extraction script.
