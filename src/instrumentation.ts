export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { registerWebhook } = await import("@/lib/telegram");
  void registerWebhook();
  // дослать в amoCRM заявки, не доставленные из-за временных ошибок (src/lib/leadCrm.ts)
  const { startAmoSweeper } = await import("@/lib/leadCrm");
  startAmoSweeper();
}
