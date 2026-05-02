import axios from "axios";
import { MessageResponse } from "../utils/types";

const MESSAGE_QUEUE: { phoneNumber: string; response: MessageResponse; timestamp: number }[] = [];
const QUEUE_INTERVAL = 1000; // 1 second between messages
let lastMessageTime = 0;

export async function sendWhatsAppMessage(
  toNumber: string,
  response: MessageResponse
): Promise<void> {
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
    throw new Error("Missing Twilio credentials");
  }

  const TWILIO_API_URL = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

  try {
    const cleanNumber = toNumber.replace("whatsapp:", "");

    let messageBody = response.text;

    if (response.buttons && response.buttons.length > 0) {
      const buttonText = response.buttons
        .map((btn, idx) => `${idx + 1}. ${btn.title}`)
        .join("\n");
      messageBody = `${response.text}\n\n${buttonText}`;
    }

    // Throttle: wait if needed
    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTime;
    if (timeSinceLastMessage < QUEUE_INTERVAL) {
      await new Promise((resolve) =>
        setTimeout(resolve, QUEUE_INTERVAL - timeSinceLastMessage)
      );
    }

    const params = new URLSearchParams();
    params.append("From", `whatsapp:${TWILIO_WHATSAPP_NUMBER}`);
    params.append("To", `whatsapp:${cleanNumber}`);
    params.append("Body", messageBody);

    await axios.post(TWILIO_API_URL, params, {
      auth: {
        username: TWILIO_ACCOUNT_SID,
        password: TWILIO_AUTH_TOKEN,
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    lastMessageTime = Date.now();
    console.log(`[WhatsApp] Message sent to ${cleanNumber}`);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      console.warn("[WhatsApp] Rate limited. Retrying in 5 seconds...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return sendWhatsAppMessage(toNumber, response);
    }
    console.error("[WhatsApp Error]", error instanceof Error ? error.message : "Unknown");
    throw error;
  }
}
