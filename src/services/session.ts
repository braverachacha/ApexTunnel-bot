import { createClient, RedisClientType } from "redis";

let redisClient: RedisClientType;

// Initialize Redis connection
export async function initRedis(): Promise<void> {
  redisClient = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
  });

  redisClient.on("error", (err) => console.error("Redis error:", err));
  redisClient.on("connect", () => console.log("Redis connected"));

  await redisClient.connect();
}

// Get Redis client instance
export function getRedis(): RedisClientType {
  if (!redisClient) {
    throw new Error("Redis not initialized. Call initRedis() first.");
  }
  return redisClient;
}

// Store user session (email + verification state)
export async function setUserSession(
  phoneNumber: string,
  data: Record<string, string | boolean | number>
): Promise<void> {
  const key = `whatsapp:${phoneNumber}`;
  const redis = getRedis();

  // Store as hash and set 2-hour TTL
  await redis.hSet(key, data);
  await redis.expire(key, 7200); // 2 hours = 7200 seconds
}

// Get user session
export async function getUserSession(
  phoneNumber: string
): Promise<Record<string, string> | null> {
  const key = `whatsapp:${phoneNumber}`;
  const redis = getRedis();
  return await redis.hGetAll(key);
}

// Update specific field in user session
export async function updateUserSession(
  phoneNumber: string,
  field: string,
  value: string | number | boolean
): Promise<void> {
  const key = `whatsapp:${phoneNumber}`;
  const redis = getRedis();

  await redis.hSet(key, field, String(value));
  await redis.expire(key, 7200); // Refresh TTL
}

// Delete user session
export async function deleteUserSession(phoneNumber: string): Promise<void> {
  const key = `whatsapp:${phoneNumber}`;
  const redis = getRedis();
  await redis.del(key);
}

// Check if user session exists and is valid
export async function isSessionValid(phoneNumber: string): Promise<boolean> {
  const session = await getUserSession(phoneNumber);
  return session !== null && session.verified === "true";
}
