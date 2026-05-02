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
    
    // Add buttons as numbered list
    if (response.buttons && response.buttons.length > 0) {
      const buttonText = response.buttons
        .map((btn, idx) => `${idx + 1}. ${btn.title}`)
        .join("\n");
      messageBody = `${response.text}\n\n${buttonText}`;
    }

    console.log(`Sending WhatsApp message to whatsapp:${cleanNumber}`);
    console.log(`Message body: ${messageBody}`);

    // Use form-encoded data instead of JSON
    const params = new URLSearchParams();
    params.append("From", `whatsapp:${TWILIO_WHATSAPP_NUMBER}`);
    params.append("To", `whatsapp:${cleanNumber}`);
    params.append("Body", messageBody);

    const response_data = await axios.post(TWILIO_API_URL, params, {
      auth: {
        username: TWILIO_ACCOUNT_SID,
        password: TWILIO_AUTH_TOKEN,
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log(`✓ Message sent successfully`);
  } catch (error: any) {
    console.error("Failed to send WhatsApp message");
    console.error("Error details:", error.response?.data || error.message);
    throw error;
  }
}
