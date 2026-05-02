import axios from "axios";
import { MessageResponse } from "../utils/types";

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN in .env");
  }
  return token;
}

export async function sendTelegramMessage(
  chatId: string,
  response: MessageResponse
): Promise<void> {
  try {
    const BOT_TOKEN = getBotToken();
    const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

    const payload: any = {
      chat_id: chatId,
      text: response.text,
      parse_mode: "HTML",
    };

    if (response.buttons && response.buttons.length > 0) {
      payload.reply_markup = {
        inline_keyboard: [
          response.buttons.map((btn) => ({
            text: btn.title,
            callback_data: btn.id,
          })),
        ],
      };
    }

    await axios.post(`${TELEGRAM_API}/sendMessage`, payload);

    console.log(`[Telegram] Message sent to ${chatId}`);
  } catch (error) {
    console.error("[Telegram Error]", error instanceof Error ? error.message : "Unknown");
    throw error;
  }
}

export function parseTelegramMessage(data: any): {
  chatId: string;
  userId: string;
  messageText: string;
} | null {
  try {
    if (data.message?.text) {
      return {
        chatId: String(data.message.chat.id),
        userId: String(data.message.from.id),
        messageText: data.message.text,
      };
    }

    if (data.callback_query?.data) {
      // Acknowledge the callback so Telegram removes the loading spinner
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: data.callback_query.id }),
        }).catch(() => {});
      }
      return {
        chatId: String(data.callback_query.message.chat.id),
        userId: String(data.callback_query.from.id),
        messageText: data.callback_query.data,
      };
    }

    return null;
  } catch (error) {
    return null;
  }
}