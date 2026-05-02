import axios from "axios";
import { MessageResponse } from "../utils/types";

export async function sendWhatsAppMessage(
  toNumber: string,
  response: MessageResponse
): Promise<void> {
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
    throw new Error("Missing Twilio credentials in .env");
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

    console.log(`[WhatsApp] Message sent to ${cleanNumber}`);
  } catch (error) {
    console.error("[WhatsApp Error]", error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
