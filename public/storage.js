// 回答記録の保存先。端末内 (localStorage) に常に保存し、
// Firebase の設定があれば Firestore にも送る（匿名ログインでユーザーごとに分離）。
// 午前Ⅱ（選択式）と午後（記述式の自己採点）で記録を分けて持つ。
import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_VERSION = "10.12.2";

let remote = null; // { db, uid, fs } when Firestore is ready
let remoteStatus = firebaseConfig.apiKey ? "接続中…" : "端末内に保存（Firebase 未設定）";

const CHOICES = ["ア", "イ", "ウ", "エ"];
export const GRADES = ["ok", "partial", "ng"];
export const RESPONSE_MAX = 500;

const isId = (v) => typeof v === "string" && /^[0-9]{13}-[a-z0-9]{6}$/.test(v);
const isExamId = (v) => typeof v === "string" && /^[a-z0-9_]{1,40}$/.test(v);
const isTime = (v) => Number.isInteger(v) && v >= 0 && v <= 86400000;
const isAt = (v) => Number.isInteger(v) && v > 0;

// 保存データは外部から書き換えられる可能性があるので、形が正しい記録だけを使う
// （firestore.rules の検証と同じ条件）
export function isValidAttempt(a) {
  return (
    a !== null && typeof a === "object" &&
    isId(a.id) && isExamId(a.examId) &&
    Number.isInteger(a.questionNo) && a.questionNo >= 1 && a.questionNo <= 200 &&
    CHOICES.includes(a.chosen) && CHOICES.includes(a.answer) &&
    a.correct === (a.chosen === a.answer) &&
    isTime(a.timeMs) && isAt(a.answeredAt)
  );
}

// 午後：設問（小問）ごとの自己採点の記録
export function isValidPmAttempt(a) {
  return (
    a !== null && typeof a === "object" &&
    isId(a.id) && isExamId(a.examId) &&
    Number.isInteger(a.questionNo) && a.questionNo >= 1 && a.questionNo <= 10 &&
    typeof a.itemId === "string" && /^[0-9a-z-]{1,20}$/.test(a.itemId) &&
    GRADES.includes(a.grade) &&
    typeof a.response === "string" && a.response.length <= RESPONSE_MAX &&
    isTime(a.timeMs) && isAt(a.answeredAt)
  );
}

const pickFields = (fields) => (a) => Object.fromEntries(fields.map((f) => [f, a[f]]));

function createStore(localKey, collection, isValid, fields) {
  const pick = pickFields(fields);
  const load = () => {
    try {
      const data = JSON.parse(localStorage.getItem(localKey));
      return Array.isArray(data) ? data.filter(isValid).map(pick) : [];
    } catch {
      return [];
    }
  };
  const store = { localKey, collection, isValid, pick, items: load() };
  store.save = () => {
    try {
      localStorage.setItem(localKey, JSON.stringify(store.items));
    } catch {
      // 保存できない環境（プライベートモード等）ではメモリ上だけで続行
    }
  };
  return store;
}

const am = createStore("sc-quiz-attempts-v1", "attempts", isValidAttempt,
  ["id", "examId", "questionNo", "chosen", "answer", "correct", "timeMs", "answeredAt"]);
const pm = createStore("sc-quiz-pm-attempts-v1", "pmAttempts", isValidPmAttempt,
  ["id", "examId", "questionNo", "itemId", "grade", "response", "timeMs", "answeredAt"]);

function get(store, examIds) {
  return examIds ? store.items.filter((a) => examIds.includes(a.examId)) : store.items.slice();
}

async function sync(store) {
  const { db, uid, fs } = remote;
  // Firestore 側の記録を取り込み、端末だけにある記録は送る
  const col = fs.collection(db, "users", uid, store.collection);
  const snap = await fs.getDocs(col);
  const byId = new Map(store.items.map((a) => [a.id, a]));
  snap.forEach((d) => {
    const a = d.data();
    if (store.isValid(a)) byId.set(a.id, store.pick(a));
  });
  const remoteIds = new Set(snap.docs.map((d) => d.id));
  store.items = [...byId.values()].sort((a, b) => a.answeredAt - b.answeredAt);
  store.save();
  await Promise.all(
    store.items.filter((a) => !remoteIds.has(a.id)).map((a) => fs.setDoc(fs.doc(col, a.id), a))
  );
}

async function add(store, inputs) {
  const records = inputs.filter(store.isValid).map(store.pick);
  if (!records.length) return;
  store.items.push(...records);
  store.save();
  if (!remote) return;
  const { db, uid, fs } = remote;
  await Promise.all(
    records.map((r) => fs.setDoc(fs.doc(db, "users", uid, store.collection, r.id), r).catch(console.error))
  );
}

async function clear(store, examIds) {
  const removed = store.items.filter((a) => examIds.includes(a.examId));
  store.items = store.items.filter((a) => !examIds.includes(a.examId));
  store.save();
  if (!remote) return;
  const { db, uid, fs } = remote;
  await Promise.all(
    removed.map((a) => fs.deleteDoc(fs.doc(db, "users", uid, store.collection, a.id)).catch(console.error))
  );
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
    remote = { db: fs.getFirestore(app), uid: cred.user.uid, fs };
    const [amSync, pmSync] = await Promise.allSettled([sync(am), sync(pm)]);
    if (amSync.status === "rejected") throw amSync.reason;
    if (pmSync.status === "rejected") {
      // Firestore ルールが午後の記録に未対応のときなど。午前Ⅱの同期は続ける
      console.error(pmSync.reason);
      remoteStatus = "Firebase に同期済み（午後の記録は端末内のみ）";
    } else {
      remoteStatus = "Firebase に同期済み";
    }
  } catch (e) {
    console.error(e);
    remoteStatus = "Firebase に接続できないため端末内に保存中";
  }
  onChange?.();
}

// examIds を省略すると全試験の記録を返す
export const getAttempts = (examIds) => get(am, examIds);
export const addAttempt = (attempt) => add(am, [attempt]);
export const clearAttempts = (examIds) => clear(am, examIds);

export const getPmAttempts = (examIds) => get(pm, examIds);
export const addPmAttempts = (attempts) => add(pm, attempts);
export const clearPmAttempts = (examIds) => clear(pm, examIds);
