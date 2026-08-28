export default async function stopEnvironment() {
  try {
    await fetch("http://127.0.0.1:3201/__e2e/shutdown", { method: "POST" });
  } catch {
    // The process may exit before the response body is observed.
  }
}
