import axios from "axios";

const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const INTENT_SYSTEM_PROMPT = `You are ApexTunnel Bot's intent engine. Read user messages and decide what function to call.

Available functions:
- "resend_otp" - User wants OTP resent (keywords: resend, re-send, didn't get, haven't received, again)
- "change_email" - User wants to use different email (keywords: wrong email, invalid, change, different, new email, mistake)
- "verify_otp" - User is providing OTP code (keywords: numbers, 6 digits, codes)
- "register_email" - User providing email for registration (keywords: @, register, signup)
- "get_account_info" - User wants account details (keywords: account, info, status, email)
- "get_tunnels" - User wants tunnels list (keywords: tunnel, running, active)
- "get_domains" - User wants domains list (keywords: domain, registered)
- "none" - No function needed, just respond

Rules:
- If user says "wrong email", "change email", "invalid email" → change_email
- If user says "resend otp" → resend_otp
- If user sends 6 digits → verify_otp with the code
- If user sends email → register_email
- If unsure → none

Respond ONLY with JSON:
{
  "function": "function_name",
  "params": { "otp": "123456", "email": "user@example.com" },
  "confidence": 0.95,
  "reason": "why"
}`;

export interface IntentResult {
  function: string;
  params: Record<string, any>;
  confidence: number;
  reason: string;
}

export async function interpretIntent(
  userMessage: string
): Promise<IntentResult> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return {
      function: "none",
      params: {},
      confidence: 0,
      reason: "AI disabled",
    };
  }

  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: INTENT_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: `User message: "${userMessage}"`,
          },
        ],
        max_tokens: 100,
        temperature: 0.1,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      }
    );

    const responseText = response.data.choices?.[0]?.message?.content?.trim();

    if (!responseText) {
      return {
        function: "none",
        params: {},
        confidence: 0,
        reason: "Parse failed",
      };
    }

    try {
      const intent = JSON.parse(responseText) as IntentResult;
      console.log(`[Intent] ${intent.function}: ${intent.reason}`);
      return intent;
    } catch {
      return {
        function: "none",
        params: {},
        confidence: 0,
        reason: "JSON parse error",
      };
    }
  } catch (error) {
    return {
      function: "none",
      params: {},
      confidence: 0,
      reason: "Engine error",
    };
  }
}
