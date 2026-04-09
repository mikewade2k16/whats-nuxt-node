import { env } from "../config.js";
import { prisma } from "../db.js";
import { runRetentionSweep } from "../services/retention-service.js";

const MINUTE_IN_MS = 60 * 1000;
const intervalMs = env.RETENTION_SWEEP_INTERVAL_MINUTES * MINUTE_IN_MS;

let running = false;
let timer: NodeJS.Timeout | null = null;

async function executeSweep(trigger: "startup" | "interval") {
  if (running) {
    console.info(`[retention] sweep skipped (already running) trigger=${trigger}`);
    return;
  }

  running = true;
  try {
    const result = await runRetentionSweep(new Date());
    console.info("[retention] sweep finished", {
      trigger,
      tenantsScanned: result.tenantsScanned,
      deletedMessages: result.deletedMessages,
      deletedConversations: result.deletedConversations,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt
    });
  } catch (error) {
    console.error("[retention] sweep failed", {
      trigger,
      error
    });
  } finally {
    running = false;
  }
}

function startScheduler() {
  if (timer) {
    clearInterval(timer);
  }

  timer = setInterval(() => {
    void executeSweep("interval");
  }, intervalMs);

  console.info("[retention] scheduler started", {
    intervalMinutes: env.RETENTION_SWEEP_INTERVAL_MINUTES
  });
}

async function shutdown() {
  console.info("[retention] shutting down");
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  await prisma.$disconnect();
  process.exit(0);
}

async function start() {
  console.info("[retention] worker online", {
    onBoot: env.RETENTION_SWEEP_ON_BOOT,
    intervalMinutes: env.RETENTION_SWEEP_INTERVAL_MINUTES
  });

  if (env.RETENTION_SWEEP_ON_BOOT) {
    await executeSweep("startup");
  }

  startScheduler();
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

void start();
