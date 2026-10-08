import { getAttempts, addAttempt, clearAttempts, initRemote, getStatus } from "./storage.js";

const EXAM_URL = "data/r07a_sc_am2.json";
const LABELS = ["ア", "イ", "ウ", "エ"];

const $ = (id) => document.getElementById(id);
const views = ["home", "quiz", "result"];

let exam = null;
let session = null; // { order: [no], index, startedAt, questionStartedAt, results: [] }
let tickTimer = null;

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function rate(correct, total) {
  return total ? `${Math.round((correct / total) * 1000) / 10}%` : "-";
}

function show(name) {
  views.forEach((v) => ($(v).hidden = v !== name));
  $("timers").hidden = name !== "quiz";
  window.scrollTo(0, 0);
}

function question(no) {
  return exam.questions.find((q) => q.no === no);
}

// ---------- ホーム ----------
function latestByQuestion() {
  const latest = new Map();
  for (const a of getAttempts(exam.id)) latest.set(a.questionNo, a);
  return latest;
}

function renderHome() {
  const attempts = getAttempts(exam.id);
  const correct = attempts.filter((a) => a.correct).length;
  $("examTitle").textContent = exam.title;
  $("statRate").textContent = rate(correct, attempts.length);
  $("statCount").textContent = attempts.length;
  $("statAvg").textContent = attempts.length
    ? fmt(attempts.reduce((s, a) => s + a.timeMs, 0) / attempts.length)
    : "-";

  const latest = latestByQuestion();
  const list = $("questionList");
  list.innerHTML = "";
  for (const q of exam.questions) {
    const a = latest.get(q.no);
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = a ? (a.correct ? "ok" : "ng") : "";
    btn.innerHTML = `<span class="mark">${a ? (a.correct ? "○" : "×") : "－"}</span>問${q.no}`;
    btn.setAttribute("aria-label", `問${q.no}を解く`);
    btn.addEventListener("click", () => startSession([q.no]));
    li.appendChild(btn);
    list.appendChild(li);
  }
  $("syncStatus").textContent = `保存先：${getStatus()}`;
}

function ordersFor(mode) {
  const all = exam.questions.map((q) => q.no);
  const latest = latestByQuestion();
  switch (mode) {
    case "shuffle":
      return shuffle([...all]);
    case "wrong":
      return all.filter((no) => latest.has(no) && !latest.get(no).correct);
    case "unanswered":
      return all.filter((no) => !latest.has(no));
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
  $("qNo").textContent = `問${q.no}`;
  $("qText").innerHTML = q.text; // 問題文は自前データ（下線などの装飾のみ）
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
    btn.addEventListener("click", () => answer(q, label));
    box.appendChild(btn);
  }
  session.questionStartedAt = Date.now();
  session.answeredAt = null;
  tick();
}

function answer(q, chosen) {
  if (session.answeredAt) return;
  const now = Date.now();
  session.answeredAt = now;
  const correct = chosen === q.answer;
  const timeMs = now - session.questionStartedAt;
  const attempt = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    examId: exam.id,
    questionNo: q.no,
    chosen,
    answer: q.answer,
    correct,
    timeMs,
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
  fb.innerHTML = `${correct ? "○ 正解" : `× 不正解（正解は ${q.answer}）`}<small>解答時間 ${fmt(timeMs)}</small>`;
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
  $("resBody").innerHTML = res
    .map(
      (r) =>
        `<tr><td>問${r.questionNo}</td><td>${r.chosen}</td><td>${r.answer}</td>` +
        `<td class="${r.correct ? "ok" : "ng"}">${r.correct ? "○" : "×"}</td><td>${fmt(r.timeMs)}</td></tr>`
    )
    .join("");
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
  exam = await (await fetch(EXAM_URL)).json();
  document.querySelectorAll("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => startSession(ordersFor(b.dataset.mode)))
  );
  $("nextBtn").addEventListener("click", next);
  $("quitBtn").addEventListener("click", () => (session.results.length ? finish() : goHome()));
  $("homeBtn").addEventListener("click", goHome);
  $("backHomeBtn").addEventListener("click", goHome);
  $("retryWrongBtn").addEventListener("click", () =>
    startSession(session.results.filter((r) => !r.correct).map((r) => r.questionNo))
  );
  $("resetBtn").addEventListener("click", async () => {
    if (!confirm("この試験の成績をすべて削除しますか？")) return;
    await clearAttempts(exam.id);
    renderHome();
  });
  renderHome();
  show("home");
  initRemote(() => {
    if (!$("home").hidden) renderHome();
  });
}

main();
