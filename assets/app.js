/* Igiena generală — flashcard study app.
   Data comes from assets/data.js (window.QUIZ_DATA / window.QUIZ_SECTIONS),
   generated out of "totalizarea 1.pdf" by tools/extract_answers.py. */
(function () {
  "use strict";

  var ALL = window.QUIZ_DATA || [];
  var SECTIONS = window.QUIZ_SECTIONS || [];
  var LETTERS = ["a", "b", "c", "d", "e"];
  var PRESETS = [10, 20, 30, 50, 100];
  var STORE_KEY = "igiena.settings.v1";
  var THEME_KEY = "igiena.theme.v1";

  var $ = function (id) { return document.getElementById(id); };

  /* ── persistence (never fatal: private mode can throw) ───────────── */
  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }

  /* ── settings ────────────────────────────────────────────────────── */
  var settings = {
    mode: "quiz",       // "quiz" = tap the answers and get marked, "flash" = self-assessed
    sections: SECTIONS.slice(),
    count: 20,          // number, or "all"
    shuffleOpts: false,
    hideOpts: false
  };
  (function restore() {
    var s = load(STORE_KEY);
    if (!s) return;
    if (Array.isArray(s.sections)) {
      var keep = s.sections.filter(function (x) { return SECTIONS.indexOf(x) !== -1; });
      if (keep.length) settings.sections = keep;
    }
    if (s.mode === "quiz" || s.mode === "flash") settings.mode = s.mode;
    if (s.count === "all" || (typeof s.count === "number" && s.count > 0)) settings.count = s.count;
    settings.shuffleOpts = !!s.shuffleOpts;
    settings.hideOpts = !!s.hideOpts;
  })();

  /* ── session state ───────────────────────────────────────────────── */
  var session = null;   // { cards, i, known:[], unknown:[] }

  /* ── helpers ─────────────────────────────────────────────────────── */
  function shuffle(arr) {           // Fisher–Yates, on a copy
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function pool() {
    if (settings.sections.length === SECTIONS.length) return ALL;
    return ALL.filter(function (q) { return settings.sections.indexOf(q.s) !== -1; });
  }

  /* A card is a question plus the order its options are shown in. */
  function makeCard(q) {
    var order = settings.shuffleOpts
      ? shuffle(q.o.map(function (_, i) { return i; }))
      : q.o.map(function (_, i) { return i; });
    return { q: q, order: order, picked: [], correct: null };
  }

  function screen(name) {
    ["setup", "study", "results", "review"].forEach(function (s) {
      $("screen-" + s).classList.toggle("is-active", s === name);
    });
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  /* ── setup screen ────────────────────────────────────────────────── */
  function renderSections() {
    var box = $("sections");
    box.innerHTML = "";
    SECTIONS.forEach(function (name) {
      var n = ALL.filter(function (q) { return q.s === name; }).length;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.setAttribute("aria-pressed", settings.sections.indexOf(name) !== -1);
      b.innerHTML = esc(name) + "<small>" + n + " întrebări</small>";
      b.addEventListener("click", function () {
        var at = settings.sections.indexOf(name);
        if (at === -1) settings.sections.push(name);
        else if (settings.sections.length > 1) settings.sections.splice(at, 1);
        else return;                        // never leave the pool empty
        b.setAttribute("aria-pressed", at === -1);
        afterSettingsChange();
      });
      box.appendChild(b);
    });
  }

  function renderCounts() {
    var box = $("counts");
    var max = pool().length;
    box.innerHTML = "";
    PRESETS.filter(function (n) { return n < max; }).concat(["all"]).forEach(function (n) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = n === "all" ? "Toate (" + max + ")" : String(n);
      b.setAttribute("aria-pressed", settings.count === n);
      b.addEventListener("click", function () {
        settings.count = n;
        $("custom-count").value = "";
        afterSettingsChange();
      });
      box.appendChild(b);
    });
  }

  function afterSettingsChange() {
    var max = pool().length;
    if (typeof settings.count === "number" && settings.count > max) settings.count = "all";
    $("pool-count").textContent = max;
    renderCounts();
    save(STORE_KEY, settings);
    var n = sessionSize();
    $("start-note").textContent = n
      ? n + (n === 1 ? " întrebare" : " întrebări") + " din " + max + " disponibile."
      : "";
    $("start-btn").disabled = !n;
  }

  /* Reflect the chosen mode in the setup UI. */
  function syncMode() {
    document.querySelectorAll("#modes .mode").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.mode === settings.mode);
    });
    // "hide the options" would leave nothing to tap in quiz mode.
    var flash = settings.mode === "flash";
    var box = $("opt-hide-opts");
    box.disabled = !flash;
    box.closest(".switch").classList.toggle("is-off", !flash);
    $("start-btn").textContent = flash ? "Începe sesiunea" : "Începe testul";
  }

  function sessionSize() {
    var max = pool().length;
    if (settings.count === "all") return max;
    return Math.max(0, Math.min(max, settings.count | 0));
  }

  /* ── study ───────────────────────────────────────────────────────── */
  function startSession(questions) {
    var qs = questions || shuffle(pool()).slice(0, sessionSize());
    if (!qs.length) return;
    session = { cards: qs.map(makeCard), i: 0, known: [], unknown: [] };
    screen("study");
    renderCard();
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* Front of the card. In quiz mode every option is a button you can tap. */
  function optionList(card) {
    var quiz = settings.mode === "quiz";
    var html = "";
    card.order.forEach(function (orig, pos) {
      var body = "<span class=\"key\">" + LETTERS[pos] + "</span><span>" + card.q.o[orig] + "</span>";
      html += quiz
        ? "<li><button type=\"button\" class=\"opt\" data-pos=\"" + pos + "\" aria-pressed=\"false\">" + body + "</button></li>"
        : "<li>" + body + "</li>";
    });
    return html;
  }

  /* Back of the card: correct answers, plus what was picked when in quiz mode. */
  function answerList(card) {
    var quiz = settings.mode === "quiz";
    var html = "";
    card.order.forEach(function (orig, pos) {
      var right = isRightText(card.q, orig);
      var picked = quiz && card.picked.indexOf(pos) !== -1;
      var cls = right ? "right" : "wrong";
      var tag = "";
      if (quiz) {
        if (right && picked) { tag = "<span class=\"tag tag-you-ok\">răspunsul tău</span>"; }
        else if (right) { cls = "right missed"; tag = "<span class=\"tag tag-miss\">ratat</span>"; }
        else if (picked) { cls = "picked-wrong"; tag = "<span class=\"tag tag-you\">răspunsul tău</span>"; }
      }
      var key = right ? "✓" : (picked ? "✕" : LETTERS[pos]);
      html += "<li class=\"" + cls + "\"><span class=\"key\">" + key + "</span>" +
              "<span>" + card.q.o[orig] + "</span>" + tag + "</li>";
    });
    return html;
  }

  /* Three questions in the paper print the same option twice (#11, #29, #157), so an index
     comparison would mark a word-for-word identical pick wrong. Compare the answer texts. */
  function rightTexts(q) {
    return q.a.map(function (ix) { return q.o[ix]; });
  }

  function isRightText(q, orig) {
    return rightTexts(q).indexOf(q.o[orig]) !== -1;
  }

  /* A question counts as right only when the picked texts match the marked ones exactly. */
  function isCorrect(card) {
    var want = rightTexts(card.q).slice().sort().join("\u0000");
    var got = card.picked.map(function (pos) { return card.q.o[card.order[pos]]; })
                         .sort().join("\u0000");
    return want === got;
  }

  function updatePickUI() {
    var card = session.cards[session.i];
    var quiz = settings.mode === "quiz";
    Array.prototype.forEach.call($("q-opts").querySelectorAll(".opt"), function (btn) {
      btn.setAttribute("aria-pressed", card.picked.indexOf(+btn.dataset.pos) !== -1);
    });
    if (quiz) $("reveal-btn").disabled = card.picked.length === 0;
  }

  function togglePick(pos) {
    var card = session.cards[session.i];
    if ($("flip").classList.contains("flipped")) return;   // already checked
    if (card.q.t === "CS") {
      card.picked = card.picked.length === 1 && card.picked[0] === pos ? [] : [pos];
    } else {
      var at = card.picked.indexOf(pos);
      if (at === -1) card.picked.push(pos); else card.picked.splice(at, 1);
    }
    updatePickUI();
  }

  function renderCard() {
    var card = session.cards[session.i];
    var q = card.q;
    var total = session.cards.length;

    $("flip").classList.remove("flipped");

    $("progress-count").textContent = (session.i + 1) + " / " + total;
    $("progress-fill").style.width = (session.i / total * 100) + "%";
    $("tally-known").textContent = session.known.length;
    $("tally-unknown").textContent = session.unknown.length;

    // front
    $("q-type").textContent = q.t;
    $("q-type").title = q.t === "CM" ? "Complement multiplu — mai multe răspunsuri" : "Complement simplu — un singur răspuns";
    $("q-section").textContent = q.s;
    $("q-num").textContent = "#" + q.n;
    $("q-text").innerHTML = q.q;

    // Questions 264-268 ask about a picture, so it has to stay visible on the answer side too.
    [["q-fig", "q-img"], ["a-fig", "a-img"]].forEach(function (pair) {
      var fig = $(pair[0]), img = $(pair[1]);
      if (q.img) {
        img.src = q.img; fig.hidden = false;
        if (!img.complete) img.addEventListener("load", fitCard, { once: true });
      } else { fig.hidden = true; img.removeAttribute("src"); }
    });

    var quiz = settings.mode === "quiz";
    $("q-opts").innerHTML = (!quiz && settings.hideOpts) ? "" : optionList(card);
    $("q-opts").classList.toggle("pickable", quiz);

    var hint = $("pick-hint");
    hint.hidden = !quiz;
    hint.textContent = q.t === "CM"
      ? "Complement multiplu — bifează toate variantele corecte."
      : "Complement simplu — alege o singură variantă.";

    $("reveal-btn").textContent = quiz ? "Verifică răspunsul" : "Arată răspunsul";
    $("reveal-btn").disabled = quiz;                 // nothing picked yet
    $("reveal-hint").innerHTML = quiz
      ? "tastele <kbd>1</kbd>–<kbd>5</kbd> aleg, <kbd>Enter</kbd> verifică"
      : "sau apasă <kbd>Space</kbd>";

    $("tally-known-lbl").textContent = quiz ? "corecte" : "știute";
    $("tally-unknown-lbl").textContent = quiz ? "greșite" : "de repetat";

    $("kbd-help").innerHTML = quiz
      ? "<kbd>1</kbd>–<kbd>5</kbd> aleg variantele · <kbd>Enter</kbd> verifică / continuă · <kbd>Esc</kbd> termină"
      : "<kbd>Space</kbd> întoarce · <kbd>1</kbd> nu am știut · <kbd>2</kbd> am știut · <kbd>Esc</kbd> termină";

    $("grade-foot").hidden = quiz;
    $("next-foot").hidden = !quiz;
    $("verdict").hidden = true;

    // back
    $("a-section").textContent = q.s;
    $("a-num").textContent = "#" + q.n;
    $("a-q").innerHTML = q.q;
    $("a-opts").innerHTML = answerList(card);
    var note = $("a-note");
    if (q.note) { note.textContent = q.note; note.hidden = false; }
    else { note.hidden = true; note.textContent = ""; }

    $("face-front").querySelector(".face-body").scrollTop = 0;
    $("face-back").querySelector(".face-body").scrollTop = 0;
    fitCard();
  }

  /* The back face is absolutely positioned, so the card is only as tall as the front.
     Grow the front until the answer side fits too, instead of making it scroll. */
  function fitCard() {
    var front = $("face-front");
    var backBody = $("face-back").querySelector(".face-body");
    front.style.minHeight = "";
    requestAnimationFrame(function () {
      var overflow = backBody.scrollHeight - backBody.clientHeight;
      if (overflow > 0) front.style.minHeight = (front.offsetHeight + overflow) + "px";
    });
  }

  function flip() {
    var f = $("flip");
    if (f.classList.contains("flipped")) return;
    var card = session.cards[session.i];
    var quiz = settings.mode === "quiz";

    if (quiz) {
      if (!card.picked.length) return;               // nothing to check yet
      card.correct = isCorrect(card);
      $("a-opts").innerHTML = answerList(card);      // redraw with the picks shown

      var v = $("verdict");
      v.className = "verdict " + (card.correct ? "ok" : "bad");
      v.innerHTML = card.correct
        ? "✓ Corect!"
        : "✕ Greșit <small>· răspunsul corect e marcat cu verde</small>";
      v.hidden = false;

      (card.correct ? session.known : session.unknown).push(card);
      $("tally-known").textContent = session.known.length;
      $("tally-unknown").textContent = session.unknown.length;
      fitCard();
    }

    f.classList.add("flipped");
    window.setTimeout(function () {
      $(quiz ? "next-btn" : "ok-btn").focus({ preventScroll: true });
    }, 380);
  }

  /* Quiz mode has already scored the card, so this only moves on. */
  function advance() {
    if (!$("flip").classList.contains("flipped")) return;
    session.i++;
    if (session.i >= session.cards.length) showResults();
    else renderCard();
  }

  function grade(knew) {
    if (settings.mode === "quiz") return;                   // scored automatically
    if (!$("flip").classList.contains("flipped")) return;   // must reveal first
    (knew ? session.known : session.unknown).push(session.cards[session.i]);
    advance();
  }

  /* ── results ─────────────────────────────────────────────────────── */
  function showResults() {
    var total = session.cards.length;
    var known = session.known.length;
    var pct = total ? Math.round(known / total * 100) : 0;

    var quiz = settings.mode === "quiz";
    document.querySelector(".score.ok span").textContent = quiz ? "Corecte" : "Știute";
    document.querySelector(".score.bad span").textContent = "Greșite";
    $("res-pct").textContent = pct + "%";
    $("res-known").textContent = known;
    $("res-unknown").textContent = session.unknown.length;
    $("res-total").textContent = total;

    $("res-title").textContent =
      pct === 100 ? "Perfect! 🎉" :
      pct >= 80 ? "Foarte bine! 👏" :
      pct >= 60 ? "Bun început 💪" :
      pct >= 40 ? "Mai exersează 📚" : "Hai din nou 🔁";
    $("res-eyebrow").textContent = "Sesiune terminată · " + total +
      (total === 1 ? " întrebare" : " întrebări");

    var ring = $("ring-fg");
    var C = 2 * Math.PI * 52;
    ring.style.stroke = pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--indigo)" : "var(--red)";
    ring.style.strokeDashoffset = C;                 // reset, then animate on next frame
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        ring.style.strokeDashoffset = C * (1 - pct / 100);
      });
    });

    var hasWrong = session.unknown.length > 0;
    $("review-btn").disabled = !hasWrong;
    $("retry-wrong-btn").disabled = !hasWrong;
    $("retry-wrong-btn").textContent = hasWrong
      ? "Repetă greșelile (" + session.unknown.length + ")"
      : "Repetă greșelile";

    screen("results");
  }

  /* ── review ──────────────────────────────────────────────────────── */
  function showReview() {
    var list = $("review-list");
    list.innerHTML = "";
    if (!session || !session.unknown.length) {
      list.innerHTML = "<p class=\"review-empty\">Nicio greșeală — totul a fost știut. 🎉</p>";
    } else {
      session.unknown.forEach(function (card) {
        var q = card.q;
        var el = document.createElement("article");
        el.className = "card review-item";
        el.innerHTML =
          "<div class=\"face-top\">" +
            "<span class=\"badge\">" + q.t + "</span>" +
            "<span class=\"q-section\">" + esc(q.s) + "</span>" +
            "<span class=\"q-num\">#" + q.n + "</span>" +
          "</div>" +
          "<h2 class=\"q-text\">" + q.q + "</h2>" +
          (q.img ? "<figure class=\"q-fig\"><img src=\"" + esc(q.img) + "\" alt=\"Imagine din întrebarea " + q.n + "\"></figure>" : "") +
          (card.correct === false
            ? "<p class=\"verdict bad\">✕ Răspunsul tău a fost greșit</p>" : "") +
          "<ul class=\"opts opts-ans\">" + answerList(card) + "</ul>" +
          (q.note ? "<p class=\"note\">" + esc(q.note) + "</p>" : "");
        list.appendChild(el);
      });
    }
    screen("review");
  }

  /* ── wiring ──────────────────────────────────────────────────────── */
  function init() {
    if (!ALL.length) {
      $("start-note").textContent = "Nu s-au putut încărca întrebările (assets/data.js).";
      $("start-btn").disabled = true;
      return;
    }

    $("pill-total").textContent = ALL.length + " întrebări";
    document.querySelector(".site-foot p").innerHTML =
      ALL.length + " de întrebări extrase din <em>totalizarea 1.pdf</em> · " +
      "răspunsurile corecte = cele evidențiate cu verde în PDF.";

    renderSections();
    afterSettingsChange();

    $("custom-count").addEventListener("input", function () {
      var v = parseInt(this.value, 10);
      if (v > 0) { settings.count = v; afterSettingsChange(); }
    });

    document.querySelectorAll("[data-sections]").forEach(function (b) {
      b.addEventListener("click", function () {
        // "none" still leaves one section on, so a session is always possible.
        settings.sections = b.dataset.sections === "all" ? SECTIONS.slice() : [SECTIONS[0]];
        renderSections();
        afterSettingsChange();
      });
    });

    $("opt-shuffle-opts").checked = settings.shuffleOpts;
    $("opt-hide-opts").checked = settings.hideOpts;
    $("opt-shuffle-opts").addEventListener("change", function () {
      settings.shuffleOpts = this.checked; save(STORE_KEY, settings);
    });
    $("opt-hide-opts").addEventListener("change", function () {
      settings.hideOpts = this.checked; save(STORE_KEY, settings);
    });

    document.querySelectorAll("#modes .mode").forEach(function (b) {
      b.addEventListener("click", function () {
        settings.mode = b.dataset.mode;
        syncMode();
        save(STORE_KEY, settings);
      });
    });
    syncMode();

    // Options are redrawn for every card, so listen on the list instead of each button.
    $("q-opts").addEventListener("click", function (e) {
      var btn = e.target.closest(".opt");
      if (btn) togglePick(+btn.dataset.pos);
    });

    $("start-btn").addEventListener("click", function () { startSession(); });
    $("reveal-btn").addEventListener("click", flip);
    $("next-btn").addEventListener("click", advance);
    $("ok-btn").addEventListener("click", function () { grade(true); });
    $("bad-btn").addEventListener("click", function () { grade(false); });

    $("quit-btn").addEventListener("click", function () {
      if (session && session.i > 0) showResults();     // keep what was answered
      else screen("setup");
    });
    $("brand").addEventListener("click", function () { screen("setup"); });
    $("home-btn").addEventListener("click", function () { screen("setup"); });
    $("again-btn").addEventListener("click", function () { startSession(); });
    $("retry-wrong-btn").addEventListener("click", function () {
      if (session && session.unknown.length) {
        startSession(shuffle(session.unknown.map(function (c) { return c.q; })));
      }
    });
    $("review-btn").addEventListener("click", showReview);
    $("back-res-btn").addEventListener("click", function () { screen("results"); });

    document.addEventListener("keydown", function (e) {
      if (!$("screen-study").classList.contains("is-active")) return;
      if (e.target.matches("input, textarea")) return;
      var flipped = $("flip").classList.contains("flipped");
      var quiz = settings.mode === "quiz";

      if (e.key === "Escape") { $("quit-btn").click(); return; }

      if (e.code === "Space" || e.key === "Enter") {
        e.preventDefault();
        if (flipped) { if (quiz) advance(); }
        else flip();
        return;
      }

      if (quiz) {
        var n = parseInt(e.key, 10);
        if (!flipped && n >= 1 && n <= 5) { e.preventDefault(); togglePick(n - 1); }
      } else if (e.key === "1") { grade(false); }
      else if (e.key === "2") { grade(true); }
    });

    window.addEventListener("resize", function () {
      if ($("screen-study").classList.contains("is-active")) fitCard();
    });

    // theme
    var saved = load(THEME_KEY);
    if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved;
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.dataset.theme = "dark";
    $("theme-btn").addEventListener("click", function () {
      var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      save(THEME_KEY, next);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
