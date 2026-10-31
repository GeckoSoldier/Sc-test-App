// 午後（記述式）の演習：問題を1問選び、設問ごとに答えを書いてから解答例と見比べて自己採点する
import { getPmAttempts, addPmAttempts, clearPmAttempts, GRADES, RESPONSE_MAX } from "./storage.js";
import { $, fmt, randomId, rate, show, load, save } from "./util.js";

// 収録している午後の試験（新しい順）。問題データは data/ に置いた自前の JSON のみ
const PM_EXAMS = [
  { id: "r07a_sc_pm", short: "R7秋", label: "令和7年度 秋期" },
];
const SCOPE_KEY = "sc-quiz-pm-scope-v1";
// 本番は 150 分で 4 問中 2 問を解くので、1 問あたりの目安は 75 分
const TARGET_MS = 75 * 60 * 1000;
const GRADE_LABEL = { ok: "○", partial: "△", ng: "×" };
const GRADE_POINT = { ok: 1, partial: 0.5, ng: 0 };

const exams = new Map(); // id -> 試験データ
let scope = null; // 試験 id
let session = null; // { examId, no, startedAt, revealedAt, grades: Map(itemId -> grade), finished }
let tickTimer = null;
let goHome = () => {};

const examInfo = (id) => PM_EXAMS.find((e) => e.id === id);
const question = (examId, no) => exams.get(examId).questions.find((q) => q.no === no);

// 設問ごとに最新の採点だけを使って得点を出す
function latestByItem(examIds) {
  const latest = new Map();
  for (const a of getPmAttempts(examIds)) latest.set(`${a.examId}:${a.questionNo}:${a.itemId}`, a);
  return latest;
}

function score(attempts) {
  const points = attempts.reduce((s, a) => s + GRADE_POINT[a.grade], 0);
  return { points, total: attempts.length, text: attempts.length ? rate(points, attempts.length) : "未回答" };
}

function questionScore(latest, examId, q) {
  const graded = q.items.map((it) => latest.get(`${examId}:${q.no}:${it.id}`)).filter(Boolean);
  return graded.length ? score(graded) : null;
}

// ---------- ホーム ----------
export function renderPmHome() {
  if (!PM_EXAMS.length) {
    $("pmPicker").replaceChildren();
    $("pmExamTitle").textContent = "午後の問題はまだ収録していません";
    $("pmQuestionList").replaceChildren();
    $("pmStats").hidden = true;
    $("pmResetBtn").hidden = true;
    return;
  }
  $("pmStats").hidden = false;
  $("pmResetBtn").hidden = false;

  $("pmPicker").replaceChildren(
    ...PM_EXAMS.map((e) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-pressed", String(scope === e.id));
      const small = document.createElement("small");
      small.textContent = score([...latestByItem([e.id]).values()]).text;
      btn.append(e.label, small);
      btn.addEventListener("click", () => {
        scope = e.id;
        save(SCOPE_KEY, scope);
        renderPmHome();
      });
      return btn;
    })
  );

  const exam = exams.get(scope);
  $("pmExamTitle").textContent = exam.title;
  const latest = latestByItem([scope]);
  const s = score([...latest.values()]);
  $("pmStatRate").textContent = s.total ? rate(s.points, s.total) : "-";
  const solved = exam.questions.filter((q) => questionScore(latest, scope, q));
  $("pmStatCount").textContent = `${solved.length} / ${exam.questions.length}`;
  // 解答時間は1問を解き終えた記録ごとに1回だけ数える
  const sessions = new Map();
  for (const a of getPmAttempts([scope])) sessions.set(`${a.questionNo}:${a.answeredAt}`, a.timeMs);
  $("pmStatAvg").textContent = sessions.size
    ? fmt([...sessions.values()].reduce((t, ms) => t + ms, 0) / sessions.size)
    : "-";

  $("pmQuestionList").replaceChildren(
    ...exam.questions.map((q) => {
      const qs = questionScore(latest, scope, q);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pmq";
      const head = document.createElement("b");
      head.textContent = `問${q.no}`;
      const title = document.createElement("span");
      title.textContent = q.title;
      const sub = document.createElement("small");
      sub.textContent = qs
        ? `前回 ${qs.points} / ${q.items.length} 点（${rate(qs.points, q.items.length)}）`
        : `未回答（設問 ${q.items.length} 個）`;
      btn.append(head, title, sub);
      btn.setAttribute("aria-label", `問${q.no} ${q.title}を解く`);
      btn.addEventListener("click", () => start(scope, q.no));
      return btn;
    })
  );
  $("pmResetBtn").textContent = `${examInfo(scope).label}（午後）の成績をリセット`;
}

