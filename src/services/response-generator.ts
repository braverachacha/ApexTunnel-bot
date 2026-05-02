import axios from "axios";

const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const RESPONSE_SYSTEM_PROMPT = `You are ApexTunnel Bot. Generate friendly, natural WhatsApp responses.

Rules:
- Keep responses SHORT (2-3 sentences max)
- Be conversational and helpful
- Never use quotes or asterisks
- If providing data, format it clearly
- Be professional but friendly`;

export async function generateActionResponse(
  action: string,
  data: Record<string, any>
): Promise<string> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

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
        temperature: 0.7,
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

function buildPromptForAction(action: string, data: Record<string, any>): string {
  switch (action) {
    case "account_info":
      return `User asked for account info. Present this data naturally:
Email: ${data.email}
Joined: ${data.joined}
Status: ${data.status}
Verified: ${data.verified}

Format it in a friendly way, like you're chatting with a friend.`;

    case "tunnels":
      const tunnelCount = data.count || 0;
      return `User asked about active tunnels. They have ${tunnelCount} active tunnels.
${tunnelCount > 0 ? `Tunnels: ${data.tunnels?.map((t: any) => t.name).join(", ")}` : ""}
Respond naturally and helpfully.`;

    case "domains":
      const domainCount = data.count || 0;
      return `User asked about registered domains. They have ${domainCount} registered domains.
${domainCount > 0 ? `Domains: ${data.domains?.map((d: any) => d.name).join(", ")}` : ""}
Respond naturally. If they have no domains, suggest they can register via the web dashboard.`;

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

    default:
      return `User asked: "${data.userMessage}". Respond helpfully and naturally.`;
  }
}

function getDefaultResponse(action: string, data: Record<string, any>): string {
  switch (action) {
    case "account_info":
      return `Email: ${data.email}\nJoined: ${data.joined}\nStatus: ${data.status}\nVerified: ${data.verified}`;

    case "tunnels":
      return `You have ${data.count || 0} active tunnels.`;

    case "domains":
      return `You have ${data.count || 0} registered domains.`;

    case "help":
      return "I can help you check your account, view tunnels, manage domains, or download ExposureApp.";

    case "download":
      return "ExposureApp v2.0: https://github.com/braverachacha/ExposureApp/releases/tag/v2.0";

    default:
      return "What would you like to do? Check your account, view tunnels, manage domains, or ask for help.";
  }
}
