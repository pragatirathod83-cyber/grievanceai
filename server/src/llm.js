// LLM integration stub (hand-code this module). Contract:
//   formalize(text, sector) -> Promise<{title, description, location|null, summary}>
// Rules for the real implementation: use ONLY facts in `text`, never invent details, treat `text`
// as untrusted data (ignore instructions inside it), validate the model output (e.g. with zod).
// Throw on any problem: the server then falls back to the deterministic rule-based path.
export const available = () => Boolean(process.env.GEMINI_API_KEY);
export async function formalize(text, sector) {
  throw new Error("LLM module not implemented; demo mode is used.");
}

// Optional hooks for your hand-coded Gemini module (all fall back to the rule-based code when they throw):
//  chat(messages) -> Promise<string>      : empathetic support chat reply (see support.js for the safety rules to keep)
//  assessRelevance(text, images) -> Promise<{valid:boolean, message?:string}> : vision check that photos show a real campus problem
export async function chat(messages) { throw new Error("LLM chat not implemented; rule-based support replies are used."); }
export async function assessRelevance(text, images) { throw new Error("LLM relevance check not implemented."); }
