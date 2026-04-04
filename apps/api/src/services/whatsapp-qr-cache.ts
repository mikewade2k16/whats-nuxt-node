import { createRedisConnection } from "../redis.js";

const QR_TTL_SECONDS = 120;

function qrKey(tenantId: string, instanceName: string) {
  return `wa:qrcode:${tenantId}:${instanceName}`;
}

export async function setLatestQrCode(tenantId: string, instanceName: string, qrCode: string) {
  const redis = createRedisConnection();
  try {
    await redis.setex(qrKey(tenantId, instanceName), QR_TTL_SECONDS, qrCode);
  } finally {
    await redis.quit();
  }
}

export async function getLatestQrCode(tenantId: string, instanceName: string) {
  const redis = createRedisConnection();
  try {
    return await redis.get(qrKey(tenantId, instanceName));
  } finally {
    await redis.quit();
  }
}

export async function deleteLatestQrCode(tenantId: string, instanceName: string) {
  const redis = createRedisConnection();
  try {
    await redis.del(qrKey(tenantId, instanceName));
  } finally {
    await redis.quit();
  }
}
