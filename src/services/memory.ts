import { getRedis } from "./session";

export interface ConversationMessage {
  role: "user" | "bot";
  content: string;
  timestamp: string;
}

/**
 * Store entire conversation history in Redis
 */
export async function storeMessage(
  phoneNumber: string,
  role: "user" | "bot",
  content: string
): Promise<void> {
  const redis = getRedis();
  const key = `conversation:${phoneNumber}`;

  const message: ConversationMessage = {
    role,
    content,
    timestamp: new Date().toISOString(),
  };

  // Push message to conversation list
  await redis.lPush(key, JSON.stringify(message));

  // Keep last 50 messages, set 24h expiry
  await redis.lTrim(key, 0, 49);
  await redis.expire(key, 86400);
}

/**
 * Get full conversation history
 */
export async function getConversationHistory(
  phoneNumber: string
): Promise<ConversationMessage[]> {
  const redis = getRedis();
  const key = `conversation:${phoneNumber}`;

  const messages = await redis.lRange(key, 0, -1);
  return messages
    .map((msg) => {
      try {
        return JSON.parse(msg) as ConversationMessage;
      } catch {
        return null;
      }
    })
    .filter((msg): msg is ConversationMessage => msg !== null)
    .reverse(); // Reverse to get chronological order
}

/**
 * Format conversation for AI context
 */
export function formatConversationForAI(
  messages: ConversationMessage[]
): string {
  return messages
    .map((msg) => `${msg.role === "user" ? "User" : "Bot"}: ${msg.content}`)
    .join("\n");
}
