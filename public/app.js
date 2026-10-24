import { getAttempts, addAttempt, clearAttempts, initRemote, getStatus } from "./storage.js";
import { $, fmt, randomId, rate, show, load, save } from "./util.js";
import { initPm, renderPmHome, pmActive, quitPm } from "./pm.js";

// 収録している試験（新しい順）。問題データは data/ に置いた自前の JSON のみ
const EXAMS = [
  { id: "r07a_sc_am2", short: "R7秋", label: "令和7年度 秋期" },
  { id: "r07h_sc_am2", short: "R7春", label: "令和7年度 春期" },
  { id: "r06a_sc_am2", short: "R6秋", label: "令和6年度 秋期" },
];
const ALL = "all";
const SCOPE_KEY = "sc-quiz-scope-v1";
const LABELS = ["ア", "イ", "ウ", "エ"];

const MODE_KEY = "sc-quiz-mode-v1";

const exams = new Map(); // id -> 試験データ
let scope = ALL; // "all" または試験 id
let mode = "am"; // "am"（午前Ⅱ）または "pm"（午後）
let session = null; // { order: [{ examId, no }], index, startedAt, questionStartedAt, results: [] }
let tickTimer = null;

function examInfo(id) {
  return EXAMS.find((e) => e.id === id);
}

function scopeIds() {
  return scope === ALL ? EXAMS.map((e) => e.id) : [scope];
}

function question(ref) {
  return exams.get(ref.examId).questions.find((q) => q.no === ref.no);
}

function loadScope() {
  const v = load(SCOPE_KEY);
  if (v === ALL || examInfo(v)) scope = v;
  if (load(MODE_KEY) === "pm") mode = "pm";
}

function saveScope() {
  save(SCOPE_KEY, scope);
}

// ---------- 午前Ⅱ／午後の切り替え ----------
function setMode(next) {
  mode = next;
  save(MODE_KEY, mode);
  renderHome();
}

function renderMode() {
  for (const b of document.querySelectorAll("[data-exam-mode]")) {
    b.setAttribute("aria-pressed", String(b.dataset.examMode === mode));
  }
  $("amHome").hidden = mode !== "am";
  $("pmHome").hidden = mode !== "pm";
  document.title = mode === "am" ? "SC午前Ⅱ 演習" : "SC午後 演習";
}

// ---------- ホーム ----------
const key = (examId, no) => `${examId}:${no}`;

function latestByQuestion() {
  const latest = new Map();
  for (const a of getAttempts(scopeIds())) latest.set(key(a.examId, a.questionNo), a);
  return latest;
}

function pickerButton(value, title, sub) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-pressed", String(scope === value));
  if (value === ALL) btn.className = "all";
  const small = document.createElement("small");
  small.textContent = sub;
  btn.append(title, small);
  btn.addEventListener("click", () => {
    scope = value;
    saveScope();
    renderHome();
  });
  return btn;
}

function summary(ids) {
  const attempts = getAttempts(ids);
  const correct = attempts.filter((a) => a.correct).length;
  return { attempts, correct, text: attempts.length ? `正解率 ${rate(correct, attempts.length)}` : "未回答" };
}

