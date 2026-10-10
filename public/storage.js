// 回答記録の保存先。端末内 (localStorage) に常に保存し、
// Firebase の設定があれば Firestore にも送る（匿名ログインでユーザーごとに分離）。
import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_VERSION = "10.12.2";
const LOCAL_KEY = "sc-quiz-attempts-v1";

let remote = null; // { db, uid, fs } when Firestore is ready
let remoteStatus = firebaseConfig.apiKey ? "接続中…" : "端末内に保存（Firebase 未設定）";

const CHOICES = ["ア", "イ", "ウ", "エ"];

// 保存データは外部から書き換えられる可能性があるので、形が正しい記録だけを使う
// （firestore.rules の検証と同じ条件）
export function isValidAttempt(a) {
  return (
    a !== null && typeof a === "object" &&
    typeof a.id === "string" && /^[0-9]{13}-[a-z0-9]{6}$/.test(a.id) &&
    typeof a.examId === "string" && /^[a-z0-9_]{1,40}$/.test(a.examId) &&
    Number.isInteger(a.questionNo) && a.questionNo >= 1 && a.questionNo <= 200 &&
    CHOICES.includes(a.chosen) && CHOICES.includes(a.answer) &&
    a.correct === (a.chosen === a.answer) &&
    Number.isInteger(a.timeMs) && a.timeMs >= 0 && a.timeMs <= 86400000 &&
    Number.isInteger(a.answeredAt) && a.answeredAt > 0
  );
}

function pick(a) {
  const { id, examId, questionNo, chosen, answer, correct, timeMs, answeredAt } = a;
  return { id, examId, questionNo, chosen, answer, correct, timeMs, answeredAt };
}

function loadLocal() {
  try {
    const data = JSON.parse(localStorage.getItem(LOCAL_KEY));
    return Array.isArray(data) ? data.filter(isValidAttempt).map(pick) : [];
  } catch {
    return [];
  }
}

function saveLocal(attempts) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(attempts));
  } catch {
    // 保存できない環境（プライベートモード等）ではメモリ上だけで続行
  }
}

let attempts = loadLocal();

// examIds を省略すると全試験の記録を返す
export function getAttempts(examIds) {
  return examIds ? attempts.filter((a) => examIds.includes(a.examId)) : attempts.slice();
}

export function getStatus() {
  return remoteStatus;
}

export async function initRemote(onChange) {
  if (!firebaseConfig.apiKey) return;
  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [{ initializeApp }, auth, fs] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-firestore.js`),
    ]);
    const app = initializeApp(firebaseConfig);
    const cred = await auth.signInAnonymously(auth.getAuth(app));
    const db = fs.getFirestore(app);
    remote = { db, uid: cred.user.uid, fs };

    // Firestore 側の記録を取り込み、端末だけにある記録は送る
    const col = fs.collection(db, "users", remote.uid, "attempts");
    const snap = await fs.getDocs(col);
    const byId = new Map(attempts.map((a) => [a.id, a]));
    snap.forEach((d) => {
      const a = d.data();
      if (isValidAttempt(a)) byId.set(a.id, pick(a));
    });
    const remoteIds = new Set(snap.docs.map((d) => d.id));
    attempts = [...byId.values()].sort((a, b) => a.answeredAt - b.answeredAt);
    saveLocal(attempts);
    await Promise.all(
      attempts.filter((a) => !remoteIds.has(a.id)).map((a) => fs.setDoc(fs.doc(col, a.id), a))
    );
    remoteStatus = "Firebase に同期済み";
  } catch (e) {
    console.error(e);
    remoteStatus = "Firebase に接続できないため端末内に保存中";
  }
  onChange?.();
}

export async function addAttempt(input) {
  if (!isValidAttempt(input)) return;
  const attempt = pick(input);
  attempts.push(attempt);
  saveLocal(attempts);
  if (!remote) return;
  const { db, uid, fs } = remote;
  try {
    await fs.setDoc(fs.doc(db, "users", uid, "attempts", attempt.id), attempt);
  } catch (e) {
    console.error(e);
  }
}

export async function clearAttempts(examIds) {
  const removed = attempts.filter((a) => examIds.includes(a.examId));
  attempts = attempts.filter((a) => !examIds.includes(a.examId));
  saveLocal(attempts);
  if (!remote) return;
  const { db, uid, fs } = remote;
  await Promise.all(
    removed.map((a) => fs.deleteDoc(fs.doc(db, "users", uid, "attempts", a.id)).catch(console.error))
  );
}
