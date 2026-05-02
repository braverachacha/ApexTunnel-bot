import axios from "axios";

const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `You are ApexTunnel Bot, a friendly WhatsApp assistant for the ApexTunnel platform.

Keep responses SHORT and professional (1-3 sentences max).
Never use quotes or asterisks.
Be conversational but direct.
Don't make up information.`;

export async function generateResponse(
  context: string
): Promise<string> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return context;
  }

  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: context,
          },
        ],
        max_tokens: 120,
        temperature: 0.6,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      }
    );

    const aiResponse = response.data.choices?.[0]?.message?.content?.trim();
    return aiResponse || context;
  } catch (error) {
    return context;
  }
}

export async function generateMenuResponse(
  baseText: string
): Promise<string> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return baseText;
  }

  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: baseText,
          },
        ],
        max_tokens: 100,
        temperature: 0.6,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      }
    );

    const aiResponse = response.data.choices?.[0]?.message?.content?.trim();
    return aiResponse || baseText;
  } catch (error) {
    return baseText;
  }
}
