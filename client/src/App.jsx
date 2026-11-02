import React, { useEffect, useRef, useState } from "react";

const BASE = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, ""); // no trailing slash
const arr = (d) => (Array.isArray(d) ? d : []);
let token = "";
async function api(path, opts = {}) {
  const r = await fetch(BASE + "/api" + path, { ...opts, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || "Something went wrong. Please try again.");
  return d;
}
const ICON = { "Cleanliness & Hygiene": "🧹", "Infrastructure & Maintenance": "🛠️", "Campus Safety": "🛡️", "Hostel Facilities": "🛏️", "Mess & Food Services": "🍽️",
  "Academic & Administrative": "📚", "Sports Facilities": "⚽", "Mental Health & Welfare": "💚", Other: "📌" };
const STEPS = ["Submitted", "Acknowledged", "In Progress", "Resolved"];
const fmt = (iso) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const THEME_KEY = "sahayika-theme";
const initialTheme = () => {
  try { const t = localStorage.getItem(THEME_KEY); if (t) return t; } catch {}
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};
function smallPhoto(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const c = document.createElement("canvas"); c.width = c.height = 128; const s = Math.min(img.width, img.height);
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.8)); };
    img.onerror = () => rej(new Error("Could not read that image."));
    img.src = url;
  });
}

function toCanvas(src, w, h) {
  const k = Math.min(1, 800 / Math.max(w, h)), c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext("2d").drawImage(src, 0, 0, c.width, c.height); return c;
}
function fileToCanvas(file) {
  return new Promise((res, rej) => { const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); res(toCanvas(img, img.naturalWidth, img.naturalHeight)); }; img.onerror = () => rej(new Error("bad image")); img.src = url; });
}
function looksBlank(canvas) { // friendly sanity check: reject blank / uniform / pitch-dark photos
  const t = document.createElement("canvas"); t.width = t.height = 24; const x = t.getContext("2d"); x.drawImage(canvas, 0, 0, 24, 24);
  const d = x.getImageData(0, 0, 24, 24).data, n = d.length / 4; let sum = 0, sq = 0;
  for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += v; sq += v * v; }
  const mean = sum / n; return mean < 18 || Math.sqrt(Math.max(0, sq / n - mean * mean)) < 5;
}

function CameraCapture({ onCanvas, onError }) {
  const [open, setOpen] = useState(false), vref = useRef(null), sref = useRef(null), fallback = useRef(null);
  const stop = () => { sref.current?.getTracks().forEach(t => t.stop()); sref.current = null; setOpen(false); };
  useEffect(() => stop, []);
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) return fallback.current.click(); // phones: opens the camera app
    try { const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); sref.current = st; setOpen(true);
      setTimeout(() => { if (vref.current) vref.current.srcObject = st; }, 0); }
    catch { onError("We couldn't open the camera. Please allow camera access in your browser, or use 'Upload photo' instead."); }
  }
  function snap() { const v = vref.current; if (!v || !v.videoWidth) return; onCanvas(toCanvas(v, v.videoWidth, v.videoHeight)); stop(); }
  async function viaInput(e) { const f = e.target.files[0]; e.target.value = ""; if (f) try { onCanvas(await fileToCanvas(f)); } catch { onError("We couldn't read that photo. Please try again."); } }
  return (<>
    <button type="button" className="alt" onClick={start}>📷 Use camera</button>
    <input ref={fallback} type="file" accept="image/*" capture="environment" hidden onChange={viaInput} />
    {open && <div className="camera" role="dialog" aria-label="Camera"><video ref={vref} autoPlay playsInline muted />
      <div><button type="button" onClick={snap}>● Capture</button><button type="button" className="alt" onClick={stop}>Cancel</button></div></div>}</>);
}

