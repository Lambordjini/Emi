# Igiena generală – quiz

A Quizlet-style study site for the 268 questions in `totalizarea 1.pdf`. The correct answers are the options highlighted in green in the PDF.

Open `index.html` in a browser (no install or server needed), or turn on GitHub Pages for this repository and open `/quiz/`.

## Modes

- **Învățare (Learn):** rounds of 10 questions. A wrong answer comes back later in the same round. A question counts as learned after two correct answers in a row.
- **Carduri (Flashcards):** read the question, reveal the highlighted answer, then mark "Știu" (I know it) or "Mai învăț" (still learning).
- **Test:** an exam simulation with 10, 20, 30 or 50 random questions (or all of them). You get your score and the list of mistakes at the end, and can send the mistakes straight to Learn.
- **Lista cu răspunsuri (Answer list):** every question with its correct answers marked. Search by word or by question number.

On the home screen you can limit study to some chapters, a question range (for example 1–50), starred questions, questions you got wrong before, or questions not yet learned. Progress is saved in the browser.

Keyboard: `1`–`5` or `a`–`e` choose an option, `Enter` checks or continues, `Space` flips a flashcard, `←`/`→` rate a card or move between test questions.

## Notes on the answer key

- Question 269 is cut off at the end of the PDF (only option a), so it is not included.
- Question 51 is labelled CS (single answer), but 4 options are highlighted. The quiz treats it as multiple choice.
- Question 139: option b ("6,0 kcal") is highlighted green, but option a is circled in red with "9,3" written next to it. The quiz uses the green answer and shows this note.

## Regenerating from a new PDF

```
pip install pdfplumber
python3 quiz/tools/extract_answers.py "totalizarea 2.pdf" quiz
```

The script reads the green highlighter strokes from the PDF and rewrites `quiz/data.js` (and `quiz/img/` for questions with pictures).
