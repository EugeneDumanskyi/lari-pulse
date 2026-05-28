export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler/scheduler");
    const { startLiquidityRuntime } = await import("@/lib/services/liquidityRuntimeService");

    startScheduler();
    startLiquidityRuntime();
  }
}
