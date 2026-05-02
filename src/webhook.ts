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
    console.log("Webhook payload:", JSON.stringify(data, null, 2));

    const message: IncomingMessage | null = parseIncomingMessage(data);

    if (!message) {
      console.log("No valid message found in webhook payload");
      return;
    }

    console.log(`📨 From ${message.from}: ${message.body}`);

    const response: MessageResponse = await routeMessage(message);
    await sendWhatsAppMessage(message.from, response);
  } catch (error) {
    console.error("Webhook error:", error);
  }
}

function parseIncomingMessage(data: any): IncomingMessage | null {
  try {
    // Try Twilio format first (most likely)
    if (data.Body && data.From) {
      return {
        from: data.From.replace("whatsapp:", ""),
        body: data.Body,
        messageId: data.MessageSid || "",
        timestamp: new Date().toISOString(),
      };
    }

    // Try Meta Webhook format
    const message = data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (message) {
      return {
        from: message.from,
        body: message.text?.body || "",
        messageId: message.id,
        timestamp: message.timestamp,
      };
    }

    return null;
  } catch (error) {
    console.error("Failed to parse message:", error);
    return null;
  }
}