function ChatBot() {
  const [open, setOpen] = useState(false), [text, setText] = useState(""), [busy, setBusy] = useState(false), end = useRef(null);
  const [msgs, setMsgs] = useState([{ role: "assistant", content: "Hi, I'm Buddy 💚 I'm here to listen. How are you feeling today?" }]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, open, busy]);
  async function send(e) {
    e.preventDefault(); const t = text.trim(); if (!t || busy) return;
    const next = [...msgs, { role: "user", content: t }]; setMsgs(next); setText(""); setBusy(true);
    try { const d = await api("/chat", { method: "POST", body: { messages: next.slice(-20) } }); setMsgs([...next, { role: "assistant", content: d.reply }]); }
    catch { setMsgs([...next, { role: "assistant", content: "I'm having trouble connecting right now. If you need someone to talk to now, please reach a friend, your warden, or call Tele-MANAS at 14416 (free, 24x7)." }]); }
    setBusy(false);
  }
  return (<>
    {open && <section className="chat" aria-label="Support chat">
      <header><span>🤖 Buddy · emotional support</span><button className="x" aria-label="Close chat" onClick={() => setOpen(false)}>✕</button></header>
      <p className="disc">AI companion, not a counsellor. Chats aren't saved. In danger? Call 112 · Tele-MANAS 14416</p>
      <div className="msgs" aria-live="polite">{msgs.map((m, i) => <div key={i} className={"msg " + m.role}>{m.content}</div>)}
        {busy && <div className="msg assistant">…</div>}<div ref={end} /></div>
      <form onSubmit={send}><label htmlFor="cm" className="sr">Message</label>
        <input id="cm" value={text} onChange={e => setText(e.target.value)} placeholder="Type how you're feeling…" maxLength={1000} autoComplete="off" /><button disabled={busy || !text.trim()}>Send</button></form></section>}
    <button className="fab" aria-label={open ? "Close support chat" : "Open support chat"} aria-expanded={open} onClick={() => setOpen(!open)}>🤖</button></>);
}

function Avatar({ user, size = 72 }) {
  const st = { width: size, height: size, fontSize: size / 2.6 };
  return user.photo ? <img className="avatar" style={st} src={user.photo} alt={`Photo of ${user.name}`} />
    : <div className="avatar" style={st} aria-hidden="true">{user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}</div>;
}
function ThemeSwitch({ theme, setTheme }) {
  return (<div className="seg" role="group" aria-label="Colour mode">
    <button className={theme === "light" ? "on" : ""} aria-pressed={theme === "light"} onClick={() => setTheme("light")}>☀ Light</button>
    <button className={theme === "dark" ? "on" : ""} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>☾ Dark</button></div>);
}

function Auth({ onAuth, theme, setTheme }) {
  const [mode, setMode] = useState("in"), [f, setF] = useState({ name: "", email: "", password: "", department: "", photo: null }), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function pick(e) { try { const file = e.target.files[0]; if (file) setF({ ...f, photo: await smallPhoto(file) }); } catch (x) { setErr(x.message); } }
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr("");
    try { const d = await api(mode === "in" ? "/auth/login" : "/auth/signup", { method: "POST", body: f }); token = d.token; onAuth(d.user); }
    catch (x) { setErr(x.message); } setBusy(false);
  }
  return (<div className="authpage">
    <header className="authhead"><div className="brandrow"><img className="logomark" src="/logo.png" alt="Sahāyika logo" /><div><h1 className="logo">Sahāyika</h1><p className="tag">NIT KURUKSHETRA'S campus grievance assistant</p></div></div>
      <ThemeSwitch theme={theme} setTheme={setTheme} /></header>
    <div className="authbox card">
      <div className="seg wide" role="tablist"><button role="tab" aria-selected={mode === "in"} className={mode === "in" ? "on" : ""} onClick={() => { setMode("in"); setErr(""); }}>Sign in</button>
        <button role="tab" aria-selected={mode === "up"} className={mode === "up" ? "on" : ""} onClick={() => { setMode("up"); setErr(""); }}>Sign up</button></div>
      {err && <div className="err" role="alert">{err}</div>}
      <form onSubmit={submit}>
        {mode === "up" && <><label htmlFor="n">Full name</label><input id="n" value={f.name} onChange={set("name")} required autoComplete="name" />
          <label htmlFor="d">Department / branch</label><input id="d" value={f.department} onChange={set("department")} placeholder="e.g. Computer Engineering" />
          <label htmlFor="p">Profile photo (optional)</label><input id="p" type="file" accept="image/*" onChange={pick} />
          {f.photo && <img className="avatar" style={{ width: 64, height: 64, marginTop: 8 }} src={f.photo} alt="Your selected profile" />}</>}
        <label htmlFor="e">Email</label><input id="e" type="email" value={f.email} onChange={set("email")} required autoComplete="email" />
        <label htmlFor="pw">Password {mode === "up" && <small>(at least 8 characters)</small>}</label>
        <input id="pw" type="password" value={f.password} onChange={set("password")} required autoComplete={mode === "in" ? "current-password" : "new-password"} />
        <button className="wide" disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}</button></form>
      <p className="muted demo">Demo accounts (password <b>demo1234</b>):<br />
        {["asha@campus.example", "admin@campus.example", "maint@campus.example"].map(e => <button key={e} type="button" className="alt small" onClick={() => { setMode("in"); setF({ ...f, email: e, password: "demo1234" }); }}>{e.split("@")[0]}</button>)}</p>
    </div></div>);
}