// ---------- 演習 ----------
export const pmActive = () => !$("pmQuestion").hidden || !$("pmResult").hidden;

export function quitPm() {
  if (session && !session.finished && !confirm("演習を中断してホームに戻りますか？（書いた答えと採点は保存されません）")) {
    return;
  }
  clearInterval(tickTimer);
  session = null;
  goHome();
}

function start(examId, no) {
  const q = question(examId, no);
  session = { examId, no, startedAt: Date.now(), revealedAt: null, grades: new Map(), finished: false };
  $("timerLabel1").textContent = "経過";
  $("timerLabel2").textContent = "目安75分まで";
  $("pmExam").textContent = `${examInfo(examId).label} 午後`;
  $("pmNo").textContent = `問${q.no}　${q.title}`;

  if (q.body) {
    $("pmBody").innerHTML = q.body; // 問題文・図表は同じサイトに置いた自前データのみ
  } else {
    const p = document.createElement("p");
    p.className = "pm-note";
    p.textContent = `問題文は問題冊子の 問${q.no}${q.pages ? `（${q.pages}）` : ""} を見ながら解いてください。`;
    $("pmBody").replaceChildren(p);
  }
  $("pmItems").replaceChildren(...q.items.map((it) => itemBlock(it)));
  $("pmCommentary").hidden = true;
  $("pmRevealBtn").hidden = false;
  $("pmSaveBtn").hidden = true;
  updateSaveBtn(q);
  setTab("body");
  show("pmQuestion");
  clearInterval(tickTimer);
  tickTimer = setInterval(tick, 250);
  tick();
}

function itemBlock(it) {
  const box = document.createElement("div");
  box.className = "pm-item";
  box.dataset.item = it.id;
  const label = document.createElement("h3");
  label.textContent = it.label;
  const prompt = document.createElement("div");
  prompt.className = "pm-prompt";
  prompt.innerHTML = it.prompt; // 自前データ（下線などに HTML を使う）
  const input = document.createElement("textarea");
  input.maxLength = RESPONSE_MAX;
  input.rows = 2;
  input.placeholder = it.limit ? `答え（${it.limit}）` : "答え";
  input.setAttribute("aria-label", `${it.label} の答え`);
  const count = document.createElement("small");
  count.className = "pm-count";
  const updateCount = () => (count.textContent = `${input.value.length}字`);
  input.addEventListener("input", updateCount);
  updateCount();
  box.append(label, prompt, input, count);
  return box;
}

function tick() {
  if (!session) return;
  const elapsed = (session.revealedAt ?? Date.now()) - session.startedAt;
  $("sessionTime").textContent = fmt(elapsed);
  const left = TARGET_MS - elapsed;
  $("questionTime").textContent = left >= 0 ? fmt(left) : `+${fmt(-left)}`;
}

function setTab(name) {
  for (const b of document.querySelectorAll("[data-pm-tab]")) {
    b.setAttribute("aria-selected", String(b.dataset.pmTab === name));
  }
  $("pmBodyPane").hidden = name !== "body";
  $("pmItemsPane").hidden = name !== "items";
}

