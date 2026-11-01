// Bounded agent: fixed plan over an allowlist of deterministic tools (max 6 steps).
export const MAX_STEPS = 6;
export const SECTORS = ["Cleanliness & Hygiene", "Infrastructure & Maintenance", "Campus Safety", "Hostel Facilities",
  "Mess & Food Services", "Academic & Administrative", "Sports Facilities", "Mental Health & Welfare", "Other"];
const DEPT = { "Cleanliness & Hygiene": "Housekeeping", "Infrastructure & Maintenance": "Maintenance Team", "Campus Safety": "Security Office",
  "Hostel Facilities": "Hostel Warden Office", "Mess & Food Services": "Mess Committee", "Academic & Administrative": "Academic Office",
  "Sports Facilities": "Sports Department", "Mental Health & Welfare": "Student Welfare Cell", Other: "General Administration (manual review)" };
const KW = {
  "Campus Safety": ["wiring", "exposed", "electrical", "unsafe", "theft", "stolen", "cctv", "fire", "gate", "stray", "spark"],
  "Cleanliness & Hygiene": ["clean", "dirty", "garbage", "washroom", "toilet", "smell", "dustbin", "hygiene", "waste"],
  "Infrastructure & Maintenance": ["light", "projector", "fan", "broken", "door", "road", "lift", "roof", "leak", "wifi", "bench", "window"],
  "Hostel Facilities": ["hostel", "warden", "laundry", "geyser"],
  "Mess & Food Services": ["mess", "food", "canteen", "meal", "dinner", "lunch", "breakfast"],
  "Academic & Administrative": ["exam", "timetable", "faculty", "marks", "fee", "certificate", "attendance", "syllabus"],
  "Sports Facilities": ["ground", "gym", "court", "sports", "stadium", "equipment"],
  "Mental Health & Welfare": ["stress", "anxiety", "depress", "counsel", "lonely", "bully", "bullied", "harass", "ragging", "discriminat"],
};
const CRITICAL = ["fire", "harass", "violence", "assault", "exposed", "threat", "ragging", "suicid", "self-harm", "electrical hazard"];
const HIGH = ["leak", "electrical", "short circuit", "no water", "lock", "stuck"];
const SENSITIVE = ["harass", "bully", "bullied", "discriminat", "ragging", "depress", "suicid", "self-harm", "anxiety", "assault"];
const STOP = new Set("the a an in on at of is are was not has have for to and near no been it this that with from".split(" "));
const SUPPORT = ["Campus emergency (fictional): 100-000", "Student Welfare Cell (fictional): welfare@campus.example",
  "If you are in immediate danger, contact local emergency services."];

