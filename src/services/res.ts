import axios from "axios";
import { getUserInfo } from "./api";

const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const RESPONSE_SYSTEM_PROMPT = `You are ApexTunnel Bot. Generate friendly, natural WhatsApp/Telegram responses.

Rules:
- Keep responses SHORT (2-3 sentences max)
- Be conversational and helpful
- Never use quotes or asterisks
- Never ask for information the user already provided
- Never make up data — only present what is given to you
- If no data is provided, give a brief helpful message`;

export async function generateActionResponse(
  action: string,
  data: Record<string, any>,
  session?: Record<string, any>
): Promise<string> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (action === "get_account_info" && session?.accessToken) {
    try {
      const result = await getUserInfo(session.accessToken);
      if (result.success && result.userInfo) {
        return formatAccountInfo(result.userInfo);
      }
      return "Sorry, I couldn't fetch your account info right now. Please try again later.";
    } catch (e) {
      return "Sorry, I couldn't fetch your account info right now. Please try again later.";
    }
  }

  if (action === "get_tunnels") {
    return formatTunnels(data);
  }

  if (action === "get_domains") {
    return formatDomains(data);
  }

  if (!GROQ_API_KEY) {
    return getDefaultResponse(action, data);
  }

  try {
    const prompt = buildPromptForAction(action, data);

    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: RESPONSE_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 150,
        temperature: 0.3,
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
    return aiResponse || getDefaultResponse(action, data);
  } catch (error) {
    return getDefaultResponse(action, data);
  }
}

export async function generateTokenResponse(
  session: Record<string, any>
): Promise<{ text: string; buttons?: Array<{ id: string; title: string }> }> {
  if (!session?.apexToken) {
    return {
      text: "No token available. Please verify your account first.",
    };
  }

  return {
    text: `🔐 Tap the button below to copy your token to clipboard. The token will not be shown in this chat.`,
    buttons: [
      {
        id: `copy_token:${session.apexToken}`,
        title: "📋 Copy Token to Clipboard",
      },
    ],
  };
}

function formatAccountInfo(userInfo: any): string {
  if (!userInfo) {
    return "I couldn't retrieve your account information.";
  }
  return `Here's your account info:
📧 Email: ${userInfo.email || "N/A"}
📅 Joined: ${userInfo.joined_at ? new Date(userInfo.joined_at).toLocaleDateString() : "N/A"}
✅ Status: ${userInfo.verified ? "Verified" : "Unverified"}`;
}

function formatTunnels(data: any): string {
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return "You don't have any active tunnels right now. You can create one from the web dashboard.";
  }
  if (Array.isArray(data)) {
    const tunnelList = data.map((t: any, i: number) => `${i + 1}. ${t.name || "Unnamed"} (${t.status || "active"})`).join("\n");
    return `You have ${data.length} active tunnel${data.length > 1 ? "s" : ""}:\n${tunnelList}`;
  }
  return `Active tunnels: ${JSON.stringify(data)}`;
}

function formatDomains(data: any): string {
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return "You don't have any registered domains yet. You can register one from the web dashboard.";
  }
  if (Array.isArray(data)) {
    const domainList = data.map((d: any, i: number) => `${i + 1}. ${d.name || "Unnamed"}`).join("\n");
    return `You have ${data.length} registered domain${data.length > 1 ? "s" : ""}:\n${domainList}`;
  }
  return `Registered domains: ${JSON.stringify(data)}`;
}

function buildPromptForAction(action: string, data: Record<string, any>): string {
  switch (action) {
    case "help":
      return `User asked for help. Explain what ApexTunnel Bot can do:
- Check account info
- View active tunnels
- Manage domains
- Download ExposureApp

Keep it brief and friendly.`;

    case "download":
      return `User asked for ExposureApp download link. Provide: https://github.com/braverachacha/ExposureApp/releases/tag/v2.0
Add a friendly note about it.`;

    case "menu":
      return `User doesn't know what to do. Present the menu options in a friendly way:
1. Account Info
2. Active Tunnels
3. Registered Domains
4. Help

Ask what they'd like to do.`;

    case "unclear":
      return `User said something I didn't understand. Respond helpfully and suggest they can:
- Type a number (1-4) for quick options
- Say "help" for assistance
- Or rephrase their request`;

    default:
      return `User action: "${action}". Data: ${JSON.stringify(data)}. Respond briefly and helpfully.`;
  }
}

function getDefaultResponse(action: string, data: Record<string, any>): string {
  switch (action) {
    case "account_info":
      return `Email: ${data.email || "N/A"}\nJoined: ${data.joined || "N/A"}\nStatus: ${data.status || "Active"}\nVerified: ${data.verified ? "Yes" : "No"}`;

    case "tunnels":
      return `You have ${data.count || 0} active tunnels.`;

    case "domains":
      return `You have ${data.count || 0} registered domains.`;

    case "help":
      return "I can help you check your account, view tunnels, manage domains, or download ExposureApp. What would you like to do?";

    case "download":
      return "ExposureApp v2.0: https://github.com/braverachacha/ExposureApp/releases/tag/v2.0";

    case "menu":
      return "What would you like to do?\n1. Account Info\n2. Active Tunnels\n3. Registered Domains\n4. Help";

    case "unclear":
      return "I'm not sure what you mean. Try:\n• '1' for Account Info\n• '2' for Tunnels\n• '3' for Domains\n• '4' for Help";

    default:
      return "What would you like to do? Check your account, view tunnels, manage domains, or ask for help.";
  }
}