export default function App() {
  const [user, setUser] = useState(null), [tab, setTab] = useState(""), [theme, setTheme] = useState(initialTheme);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem(THEME_KEY, theme); } catch {} }, [theme]);
  const enter = (u) => { setUser(u); setTab(u.role === "student" ? "mine" : "overview"); };
  if (!user) return <Auth onAuth={enter} theme={theme} setTheme={setTheme} />;
  const student = user.role === "student";
  const nav = student ? [["mine", "☰ My complaints"], ["report", "✎ Report an issue"], ["all", "◎ All complaints"], ["feedback", "★ Feedback"]]
    : [["overview", "▦ Dashboard"], ["complaints", "☰ Complaints"], ["all", "◎ All complaints"], ...(user.role === "admin" ? [["audit", "⌕ Audit log"]] : [])];
  return (<div className="shell">
    <aside className="sidebar">
      <div className="profile"><Avatar user={user} /><b>{user.name}</b><small>{user.email}</small>
        <span className="chip">{user.department} · {user.role}</span></div>
      <nav aria-label="Main">{nav.map(([k, label]) => <button key={k} className={"navbtn" + (tab === k ? " active" : "")} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>{label}</button>)}</nav>
      <div className="sidefoot"><ThemeSwitch theme={theme} setTheme={setTheme} />
        <button className="logout" onClick={() => { token = ""; setUser(null); }}>⎋ Log out</button></div>
    </aside>
    <main className="content">
      {tab === "mine" && <Mine go={setTab} />}
      {tab === "report" && <Report done={() => setTab("mine")} />}
      {tab === "all" && <AllComplaints />}
      {tab === "feedback" && <Feedback />}
      {!student && ["overview", "complaints", "audit"].includes(tab) && <Admin user={user} tab={tab} />}
    </main>{student && <ChatBot />}</div>);
}

function Tracker({ status }) {
  const idx = Math.max(0, STEPS.indexOf(status === "Reopened" ? "Acknowledged" : status));
  return (<ol className="track" aria-label={"Progress: " + status}>{STEPS.map((s, i) =>
    <li key={s} className={i < idx ? "done" : i === idx ? "now" : ""} aria-current={i === idx ? "step" : undefined}><span className="dot">{i < idx ? "✓" : i + 1}</span>{s}
      <span className="sr">{i < idx ? " (done)" : i === idx ? " (current)" : ""}</span></li>)}
    {status === "Reopened" && <li className="reopen">↺ Reopened</li>}</ol>);
}