export const now = () => new Date().toISOString().slice(0, 19) + "Z";
export const sanitize = (s) => String(s ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").trim();
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (w, t) => new RegExp("\\b" + esc(w)).test(t);
const tokens = (s) => new Set((s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => !STOP.has(w)));
export function extractLocation(text) {
  const m = text.match(/\b(hostel\s+(?:block\s+)?[A-Z0-9]\b|block\s+[A-Z0-9]\b|library|mess|canteen|gym|sports complex|parking(?: area)?|room\s+\d+)/i);
  return m ? m[1].replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}
export function ruleBasedFormalize(text) {
  text = sanitize(text);
  const first = text.split(/[.!?\n]/)[0].trim();
  let title = (first.slice(0, 140) || text.slice(0, 140)).replace(/[,;:]+$/, "");
  if (title.length < 10) title += " - reported issue";
  return { title: title[0].toUpperCase() + title.slice(1), description: text, location: extractLocation(text), summary: "Student reports: " + first.slice(0, 200) };
}

const tools = {
  classify(s) {
    const t = s.text.toLowerCase();
    const sc = Object.entries(KW).map(([k, v]) => [k, v.filter((w) => has(w, t)).length]).sort((a, b) => b[1] - a[1])[0];
    const location = s.location || extractLocation(s.text);
    return sc[1] === 0 ? { suggested_sector: "Other", confidence: "low", location } : { suggested_sector: sc[0], confidence: sc[1] >= 2 ? "high" : "medium", location };
  },
  assess_urgency(s) {
    const t = s.text.toLowerCase();
    let hit = CRITICAL.filter((w) => has(w, t));
    if (hit.length) return { priority: "Critical", reason: "keywords: " + hit.join(", ") };
    hit = HIGH.filter((w) => has(w, t));
    return hit.length ? { priority: "High", reason: "keywords: " + hit.join(", ") } : { priority: "Medium", reason: "no urgent keywords" };
  },
  check_sensitivity(s) {
    const t = s.text.toLowerCase();
    const sensitive = SENSITIVE.some((w) => has(w, t));
    return { sensitive, support_info: sensitive || s.priority === "Critical" ? SUPPORT : [] };
  },
  find_duplicates(s) {
    const sector = s.sector || s.suggested_sector, tk = tokens(s.text), loc = (s.location || "").toLowerCase();
    const found = [];
    for (const c of s.existing) {
      if (c.sector !== sector || c.sensitive) continue;
      const o = tokens(c.text), inter = [...tk].filter((w) => o.has(w)).length;
      const sim = inter / Math.max(1, new Set([...tk, ...o]).size);
      const sameLoc = loc && loc === (c.location || "").toLowerCase();
      if (sim >= (sameLoc ? 0.3 : 0.6)) found.push({ id: c.id, similarity: Math.round(sim * 100) / 100 });
    }
    return { duplicates: found.sort((a, b) => b.similarity - a.similarity).slice(0, 3) };
  },
  route_department(s) {
    const sector = s.sector || s.suggested_sector;
    return { sector, department: DEPT[sector], needs_manual_review: sector === "Other" || s.confidence === "low" };
  },
  decide_escalation(s) {
    const group = 1 + s.duplicates.length, crit = s.priority === "Critical";
    return { escalate: crit || group >= 3, escalation_reason: crit ? "critical priority" : group >= 3 ? "recurring issue (3+ reports)" : "", requires_human_review: true };
  },
};
const PLAN = ["classify", "assess_urgency", "check_sensitivity", "find_duplicates", "route_department", "decide_escalation"];

export function run(text, sector, location, existing) {
  const state = { text: sanitize(text), sector: sector || null, location: location || null, existing };
  const trace = [];
  PLAN.forEach((name, i) => {
    if (i + 1 > MAX_STEPS || !Object.hasOwn(tools, name)) return;
    const output = tools[name](state);
    Object.assign(state, output);
    trace.push({ step: i + 1, tool: name, output, ts: now() });
  });
  delete state.existing; delete state.text;
  return { state, trace };
}

// ---- input validity check: is this a genuine campus problem or rubbish? (deterministic, polite messages) ----
const GENERAL = new Set("problem issue broken damaged damage not no without unsafe delay delayed late dirty missing noisy slow bad poor need needs fix repair complaint complain leaking leak stuck blocked overcrowded shortage unavailable closed rude unfair unhygienic smell stinks insufficient lacking disturbance".split(" "));
const ABUSE = ["stupid", "idiot", "useless", "crap", "sucks", "bastard", "shut up", "fuck", "shit", "asshole", "bitch"];
const JUNK = /^(test|testing|hello|hi|hey|hii+|ok|okay|lol|asdf\w*|qwerty\w*|abc\w*|xyz|aaa+)\b/i;
export function checkText(text) {
  const t = sanitize(text).toLowerCase(), words = t.match(/[a-z]+/g) || [];
  const bad = (reason, message) => ({ valid: false, reason, message });
  if (words.length < 3) return bad("too_short", "Thanks for reaching out! We need a little more detail to pass this to the right team. Could you tell us what happened, where it is, and since when?");
  const wordlike = (w) => /[aeiouy]/.test(w) && w.length <= 18 && !/(.)\1{3,}/.test(w) && !/[^aeiouy]{6,}/.test(w);
  if (words.filter(wordlike).length / words.length < 0.6)
    return bad("unreadable", "Thank you for writing in. We had trouble reading that message. Could you re-type it in a few clear sentences, describing the problem and where it is?");
  const signal = Object.values(KW).flat().some((k) => has(k, t)) || SENSITIVE.some((k) => has(k, t)) || words.some((w) => GENERAL.has(w));
  if (!signal) {
    if (ABUSE.some((a) => has(a, t))) return bad("frustrated", "It sounds like you're really frustrated, and we want to help. Could you describe, calmly and in a few words, what went wrong, where, and when? That lets us send it to the right person.");
    if (JUNK.test(t)) return bad("not_a_problem", "Hi! This space is for reporting campus issues. When you're ready, tell us what's wrong, where it is, and how long it has been going on, and we'll take it from there.");
    return bad("unclear", "Thanks for the message. We couldn't tell which campus issue you'd like to report. Could you describe the problem, where it is, and how it affects you?");
  }
  return { valid: true };
}
