import { Request, Response } from "express";
import { IncomingMessage, MessageResponse } from "./utils/types";
import { routeMessage } from "./router";
import { sendWhatsAppMessage } from "./services/whatsapp";

export async function handleWebhook(
  req: Request,
  res: Response
): Promise<void> {
  try {
    res.status(200).send("ok");

    const data = req.body;
    const message: IncomingMessage | null = parseIncomingMessage(data);

    if (!message) {
      return;
    }

    console.log(`[WhatsApp] ${message.from}: ${message.body.substring(0, 50)}`);

    const response: MessageResponse = await routeMessage(message);
    await sendWhatsAppMessage(message.from, response);
  } catch (error) {
    console.error("[Webhook Error]", error instanceof Error ? error.message : "Unknown error");
  }
}

function parseIncomingMessage(data: any): IncomingMessage | null {
  try {
    if (data.Body && data.From) {
      return {
        from: data.From.replace("whatsapp:", ""),
        body: data.Body,
        messageId: data.MessageSid || "",
        timestamp: new Date().toISOString(),
        platform: "whatsapp",
      };
    }

    const message = data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (message) {
      return {
        from: message.from,
        body: message.text?.body || "",
        messageId: message.id,
        timestamp: message.timestamp,
        platform: "whatsapp",
      };
    }

    return null;
  } catch {
    return null;
  }
}