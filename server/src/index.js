import http from "node:http";
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
const hash = (pw, salt = randomBytes(16).toString("hex")) => `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
const verify = (pw, stored) => { const [salt, h] = stored.split(":"); const a = Buffer.from(h, "hex"), b = scryptSync(pw, salt, 32); return a.length === b.length && timingSafeEqual(a, b); };
import * as agent from "./agent.js";
import * as llm from "./llm.js";
import { supportReply } from "./support.js";

const FLOW = { Submitted: ["Acknowledged"], Acknowledged: ["In Progress"], "In Progress": ["Resolved"], Resolved: ["Reopened"], Reopened: ["Acknowledged", "In Progress"] };
const MAX_LEN = 5000;
// Fictional demo users. Demo auth only: log in by email, no password.
const USERS = {
  "asha@campus.example": { id: "u1", name: "Asha", role: "student", department: "CSE" },
  "ravi@campus.example": { id: "u2", name: "Ravi", role: "student", department: "ECE" },
  "admin@campus.example": { id: "a1", name: "Dr. Mehta", role: "admin", department: "Administration" },
  "maint@campus.example": { id: "h1", name: "Maintenance Lead", role: "handler", department: "Maintenance Team" },
};
const BY_ID = Object.fromEntries(Object.values(USERS).map((u) => [u.id, u]));
for (const [email, u] of Object.entries(USERS)) { u.email = email; u.pw = hash("demo1234"); } // demo password: demo1234
const pub = ({ pw, ...u }) => u;
const fails = new Map(); // email -> {n, until} simple brute-force throttle
const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || "").toLowerCase(); // e.g. nitkkr.ac.in ; empty = any email
const db = { complaints: new Map(), audit: [], tokens: new Map(), seq: 1000, feedback: [] };
const fail = (status, detail) => Object.assign(new Error(detail), { status });
const audit = (actor, action, detail = "") => db.audit.push({ ts: agent.now(), actor, action, detail });

function create(uid, text, sector, location, anonymous, join, title, evidence = []) {
  text = agent.sanitize(text);
  const existing = [...db.complaints.values()].filter((c) => !c.closed);
  const { state, trace } = agent.run(text, sector, location, existing);
  const id = "CMP-" + ++db.seq;
  const c = { id, user_id: uid, title: title || agent.ruleBasedFormalize(text).title, text, sector: state.sector, location: state.location,
    priority: state.priority, priority_reason: state.reason, department: state.department, confidence: state.confidence,
    needs_manual_review: state.needs_manual_review, sensitive: state.sensitive, anonymous: anonymous || state.sensitive,
    escalated: state.escalate, escalation_reason: state.escalation_reason, support_info: state.support_info, status: "Submitted",
    created_at: agent.now(), linked_to: null, linked_ids: [], timeline: [{ ts: agent.now(), status: "Submitted", remark: "" }], closed: false, trace, evidence };
  const target = join || state.duplicates[0]?.id;
  if (target && db.complaints.has(target)) { c.linked_to = target; db.complaints.get(target).linked_ids.push(id); } // linked, never deleted
  db.complaints.set(id, c);
  audit(uid, "complaint_submitted", id);
  for (const t of trace) audit("agent", "tool:" + t.tool, `${id} -> ${JSON.stringify(t.output)}`);
  if (c.escalated) audit("agent", "escalation_recommended", `${id}: ${c.escalation_reason} (human review required)`);
  return c;
}
export function seed() {
  db.complaints.clear(); db.audit.length = 0; db.tokens.clear(); db.seq = 1000; db.feedback.length = 0;
  create("u2", "Broken light in Block C corridor, not working for three days.");
  create("u1", "Washroom in Block B has not been cleaned for days.");
}

const canSee = (u, c) => u.id === c.user_id || u.role === "admin" || (u.role === "handler" && !c.sensitive && c.department === u.department);
function view(c, u) {
  const { user_id, trace, ...d } = c;
  d.reporter = c.anonymous || c.sensitive ? (u.id === user_id ? "You (hidden from handlers)" : "Anonymous/Confidential") : u.role === "student" ? "You" : BY_ID[user_id].name;
  if (u.role !== "student") d.trace = trace;
  return d;
}
function checkEvidence(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list) || list.length > 2) throw fail(400, "You can attach up to 2 photos.");
  return list.map((d) => {
    const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(d));
    if (!m || m[2].length > 550_000) throw fail(400, "That photo couldn't be used. Please retake it, or choose a JPG or PNG under about 400 KB.");
    const b = Buffer.from(m[2], "base64");
    const ok = b.length >= 50 && ((b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || (b[0] === 0x89 && b.subarray(1, 4).toString() === "PNG"));
    if (!ok) throw fail(400, "We couldn't read that photo. Please retake it or choose another image.");
    return d;
  });
}
const needUser = (ctx) => { if (!ctx.u) throw fail(401, "Please log in."); return ctx.u; };
const needStaff = (ctx) => { const u = needUser(ctx); if (u.role === "student") throw fail(403, "Access denied."); return u; };
const needAdmin = (ctx) => { const u = needStaff(ctx); if (u.role !== "admin") throw fail(403, "Only authorised administrators may do this."); return u; };
const getC = (id) => db.complaints.get(id) || (() => { throw fail(404, "Complaint not found. Please check your reference number."); })();

const routes = [
  ["POST", "/api/auth/login", (ctx) => {
    const email = String(ctx.body.email || "").trim().toLowerCase(), f = fails.get(email);
    if (f && f.n >= 5 && Date.now() < f.until) throw fail(429, "Too many attempts. Please try again in a few minutes.");
    const u = USERS[email];
    if (!u || !verify(String(ctx.body.password || ""), u.pw)) {
      fails.set(email, { n: (f?.n || 0) + 1, until: Date.now() + 10 * 60_000 });
      throw fail(401, "Incorrect email or password.");
    }
    fails.delete(email);
    const token = randomUUID(); db.tokens.set(token, u); return { token, user: pub(u) };
  }],
  ["POST", "/api/auth/signup", (ctx) => {
    const b = ctx.body, name = agent.sanitize(b.name), email = String(b.email || "").trim().toLowerCase();
    if (name.length < 2 || name.length > 60) throw fail(400, "Please enter your name (2-60 characters).");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, "Please enter a valid email address.");
    if (ALLOWED_DOMAIN && !email.endsWith("@" + ALLOWED_DOMAIN)) throw fail(400, `Please use your @${ALLOWED_DOMAIN} college email.`);
    if (String(b.password || "").length < 8) throw fail(400, "Password must be at least 8 characters.");
    if (USERS[email]) throw fail(409, "An account with this email already exists. Please sign in.");
    const photo = typeof b.photo === "string" && b.photo.startsWith("data:image/") && b.photo.length <= 150_000 ? b.photo : null;
    const u = { id: "u" + randomUUID().slice(0, 8), name, email, role: "student", department: agent.sanitize(b.department).slice(0, 60) || "General", photo, pw: hash(b.password) };
    USERS[email] = u; BY_ID[u.id] = u; audit(u.id, "account_created", email);
    const token = randomUUID(); db.tokens.set(token, u); ctx.status = 201; return { token, user: pub(u) };
  }],
  ["GET", "/api/meta", () => ({ sectors: agent.SECTORS, llm_mode: llm.available() ? "gemini-stub" : "demo" })],
  ["POST", "/api/complaints/formalize", async (ctx) => {
    needUser(ctx);
    const text = agent.sanitize(ctx.body.text);
    if (!text) throw fail(400, "Please describe your problem before submitting.");
    if (text.length > MAX_LEN) throw fail(413, "Complaint is too long. Please shorten it.");
    const chk = agent.checkText(text);
    if (!chk.valid) return { valid: false, clarification_required: true, reason: chk.reason, message: chk.message };
    const sector = ctx.body.sector || null;
    let d, mode = "demo";
    try { if (llm.available()) { d = await llm.formalize(text, sector); mode = "llm"; } else d = agent.ruleBasedFormalize(text); }
    catch { d = agent.ruleBasedFormalize(text); mode = "demo-fallback"; }
    const { state } = agent.run(text, sector, d.location, [...db.complaints.values()].filter((c) => !c.closed));
    return { ...d, valid: true, original_text: text, mode, sector: state.sector, department: state.department, priority: state.priority, sensitive: state.sensitive,
      possible_duplicates: state.duplicates, missing_fields: d.location ? [] : ["location"], clarification_required: text.length < 15, support_info: state.support_info, verified: false };
  }],
  ["POST", "/api/complaints", (ctx) => {
    const u = needUser(ctx), b = ctx.body;
    if (u.role !== "student") throw fail(403, "Only students can submit complaints.");
    const title = agent.sanitize(b.title), desc = agent.sanitize(b.description);
    if (!desc) throw fail(400, "Complaint description cannot be empty.");
    if (desc.length > MAX_LEN) throw fail(413, "Complaint is too long. Please shorten it.");
    const chk = agent.checkText(desc);
    if (!chk.valid) throw fail(400, chk.message);
    const evidence = checkEvidence(b.evidence);
    if (title.length < 10 || title.length > 150) throw fail(400, "Title must be 10-150 characters.");
    if (b.sector && !agent.SECTORS.includes(b.sector)) throw fail(400, "Unknown sector.");
    ctx.status = 201;
    return view(create(u.id, desc, b.sector, b.location, Boolean(b.anonymous), b.join_existing, title, evidence), u);
  }],
  ["GET", "/api/complaints", (ctx) => {
    const u = needUser(ctx);
    return [...db.complaints.values()].filter((c) => c.user_id === u.id).reverse().map((c) => view(c, u));
  }],
  ["GET", "/api/complaints/:id", (ctx) => {
    const u = needUser(ctx), c = getC(ctx.params.id);
    if (!canSee(u, c)) throw fail(403, "You are not authorised to view this complaint.");
    return view(c, u);
  }],
  ["GET", "/api/admin/complaints", (ctx) => {
    const u = needStaff(ctx), rank = { Critical: 0, High: 1, Medium: 2 };
    return [...db.complaints.values()].filter((c) => canSee(u, c)).sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3)).map((c) => view(c, u));
  }],
  ["PATCH", "/api/admin/complaints/:id/status", (ctx) => {
    const u = needStaff(ctx), c = db.complaints.get(ctx.params.id);
    if (!c || !canSee(u, c)) throw fail(404, "Complaint not found.");
    const to = ctx.body.status;
    if (![...Object.keys(FLOW), ...Object.values(FLOW).flat()].includes(to)) throw fail(400, "Invalid complaint status.");
    if (!(FLOW[c.status] || []).includes(to)) throw fail(400, `Invalid transition ${c.status} -> ${to}.`);
    c.status = to; c.timeline.push({ ts: agent.now(), status: to, remark: agent.sanitize(ctx.body.remark) });
    audit(u.id, "status_changed", `${c.id} -> ${to}`);
    return view(c, u);
  }],
  ["GET", "/api/admin/analytics", (ctx) => {
    const u = needStaff(ctx), cs = [...db.complaints.values()].filter((c) => canSee(u, c));
    const by = (k) => cs.reduce((m, c) => ((m[c[k]] = (m[c[k]] || 0) + 1), m), {});
    return { total: cs.length, unresolved: cs.filter((c) => c.status !== "Resolved").length, critical: cs.filter((c) => c.priority === "Critical").length,
      by_sector: by("sector"), by_department: by("department"),
      recurring: cs.filter((c) => c.linked_ids.length).map((c) => ({ id: c.id, title: c.title, reports: 1 + c.linked_ids.length })) };
  }],
  ["GET", "/api/public/complaints", (ctx) => {
    needUser(ctx); // public feed: no reporter, no description, sensitive reports excluded
    return [...db.complaints.values()].filter((c) => !c.sensitive).reverse().map((c) => ({ id: c.id, title: c.title, sector: c.sector, location: c.location,
      priority: c.priority, status: c.status, department: c.department, created_at: c.created_at, reports: 1 + c.linked_ids.length }));
  }],
  ["POST", "/api/feedback", (ctx) => {
    const u = needUser(ctx), rating = Number(ctx.body.rating), message = agent.sanitize(ctx.body.message);
    if (u.role !== "student") throw fail(403, "Only students can send feedback.");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw fail(400, "Please choose a star rating from 1 to 5.");
    if (message.length > 1000) throw fail(413, "Feedback is too long. Please shorten it.");
    db.feedback.push({ id: "FB-" + (db.feedback.length + 1), rating, message, ts: agent.now() });
    audit(u.id, "feedback_submitted", `rating ${rating}`); ctx.status = 201; return { ok: true };
  }],
  ["GET", "/api/admin/feedback", (ctx) => { needAdmin(ctx); return [...db.feedback].reverse(); }],
  ["POST", "/api/chat", async (ctx) => {
    const u = needUser(ctx);
    if (u.role !== "student") throw fail(403, "The support chat is available to students only.");
    const raw = Array.isArray(ctx.body.messages) ? ctx.body.messages.slice(-20) : [];
    const messages = raw.filter((m) => m && (m.role === "user" || m.role === "assistant")).map((m) => ({ role: m.role, content: agent.sanitize(m.content).slice(0, 1000) }));
    if (!messages.some((m) => m.role === "user" && m.content)) throw fail(400, "Please type a message.");
    let reply;
    try { if (llm.available()) reply = await llm.chat(messages); } catch { reply = undefined; }
    return { reply: reply || supportReply(messages) }; // chat text is never stored or logged
  }],
  ["GET", "/api/admin/audit", (ctx) => { needAdmin(ctx); return [...db.audit].reverse(); }],
  ["GET", "/api/admin/complaints/:id/reporter", (ctx) => {
    const u = needAdmin(ctx), c = getC(ctx.params.id);
    audit(u.id, "reporter_identity_accessed", c.id);
    const r = BY_ID[c.user_id]; return { name: r.name, department: r.department };
  }],
];

function match(method, path) {
  for (const [m, pattern, fn] of routes) {
    if (m !== method) continue;
    const names = [], re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, n) => (names.push(n), "([^/]+)")) + "$");
    const r = re.exec(path);
    if (r) return { fn, params: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(r[i + 1])])) };
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": process.env.FRONTEND_ORIGIN || "http://localhost:5173",
        "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS" });
      res.end(JSON.stringify(data));
    };
    if (req.method === "OPTIONS") return send(204, {});
    try {
      let raw = "";
      for await (const chunk of req) { raw += chunk; if (raw.length > 1_600_000) throw fail(413, "Request too large."); }
      let body = {};
      if (raw) { try { body = JSON.parse(raw); } catch { throw fail(400, "Invalid JSON."); } }
      const hit = match(req.method, new URL(req.url, "http://x").pathname);
      if (!hit) throw fail(404, "Not found.");
      const u = db.tokens.get((req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim());
      const ctx = { u, body, params: hit.params, status: 200 };
      const out = await hit.fn(ctx);
      send(ctx.status, out);
    } catch (e) {
      if (!e.status) console.error(e);
      send(e.status || 500, { detail: e.status ? e.message : "Unexpected server error." });
    }
  });
}

seed();
if (process.argv[1]?.endsWith("index.js")) {
  const port = Number(process.env.PORT) || 8000;
  createServer().listen(port, () => console.log(`Sahayika server running on http://localhost:${port}`));
}
