export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { registerWebhook } = await import("@/lib/telegram");
  void registerWebhook();
  const { resumePending } = await import("@/lib/amocrm");
  void resumePending();
}
