const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function retry(fn, { retries = 2, baseMs = 250, factor = 2, isRetriable = () => true } = {}) {
  let attempt = 0, lastErr;
  while (attempt <= retries) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (!isRetriable(err) || attempt === retries) break;
      const delay = Math.floor(baseMs * Math.pow(factor, attempt));
      await sleep(delay);
      attempt += 1;
    }
  }
  throw lastErr;
}

module.exports = { retry };
