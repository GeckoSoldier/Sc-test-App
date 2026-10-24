// 午前Ⅱ・午後の両方で使う小さな道具
export const $ = (id) => document.getElementById(id);

export function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function randomId(len) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => chars[b % chars.length]).join("");
}

export function rate(correct, total) {
  return total ? `${Math.round((correct / total) * 1000) / 10}%` : "-";
}

const views = ["home", "quiz", "result", "pmQuestion", "pmResult"];

export function show(name) {
  views.forEach((v) => ($(v).hidden = v !== name));
  $("timers").hidden = name !== "quiz" && name !== "pmQuestion";
  window.scrollTo(0, 0);
}

export function load(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // 保存できない環境では既定値のまま
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 無視
  }
}
