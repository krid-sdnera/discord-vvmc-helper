export async function timer(fn, seconds) {
  await fn();
  setInterval(() => fn(), seconds * 1000);
}

export async function wait(delay: number) {
  new Promise((resolve) => setTimeout(resolve, delay));
}

export async function backOff(fn, level = 0) {
  await wait(100 * level);
  try {
    return await fn();
  } catch (e) {
    console.log(`backing off, level: ${level}`);
    if (level > 7) {
      throw e;
    }
    if (e.response.status === 429) {
      return await backOff(fn, level + 1);
    }
  }
}
