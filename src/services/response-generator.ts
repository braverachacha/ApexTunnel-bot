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

const tokenStore = new Map<string, string>();

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

  if (action === "get_tunnels") return formatTunnels(data);
  if (action === "get_domains") return formatDomains(data);

  if (!GROQ_API_KEY) return getDefaultResponse(action, data);

  try {
    const prompt = buildPromptForAction(action, data);
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: RESPONSE_SYSTEM_PROMPT },
          { role: "user", content: prompt },
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
    return { text: "No token available. Please verify your account first." };
  }

  const tokenId = Math.random().toString(36).substring(2, 10);
  tokenStore.set(tokenId, session.apexToken);
  setTimeout(() => tokenStore.delete(tokenId), 5 * 60 * 1000);

  return {
    text: `🔐 Tap the button below to copy your token to clipboard. The token will not be shown in this chat.`,
    buttons: [{ id: `copy_token:${tokenId}`, title: "📋 Copy Token to Clipboard" }],
  };
}

export function getTokenById(tokenId: string): string | undefined {
  return tokenStore.get(tokenId);
}

export function generateDownloadResponse(): {
  text: string;
  buttons: Array<{ id: string; title: string }>;
} {
  return {
    text: "📥 Choose your platform to download ApexTunnel v2.0:\n\nAfter downloading, I'll walk you through how to set it up. 👇",
    buttons: [
      { id: "dl_linux_arm64", title: "🐧 Linux ARM64" },
      { id: "dl_linux_x64", title: "🐧 Linux x64" },
      { id: "dl_win_x64", title: "🪟 Windows x64" },
      { id: "dl_bundle", title: "📦 Bundle (Termux/Node)" },
    ],
  };
}

function formatAccountInfo(userInfo: any): string {
  if (!userInfo) return "I couldn't retrieve your account information.";
  return `Here's your account info:\n📧 Email: ${userInfo.email || "N/A"}\n📅 Joined: ${userInfo.joined_at ? new Date(userInfo.joined_at).toLocaleDateString() : "N/A"}\n✅ Status: ${userInfo.verified ? "Verified" : "Unverified"}`;
}

function formatTunnels(data: any): string {
  if (!data?.tunnels || (Array.isArray(data.tunnels) && data.tunnels.length === 0)) {
    return "You don't have any active tunnels right now. You can create one from the web dashboard.";
  }
  if (Array.isArray(data.tunnels)) {
    const list = data.tunnels.map((t: any, i: number) => `${i + 1}. ${t.name || "Unnamed"} (${t.status || "active"})`).join("\n");
    return `You have ${data.tunnels.length} active tunnel${data.tunnels.length > 1 ? "s" : ""}:\n${list}`;
  }
  return `Active tunnels: ${JSON.stringify(data.tunnels || data)}`;
}

function formatDomains(data: any): string {
  if (!data?.domains || (Array.isArray(data.domains) && data.domains.length === 0)) {
    return "You don't have any registered domains yet. You can register one from the web dashboard.";
  }
  if (Array.isArray(data.domains)) {
    const list = data.domains.map((d: any, i: number) => `${i + 1}. ${d.name || "Unnamed"}`).join("\n");
    return `You have ${data.domains.length} registered domain${data.domains.length > 1 ? "s" : ""}:\n${list}`;
  }
  return `Registered domains: ${JSON.stringify(data.domains || data)}`;
}

function buildPromptForAction(action: string, data: Record<string, any>): string {
  switch (action) {
    case "help":
      return `User asked for help. Briefly explain ApexTunnel Bot can: check account info, view tunnels, manage domains, download client, show setup guide, and troubleshoot errors.`;
    case "menu":
      return `User wants the menu. Present options briefly: 1. Account Info, 2. Active Tunnels, 3. Registered Domains, 4. Help. Ask what they'd like to do.`;
    case "unclear":
      return `User said something unclear. Suggest they tap a button or type: account, tunnels, domains, token, download, help, or get started.`;
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
      return "I can help you check your account, view tunnels, manage domains, download the client, or troubleshoot issues. What would you like to do?";
    case "menu":
      return `What would you like to do?\n1. Account Info\n2. Active Tunnels\n3. Registered Domains\n4. Help`;
    case "unclear":
      return `I'm not sure what you mean. Try:\n• 'account' for Account Info\n• 'tunnels' for Tunnels\n• 'domains' for Domains\n• 'get started' for setup guide\n• 'help' for Help`;
    default:
      return "What would you like to do? Check your account, view tunnels, manage domains, or ask for help.";
  }
}