function Mine({ go }) {
  const [list, setList] = useState(null), [err, setErr] = useState("");
  useEffect(() => { api("/complaints").then(d => setList(arr(d))).catch(e => setErr(e.message)); }, []);
  return (<><h2>My complaints</h2>{err && <div className="err" role="alert">{err}</div>}{!list && !err && <p>Loading…</p>}
    {list && !list.length && <div className="card empty">You haven't reported anything yet.<br /><button onClick={() => go("report")}>Report an issue</button></div>}
    {list && list.map(c => (<div className="card" key={c.id}>
      <div className="row"><b>{c.id}</b><span className={"badge " + c.priority}>{c.priority}</span>{c.sensitive && <span className="badge">Confidential</span>}</div>
      <h3>{c.title}</h3><small>{ICON[c.sector]} {c.sector} · {c.location || "location not given"} · {c.department}</small>
      {c.evidence?.length > 0 && <div className="thumbs">{c.evidence.map((e, i) => <img key={i} src={e} alt={`Evidence photo ${i + 1}`} />)}</div>}
      <Tracker status={c.status} />
      {c.linked_to && <p className="muted">Linked to {c.linked_to} as a recurring issue.</p>}
      <details><summary>Updates ({c.timeline.length})</summary><ul>{c.timeline.map((t, i) => <li key={i}>{t.status} <small>{fmt(t.ts)}{t.remark && " – " + t.remark}</small></li>)}</ul></details></div>))}</>);
}

function Report({ done }) {
  const [sectors, setSectors] = useState([]), [text, setText] = useState(""), [sector, setSector] = useState("");
  const [draft, setDraft] = useState(null), [anon, setAnon] = useState(false), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [ok, setOk] = useState(null), [photos, setPhotos] = useState([]), [notice, setNotice] = useState("");
  useEffect(() => { fetch(BASE + "/api/meta").then(r => r.json()).then(d => setSectors(arr(d.sectors))).catch(() => setErr("Can't reach the server right now. If it was idle, wait a minute and refresh the page.")); }, []);
  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return setErr("Voice input is not supported in this browser. Please type your complaint.");
    const r = new SR(); r.onresult = e => setText(t => (t + " " + e.results[0][0].transcript).trim()); r.start();
  }
  function addPhoto(canvas) {
    if (photos.length >= 2) return setNotice("You can attach up to 2 photos. Remove one to add another.");
    if (looksBlank(canvas)) return setNotice("That photo looks blank or very dark, so it may not show the problem clearly. Could you retake it in better light, pointing at the issue?");
    setPhotos(p => [...p, canvas.toDataURL("image/jpeg", 0.7)]); setNotice("");
  }
  async function pickFile(e) { const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { addPhoto(await fileToCanvas(f)); } catch { setNotice("We couldn't read that image. Please choose a JPG or PNG photo."); } }
  async function formalize() {
    setBusy(true); setErr("");
    try { const d = await api("/complaints/formalize", { method: "POST", body: { text, sector: sector || null } });
      if (d.valid === false) setNotice(d.message); else { setNotice(""); setDraft(d); } } catch (e) { setErr(e.message); } setBusy(false);
  }
  async function submit(join) {
    try { setOk(await api("/complaints", { method: "POST", body: { title: draft.title, description: draft.original_text, sector: draft.sector, location: draft.location || null, anonymous: anon, join_existing: join || null, evidence: photos } })); }
    catch (e) { setErr(e.message); }
  }
  const step = ok ? 3 : draft ? 2 : 1;
  if (ok) return (<div className="card success"><div className="bigicon">🎉</div><h2>Complaint submitted</h2><p>Your tracking ID</p><div className="tid">{ok.id}</div>
    <p className="muted">Sent to <b>{ok.department}</b>. A human will review it; AI only suggests.</p>
    {ok.support_info.length > 0 && <div className="note"><b>Support is available now:</b><ul>{ok.support_info.map(s => <li key={s}>{s}</li>)}</ul></div>}
    <button onClick={done}>Track my complaint</button></div>);
  return (<><div className="hero"><h2>What's going wrong on campus?</h2><p>Tell us in your own words. We'll turn it into a clear complaint you can check before sending.</p></div>
    <ol className="steps" aria-label="Steps">{["Describe", "Review", "Done"].map((s, i) => <li key={s} className={step === i + 1 ? "now" : step > i + 1 ? "done" : ""}><span className="dot">{i + 1}</span>{s}</li>)}</ol>
    <div className="card">{err && <div className="err" role="alert">{err}</div>}{notice && <div className="note" role="status">{notice}</div>}
      {!draft ? (<>
        <b id="sl">What kind of issue is it?</b>
        <div className="chips" role="group" aria-labelledby="sl">
          <button type="button" className={"chipbtn" + (!sector ? " on" : "")} aria-pressed={!sector} onClick={() => setSector("")}>✨ Detect for me</button>
          {sectors.map(s => <button type="button" key={s} className={"chipbtn" + (sector === s ? " on" : "")} aria-pressed={sector === s} onClick={() => setSector(s)}>{ICON[s]} {s}</button>)}</div>
        <label htmlFor="t">Describe the problem</label>
        <textarea id="t" value={text} onChange={e => setText(e.target.value)} placeholder="e.g. The corridor lights in Block C have not worked for three days…" />
        <div className="row"><button className="alt" onClick={listen}>🎤 Speak instead</button><CameraCapture onCanvas={addPhoto} onError={setErr} />
          <label className="filebtn">🖼 Upload photo<input type="file" accept="image/*" hidden onChange={pickFile} /></label></div>
        {photos.length > 0 && <div className="thumbs">{photos.map((p, i) => <span key={i} className="thumb"><img src={p} alt={`Evidence photo ${i + 1}`} />
          <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>✕</button></span>)}</div>}
        {photos.length > 0 && !text.trim() && <small className="muted">Add a short description of what the photo shows.</small>}
        <button disabled={busy || !text.trim()} onClick={formalize}>{busy ? "Working…" : "Prepare my complaint →"}</button></>) : (<>
        <h3>Review your complaint</h3><p className="muted">Built from your words only ({draft.mode} mode). Fix anything that's wrong.</p>
        {draft.support_info.length > 0 && <div className="note" role="alert"><b>Support is available now:</b><ul>{draft.support_info.map(s => <li key={s}>{s}</li>)}</ul></div>}
        <label htmlFor="ti">Title</label><input id="ti" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
        <label htmlFor="lo">Location {draft.missing_fields.includes("location") && <small>(missing: where did this happen?)</small>}</label>
        <input id="lo" value={draft.location || ""} onChange={e => setDraft({ ...draft, location: e.target.value })} />
        <label htmlFor="se">Sector</label>
        <select id="se" value={draft.sector} onChange={e => setDraft({ ...draft, sector: e.target.value })}>{sectors.map(s => <option key={s}>{s}</option>)}</select>
        <p>Suggested department: <b>{draft.department}</b> <span className={"badge " + draft.priority}>{draft.priority} priority (suggestion)</span></p>
        <label>Your original text</label><pre>{draft.original_text}</pre>
        {photos.length > 0 && <div className="thumbs">{photos.map((p, i) => <img key={i} src={p} alt={`Evidence photo ${i + 1}`} />)}</div>}
        <label className="check"><input type="checkbox" checked={anon || draft.sensitive} disabled={draft.sensitive} onChange={e => setAnon(e.target.checked)} /> Report anonymously{draft.sensitive ? " (sensitive reports are always confidential)" : ""}</label>
        {draft.possible_duplicates.length > 0 && <div className="note">Possible duplicate of {draft.possible_duplicates.map(d => d.id).join(", ")}. Joining links your report to it; your own record is kept.
          <br /><button className="alt" onClick={() => submit(draft.possible_duplicates[0].id)}>Join existing report</button></div>}
        <button onClick={() => submit()}>Approve and submit</button><button className="alt" onClick={() => setDraft(null)}>← Edit my text</button></>)}</div></>);
}