function reveal() {
  if (!session || session.revealedAt) return;
  const q = question(session.examId, session.no);
  const empty = [...$("pmItems").querySelectorAll("textarea")].filter((t) => !t.value.trim()).length;
  if (empty && !confirm(`未記入の設問が ${empty} 個あります。解答例を表示しますか？`)) return;
  session.revealedAt = Date.now();
  tick();

  for (const it of q.items) {
    const box = $("pmItems").querySelector(`[data-item="${it.id}"]`);
    box.querySelector("textarea").readOnly = true;
    const ans = document.createElement("div");
    ans.className = "pm-answer";
    const [first, ...others] = it.answers;
    const title = document.createElement("small");
    title.textContent = "解答例";
    const main = document.createElement("p");
    main.textContent = first;
    ans.append(title, main);
    for (const o of others) {
      const alt = document.createElement("p");
      alt.className = "pm-alt";
      alt.textContent = `別解：${o}`;
      ans.append(alt);
    }
    if (it.note) {
      const note = document.createElement("p");
      note.className = "pm-alt";
      note.textContent = it.note;
      ans.append(note);
    }
    const grades = document.createElement("div");
    grades.className = "pm-grades";
    grades.setAttribute("role", "group");
    grades.setAttribute("aria-label", `${it.label} の自己採点`);
    for (const g of GRADES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `grade ${g}`;
      btn.textContent = GRADE_LABEL[g];
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", { ok: "正解", partial: "部分点", ng: "不正解" }[g]);
      btn.addEventListener("click", () => {
        session.grades.set(it.id, g);
        for (const b of grades.children) b.setAttribute("aria-pressed", String(b === btn));
        updateSaveBtn(q);
      });
      grades.append(btn);
    }
    ans.append(grades);
    box.append(ans);
  }
  if (q.aim || q.commentary) {
    $("pmAimText").textContent = q.aim || "";
    $("pmAim").hidden = !q.aim;
    $("pmCommentaryText").textContent = q.commentary || "";
    $("pmCommentaryBox").hidden = !q.commentary;
    $("pmCommentary").hidden = false;
  }
  $("pmRevealBtn").hidden = true;
  $("pmSaveBtn").hidden = false;
  setTab("items");
  $("pmItems").querySelector(".pm-answer").scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateSaveBtn(q) {
  const left = q.items.length - session.grades.size;
  $("pmSaveBtn").disabled = left > 0;
  $("pmSaveBtn").textContent = left > 0 ? `残り ${left} 個を採点してください` : "採点を記録する";
}

async function finish() {
  const q = question(session.examId, session.no);
  if (session.grades.size < q.items.length) return;
  const now = Date.now();
  const timeMs = Math.round(session.revealedAt - session.startedAt);
  const records = q.items.map((it) => ({
    id: `${now}-${randomId(6)}`,
    examId: session.examId,
    questionNo: q.no,
    itemId: it.id,
    grade: session.grades.get(it.id),
    response: $("pmItems").querySelector(`[data-item="${it.id}"] textarea`).value.slice(0, RESPONSE_MAX),
    timeMs,
    answeredAt: now,
  }));
  session.finished = true;
  clearInterval(tickTimer);
  addPmAttempts(records);

  const s = score(records);
  $("pmResRate").textContent = rate(s.points, s.total);
  $("pmResScore").textContent = `${s.points} / ${s.total}`;
  $("pmResTime").textContent = fmt(timeMs);
  $("pmResBody").replaceChildren(
    ...records.map((r, i) => {
      const tr = document.createElement("tr");
      const cells = [q.items[i].label, r.response || "（未記入）", GRADE_LABEL[r.grade]];
      cells.forEach((text, j) => {
        const td = document.createElement("td");
        td.textContent = text;
        if (j === 1) td.className = "left";
        if (j === 2) td.className = r.grade;
        tr.appendChild(td);
      });
      return tr;
    })
  );
  show("pmResult");
}

// ---------- 起動 ----------
export async function initPm(onHome) {
  goHome = onHome;
  const loaded = await Promise.all(
    PM_EXAMS.map(async (e) => {
      const res = await fetch(`data/${e.id}.json`);
      if (!res.ok) throw new Error(`問題データを読み込めません: ${e.id}`);
      return res.json();
    })
  );
  loaded.forEach((exam, i) => exams.set(PM_EXAMS[i].id, exam));
  const saved = load(SCOPE_KEY);
  scope = examInfo(saved) ? saved : PM_EXAMS[0]?.id ?? null;

  document.querySelectorAll("[data-pm-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      setTab(b.dataset.pmTab);
      window.scrollTo(0, 0);
    })
  );
  $("pmRevealBtn").addEventListener("click", reveal);
  $("pmSaveBtn").addEventListener("click", finish);
  $("pmQuitBtn").addEventListener("click", quitPm);
  $("pmRetryBtn").addEventListener("click", () => start(session.examId, session.no));
  $("pmBackHomeBtn").addEventListener("click", quitPm);
  $("pmResetBtn").addEventListener("click", async () => {
    if (!confirm(`${examInfo(scope).label}（午後）の成績を削除しますか？`)) return;
    await clearPmAttempts([scope]);
    renderPmHome();
  });
  window.addEventListener("beforeunload", (e) => {
    if (session && !session.finished && !$("pmQuestion").hidden) e.preventDefault();
  });
}
