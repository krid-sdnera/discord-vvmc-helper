export async function wait(delay: number) {
  new Promise((resolve) => setTimeout(resolve, delay));
}
