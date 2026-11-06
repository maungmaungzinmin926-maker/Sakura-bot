// Sakura-sensei Telegram bot — Japanese N5/N4 learning bot
// No dependencies: Node 18+ only (uses global fetch).
// Usage:  BOT_TOKEN=<token from @BotFather> node bot.js
// The token is NEVER stored in this file — pass it as an environment variable.
// Content (lessons, vocab, kanji, grammar, mock tests) is loaded from
// bot-data.json, extracted from the japanese-speaking-practice-with-login app.
// Voice/mic speaking practice is NOT in the bot — that stays in the web app.

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const TOKEN = process.env.BOT_TOKEN || "";
const DATA_FILE = path.join(__dirname, "bot-data.json");
const PROGRESS_FILE = path.join(__dirname, "progress.json");
const DATA = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

if (!TOKEN && !process.argv.includes("--self-test")) {
  console.error("BOT_TOKEN မရှိသေးပါ။ BotFather (@BotFather) မှာ /newbot လုပ်ပြီး ရတဲ့ token ကို BOT_TOKEN=... node bot.js ဆိုပြီး run ပါ။");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;
const PRICES = [
  ["၁ ပတ်", "၂,၃၀၀ ကျပ်"], ["၁ လ", "၉,၉၀၀ ကျပ်"], ["၂ လ", "၁၉,၈၀၀ ကျပ်"],
  ["၃ လ", "၂၉,၇၀၀ ကျပ်"], ["၆ လ", "၅၉,၄၀၀ ကျပ်"], ["၁ နှစ်", "၁၁၈,၈၀၀ ကျပ်"],
  ["၂ နှစ်", "၂၃၇,၆၀၀ ကျပ်"], ["၃ နှစ်", "၃၅၆,၄၀၀ ကျပ်"], ["Lifetime", "၅၀၀,၀၀၀ ကျပ်"],
];

// ---- per-user progress (local file; one file, no database) ----
let progress = {};
try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")); } catch { progress = {}; }
const saveProgress = () => fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
const getUser = (id) => (progress[id] ||= { level: "n5", day: 1, done: [], best: {} });
const sessions = {}; // chatId -> active mock-test session (in memory only)

// ---- Telegram API helpers ----
async function api(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description || res.status}`);
  return json.result;
}
async function send(chatId, text, extra = {}) {
  // Telegram caps one message at 4096 chars — split long lessons.
  const chunks = [];
  let rest = text;
  while (rest.length > 3800) {
    let cut = rest.lastIndexOf("\n", 3800);
    if (cut < 500) cut = 3800;
    chunks.push(rest.slice(0, cut)); rest = rest.slice(cut);
  }
  chunks.push(rest);
  for (let i = 0; i < chunks.length; i++) {
    await api("sendMessage", { chat_id: chatId, text: chunks[i], ...(i === 0 ? extra : {}) });
  }
}
const menuKeyboard = () => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: "📅 ဒီနေ့ သင်ခန်းစာ", callback_data: "today" }, { text: "❓ Quiz ဖြေမယ်", callback_data: "quiz" }],
      [{ text: "📝 Mock Test", callback_data: "mock" }, { text: "🔤 Vocab အကျဉ်း", callback_data: "vocab" }],
      [{ text: "🔄 N5 ⇄ N4 ပြောင်းမယ်", callback_data: "switch" }, { text: "💎 ဈေးနှုန်း / ဝယ်ရန်", callback_data: "prices" }],
    ],
  },
});
const optionKeyboard = (options) => ({
  reply_markup: { inline_keyboard: options.map((o, i) => [{ text: o, callback_data: `a:${i}` }]) },
});

// ---- lesson rendering ----
function dayText(level, day) {
  const list = level === "n5" ? DATA.n5 : DATA.n4;
  const d = list[day - 1];
  if (!d) return null;
  const lines = [
    `👩‍🏫 Sakura-sensei — ${level.toUpperCase()} Day ${d.day} / ${list.length}`,
    `📌 ${d.title}`,
    ``,
    `🇯🇵 ${d.introJp}`,
    `${d.intro}`,
    ``,
    ...d.points.map((p) => `• ${p}`),
    ``,
    ...d.items.map((it) => `${it.jp} — ${it.sub} (${it.my})`),
    ``,
    d.quiz ? `❓ မေးခွန်း: ${d.quiz.q}` : ``,
    `🌸 ${d.closing}`,
  ].filter((x) => x !== undefined);
  return lines.join("\n");
}
function quizText(q) {
  return `❓ ${q.q}\n${q.options.map((o, i) => `${["A", "B", "C", "D"][i]}. ${o}`).join("\n")}`;
}
function pricesText() {
  return `💎 Pro ဈေးနှုန်းများ\n${PRICES.map(([d, p]) => `• ${d} — ${p}`).join("\n")}\n\n💳 ငွေပေးချေမှု: KBZPay / Wave Money / AyaPay (App ထဲက Pro tab မှာ ပြထားတဲ့အတိုင်း လူကိုယ်တိုင် လွှဲရပါတယ်)\n\n🗝️ ဝယ်ရန်: /buy ကို နှိပ်ပြီး Activation Code ရယူနည်း ကြည့်ပါ။`;
}
function buyText() {
  return `🗝️ Activation Code နဲ့ ဝယ်ယူနည်း\n\n1. ရောင်းသူကို ဆက်သွယ်ပြီး သက်တမ်း + ဈေး ပြောပါ\n2. ရောင်းသူက Admin panel ကနေ Code ထုတ်ပေးပါမယ်\n3. App ကိုဖွင့် → Header က 'Login ဝင်ရန်' → Register မှာ email + password နဲ့အတူ Code ကို ရိုက်ပါ\n4. Login ဝင်ပြီး သုံးလို့ရပါပြီ\n\nမှတ်ချက်: Code တစ်ခုကို တစ်ခါပဲ သုံးလို့ရပါတယ်။ သက်တမ်းကုန်ရင် Account tab ကနေ Code အသစ်နဲ့ တိုးလို့ရပါတယ်။`;
}
function startText() {
  return `こんにちは! Sakura-sensei ပါ 🌸\n\nဂျပန် N5 (၁၂၅ ရက်) နဲ့ N4 (၁၃၁ ရက်) ကို တစ်နေ့ချင်း သင်ပေးမယ့် bot ပါ။\n\n• /today — ဒီနေ့ သင်ခန်းစာ\n• /next — ဒီနေ့ ပြီးကြောင်း မှတ်ပြီး နောက်တစ်နေ့\n• /quiz — ဒီနေ့ မေးခွန်း\n• /mock — စာမေးပွဲ ပုံစံ Mock Test\n• /vocab — Vocab ၅ လုံး အကျဉ်း\n• /n5 10 — N5 Day 10 ကို တိုက်ရိုက် ကြည့်မယ်\n• /prices — Pro ဈေးနှုန်း\n\nအောက်က ခလုတ်တွေနဲ့လည်း သုံးလို့ရပါတယ်။`;
}

// ---- mock tests ----
function mockList(level) {
  return level === "n5" ? DATA.mockN5 : DATA.mockN4;
}
function allMockQuestions(test) {
  return test.sections.flatMap((s) => s.questions.map((q) => ({ ...q, section: s.title })));
}
async function startMock(chatId, level, idx) {
  const test = mockList(level)[idx];
  if (!test) return send(chatId, "အဲဒီ Mock Test မရှိသေးပါ။");
  const qs = allMockQuestions(test);
  sessions[chatId] = { testId: `${level}:${idx}`, title: test.title, qs, qi: 0, score: 0 };
  await send(chatId, `📝 ${test.title} စပါပြီ — မေးခွန်း ${qs.length} ပုဒ်။ အဖြေတစ်ခုကို နှိပ်ပါ။`);
  await sendMockQuestion(chatId);
}
async function sendMockQuestion(chatId) {
  const s = sessions[chatId];
  const q = s.qs[s.qi];
  await send(chatId, `[${s.qi + 1}/${s.qs.length}] ${q.section}\n${quizText(q)}`, optionKeyboard(q.options));
}
async function answerMock(chatId, picked) {
  const s = sessions[chatId];
  if (!s) return;
  const q = s.qs[s.qi];
  const ok = picked === q.answer;
  if (ok) s.score += 1;
  await send(chatId, `${ok ? "✅ မှန်ပါတယ်!" : `❌ မှားပါတယ်။ အမှန်က ${q.options[q.answer]}`} \n${q.explain || ""}`);
  s.qi += 1;
  if (s.qi >= s.qs.length) {
    const pct = Math.round((s.score / s.qs.length) * 100);
    const u = getUser(chatId);
    const prev = u.best[s.testId] || 0;
    if (s.score > prev) { u.best[s.testId] = s.score; saveProgress(); }
    await send(chatId, `🏁 ${s.title} ပြီးပါပြီ!\nအမှတ်: ${s.score}/${s.qs.length} (${pct}%)\n${pct >= 60 ? "🎉 အောင်မှတ် (၆၀%) ကျော်ပါတယ်!" : "💪 ၆၀% မပြည့်သေးဘူး — အားနည်းတဲ့ အပိုင်းကို ပြန်နွှေးပြီး ထပ်ဖြေကြည့်ပါ။"}\nအကောင်းဆုံး အမှတ်: ${u.best[s.testId]}/${s.qs.length}`, menuKeyboard());
    delete sessions[chatId];
  } else {
    await sendMockQuestion(chatId);
  }
}

// ---- message / callback handling ----
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const u = getUser(chatId);
  const m = text.match(/^\/(n5|n4)\s+(\d+)/);
  if (text === "/start" || text === "/help") return send(chatId, startText(), menuKeyboard());
  if (text === "/today") {
    const t = dayText(u.level, u.day);
    return send(chatId, t || "ဒီနေ့ သင်ခန်းစာ မရှိပါ။", menuKeyboard());
  }
  if (text === "/next") {
    if (!u.done.includes(`${u.level}:${u.day}`)) u.done.push(`${u.level}:${u.day}`);
    const max = u.level === "n5" ? DATA.n5.length : DATA.n4.length;
    if (u.day < max) u.day += 1;
    saveProgress();
    return send(chatId, `✅ Day ${u.day - 1} ပြီးပါပြီ! နောက်တစ်နေ့ — Day ${u.day} ကို /today နဲ့ ကြည့်ပါ။`, menuKeyboard());
  }
  if (text === "/quiz") {
    const list = u.level === "n5" ? DATA.n5 : DATA.n4;
    const d = list[u.day - 1];
    if (!d || !d.quiz) return send(chatId, "ဒီနေ့မှာ Quiz မရှိပါ။");
    sessions[chatId] = { quiz: d.quiz };
    return send(chatId, quizText(d.quiz), optionKeyboard(d.quiz.options));
  }
  if (text === "/mock") {
    return send(chatId, "📝 Mock Test ရွေးပါ:", {
      reply_markup: { inline_keyboard: [
        [{ text: "N5 Mock 1 (၂၂ ပုဒ်)", callback_data: "m:n5:0" }, { text: "N5 Mock 2", callback_data: "m:n5:1" }],
        [{ text: "N5 Mock 3", callback_data: "m:n5:2" }, { text: "N4 Mock 1 (၂၂ ပုဒ်)", callback_data: "m:n4:0" }],
        [{ text: "N4 Mock 2", callback_data: "m:n4:1" }],
      ]},
    });
  }
  if (text === "/vocab") {
    const pool = u.level === "n5" ? DATA.vocab : DATA.vocabN4;
    const picks = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
    return send(chatId, `🔤 Vocab ၅ လုံး\n${picks.map((v) => `${v.jp} (${v.romaji}) — ${v.my} · အသံထွက် ${v.myPron}`).join("\n")}`, menuKeyboard());
  }
  if (text === "/prices") return send(chatId, pricesText(), menuKeyboard());
  if (text === "/buy") return send(chatId, buyText(), menuKeyboard());
  if (m) {
    const level = m[1], day = parseInt(m[2], 10);
    const t = dayText(level, day);
    if (!t) return send(chatId, `${level.toUpperCase()} မှာ Day ${day} မရှိပါ။`);
    u.level = level; u.day = day; saveProgress();
    return send(chatId, t, menuKeyboard());
  }
  return send(chatId, "နားမလည်လိုက်ဘူး 😅 /help ကို နှိပ်ပြီး command တွေ ကြည့်ပါ။", menuKeyboard());
}
async function handleCallback(q) {
  const chatId = q.message.chat.id;
  const data = q.data || "";
  const u = getUser(chatId);
  await api("answerCallbackQuery", { callback_query_id: q.id });
  if (data === "today") { const t = dayText(u.level, u.day); return send(chatId, t || "သင်ခန်းစာ မရှိပါ။", menuKeyboard()); }
  if (data === "quiz") {
    const list = u.level === "n5" ? DATA.n5 : DATA.n4;
    const d = list[u.day - 1];
    if (!d || !d.quiz) return send(chatId, "ဒီနေ့မှာ Quiz မရှိပါ။");
    sessions[chatId] = { quiz: d.quiz };
    return send(chatId, quizText(d.quiz), optionKeyboard(d.quiz.options));
  }
  if (data === "mock") return handleMessage({ chat: { id: chatId }, text: "/mock" });
  if (data === "vocab") return handleMessage({ chat: { id: chatId }, text: "/vocab" });
  if (data === "prices") return send(chatId, pricesText(), menuKeyboard());
  if (data === "switch") {
    u.level = u.level === "n5" ? "n4" : "n5"; u.day = 1; saveProgress();
    return send(chatId, `🔄 ${u.level.toUpperCase()} ကို ပြောင်းလိုက်ပါပြီ — Day 1 ကနေ စပါမယ်။ /today နဲ့ ကြည့်ပါ။`, menuKeyboard());
  }
  if (data.startsWith("m:")) {
    const [, level, idx] = data.split(":");
    return startMock(chatId, level, parseInt(idx, 10));
  }
  if (data.startsWith("a:")) {
    const picked = parseInt(data.split(":")[1], 10);
    const s = sessions[chatId];
    if (!s) return;
    if (s.qs) return answerMock(chatId, picked);
    if (s.quiz) {
      const ok = picked === s.quiz.answer;
      delete sessions[chatId];
      return send(chatId, `${ok ? "✅ မှန်ပါတယ်!" : `❌ မှားပါတယ်။ အမှန်က ${s.quiz.options[s.quiz.answer]}`} \n${s.quiz.explain || ""}`, menuKeyboard());
    }
  }
}

// ---- long polling loop ----
let offset = 0;
async function poll() {
  try {
    const res = await fetch(`${API}/getUpdates?offset=${offset}&timeout=30`);
    const json = await res.json();
    if (!json.ok) {
      if (json.error_code === 401) { console.error("Token မှားနေပါတယ် (401) — BotFather က token ကို ပြန်စစ်ပါ။"); process.exit(1); }
      throw new Error(json.description || "getUpdates failed");
    }
    for (const upd of json.result || []) {
      offset = upd.update_id + 1;
      try {
        if (upd.message) await handleMessage(upd.message);
        else if (upd.callback_query) await handleCallback(upd.callback_query);
      } catch (e) { console.error("update error:", e.message); }
    }
  } catch (e) {
    console.error("poll error:", e.message);
    await new Promise((r) => setTimeout(r, 5000));
  }
  setImmediate(poll);
}
if (process.argv.includes("--self-test")) { selfTest(); process.exit(0); }

// ---- tiny HTTP server (Render free tier) ----
// Render's free tier has no Background Worker, so the bot must run as a
// Web Service — and a Web Service must listen on $PORT, or Render marks
// the deploy unhealthy and kills it. The bot itself uses long polling
// (no inbound Telegram traffic), so this server only answers health
// checks / keep-alive pings; it serves no lesson content.
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Sakura-sensei bot is running 🌸\n");
}).listen(PORT, () => console.log(`Health server listening on port ${PORT}`));

console.log("Sakura-sensei bot စတင်နေပါပြီ 🌸 (Ctrl+C နဲ့ ရပ်ပါ)");
poll();

// ---- offline self-test (no network, no token needed) ----
function selfTest() {
  const assert = (c, label) => { if (!c) { console.error("FAIL:", label); process.exitCode = 1; } else console.log("OK:", label); };
  assert(DATA.n5.length === 125, `N5 days = ${DATA.n5.length}`);
  assert(DATA.n4.length === 131, `N4 days = ${DATA.n4.length}`);
  assert(DATA.vocab.length === 800, `N5 vocab = ${DATA.vocab.length}`);
  assert(DATA.kanji.length === 103, `N5 kanji = ${DATA.kanji.length}`);
  assert(DATA.mockN5.reduce((a, t) => a + t.sections.reduce((b, s) => b + s.questions.length, 0), 0) === 66, "N5 mock questions = 66");
  assert(DATA.mockN4.reduce((a, t) => a + t.sections.reduce((b, s) => b + s.questions.length, 0), 0) === 44, "N4 mock questions = 44");
  let longest = 0, badQuiz = 0;
  for (const list of [DATA.n5, DATA.n4]) for (const d of list) {
    const t = dayText(list === DATA.n5 ? "n5" : "n4", d.day);
    longest = Math.max(longest, t.length);
    if (d.quiz && (d.quiz.answer < 0 || d.quiz.answer >= d.quiz.options.length || new Set(d.quiz.options).size !== d.quiz.options.length)) badQuiz++;
  }
  console.log("longest day message chars:", longest);
  assert(longest <= 3800 * 2, "longest day fits in 2 Telegram chunks");
  assert(badQuiz === 0, `days with invalid quiz: ${badQuiz}`);
  for (const list of [DATA.mockN5, DATA.mockN4]) for (const t of list) for (const q of allMockQuestions(t)) {
    if (q.answer < 0 || q.answer >= q.options.length) { console.error("FAIL: bad mock answer", t.title); process.exitCode = 1; }
  }
  console.log("OK: all mock answers valid");
  console.log("--- sample /start ---"); console.log(startText().slice(0, 200));
  console.log("--- sample /today N5 Day 1 (first 300 chars) ---"); console.log(dayText("n5", 1).slice(0, 300));
  console.log("--- sample /prices ---"); console.log(pricesText().slice(0, 200));
}
