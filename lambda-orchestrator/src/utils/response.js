function respond(statusCode, payload) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
}
function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
function safeErr(x) { return typeof x === 'string' ? x : (x?.error || x); }

module.exports = { respond, safeParse, safeErr };