function AllComplaints() {
  const [list, setList] = useState(null), [err, setErr] = useState(""), [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: "all", type: "all", status: "all" });
  useEffect(() => { api("/public/complaints").then(d => setList(arr(d))).catch(e => setErr(e.message)); }, []);
  const days = { week: 7, month: 30 };
  const shown = (list || []).filter(c => (f.type === "all" || c.sector === f.type) && (f.status === "all" || c.status === f.status)
    && (f.date === "all" || Date.now() - new Date(c.created_at) <= days[f.date] * 864e5));
  const active = Object.values(f).filter(v => v !== "all").length;
  const sel = (k, label, opts) => (<div><label htmlFor={"f" + k}>{label}</label><select id={"f" + k} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })}>{opts}</select></div>);
  return (<><div className="row between"><h2>All complaints</h2>
    <button className="alt" aria-expanded={open} onClick={() => setOpen(!open)}>⚲ Filter{active ? ` (${active})` : ""}</button></div>
    <p className="muted">Public campus feed. Names and confidential reports are never shown.</p>
    {open && <div className="card filters">
      {sel("date", "Date", <><option value="all">All time</option><option value="week">Last 7 days</option><option value="month">Last 30 days</option></>)}
      {sel("type", "Type", <><option value="all">All types</option>{[...new Set((list || []).map(c => c.sector))].map(s => <option key={s}>{s}</option>)}</>)}
      {sel("status", "Status", <><option value="all">All statuses</option>{[...STEPS, "Reopened"].map(s => <option key={s}>{s}</option>)}</>)}
      <button className="alt" onClick={() => setF({ date: "all", type: "all", status: "all" })}>Clear</button></div>}
    {err && <div className="err" role="alert">{err}</div>}{!list && !err && <p>Loading…</p>}
    {list && <p aria-live="polite"><small>{shown.length} of {list.length} complaints</small></p>}
    {list && !shown.length && <div className="card empty">No complaints match these filters.</div>}
    {shown.map(c => (<div className="card" key={c.id}><div className="row"><b>{c.id}</b><span className={"badge " + c.priority}>{c.priority}</span><span className="badge">{c.status}</span>
      {c.reports > 1 && <span className="badge">{c.reports} reports</span>}</div>
      <h3>{c.title}</h3><small>{ICON[c.sector]} {c.sector} · {c.location || "—"} · {c.department} · {fmt(c.created_at)}</small></div>))}</>);
}

