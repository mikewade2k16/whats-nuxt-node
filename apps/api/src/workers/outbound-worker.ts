import axios from "axios";
import { MessageStatus } from "@prisma/client";
import { Worker } from "bullmq";
import { env } from "../config.js";
import { prisma } from "../db.js";
import { publishEvent } from "../event-bus.js";
import { outboundQueueName } from "../queue.js";
import { redisOptions, redisPublisher } from "../redis.js";

function buildEvolutionUrl(instance: string) {
  const base = env.EVOLUTION_BASE_URL?.replace(/\/$/, "");
  if (!base) {
    return null;
  }

  const path = env.EVOLUTION_SEND_PATH.replace(":instance", instance).replace(/^\/+/, "");
  return `${base}/${path}`;
}

function normalizeRecipient(externalId: string) {
  const phone = externalId.split("@")[0].replace(/\D/g, "");
  return phone.length > 0 ? phone : externalId;
}

async function setStatus(messageId: string, tenantId: string, status: MessageStatus, externalMessageId?: string) {
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: {
      status,
      externalMessageId: externalMessageId ?? null
    }
  });

  await publishEvent({
    type: "message.updated",
    tenantId,
    payload: {
      id: updated.id,
      status: updated.status,
      externalMessageId: updated.externalMessageId,
      updatedAt: updated.updatedAt
    }
  });
}

const worker = new Worker(
  outboundQueueName,
  async (job) => {
    const messageId = String(job.data.messageId ?? "");
    if (!messageId) {
      throw new Error("Job sem messageId");
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: true,
        tenant: true
      }
    });

    if (!message) {
      throw new Error(`Mensagem nao encontrada: ${messageId}`);
    }

    try {
      const instance = message.tenant.whatsappInstance ?? env.EVOLUTION_DEFAULT_INSTANCE;
      const evolutionUrl = instance ? buildEvolutionUrl(instance) : null;

      if (!evolutionUrl) {
        await setStatus(message.id, message.tenantId, MessageStatus.SENT);
        return;
      }

      const recipient = normalizeRecipient(message.conversation.externalId);
      const apiKey = message.tenant.evolutionApiKey ?? env.EVOLUTION_API_KEY;

      const response = await axios.post(
        evolutionUrl,
        {
          number: recipient,
          text: message.content
        },
        {
          headers: apiKey
            ? {
                apikey: apiKey
              }
            : undefined,
          timeout: 15_000
        }
      );

      const externalMessageId =
        (response.data?.key?.id as string | undefined) ??
        (response.data?.id as string | undefined);

      await setStatus(message.id, message.tenantId, MessageStatus.SENT, externalMessageId);
    } catch (error) {
      await setStatus(message.id, message.tenantId, MessageStatus.FAILED);
      throw error;
    }
  },
  {
    connection: redisOptions
  }
);

worker.on("completed", (job) => {
  console.log(`Job concluido: ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`Job falhou: ${job?.id}`, error);
});

const shutdown = async () => {
  console.log("Encerrando worker...");
  await worker.close();
  await redisPublisher.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
