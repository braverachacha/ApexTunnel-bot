import { getConversationHistory, formatConversationForAI } from "./memory";
import axios from "axios";

const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const DECISION_SYSTEM_PROMPT = `You are ApexTunnel Bot's decision engine. Analyze what the user is asking for and decide the action.

Available actions:
- "account_info" - User wants to see account details (keywords: account, info, profile, status, email, joined, "1")
- "tunnels" - User wants to see active tunnels (keywords: tunnel, active, running, status, "2")
- "domains" - User wants to see domains (keywords: domain, registered, "3")
- "help" - User wants help/menu (keywords: help, menu, what can you do, options, "4")
- "download" - User wants ExposureApp download (keywords: download, exposureapp, link, install, binary)
- "menu" - User doesn't know what to do, show menu
- "unclear" - You genuinely don't understand

Rules:
- Be lenient with keywords - "1" clearly means account_info
- "help" or "?" or "menu" = help action
- If user says anything about tunnels = tunnels action
- Short answers like "1", "2", "3", "4" map directly to those options

Respond ONLY with JSON:
{
  "action": "action_name",
  "confidence": 0.95,
  "reason": "why you think this"
}`;

export interface DecisionResult {
  action: string;
  confidence: number;
  reason: string;
}

export async function makeDecision(
  userMessage: string
): Promise<DecisionResult> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return {
      action: "menu",
      confidence: 0.5,
      reason: "AI disabled",
    };
  }

  try {
    const prompt = `User message: "${userMessage}"

What action should be taken?`;

    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: DECISION_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 100,
        temperature: 0.2,
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
        action: "menu",
        confidence: 0.3,
        reason: "Parse failed",
      };
    }

    try {
      const decision = JSON.parse(responseText) as DecisionResult;
      console.log(`[Decision] ${decision.action} (${(decision.confidence * 100).toFixed(0)}%): ${decision.reason}`);
      return decision;
    } catch (e) {
      console.error("[Decision Parse Error]", responseText);
      return {
        action: "menu",
        confidence: 0.3,
        reason: "JSON parse error",
      };
    }
  } catch (error) {
    console.error("[Decision Error]", error instanceof Error ? error.message : "Unknown");
    return {
      action: "menu",
      confidence: 0.2,
      reason: "API error",
    };
  }
}