function Feedback() {
  const [rating, setRating] = useState(0), [hover, setHover] = useState(0), [msg, setMsg] = useState(""), [err, setErr] = useState(""), [sent, setSent] = useState(false);
  async function send() {
    try { await api("/feedback", { method: "POST", body: { rating, message: msg } }); setSent(true); setErr(""); } catch (e) { setErr(e.message); }
  }
  if (sent) return <div className="card success"><div className="bigicon">💚</div><h2>Thank you!</h2><p>Your feedback helps improve campus services.</p>
    <button className="alt" onClick={() => { setSent(false); setRating(0); setMsg(""); }}>Send more feedback</button></div>;
  return (<><h2>Feedback</h2><div className="card">{err && <div className="err" role="alert">{err}</div>}
    <b id="rl">How was your experience with Sahāyika?</b>
    <div className="stars" role="group" aria-labelledby="rl">{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={rating === n}
      className={n <= (hover || rating) ? "star on" : "star"} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setRating(n)}>★</button>)}</div>
    <label htmlFor="fm">Your feedback</label><textarea id="fm" value={msg} maxLength={1000} onChange={e => setMsg(e.target.value)} placeholder="What worked well? What could be better?" />
    <button disabled={!rating} onClick={send}>Submit feedback</button>{!rating && <small className="muted"> Choose a star rating first.</small>}</div></>);
}

