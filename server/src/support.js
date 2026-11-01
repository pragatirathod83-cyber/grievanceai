// Rule-based emotional-support replies used when no LLM is configured. Not a counsellor and not a diagnosis tool.
// Helplines verified from public sources (Tele-MANAS 14416 / 1800-89-14416; KIRAN 1800-599-0019; emergency 112). Re-check before real use.
const rx = (w) => new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const CRISIS = ["suicid", "kill myself", "end my life", "end it all", "want to die", "self-harm", "self harm", "hurt myself", "cut myself", "no reason to live", "better off dead"];
export const CRISIS_REPLY = "I'm really glad you told me, and I'm sorry you're carrying something this heavy. You deserve support from a real person right now. " +
  "Please call Tele-MANAS at 14416 (free, 24x7, India) or KIRAN at 1800-599-0019, or 112 if you are in immediate danger. " +
  "You can also go to someone near you, such as a friend, your warden or a family member, so you are not alone. Are you somewhere safe at the moment?";
const THEMES = [
  ["bullied", ["bully", "bullied", "ragging", "harass", "threat", "discriminat"], [
    "I'm sorry you're dealing with that. Nobody should have to face it, and none of it is your fault. You can report it confidentially from 'Report an issue': it is never shown to handlers with your name. Would you like to tell me more about what's been happening?",
    "That sounds really hard and frightening. You don't have to handle it alone. A trusted friend, your warden or the Student Welfare Cell can help, and you can file a confidential report here whenever you're ready. How are you feeling right now?"]],
  ["anxious", ["anxious", "anxiety", "panic", "nervous", "worried", "worry", "scared", "afraid", "exam", "stress", "pressure", "overwhelm"], [
    "That sounds like a lot of pressure, and it makes sense to feel on edge. One small thing that can help is a slow breath: in for 4 counts, out for 6, a few times. What feels like the heaviest part right now?",
    "Feeling overwhelmed is really common, especially around exams and deadlines. Breaking the day into one small next step can make it feel lighter. What is one thing you could do in the next 15 minutes?"]],
  ["sad", ["sad", "cry", "crying", "depress", "hopeless", "empty", "down", "low", "miserable", "hurt"], [
    "I'm sorry you're feeling this way. Thank you for putting it into words. Your feelings matter, and it's okay not to be okay. Do you want to tell me what's been weighing on you?",
    "That sounds painful, and I'm here with you. Sometimes talking to someone you trust, or to a counsellor, can lighten what we carry. When did you start feeling like this?"]],
  ["lonely", ["lonely", "alone", "no friends", "isolated", "homesick", "miss home", "left out"], [
    "Feeling lonely or far from home is tough, and many students feel it, even if it isn't visible. Reaching out, like you just did, is a good step. What would help you feel a bit more connected right now?",
    "I hear you. Missing home or feeling left out can be heavy. A call to someone you love, or joining one small club or activity, can help over time. Is there someone you feel comfortable with?"]],
  ["angry", ["angry", "furious", "unfair", "hate", "frustrat", "annoyed", "irritat"], [
    "It sounds like you're really frustrated, and that's understandable. Feelings like that usually point to something that matters to you. What happened that made you feel this way?",
    "That sounds infuriating. Taking a few slow breaths or a short walk can take the edge off before deciding what to do. If it's a campus issue, I can help you report it. Want to tell me more?"]],
  ["tired", ["tired", "exhausted", "sleep", "insomnia", "burnout", "burnt out", "drained"], [
    "You sound worn out. Rest matters, and you're allowed to take it. A steady sleep routine and short breaks can help. What has been taking most of your energy lately?",
    "Being exhausted for a long time is hard on everything else. Be gentle with yourself. Is something keeping you up, like worries or workload?"]],
  ["happy", ["happy", "good", "great", "better", "excited", "proud", "relieved", "thanks", "thank you"], [
    "I'm really glad to hear that. Moments like this are worth noticing. What's been going well?",
    "That's lovely to hear. Thank you for sharing it with me. I'm here anytime you want to talk."]],
];
export function supportReply(messages) {
  const user = [...messages].reverse().find((m) => m.role === "user");
  const t = (user?.content || "").toLowerCase();
  if (CRISIS.some((c) => t.includes(c))) return CRISIS_REPLY;
  const turn = messages.filter((m) => m.role === "assistant").length;
  if (/^(hi|hello|hey|hii+)\b/.test(t) && t.split(/\s+/).length < 4) return "Hi, I'm glad you stopped by. How are you feeling today?";
  let best = null, score = 0;
  for (const [name, kws, replies] of THEMES) { const s = kws.filter((k) => rx(k).test(t)).length; if (s > score) { best = replies; score = s; } }
  if (best) return best[turn % best.length];
  return ["Thank you for sharing that with me. I'm listening. Can you tell me a bit more about how it's affecting you?",
    "I'm here, and there's no rush. What has been on your mind the most lately?"][turn % 2];
}
