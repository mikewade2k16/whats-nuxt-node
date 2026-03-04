import cors from "@fastify/cors";
import Fastify from "fastify";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";
import { env } from "./config.js";
import { closeSubscriber, subscribeEvents } from "./event-bus.js";
import { resolveRequestCorrelationId } from "./lib/correlation.js";
import authPlugin, { type JwtUser } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { contactsRoutes } from "./routes/contacts.js";
import { conversationRoutes } from "./routes/conversations.js";
import { healthRoutes } from "./routes/health.js";
import { stickerRoutes } from "./routes/stickers.js";
import { tenantRoutes } from "./routes/tenant.js";
import { userRoutes } from "./routes/users.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { createRedisConnection, redisPublisher } from "./redis.js";

function parseCorsOrigin(input: string) {
  if (input === "*") {
    return true;
  }
  return input.split(",").map((entry) => entry.trim());
}

async function start() {
  const app = Fastify({
    logger: true,
    bodyLimit: env.API_BODY_LIMIT_MB * 1024 * 1024
  });

  app.addHook("onRequest", async (request, reply) => {
    const headerCorrelationId = request.headers["x-correlation-id"];
    request.correlationId = resolveRequestCorrelationId(headerCorrelationId, request.id);
    reply.header("x-correlation-id", request.correlationId);
  });

  await app.register(cors, {
    origin: parseCorsOrigin(env.CORS_ORIGIN),
    credentials: true
  });

  await app.register(authPlugin);
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(tenantRoutes);
  await app.register(userRoutes);
  await app.register(stickerRoutes);
  await app.register(contactsRoutes);
  await app.register(conversationRoutes);
  await app.register(webhookRoutes);

  const io = new Server(app.server, {
    cors: {
      origin: parseCorsOrigin(env.CORS_ORIGIN),
      credentials: true
    }
  });

  const adapterPub = createRedisConnection();
  const adapterSub = createRedisConnection();
  io.adapter(createAdapter(adapterPub, adapterSub));

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        return next(new Error("Unauthorized"));
      }
      const user = app.jwt.verify<JwtUser>(token);
      socket.data.user = user;
      return next();
    } catch (_error) {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as JwtUser | undefined;
    if (!user) {
      socket.disconnect();
      return;
    }

    socket.join(`tenant:${user.tenantId}`);
  });

  const subscriber = await subscribeEvents((event) => {
    io.to(`tenant:${event.tenantId}`).emit(event.type, event.payload);
  });

  const shutdown = async () => {
    app.log.info("Encerrando servicos...");
    await closeSubscriber(subscriber);
    await adapterPub.quit();
    await adapterSub.quit();
    await redisPublisher.quit();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({
    host: "0.0.0.0",
    port: env.PORT
  });

  app.log.info(`API online na porta ${env.PORT}`);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
