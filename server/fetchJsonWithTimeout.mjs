export async function fetchJsonWithTimeout(fetchImpl, url, options, { timeoutMs, errorPrefix }) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${errorPrefix}:timeout`));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { ...options, signal: controller.signal });
        if (!response.ok) throw new Error(`${errorPrefix}:${response.status}`);
        return response.json();
      })(),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