function renderHome() {
  renderMode();
  $("syncStatus").textContent = `保存先：${getStatus()}`;
  if (mode === "pm") {
    renderPmHome();
    return;
  }
  const total = EXAMS.reduce((n, e) => n + exams.get(e.id).questions.length, 0);
  $("examPicker").replaceChildren(
    pickerButton(ALL, `3回分まとめて（${total}問）`, summary(EXAMS.map((e) => e.id)).text),
    ...EXAMS.map((e) => pickerButton(e.id, e.label, summary([e.id]).text))
  );

  const { attempts, correct } = summary(scopeIds());
  $("examTitle").textContent = scope === ALL
    ? "情報処理安全確保支援士 午前Ⅱ（3回分まとめて）"
    : exams.get(scope).title;
  $("statRate").textContent = rate(correct, attempts.length);
  $("statCount").textContent = attempts.length;
  $("statAvg").textContent = attempts.length
    ? fmt(attempts.reduce((s, a) => s + a.timeMs, 0) / attempts.length)
    : "-";

  const latest = latestByQuestion();
  const groups = scopeIds().map((id) => {
    const exam = exams.get(id);
    const group = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "qgroup-title";
    const sub = document.createElement("small");
    sub.textContent = summary([id]).text;
    title.append(examInfo(id).label, sub);
    const list = document.createElement("ul");
    list.className = "qlist";
    for (const q of exam.questions) {
      const a = latest.get(key(id, q.no));
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = a ? (a.correct ? "ok" : "ng") : "";
      const mark = document.createElement("span");
      mark.className = "mark";
      mark.textContent = a ? (a.correct ? "○" : "×") : "－";
      btn.append(mark, `問${q.no}`);
      btn.setAttribute("aria-label", `${examInfo(id).label} 問${q.no}を解く`);
      btn.addEventListener("click", () => startSession([{ examId: id, no: q.no }]));
      li.appendChild(btn);
      list.appendChild(li);
    }
    group.append(title, list);
    return group;
  });
  $("questionLists").replaceChildren(...groups);
  $("resetBtn").textContent = scope === ALL ? "3回分の成績をすべてリセット" : `${examInfo(scope).label}の成績をリセット`;
}

