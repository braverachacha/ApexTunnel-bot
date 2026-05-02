import { Request, Response } from "express";
import { parseTelegramMessage } from "./services/telegram";
import { routeMessage } from "./router";
import { sendTelegramMessage } from "./services/telegram";
import { IncomingMessage } from "./utils/types";

export async function handleTelegramWebhook(
  req: Request,
  res: Response
): Promise<void> {
  try {
    res.status(200).send("ok");

    const data = req.body;
    const parsed = parseTelegramMessage(data);

    if (!parsed) {
      return;
    }

    const message: IncomingMessage = {
      from: parsed.chatId,
      body: parsed.messageText,
      messageId: `${parsed.userId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      platform: "telegram",
    };

    console.log(`[Telegram] ${message.from}: ${message.body}`);

    const response = await routeMessage(message);
    await sendTelegramMessage(message.from, response);
  } catch (error) {
    console.error("[Telegram Webhook Error]", error instanceof Error ? error.message : "Unknown");
  }
}