const NEXT = { Submitted: ["Acknowledged"], Acknowledged: ["In Progress"], "In Progress": ["Resolved"], Resolved: ["Reopened"], Reopened: ["Acknowledged", "In Progress"] };
function Admin({ user, tab }) {
  const [list, setList] = useState([]), [stats, setStats] = useState(null), [log, setLog] = useState([]), [fb, setFb] = useState([]), [err, setErr] = useState("");
  async function load() {
    setList(arr(await api("/admin/complaints"))); setStats(await api("/admin/analytics"));
    if (user.role === "admin") { setLog(arr(await api("/admin/audit"))); setFb(arr(await api("/admin/feedback"))); }
  }
  useEffect(() => { load().catch(e => setErr(e.message)); }, [tab]);
  async function move(id, status) { try { await api(`/admin/complaints/${id}/status`, { method: "PATCH", body: { status } }); await load(); } catch (e) { setErr(e.message); } }
  async function reveal(id) { try { const r = await api(`/admin/complaints/${id}/reporter`); alert(`Reporter: ${r.name} (${r.department}). This access was logged.`); await load(); } catch (e) { setErr(e.message); } }
  const errBox = err && <div className="err" role="alert">{err}</div>;
  if (tab === "overview") return (<>{errBox}<h2>Dashboard</h2>
    {stats && <div className="grid">{[["Total", stats.total], ["Unresolved", stats.unresolved], ["Critical", stats.critical], ["Recurring", stats.recurring.length]].map(([k, v]) => <div className="card stat" key={k}><div className="big">{v}</div>{k}</div>)}</div>}
    {stats && <div className="card"><b>By department</b><div>{Object.entries(stats.by_department).map(([k, v]) => <span className="badge" key={k}>{k}: {v}</span>)}</div></div>}
    {stats && <div className="card"><b>By sector</b><div>{Object.entries(stats.by_sector).map(([k, v]) => <span className="badge" key={k}>{k}: {v}</span>)}</div></div>}
    {stats && stats.recurring.length > 0 && <div className="card"><b>Recurring issues</b>{stats.recurring.map(r => <div key={r.id}>{r.id} {r.title} ({r.reports} reports)</div>)}</div>}
    {user.role === "admin" && <div className="card"><b>Student feedback</b>{fb.length === 0 ? <p className="muted">No feedback yet.</p> :
      <><p>Average: {(fb.reduce((a, x) => a + x.rating, 0) / fb.length).toFixed(1)} ★ ({fb.length})</p>{fb.slice(0, 5).map(x => <div key={x.id}><small>{"★".repeat(x.rating)} {x.message}</small></div>)}</>}</div>}</>);
  if (tab === "audit") return (<>{errBox}<h2>Audit log ({log.length})</h2><div className="card">{log.map((l, i) => <div key={i}><small>{l.ts} · {l.actor} · {l.action} · {l.detail}</small></div>)}</div></>);
  return (<>{errBox}<h2>Complaints</h2>{list.length === 0 && <div className="card empty">No complaints in your area yet.</div>}
    {list.map(c => (<div className="card" key={c.id}><b>{c.id}</b> {c.title}
      <div><span className={"badge " + c.priority}>{c.priority}</span><span className="badge">{c.status}</span>
        {c.escalated && <span className="badge Critical">Escalation recommended: {c.escalation_reason}</span>}{c.needs_manual_review && <span className="badge High">Manual categorisation</span>}</div>
      <small>{c.sector} · {c.location || "—"} · {c.department} · Reporter: {c.reporter}</small>
      {c.evidence?.length > 0 && <div className="thumbs">{c.evidence.map((e, i) => <img key={i} src={e} alt={`Evidence photo ${i + 1}`} />)}</div>}
      {c.linked_ids.length > 0 && <p>Collective issue: {1 + c.linked_ids.length} reports ({c.linked_ids.join(", ")})</p>}
      <p className="muted">AI suggestions only. Priority reason: {c.priority_reason}. Final decision rests with you.</p>
      {(NEXT[c.status] || []).map(s => <button key={s} onClick={() => move(c.id, s)}>Mark {s}</button>)}
      {user.role === "admin" && <button className="alt" onClick={() => reveal(c.id)}>View reporter (logged)</button>}
      <details><summary>Agent trace</summary><pre>{JSON.stringify(c.trace, null, 1)}</pre></details></div>))}</>);
}