function ordersFor(mode) {
  const all = scopeIds().flatMap((id) => exams.get(id).questions.map((q) => ({ examId: id, no: q.no })));
  const latest = latestByQuestion();
  const last = (r) => latest.get(key(r.examId, r.no));
  switch (mode) {
    case "shuffle":
      return shuffle([...all]);
    case "wrong":
      return all.filter((r) => last(r) && !last(r).correct);
    case "unanswered":
      return all.filter((r) => !last(r));
    default:
      return all;
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- 演習 ----------
function startSession(order) {
  if (!order.length) {
    alert("該当する問題がありません。");
    return;
  }
  session = { order, index: 0, startedAt: Date.now(), results: [] };
  $("timerLabel1").textContent = "経過";
  $("timerLabel2").textContent = "この問題";
  show("quiz");
  renderQuestion();
  clearInterval(tickTimer);
  tickTimer = setInterval(tick, 250);
}

function tick() {
  if (!session) return;
  const now = Date.now();
  $("sessionTime").textContent = fmt(now - session.startedAt);
  if (session.questionStartedAt) {
    $("questionTime").textContent = fmt((session.answeredAt ?? now) - session.questionStartedAt);
  }
}

function renderQuestion() {
  const q = question(session.order[session.index]);
  const total = session.order.length;
  $("progressText").textContent = `${session.index + 1} / ${total}`;
  $("progressBar").style.width = `${(session.index / total) * 100}%`;
  const ref = session.order[session.index];
  $("qExam").textContent = examInfo(ref.examId).label;
  $("qNo").textContent = `問${q.no}`;
  $("qText").innerHTML = q.text; // 問題文・図表は同じサイトに置いた自前データのみ（下線・表の装飾に HTML を使う）
  $("qFigure").innerHTML = q.figure || "";
  $("feedback").hidden = true;
  $("nextBtn").hidden = true;

  const box = $("choices");
  box.innerHTML = "";
  for (const label of LABELS) {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.dataset.label = label;
    const l = document.createElement("span");
    l.className = "label";
    l.textContent = label;
    const t = document.createElement("span");
    t.textContent = q.choices[label];
    btn.append(l, t);
    btn.addEventListener("click", () => answer(ref.examId, q, label));
    box.appendChild(btn);
  }
  session.questionStartedAt = Date.now();
  session.answeredAt = null;
  tick();
}

function answer(examId, q, chosen) {
  if (session.answeredAt) return;
  const now = Date.now();
  session.answeredAt = now;
  const correct = chosen === q.answer;
  const timeMs = now - session.questionStartedAt;
  const attempt = {
    id: `${now}-${randomId(6)}`,
    examId,
    questionNo: q.no,
    chosen,
    answer: q.answer,
    correct,
    timeMs: Math.round(timeMs),
    answeredAt: now,
  };
  session.results.push(attempt);
  addAttempt(attempt);

  for (const btn of $("choices").children) {
    btn.disabled = true;
    const l = btn.dataset.label;
    if (l === q.answer) btn.classList.add("correct");
    else if (l === chosen) btn.classList.add("wrong");
    else btn.classList.add("dim");
  }
  const fb = $("feedback");
  fb.className = `feedback ${correct ? "ok" : "ng"}`;
  const detail = document.createElement("small");
  detail.textContent = `解答時間 ${fmt(timeMs)}`;
  fb.replaceChildren(correct ? "○ 正解" : `× 不正解（正解は ${q.answer}）`, detail);
  fb.hidden = false;

  const last = session.index === session.order.length - 1;
  $("nextBtn").textContent = last ? "結果を見る" : "次の問題へ";
  $("nextBtn").hidden = false;
  $("progressBar").style.width = `${((session.index + 1) / session.order.length) * 100}%`;
  tick();
  $("nextBtn").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function next() {
  if (session.index < session.order.length - 1) {
    session.index++;
    renderQuestion();
    window.scrollTo(0, 0);
  } else {
    finish();
  }
}

// ---------- 結果 ----------
function finish() {
  clearInterval(tickTimer);
  const res = session.results;
  const correct = res.filter((r) => r.correct).length;
  $("resRate").textContent = rate(correct, res.length);
  $("resScore").textContent = `${correct} / ${res.length}`;
  $("resTime").textContent = fmt(Date.now() - session.startedAt);
  const body = $("resBody");
  body.replaceChildren(
    ...res.map((r) => {
      const tr = document.createElement("tr");
      const cells = [examInfo(r.examId).short, `問${r.questionNo}`, r.chosen, r.answer, r.correct ? "○" : "×", fmt(r.timeMs)];
      cells.forEach((text, i) => {
        const td = document.createElement("td");
        td.textContent = text;
        if (i === 4) td.className = r.correct ? "ok" : "ng";
        tr.appendChild(td);
      });
      return tr;
    })
  );
  $("retryWrongBtn").hidden = correct === res.length;
  session.finished = true;
  show("result");
}

function goHome() {
  if (session && !session.finished && session.results.length &&
      !confirm("演習を中断してホームに戻りますか？（回答済みの記録は保存されています）")) {
    return;
  }
  clearInterval(tickTimer);
  session = null;
  renderHome();
  show("home");
}

// ---------- 起動 ----------
async function main() {
  loadScope();
  const loaded = await Promise.all(
    EXAMS.map(async (e) => {
      const res = await fetch(`data/${e.id}.json`);
      if (!res.ok) throw new Error(`問題データを読み込めません: ${e.id}`);
      return res.json();
    })
  );
  loaded.forEach((exam, i) => exams.set(EXAMS[i].id, exam));
  document.querySelectorAll("[data-exam-mode]").forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.examMode))
  );
  await initPm(goHome);
  document.querySelectorAll("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => startSession(ordersFor(b.dataset.mode)))
  );
  $("nextBtn").addEventListener("click", next);
  $("quitBtn").addEventListener("click", () => (session.results.length ? finish() : goHome()));
  $("homeBtn").addEventListener("click", () => {
    if (pmActive()) quitPm();
    else goHome();
  });
  $("backHomeBtn").addEventListener("click", goHome);
  $("retryWrongBtn").addEventListener("click", () =>
    startSession(session.results.filter((r) => !r.correct).map((r) => ({ examId: r.examId, no: r.questionNo })))
  );
  $("resetBtn").addEventListener("click", async () => {
    const what = scope === ALL ? "3回分すべて" : examInfo(scope).label;
    if (!confirm(`${what}の成績を削除しますか？`)) return;
    await clearAttempts(scopeIds());
    renderHome();
  });
  renderHome();
  show("home");
  initRemote(() => {
    if (!$("home").hidden) renderHome();
  });
}

main();
