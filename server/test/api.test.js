import test, { beforeEach, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, seed } from "../src/index.js";

let srv, base;
before(async () => { srv = createServer(); await new Promise((r) => srv.listen(0, r)); base = `http://localhost:${srv.address().port}`; });
after(() => srv.close());
beforeEach(() => seed());

const call = async (method, path, token, body) => {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token && { Authorization: "Bearer " + token }) }, body: body && JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
};
const login = async (e) => (await call("POST", "/api/auth/login", null, { email: e, password: "demo1234" })).data.token;
const submit = async (t, text, extra = {}) => {
  const f = (await call("POST", "/api/complaints/formalize", t, { text })).data;
  return call("POST", "/api/complaints", t, { title: f.title, description: text, ...extra });
};

test("401 without login", async () => assert.equal((await call("GET", "/api/complaints")).status, 401));
test("student gets 403 on admin routes", async () => assert.equal((await call("GET", "/api/admin/analytics", await login("asha@campus.example"))).status, 403));
test("empty description rejected", async () => assert.equal((await call("POST", "/api/complaints/formalize", await login("asha@campus.example"), { text: "  " })).status, 400));
test("classification and priority", async () => {
  const t = await login("asha@campus.example");
  let f = (await call("POST", "/api/complaints/formalize", t, { text: "There is exposed electrical wiring near Hostel A." })).data;
  assert.equal(f.sector, "Campus Safety"); assert.equal(f.priority, "Critical");
  f = (await call("POST", "/api/complaints/formalize", t, { text: "The classroom projector is not working." })).data;
  assert.equal(f.sector, "Infrastructure & Maintenance"); assert.equal(f.priority, "Medium");
  f = (await call("POST", "/api/complaints/formalize", t, { text: "Washroom in Block B has not been cleaned for days." })).data;
  assert.equal(f.sector, "Cleanliness & Hygiene");
});
test("duplicate is linked, not deleted", async () => {
  const t = await login("asha@campus.example");
  const r = await submit(t, "Light not working in Block C corridor.");
  assert.equal(r.status, 201); assert.equal(r.data.linked_to, "CMP-1001");
  assert.equal((await call("GET", "/api/admin/complaints", await login("admin@campus.example"))).data.length, 3);
});
test("anonymous identity hidden from admin view and handler", async () => {
  const r = (await submit(await login("asha@campus.example"), "Fan broken in Room 12, not working.", { anonymous: true })).data;
  for (const who of ["admin@campus.example", "maint@campus.example"]) {
    const d = (await call("GET", `/api/complaints/${r.id}`, await login(who))).data;
    assert.ok(!JSON.stringify(d).includes("Asha")); assert.equal(d.user_id, undefined);
  }
  assert.equal((await call("GET", `/api/admin/complaints/${r.id}/reporter`, await login("maint@campus.example"))).status, 403);
});
test("sensitive complaints restricted", async () => {
  const r = (await submit(await login("asha@campus.example"), "I am being bullied and harassed by seniors.")).data;
  assert.ok(r.sensitive && r.support_info.length);
  assert.equal((await call("GET", `/api/complaints/${r.id}`, await login("maint@campus.example"))).status, 403);
  assert.equal((await call("GET", `/api/complaints/${r.id}`, await login("ravi@campus.example"))).status, 403);
});
test("status flow and audit", async () => {
  const a = await login("admin@campus.example"), p = async (s) => (await call("PATCH", "/api/admin/complaints/CMP-1001/status", a, { status: s })).status;
  assert.equal(await p("Resolved"), 400);
  assert.deepEqual([await p("Acknowledged"), await p("In Progress"), await p("Resolved")], [200, 200, 200]);
  assert.ok((await call("GET", "/api/admin/audit", a)).data.some((e) => e.action === "status_changed"));
});

test("wrong password rejected", async () => assert.equal((await call("POST", "/api/auth/login", null, { email: "asha@campus.example", password: "nope" })).status, 401));
test("signup then login; duplicate email rejected; password hidden", async () => {
  const body = { name: "Meera", email: "meera@campus.example", password: "longenough1", department: "ME" };
  const r = await call("POST", "/api/auth/signup", null, body);
  assert.equal(r.status, 201); assert.equal(r.data.user.pw, undefined); assert.equal(r.data.user.role, "student");
  assert.equal((await call("POST", "/api/auth/signup", null, body)).status, 409);
  assert.equal((await call("POST", "/api/auth/signup", null, { ...body, email: "x@campus.example", password: "short" })).status, 400);
  assert.equal((await call("POST", "/api/auth/login", null, { email: body.email, password: body.password })).status, 200);
});
test("public feed hides sensitive complaints and reporters", async () => {
  const t = await login("asha@campus.example");
  await submit(t, "I am being bullied and harassed by seniors.");
  const list = (await call("GET", "/api/public/complaints", t)).data;
  assert.equal(list.length, 2); assert.ok(!JSON.stringify(list).match(/Asha|Ravi|bullied|user_id/));
});
test("feedback validation and admin-only read", async () => {
  const t = await login("asha@campus.example");
  assert.equal((await call("POST", "/api/feedback", t, { rating: 9, message: "x" })).status, 400);
  assert.equal((await call("POST", "/api/feedback", t, { rating: 5, message: "Great" })).status, 201);
  assert.equal((await call("GET", "/api/admin/feedback", t)).status, 403);
  assert.equal((await call("GET", "/api/admin/feedback", await login("admin@campus.example"))).data.length, 1);
});

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
test("rubbish text gets a polite request for details", async () => {
  const t = await login("asha@campus.example");
  for (const text of ["asdfghjkl qwrtpsd zxcvbn", "hello", "my cat likes pizza and sleeping all day"]) {
    const r = (await call("POST", "/api/complaints/formalize", t, { text })).data;
    assert.equal(r.valid, false); assert.ok(r.message.length > 40); assert.ok(!/rubbish|spam|stupid|invalid/i.test(r.message));
  }
  assert.equal((await call("POST", "/api/complaints", t, { title: "Some title here", description: "asdfghjkl qwrtpsd zxcvbn" })).status, 400);
});
test("valid problems are accepted, with photo evidence", async () => {
  const t = await login("asha@campus.example");
  const r = await call("POST", "/api/complaints", t, { title: "Broken fan in Room 12", description: "Fan broken in Room 12, not working.", evidence: [PNG] });
  assert.equal(r.status, 201); assert.equal(r.data.evidence.length, 1);
  assert.equal((await call("POST", "/api/complaints", t, { title: "Broken fan in Room 12", description: "Fan broken in Room 12, not working.", evidence: ["data:image/png;base64,AAAA"] })).status, 400);
});
test("support chat: students only, crisis message shows helplines", async () => {
  const t = await login("asha@campus.example");
  const r = (await call("POST", "/api/chat", t, { messages: [{ role: "user", content: "I feel anxious about my exams" }] })).data;
  assert.ok(r.reply.length > 20);
  const c = (await call("POST", "/api/chat", t, { messages: [{ role: "user", content: "I want to end my life" }] })).data;
  assert.ok(c.reply.includes("14416") && c.reply.includes("112"));
  assert.equal((await call("POST", "/api/chat", await login("admin@campus.example"), { messages: [{ role: "user", content: "hi" }] })).status, 403);
});
