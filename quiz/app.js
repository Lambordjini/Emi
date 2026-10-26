(function () {
  "use strict";

  var DATA = window.QUIZ_DATA || [];
  var SECTIONS = window.QUIZ_SECTIONS || [];
  var byN = new Map(DATA.map(function (q) { return [q.n, q]; }));
  var LETTERS = "abcde";
  var ROUND = 10;
  var KEY = "igiena-teste-v1";
  var MINN = Math.min.apply(null, DATA.map(function (q) { return q.n; }));
  var MAXN = Math.max.apply(null, DATA.map(function (q) { return q.n; }));

  var ICON = {
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
    learn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v3.8h3.8"/><path d="M9 12.2l2.1 2.1 4-4.3"/></svg>',
    cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7.5" width="14" height="13" rx="2"/><path d="M7 4h11.5a2 2 0 0 1 2 2v11.5"/></svg>',
    test: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9.5 4V2.8h5V4"/><path d="M8.8 12.5l2 2 4.4-4.5"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4 6.5h.5M4 12h.5M4 17.5h.5" stroke-width="2.6"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>'
  };

  /* ---------------- storage ---------------- */

  function defaults() {
    return {
      p: {},
      resetAt: 0,
      sel: { sec: [], from: MINN, to: MAXN, only: "all" },
      opt: { shuffle: true, cardsShuffle: true }
    };
  }

  function loadStore() {
    var d = defaults();
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw);
        return {
          p: cleanProgress(s.p),
          resetAt: +s.resetAt || 0,
          sel: Object.assign(d.sel, s.sel || {}),
          opt: Object.assign(d.opt, s.opt || {})
        };
      }
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    return d;
  }

  function cleanProgress(p) {
    var out = {};
    if (!p || typeof p !== "object") return out;
    Object.keys(p).forEach(function (n) {
      var r = p[n];
      if (!byN.has(+n) || !r || typeof r !== "object") return;
      out[n] = { b: +r.b || 0, c: +r.c || 0, w: +r.w || 0, s: r.s ? 1 : 0, t: +r.t || 0 };
    });
    return out;
  }

  var store = loadStore();

  function persist(progressChanged) {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private mode */ }
    if (progressChanged) Sync.schedule();
  }

  function rec(n) { return store.p[n] || { b: 0, c: 0, w: 0, s: 0, t: 0 }; }

  function put(n, r) { r.t = Date.now(); store.p[n] = r; }

  // Leitner-style box: 0 new · 1 wrong recently · 2 seen correct · 3+ learned
  function record(n, ok) {
    var r = Object.assign({}, rec(n));
    if (ok) { r.c++; r.b = r.b === 0 ? 2 : Math.min(4, r.b + 1); }
    else { r.w++; r.b = 1; }
    put(n, r);
    persist(true);
  }

  function toggleStar(n) {
    var r = Object.assign({}, rec(n));
    r.s = r.s ? 0 : 1;
    put(n, r);
    persist(true);
    return !!r.s;
  }

  function status(n) {
    var b = rec(n).b;
    return b === 0 ? "new" : b >= 3 ? "done" : "learn";
  }

  /* ---------------- sync with the Claude account (published page only) ---------------- */

  var Sync = (function () {
    var ref = null, timer = null, writing = false, again = false;
    var api = { active: false, schedule: schedule };

    function snapshot() { return { v: 1, p: store.p, resetAt: store.resetAt || 0 }; }

    function merge(remote) {
      var res = { changed: false, push: false };
      if (!remote || typeof remote !== "object") { res.push = true; return res; }
      var rp = cleanProgress(remote.p);
      var resetAt = Math.max(store.resetAt || 0, +remote.resetAt || 0);
      if (resetAt > (store.resetAt || 0)) {
        Object.keys(store.p).forEach(function (n) {
          if (store.p[n].t < resetAt) { delete store.p[n]; res.changed = true; }
        });
        store.resetAt = resetAt;
        res.changed = true;
      }
      Object.keys(rp).forEach(function (n) {
        var r = rp[n], l = store.p[n];
        if (r.t < resetAt) return;
        if (!l || r.t > l.t) { store.p[n] = r; res.changed = true; }
      });
      Object.keys(store.p).forEach(function (n) {
        if (!rp[n] || store.p[n].t > rp[n].t) res.push = true;
      });
      if ((+remote.resetAt || 0) < resetAt) res.push = true;
      return res;
    }

    function schedule() {
      if (!ref) return;
      clearTimeout(timer);
      timer = setTimeout(flush, 1500);
    }

    function flush() {
      if (!ref) return;
      if (writing) { again = true; return; }
      writing = true;
      ref.set(snapshot()).catch(function (e) {
        var code = e && e.code;
        if (code !== "unavailable" && code !== "resource_exhausted") stop();
      }).then(function () {
        writing = false;
        if (again) { again = false; flush(); }
      });
    }

    function stop() {
      ref = null;
      api.active = false;
      updateSyncNote();
    }

    function init() {
      if (!window.claude || typeof window.claude.use !== "function") return;
      Promise.all([window.claude.use("db"), window.claude.use("user")]).then(function (caps) {
        var db = caps[0], user = caps[1];
        if (!db || !user) return null;
        return user.id().then(function (uid) {
          if (!uid) return null;
          var r = db.doc("data/users/" + uid + "/progress");
          return r.get().then(function (snap) {
            ref = r;
            api.active = true;
            var res = merge(snap.exists ? snap.data() : null);
            if (res.changed) { persist(false); refreshAfterSync(); }
            if (res.push) flush();
            updateSyncNote();
          });
        });
      }).catch(function () { stop(); });
    }

    api.init = init;
    return api;
  })();

  function updateSyncNote() {
    var el = document.getElementById("sync-note");
    if (el) el.textContent = syncText();
  }

  function syncText() {
    return Sync.active
      ? "Progresul se sincronizează cu contul tău Claude, deci îl regăsești și pe telefon și pe laptop."
      : "Progresul se salvează în acest browser.";
  }

  function refreshAfterSync() {
    if (S.view === "home" || S.view === "list") render();
  }

  /* ---------------- helpers ---------------- */

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function norm(s) {
    return String(s).replace(/<[^>]+>/g, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  var searchText = new Map(DATA.map(function (q) { return [q.n, norm(q.q + " " + q.o.join(" "))]; }));

  function plain(html) { return String(html).replace(/<[^>]+>/g, ""); }

  function fmtTime(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(s / 60);
    return m + ":" + String(s % 60).padStart(2, "0");
  }

  function pool() {
    var s = store.sel;
    return DATA.filter(function (q) {
      if (s.sec.length && s.sec.indexOf(q.s) < 0) return false;
      if (q.n < s.from || q.n > s.to) return false;
      var r = rec(q.n);
      if (s.only === "star") return !!r.s;
      if (s.only === "wrong") return r.w > 0;
      if (s.only === "notdone") return status(q.n) !== "done";
      return true;
    });
  }

  function counts(list) {
    var c = { done: 0, learn: 0, new: 0 };
    list.forEach(function (q) { c[status(q.n)]++; });
    return c;
  }

  function orderFor(q) {
    var idx = q.o.map(function (_, i) { return i; });
    return store.opt.shuffle ? shuffle(idx) : idx;
  }

  function grade(q, sel) {
    if (!sel || !sel.size) return "skip";
    var allIn = q.a.every(function (i) { return sel.has(i); });
    var noWrong = Array.from(sel).every(function (i) { return q.a.indexOf(i) >= 0; });
    if (allIn && noWrong) return "ok";
    if (noWrong) return "half";
    return "bad";
  }

  function lettersOf(order, idxs) {
    return idxs.map(function (i) { return order.indexOf(i); }).sort().map(function (p) { return LETTERS[p]; }).join(", ");
  }

  /* ---------------- shared renderers ---------------- */

  function starBtn(n) {
    var on = !!rec(n).s;
    return '<button type="button" class="icon-btn" data-act="star" data-n="' + n + '" aria-pressed="' + on +
      '" aria-label="Marchează întrebarea ' + n + ' cu stea" title="Marchează cu stea">' + ICON.star + "</button>";
  }

  function typeTag(q) {
    return q.t === "CM"
      ? '<span class="tag cm" title="Complement multiplu">CM · mai multe</span>'
      : '<span class="tag" title="Complement simplu">CS · unul</span>';
  }

  function metaRow(q, extra) {
    return '<div class="qmeta"><span class="qnum">#' + q.n + "</span>" + typeTag(q) +
      '<span class="qsec">' + esc(q.s) + "</span>" + (extra || "") + starBtn(q.n) + "</div>";
  }

  function qBody(q) {
    var h = '<p class="qtext">' + q.q + "</p>";
    if (q.img) h += '<img class="qimg" src="' + q.img + '" alt="Imaginea pentru întrebarea ' + q.n + '">';
    return h;
  }

  // o: { order, sel (Set|null), revealed, buttons, dimOthers }
  function optsHTML(q, o) {
    var order = o.order;
    return '<ol class="opts">' + order.map(function (oi, pos) {
      var ok = q.a.indexOf(oi) >= 0;
      var chosen = !!(o.sel && o.sel.has(oi));
      var cls = "opt", verdict = "";
      if (o.revealed) {
        if (ok) {
          cls += " ok";
          if (o.sel) { if (chosen) verdict = "corect"; else { cls += " missed"; verdict = "omis"; } }
        } else if (chosen) { cls += " bad"; verdict = "greșit"; }
        else if (o.dimOthers) cls += " dim";
      } else if (chosen) cls += " sel";
      var inner = '<span class="letter">' + LETTERS[pos] + '</span><span class="otext"><span class="ink">' + q.o[oi] +
        '</span></span><span class="verdict">' + verdict + "</span>";
      if (o.buttons) {
        return '<li><button type="button" class="' + cls + '" data-act="pick" data-i="' + oi + '" aria-pressed="' + chosen + '">' + inner + "</button></li>";
      }
      return '<li><div class="' + cls + '">' + inner + "</div></li>";
    }).join("") + "</ol>";
  }

  function feedbackHTML(q, order, sel, res, extra) {
    var right = lettersOf(order, q.a);
    var cls, title, body;
    if (res === "ok") {
      cls = "good"; title = "Corect!";
      body = q.a.length > 1 ? "Ai găsit toate cele " + q.a.length + " răspunsuri." : "";
    } else if (res === "half") {
      var miss = q.a.filter(function (i) { return !sel.has(i); });
      cls = "half"; title = "Parțial corect";
      body = "Îți " + (miss.length > 1 ? "lipsesc" : "lipsește") + ": " + lettersOf(order, miss) + ". Răspuns complet: " + right + ".";
    } else if (res === "skip") {
      cls = "bad"; title = "Răspunsul corect: " + right;
      body = "";
    } else {
      cls = "bad"; title = "Greșit";
      body = "Răspuns corect: " + right + ".";
    }
    var h = '<div class="feedback ' + cls + '" role="status"><strong>' + title + "</strong>";
    if (body) h += "<span>" + body + "</span>";
    if (extra) h += '<span class="small">' + extra + "</span>";
    if (q.note) h += '<div class="note">' + esc(q.note) + "</div>";
    return h + "</div>";
  }

  function hintFor(q) {
    return q.t === "CM"
      ? "Alege toate variantele corecte, apoi apasă Verifică."
      : "Un singur răspuns corect. Apasă pe el.";
  }

  /* ---------------- state + routing ---------------- */

  var S = {
    view: "home",
    learn: null,
    cards: null,
    test: { phase: "setup", count: 20 },
    list: { q: "", hide: false, open: new Set() },
    confirmReset: false
  };

  var app = document.getElementById("app");
  var crumb = document.getElementById("crumb");
  var NAMES = { home: "", learn: "Învățare", cards: "Carduri", test: "Test", list: "Lista cu răspunsuri" };

  function go(view) {
    S.view = view;
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    crumb.textContent = NAMES[S.view] || "";
    var fn = { home: renderHome, learn: renderLearn, cards: renderCards, test: renderTest, list: renderList }[S.view];
    app.innerHTML = '<section class="view">' + fn() + "</section>";
    if (S.view === "list") renderListItems();
  }

  /* ---------------- home ---------------- */

  function renderHome() {
    var all = counts(DATA);
    var total = DATA.length;
    var p = pool();
    var pc = counts(p);
    var sel = store.sel;
    var nStar = 0, nWrong = 0, nNot = 0;
    DATA.forEach(function (q) {
      var r = rec(q.n);
      if (r.s) nStar++;
      if (r.w > 0) nWrong++;
      if (status(q.n) !== "done") nNot++;
    });

    function bar(c, t) {
      return '<div class="stack" aria-hidden="true"><span class="s-done" style="width:' + (100 * c.done / t) +
        '%"></span><span class="s-learn" style="width:' + (100 * c.learn / t) + '%"></span></div>';
    }

    var secRows = SECTIONS.map(function (s) {
      var qs = DATA.filter(function (q) { return q.s === s; });
      var c = counts(qs);
      return '<div class="sec-row"><span class="name">' + esc(s) + '</span><span class="num">' + c.done + " / " + qs.length +
        "</span>" + bar(c, qs.length) + "</div>";
    }).join("");

    var secChips = '<button type="button" class="chip" data-act="sec" data-s="" aria-pressed="' + (!sel.sec.length) + '">Toate capitolele</button>' +
      SECTIONS.map(function (s, i) {
        var n = DATA.filter(function (q) { return q.s === s; }).length;
        return '<button type="button" class="chip" data-act="sec" data-s="' + i + '" aria-pressed="' + (sel.sec.indexOf(s) >= 0) + '">' +
          esc(s) + ' <span class="n">' + n + "</span></button>";
      }).join("");

    var onlyChips = [["all", "Toate", ""], ["star", "Cu stea", nStar], ["wrong", "Greșite cândva", nWrong], ["notdone", "Neînvățate", nNot]]
      .map(function (o) {
        return '<button type="button" class="chip" data-act="only" data-v="' + o[0] + '" aria-pressed="' + (sel.only === o[0]) + '">' + o[1] +
          (o[2] !== "" ? ' <span class="n">' + o[2] + "</span>" : "") + "</button>";
      }).join("");

    var empty = !p.length;
    var dis = empty ? " disabled" : "";

    return (
      '<div class="hero">' +
        '<span class="eyebrow">Totalizarea 1 · ' + total + " întrebări</span>" +
        '<h1>Igiena <span class="hl">generală</span></h1>' +
        "<p>Răspunsurile corecte sunt cele marcate cu verde în „totalizarea 1.pdf”. Învață în runde scurte, verifică-te cu cardurile și simulează testul.</p>" +
      "</div>" +

      '<div class="panel" aria-label="Progresul tău">' +
        '<span class="eyebrow">Progresul tău</span>' +
        '<div class="progress-head"><span class="big">' + all.done + '</span><span class="muted">din ' + total + " întrebări învățate</span></div>" +
        bar(all, total) +
        '<div class="legend"><span><i class="i-done"></i>Învățate <b>' + all.done + '</b></span><span><i class="i-learn"></i>În lucru <b>' + all.learn +
          '</b></span><span><i class="i-new"></i>Noi <b>' + all.new + "</b></span></div>" +
        '<div class="sections">' + secRows + "</div>" +
        '<p class="small muted" style="margin:0">O întrebare devine „învățată” după ce răspunzi corect de două ori la rând.</p>' +
      "</div>" +

      '<div class="panel">' +
        '<span class="eyebrow">Ce studiezi</span>' +
        '<div class="field"><span class="label">Capitole</span><div class="chips">' + secChips + "</div></div>" +
        '<div class="field"><span class="label">Interval de întrebări</span><div class="range">' +
          '<label for="from" class="muted small">de la</label><input id="from" type="number" inputmode="numeric" min="' + MINN + '" max="' + MAXN + '" value="' + sel.from + '">' +
          '<label for="to" class="muted small">până la</label><input id="to" type="number" inputmode="numeric" min="' + MINN + '" max="' + MAXN + '" value="' + sel.to + '">' +
          (sel.from !== MINN || sel.to !== MAXN ? '<button type="button" class="btn ghost sm" data-act="range-all">Toate</button>' : "") +
        "</div></div>" +
        '<div class="field"><span class="label">Filtru</span><div class="chips">' + onlyChips + "</div></div>" +
        '<label class="switch"><input type="checkbox" id="opt-shuffle"' + (store.opt.shuffle ? " checked" : "") + "> Amestecă ordinea variantelor de răspuns</label>" +
        '<div class="pool-count"><span class="big">' + p.length + '</span><span class="muted">' +
          (p.length === 1 ? "întrebare selectată" : "întrebări selectate") +
          (p.length ? " · " + pc.done + " învățate, " + pc.learn + " în lucru, " + pc.new + " noi" : "") + "</span></div>" +
        (empty ? '<p class="small" style="margin:0;color:var(--bad)">Nicio întrebare nu se potrivește. Schimbă capitolele, intervalul sau filtrul.</p>' : "") +
      "</div>" +

      '<div class="modes">' +
        '<button type="button" class="mode featured" data-act="start-learn"' + dis + "><span class=\"mode-t\">" + ICON.learn + "Învățare</span><span class=\"mode-d\">Runde de câte " + ROUND +
          " întrebări. Cele greșite revin în aceeași rundă până le știi, apoi apar mai rar.</span></button>" +
        '<button type="button" class="mode" data-act="start-cards"' + dis + "><span class=\"mode-t\">" + ICON.cards + "Carduri</span><span class=\"mode-d\">Citești întrebarea, întorci cardul și vezi răspunsul marcat. Spui singur dacă îl știai.</span></button>" +
        '<button type="button" class="mode" data-act="open-test"' + dis + "><span class=\"mode-t\">" + ICON.test + "Test</span><span class=\"mode-d\">Simulare de examen: întrebări la întâmplare, nota la final și lista greșelilor.</span></button>" +
        '<button type="button" class="mode" data-act="open-list"><span class="mode-t">' + ICON.list + "Lista cu răspunsuri</span><span class=\"mode-d\">Toate întrebările cu răspunsurile corecte marcate. Caută după cuvinte sau număr.</span></button>" +
      "</div>" +

      '<div class="foot">' +
        '<span id="sync-note">' + syncText() + "</span>" +
        (S.confirmReset
          ? '<div class="confirm"><span>Ștergi tot progresul (răspunsuri, stele, întrebări învățate)? Nu se poate anula.</span>' +
            '<div class="row"><button type="button" class="btn danger sm" data-act="reset-yes">Da, șterge progresul</button>' +
            '<button type="button" class="btn sm" data-act="reset-no">Renunță</button></div></div>'
          : '<div><button type="button" class="btn ghost sm" data-act="reset">Resetează progresul</button></div>') +
      "</div>"
    );
  }

  /* ---------------- learn ---------------- */

  function startLearn(customNs, label) {
    var base = customNs || pool().map(function (q) { return q.n; });
    if (!base.length) return;
    S.learn = { base: base, label: label || "", roundNo: 0 };
    newRound();
    go("learn");
  }

  function newRound() {
    var L = S.learn;
    var rank = { 1: 0, 2: 1, 0: 2, 3: 3, 4: 4 };
    var picked = shuffle(L.base).sort(function (x, y) { return rank[rec(x).b] - rank[rec(y).b]; }).slice(0, ROUND);
    L.roundNo++;
    L.round = picked;
    L.queue = shuffle(picked);
    L.first = {};
    L.cleared = new Set();
    L.summary = false;
    nextLearnQ();
  }

  function nextLearnQ() {
    var L = S.learn;
    if (!L.queue.length) { L.cur = null; L.summary = true; return; }
    var n = L.queue.shift();
    L.cur = { n: n, order: orderFor(byN.get(n)), sel: new Set(), revealed: false, res: null };
  }

  function learnCheck(skip) {
    var L = S.learn, c = L.cur;
    if (!c || c.revealed) return;
    if (!skip && !c.sel.size) return;
    var q = byN.get(c.n);
    c.revealed = true;
    c.res = skip ? "skip" : grade(q, c.sel);
    var ok = c.res === "ok";
    record(c.n, ok);
    if (!(c.n in L.first)) L.first[c.n] = ok;
    if (ok) L.cleared.add(c.n);
    else L.queue.splice(Math.min(3, L.queue.length), 0, c.n);
    render();
    var fb = app.querySelector(".feedback");
    if (fb && fb.scrollIntoView) fb.scrollIntoView({ block: "nearest", behavior: "smooth" });
    var btn = app.querySelector('[data-act="learn-next"]');
    if (btn) btn.focus({ preventScroll: true });
  }

  function learnNext() {
    nextLearnQ();
    render();
    window.scrollTo(0, 0);
  }

  function renderLearn() {
    var L = S.learn;
    var baseQs = L.base.map(function (n) { return byN.get(n); });
    var bc = counts(baseQs);
    var top = '<div class="study-top"><div class="row between"><span class="eyebrow">' +
      (L.label ? esc(L.label) + " · " : "") + "Runda " + L.roundNo + " · " + L.cleared.size + " din " + L.round.length +
      ' rezolvate</span><span class="small muted">Învățate: ' + bc.done + " / " + baseQs.length + "</span></div>" +
      '<div class="track"><span style="width:' + (100 * L.cleared.size / L.round.length) + '%"></span></div></div>';

    if (L.summary) {
      var firstOk = L.round.filter(function (n) { return L.first[n]; }).length;
      var allDone = bc.done === baseQs.length;
      return top +
        '<div class="panel"><span class="eyebrow">Runda ' + L.roundNo + ' încheiată</span>' +
        '<div class="progress-head"><span class="big">' + firstOk + " / " + L.round.length + '</span><span class="muted">corecte din prima încercare</span></div>' +
        (allDone ? '<p style="margin:0">Ai învățat toate cele ' + baseQs.length + " întrebări din selecție. Rundele următoare sunt recapitulare.</p>" : "") +
        '<ul class="summary-list">' + L.round.map(function (n) {
          var q = byN.get(n);
          return '<li><span class="qnum">#' + n + '</span><span class="t">' + esc(plain(q.q)) + '</span><span class="pill ' + (L.first[n] ? "done" : "learn") + '">' +
            (L.first[n] ? "din prima" : "după repetare") + "</span></li>";
        }).join("") + "</ul>" +
        '<div class="actions"><button type="button" class="btn primary" data-act="learn-round">Runda următoare <span class="kbd">Enter</span></button>' +
        '<button type="button" class="btn" data-act="home">Înapoi acasă</button></div></div>';
    }

    var c = L.cur, q = byN.get(c.n);
    var single = q.t === "CS";
    var actions = c.revealed
      ? '<button type="button" class="btn primary" data-act="learn-next">Continuă <span class="kbd">Enter</span></button>'
      : (single ? "" : '<button type="button" class="btn primary" data-act="learn-check"' + (c.sel.size ? "" : " disabled") + '>Verifică <span class="kbd">Enter</span></button>') +
        '<button type="button" class="btn ghost" data-act="learn-skip">Nu știu, arată răspunsul</button>';
    var extra = c.revealed && c.res !== "ok" ? "Întrebarea revine mai târziu în această rundă." : "";

    return top +
      '<article class="qcard' + (c.revealed ? " revealed" : "") + '">' +
        metaRow(q) + qBody(q) +
        (c.revealed ? "" : '<p class="hint">' + hintFor(q) + "</p>") +
        optsHTML(q, { order: c.order, sel: c.sel, revealed: c.revealed, buttons: true, dimOthers: true }) +
      "</article>" +
      (c.revealed ? feedbackHTML(q, c.order, c.sel, c.res, extra) : "") +
      '<div class="actions">' + actions + "</div>";
  }

  /* ---------------- flashcards ---------------- */

  function startCards(list) {
    var ns = list || pool().map(function (q) { return q.n; });
    if (!ns.length) return;
    S.cards = {
      list: !list && store.opt.cardsShuffle ? shuffle(ns) : ns,
      i: 0, revealed: false, rated: {}, done: false
    };
    S.cards.orders = {};
    go("cards");
  }

  function cardOrder(n) {
    var C = S.cards;
    if (!C.orders[n]) C.orders[n] = orderFor(byN.get(n));
    return C.orders[n];
  }

  function cardsRate(ok) {
    var C = S.cards;
    if (!C.revealed) return;
    var n = C.list[C.i];
    record(n, ok);
    C.rated[n] = ok;
    cardsMove(1);
  }

  function cardsMove(d) {
    var C = S.cards;
    var ni = C.i + d;
    if (ni < 0) return;
    if (ni >= C.list.length) { C.done = true; }
    else { C.i = ni; }
    C.revealed = false;
    render();
    window.scrollTo(0, 0);
  }

  function renderCards() {
    var C = S.cards;
    var total = C.list.length;
    var know = C.list.filter(function (n) { return C.rated[n] === true; });
    var again = C.list.filter(function (n) { return C.rated[n] === false; });

    if (C.done) {
      return '<div class="panel"><span class="eyebrow">Ai parcurs toate cardurile</span>' +
        '<div class="progress-head"><span class="big">' + know.length + " / " + total + '</span><span class="muted">le știai</span></div>' +
        '<p style="margin:0" class="muted">' + again.length + (again.length === 1 ? " card marcat" : " carduri marcate") + " „Mai învăț”.</p>" +
        '<div class="actions">' +
          (again.length ? '<button type="button" class="btn primary" data-act="cards-again">Repetă cele ' + again.length + "</button>" : "") +
          '<button type="button" class="btn' + (again.length ? "" : " primary") + '" data-act="cards-restart">Reia toate cardurile</button>' +
          '<button type="button" class="btn ghost" data-act="home">Înapoi acasă</button>' +
        "</div></div>";
    }

    var n = C.list[C.i], q = byN.get(n), order = cardOrder(n);
    var top = '<div class="study-top"><div class="row between"><span class="eyebrow">Cardul ' + (C.i + 1) + " din " + total + "</span>" +
      '<label class="switch small"><input type="checkbox" id="opt-cards-shuffle"' + (store.opt.cardsShuffle ? " checked" : "") + "> Ordine aleatorie</label></div>" +
      '<div class="track"><span style="width:' + (100 * C.i / total) + '%"></span></div></div>';

    var buttons = C.revealed
      ? '<div class="fc-buttons"><button type="button" class="btn no" data-act="cards-no"><span class="kbd">←</span> Mai învăț</button>' +
        '<button type="button" class="btn yes" data-act="cards-yes">Știu <span class="kbd">→</span></button></div>'
      : '<div class="actions"><button type="button" class="btn primary" data-act="cards-flip">Arată răspunsul <span class="kbd">Spațiu</span></button>' +
        (C.i > 0 ? '<button type="button" class="btn ghost" data-act="cards-prev">‹ Cardul anterior</button>' : "") + "</div>";

    return top +
      '<article class="qcard tappable' + (C.revealed ? " revealed" : "") + '" data-act="cards-flip">' +
        metaRow(q) + qBody(q) +
        optsHTML(q, { order: order, sel: null, revealed: C.revealed, buttons: false, dimOthers: true }) +
        (C.revealed && q.note ? '<div class="note">' + esc(q.note) + "</div>" : "") +
        (C.revealed ? "" : '<p class="hint" style="margin:0">Gândește-te la răspuns, apoi atinge cardul.</p>') +
      "</article>" + buttons;
  }

  /* ---------------- test ---------------- */

  function startTest() {
    var T = S.test;
    var ns = shuffle(pool().map(function (q) { return q.n; }));
    if (!ns.length) return;
    var count = T.count === "all" ? ns.length : Math.min(T.count, ns.length);
    S.test = {
      phase: "run", count: T.count, list: ns.slice(0, count), i: 0,
      sel: {}, orders: {}, started: Date.now(), confirm: false, onlyWrong: false
    };
    S.test.list.forEach(function (n) { S.test.sel[n] = new Set(); S.test.orders[n] = orderFor(byN.get(n)); });
    go("test");
  }

  function finishTest() {
    var T = S.test;
    T.phase = "done";
    T.elapsed = Date.now() - T.started;
    T.res = {};
    T.list.forEach(function (n) {
      var r = grade(byN.get(n), T.sel[n]);
      T.res[n] = r;
      record(n, r === "ok");
    });
    go("test");
  }

  function renderTest() {
    var T = S.test;
    var p = pool();

    if (T.phase === "setup") {
      var opts = [10, 20, 30, 50].filter(function (k) { return k < p.length; });
      var chips = opts.map(function (k) {
        return '<button type="button" class="chip" data-act="test-count" data-v="' + k + '" aria-pressed="' + (T.count === k) + '">' + k + " întrebări</button>";
      }).join("") + '<button type="button" class="chip" data-act="test-count" data-v="all" aria-pressed="' +
        (T.count === "all" || opts.indexOf(T.count) < 0) + '">Toate (' + p.length + ")</button>";
      return '<div class="panel"><span class="eyebrow">Simulare de test</span>' +
        '<h2 style="font-size:var(--step-3)">Câte întrebări?</h2>' +
        '<p class="muted" style="margin:0">Întrebările se aleg la întâmplare din selecția ta (' + p.length + "). Răspunsurile apar abia la final, ca la examen.</p>" +
        '<div class="chips">' + chips + "</div>" +
        '<div class="actions"><button type="button" class="btn primary" data-act="test-start">Începe testul</button>' +
        '<button type="button" class="btn ghost" data-act="home">Schimbă selecția</button></div></div>';
    }

    if (T.phase === "run") {
      var n = T.list[T.i], q = byN.get(n), order = T.orders[n];
      var answered = T.list.filter(function (k) { return T.sel[k].size; }).length;
      var nav = '<div class="grid-nav" aria-label="Navigare între întrebări">' + T.list.map(function (k, j) {
        return '<button type="button" data-act="test-go" data-j="' + j + '" class="' + (T.sel[k].size ? "ans" : "") + (j === T.i ? " cur" : "") +
          '" aria-label="Întrebarea ' + (j + 1) + '">' + (j + 1) + "</button>";
      }).join("") + "</div>";
      var last = T.i === T.list.length - 1;
      var confirm = T.confirm
        ? '<div class="confirm"><span>Ai ' + (T.list.length - answered) + " " + (T.list.length - answered === 1 ? "întrebare" : "întrebări") +
          " fără răspuns. Le numărăm greșite. Termini testul?</span>" +
          '<div class="row"><button type="button" class="btn primary sm" data-act="test-finish-yes">Da, termină</button>' +
          '<button type="button" class="btn sm" data-act="test-finish-no">Mă întorc la întrebări</button></div></div>'
        : "";
      return '<div class="study-top"><div class="row between"><span class="eyebrow">Întrebarea ' + (T.i + 1) + " din " + T.list.length +
        '</span><span class="clock" id="clock">' + fmtTime(Date.now() - T.started) + "</span></div>" +
        '<div class="track"><span style="width:' + (100 * answered / T.list.length) + '%"></span></div>' + nav + "</div>" +
        '<article class="qcard">' + metaRow(q) + qBody(q) +
          '<p class="hint">' + (q.t === "CM" ? "Alege toate variantele corecte." : "Alege un singur răspuns.") + "</p>" +
          optsHTML(q, { order: order, sel: T.sel[n], revealed: false, buttons: true }) +
        "</article>" + confirm +
        '<div class="actions">' +
          '<button type="button" class="btn" data-act="test-prev"' + (T.i === 0 ? " disabled" : "") + ">‹ Înapoi</button>" +
          (last
            ? '<button type="button" class="btn primary" data-act="test-finish">Termină testul</button>'
            : '<button type="button" class="btn primary" data-act="test-next">Următoarea › </button>') +
          '<span class="spacer"></span>' +
          (last ? "" : '<button type="button" class="btn ghost" data-act="test-finish">Termină testul</button>') +
        "</div>";
    }

    // results
    var tally = { ok: 0, half: 0, bad: 0, skip: 0 };
    T.list.forEach(function (k) { tally[T.res[k]]++; });
    var tot = T.list.length;
    var pct = Math.round(100 * tally.ok / tot);
    var C = 2 * Math.PI * 44;
    var ring = '<svg class="ring" viewBox="0 0 104 104" role="img" aria-label="' + pct + '% corecte">' +
      '<circle class="bg" cx="52" cy="52" r="44"/><circle class="fg" cx="52" cy="52" r="44" transform="rotate(-90 52 52)" stroke-dasharray="' +
      C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - tally.ok / tot)).toFixed(1) + '"/>' +
      '<text x="52" y="60" text-anchor="middle">' + pct + "%</text></svg>";
    var wrongNs = T.list.filter(function (k) { return T.res[k] !== "ok"; });
    var navR = '<div class="grid-nav">' + T.list.map(function (k, j) {
      var r = T.res[k];
      return '<button type="button" data-act="test-jump" data-n="' + k + '" class="r-' + (r === "skip" ? "bad" : r) + '" aria-label="Întrebarea ' + (j + 1) + '">' + (j + 1) + "</button>";
    }).join("") + "</div>";
    var shown = T.onlyWrong ? wrongNs : T.list;
    var review = shown.map(function (k) {
      var q = byN.get(k), order = T.orders[k], r = T.res[k];
      var pill = { ok: '<span class="pill done">corect</span>', half: '<span class="pill half">parțial</span>', bad: '<span class="pill bad">greșit</span>', skip: '<span class="pill bad">fără răspuns</span>' }[r];
      return '<article class="qcard revealed" id="r-' + k + '">' + metaRow(q, pill) + qBody(q) +
        optsHTML(q, { order: order, sel: T.sel[k], revealed: true, buttons: false, dimOthers: false }) +
        (q.note ? '<div class="note">' + esc(q.note) + "</div>" : "") + "</article>";
    }).join("");

    return '<div class="panel"><span class="eyebrow">Rezultatul testului</span>' +
      '<div class="score">' + ring + '<div class="score-lines">' +
        "<span>Corecte complet: <b>" + tally.ok + "</b> din " + tot + "</span>" +
        "<span>Parțial corecte: <b>" + tally.half + "</b></span>" +
        "<span>Greșite: <b>" + tally.bad + "</b></span>" +
        (tally.skip ? "<span>Fără răspuns: <b>" + tally.skip + "</b></span>" : "") +
        '<span class="muted small">Timp: ' + fmtTime(T.elapsed) + " · " + fmtTime(T.elapsed / tot) + " pe întrebare</span>" +
      "</div></div>" + navR +
      '<div class="actions">' +
        (wrongNs.length ? '<button type="button" class="btn primary" data-act="test-learn-wrong">Învață cele ' + wrongNs.length + " greșite</button>" : "") +
        '<button type="button" class="btn' + (wrongNs.length ? "" : " primary") + '" data-act="test-new">Test nou</button>' +
        '<button type="button" class="btn ghost" data-act="home">Acasă</button>' +
      "</div></div>" +
      '<div class="row between"><span class="eyebrow">Verifică răspunsurile</span>' +
      '<label class="switch small"><input type="checkbox" id="test-only-wrong"' + (T.onlyWrong ? " checked" : "") + "> Doar greșelile</label></div>" +
      '<div class="list">' + (review || '<div class="empty">Nicio greșeală. Bravo!</div>') + "</div>";
  }

  /* ---------------- list ---------------- */

  function renderList() {
    var L = S.list;
    var p = pool();
    var filtered = p.length !== DATA.length;
    return '<div class="search-wrap">' + ICON.search +
      '<input class="search" id="q-search" type="search" placeholder="Caută: vitamina C, botulism, 145…" value="' + esc(L.q) + '" autocomplete="off" aria-label="Caută în întrebări"></div>' +
      '<div class="row between"><span class="small muted" id="list-count"></span>' +
      '<label class="switch small"><input type="checkbox" id="list-hide"' + (L.hide ? " checked" : "") + "> Ascunde răspunsurile (atinge ca să vezi)</label></div>" +
      (filtered ? '<div class="row"><span class="small muted">Lista arată doar selecția ta (' + p.length + ' întrebări).</span><button type="button" class="btn ghost sm" data-act="list-all">Arată toate ' + DATA.length + "</button></div>" : "") +
      '<div class="list" id="list"></div>';
  }

  function renderListItems() {
    var L = S.list;
    var box = document.getElementById("list");
    if (!box) return;
    var qn = norm(L.q.trim());
    var num = /^#?\d+$/.test(qn) ? +qn.replace("#", "") : null;
    var items = pool().filter(function (q) {
      if (!qn) return true;
      if (num !== null) return q.n === num;
      return qn.split(/\s+/).every(function (w) { return searchText.get(q.n).indexOf(w) >= 0; });
    });
    document.getElementById("list-count").textContent = items.length + (items.length === 1 ? " întrebare" : " întrebări");
    var shown = items.slice(0, L.limit || 60);
    box.innerHTML = shown.map(function (q) {
      var st = status(q.n), r = rec(q.n);
      var pill = '<span class="pill ' + st + '">' + { new: "nouă", learn: "în lucru", done: "învățată" }[st] + "</span>";
      var stats = r.c || r.w ? '<span class="small muted" title="corect / greșit">✓' + r.c + " ✗" + r.w + "</span>" : "";
      var open = !L.hide || L.open.has(q.n);
      return '<article class="qcard' + (open ? " revealed" : " tappable") + '"' + (open ? "" : ' data-act="list-open" data-n="' + q.n + '"') + ">" +
        metaRow(q, pill + stats) + qBody(q) +
        optsHTML(q, { order: q.o.map(function (_, i) { return i; }), sel: null, revealed: open, buttons: false, dimOthers: false }) +
        (open && q.note ? '<div class="note">' + esc(q.note) + "</div>" : "") + "</article>";
    }).join("") +
      (items.length > shown.length ? '<button type="button" class="btn" data-act="list-more">Arată încă ' + Math.min(60, items.length - shown.length) + " (din " + (items.length - shown.length) + " rămase)</button>" : "") +
      (items.length ? "" : '<div class="empty">Nimic găsit pentru „' + esc(L.q) + '”.</div>');
  }

  /* ---------------- events ---------------- */

  var ACT = {
    home: function () { go("home"); },
    star: function (el) {
      var n = +el.dataset.n;
      var on = toggleStar(n);
      document.querySelectorAll('[data-act="star"][data-n="' + n + '"]').forEach(function (b) { b.setAttribute("aria-pressed", on); });
    },
    sec: function (el) {
      var s = el.dataset.s;
      if (s === "") store.sel.sec = [];
      else {
        var name = SECTIONS[+s];
        var i = store.sel.sec.indexOf(name);
        if (i >= 0) store.sel.sec.splice(i, 1); else store.sel.sec.push(name);
        if (store.sel.sec.length === SECTIONS.length) store.sel.sec = [];
      }
      persist(false); render();
    },
    only: function (el) { store.sel.only = el.dataset.v; persist(false); render(); },
    "range-all": function () { store.sel.from = MINN; store.sel.to = MAXN; persist(false); render(); },
    reset: function () { S.confirmReset = true; render(); },
    "reset-no": function () { S.confirmReset = false; render(); },
    "reset-yes": function () {
      store.p = {}; store.resetAt = Date.now(); S.confirmReset = false;
      persist(true); render();
    },
    "start-learn": function () { startLearn(); },
    "start-cards": function () { startCards(); },
    "open-test": function () { S.test = { phase: "setup", count: S.test.count || 20 }; go("test"); },
    "open-list": function () { S.list.limit = 60; go("list"); },

    pick: function (el) {
      var i = +el.dataset.i;
      if (S.view === "learn") {
        var c = S.learn.cur;
        if (!c || c.revealed) return;
        var q = byN.get(c.n);
        if (q.t === "CS") { c.sel = new Set([i]); learnCheck(false); return; }
        if (c.sel.has(i)) c.sel.delete(i); else c.sel.add(i);
        render();
      } else if (S.view === "test") {
        var T = S.test, n = T.list[T.i], set = T.sel[n];
        if (byN.get(n).t === "CS") { var had = set.has(i); set.clear(); if (!had) set.add(i); }
        else if (set.has(i)) set.delete(i); else set.add(i);
        T.confirm = false;
        render();
      }
    },
    "learn-check": function () { learnCheck(false); },
    "learn-skip": function () { learnCheck(true); },
    "learn-next": learnNext,
    "learn-round": function () { newRound(); render(); window.scrollTo(0, 0); },

    "cards-flip": function () { if (!S.cards.revealed) { S.cards.revealed = true; render(); } },
    "cards-yes": function () { cardsRate(true); },
    "cards-no": function () { cardsRate(false); },
    "cards-prev": function () { cardsMove(-1); },
    "cards-again": function () {
      var C = S.cards;
      startCards(C.list.filter(function (n) { return C.rated[n] === false; }));
    },
    "cards-restart": function () { startCards(); },

    "test-count": function (el) { S.test.count = el.dataset.v === "all" ? "all" : +el.dataset.v; render(); },
    "test-start": startTest,
    "test-go": function (el) { S.test.i = +el.dataset.j; S.test.confirm = false; render(); },
    "test-prev": function () { if (S.test.i > 0) { S.test.i--; S.test.confirm = false; render(); window.scrollTo(0, 0); } },
    "test-next": function () { if (S.test.i < S.test.list.length - 1) { S.test.i++; S.test.confirm = false; render(); window.scrollTo(0, 0); } },
    "test-finish": function () {
      var T = S.test;
      var left = T.list.filter(function (k) { return !T.sel[k].size; }).length;
      if (left) { T.confirm = true; render(); var c = app.querySelector(".confirm"); if (c) c.scrollIntoView({ block: "nearest" }); }
      else finishTest();
    },
    "test-finish-yes": finishTest,
    "test-finish-no": function () { S.test.confirm = false; render(); },
    "test-jump": function (el) {
      var t = document.getElementById("r-" + el.dataset.n);
      if (!t && S.test.onlyWrong) { S.test.onlyWrong = false; render(); t = document.getElementById("r-" + el.dataset.n); }
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    "test-learn-wrong": function () {
      var T = S.test;
      startLearn(T.list.filter(function (k) { return T.res[k] !== "ok"; }), "Greșelile din test");
    },
    "test-new": function () { S.test = { phase: "setup", count: S.test.count || 20 }; render(); window.scrollTo(0, 0); },

    "list-open": function (el) { S.list.open.add(+el.dataset.n); renderListItems(); },
    "list-more": function () { S.list.limit = (S.list.limit || 60) + 60; renderListItems(); },
    "list-all": function () {
      store.sel = { sec: [], from: MINN, to: MAXN, only: "all" };
      persist(false); render();
    }
  };

  document.getElementById("brand").addEventListener("click", function () { go("home"); });

  app.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el || !app.contains(el) || el.disabled) return;
    var fn = ACT[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  app.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "from" || t.id === "to") {
      var v = Math.round(+t.value);
      if (!isFinite(v)) v = t.id === "from" ? MINN : MAXN;
      v = Math.max(MINN, Math.min(MAXN, v));
      store.sel[t.id] = v;
      if (store.sel.from > store.sel.to) {
        if (t.id === "from") store.sel.to = v; else store.sel.from = v;
      }
      persist(false); render();
    } else if (t.id === "opt-shuffle") {
      store.opt.shuffle = t.checked; persist(false);
    } else if (t.id === "opt-cards-shuffle") {
      store.opt.cardsShuffle = t.checked; persist(false);
      startCards();
    } else if (t.id === "list-hide") {
      S.list.hide = t.checked; S.list.open = new Set(); renderListItems();
    } else if (t.id === "test-only-wrong") {
      S.test.onlyWrong = t.checked; render();
    }
  });

  var searchTimer = null;
  app.addEventListener("input", function (e) {
    if (e.target.id !== "q-search") return;
    S.list.q = e.target.value;
    S.list.limit = 60;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderListItems, 120);
  });

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    var k = e.key;
    var pos = -1;
    if (k.length === 1) {
      pos = "12345".indexOf(k);
      if (pos < 0) pos = LETTERS.indexOf(k.toLowerCase());
    }

    if (S.view === "learn" && S.learn) {
      var L = S.learn;
      if (L.summary) { if (k === "Enter") { e.preventDefault(); ACT["learn-round"](); } return; }
      if (pos >= 0 && !L.cur.revealed && pos < L.cur.order.length) {
        e.preventDefault();
        ACT.pick({ dataset: { i: String(L.cur.order[pos]) } });
      } else if (k === "Enter") {
        e.preventDefault();
        if (L.cur.revealed) learnNext(); else if (L.cur.sel.size) learnCheck(false);
      }
    } else if (S.view === "cards" && S.cards && !S.cards.done) {
      var C = S.cards;
      if (k === " " || k === "Enter") { e.preventDefault(); if (!C.revealed) ACT["cards-flip"](); }
      else if (k === "ArrowRight" && C.revealed) cardsRate(true);
      else if (k === "ArrowLeft") { if (C.revealed) cardsRate(false); else cardsMove(-1); }
    } else if (S.view === "test" && S.test.phase === "run") {
      var T = S.test;
      if (pos >= 0 && pos < T.orders[T.list[T.i]].length) {
        e.preventDefault();
        ACT.pick({ dataset: { i: String(T.orders[T.list[T.i]][pos]) } });
      } else if (k === "ArrowRight") ACT["test-next"]();
      else if (k === "ArrowLeft") ACT["test-prev"]();
    }
  });

  setInterval(function () {
    if (S.view === "test" && S.test.phase === "run") {
      var el = document.getElementById("clock");
      if (el) el.textContent = fmtTime(Date.now() - S.test.started);
    }
  }, 1000);

  render();
  Sync.init();
})();
