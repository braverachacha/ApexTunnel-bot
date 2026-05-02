import axios from "axios";

const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const DECISION_SYSTEM_PROMPT = `You are ApexTunnel Bot's STRICT decision engine. Your ONLY job is to classify the user's message into one action. You do NOT generate responses. You do NOT chat. You classify.

Available actions:
- "collect_email" - User sent an email address (contains @ and . and looks like an email). ONLY valid when state is "awaiting_email".
- "confirm_registration" - User confirmed they want to register (yes, sure, ok, proceed, "yes register", "1", any positive confirmation). ONLY valid when state is "awaiting_confirmation".
- "cancel" - User cancelled, said no, wants to stop (no, cancel, stop, "no cancel", "2", any negative response). ONLY valid when state is "awaiting_confirmation".
- "resend_otp" - User wants OTP resent (resend, re-send, didn't get, haven't received, again, "mind re-sending", "send again", "where is my otp", "i need the otp again"). ONLY valid when state is "awaiting_otp".
- "change_email" - User wants different email (wrong email, invalid, change, different, new email, mistake, "change email", "use another email"). ONLY valid when state is "awaiting_otp" or "awaiting_confirmation".
- "verify_otp" - User provided a 6-digit OTP code (message contains exactly 6 consecutive digits). ONLY valid when state is "awaiting_otp".
- "get_account_info" - User wants account details (account, info, profile, status, my details, "1"). ONLY valid when state is "verified".
- "get_tunnels" - User wants tunnels list (tunnel, tunnels, active, running, "2"). ONLY valid when state is "verified".
- "get_domains" - User wants domains list (domain, domains, registered, "3"). ONLY valid when state is "verified".
- "get_token" - User wants their access token (token, my token, access token, "/token"). ONLY valid when state is "verified".
- "help" - User wants help (help, what can you do, options, "4", "?"). Valid in ALL states.
- "download" - User wants ApexTunnel download (download, exposureapp, link, install, binary, app, client). Valid in ALL states.
- "get_started" - User wants setup/usage guide (how to use, get started, setup, install guide, how do I use, how to run, how to expose). Valid in ALL states.
- "troubleshoot" - User has a problem or error (not working, error, reconnecting, loop, permission denied, command not found, help me fix, troubleshoot, issue, bug, broken, crashing, dropping). Valid in ALL states.
- "menu" - User sent /start, a greeting, or wants the menu (hi, hello, hey, /start, /menu, start, menu). Valid in ALL states.
- "unclear" - Cannot determine intent, OR the requested action is NOT valid in the current state.

CRITICAL STATE RULES — THESE OVERRIDE EVERYTHING:
- state "awaiting_email": ONLY collect_email, menu, help, download, get_started, troubleshoot, unclear are valid.
- state "awaiting_confirmation": ONLY confirm_registration, cancel, change_email, help, download, get_started, troubleshoot, unclear are valid.
- state "awaiting_otp": ONLY verify_otp, resend_otp, change_email, help, download, get_started, troubleshoot, unclear are valid.
- state "verified": ONLY get_account_info, get_tunnels, get_domains, get_token, help, download, get_started, troubleshoot, menu, unclear are valid.

IF THE USER ASKS ABOUT ANYTHING UNRELATED TO APEXTUNNEL (e.g. weather, sports, general chat, trivia) → "unclear". You are NOT a general assistant.

Respond ONLY with valid JSON — no markdown, no code blocks, no backticks, just raw JSON:
{"action": "action_name", "params": {}, "confidence": 0.95, "reason": "brief explanation"}`;

export interface DecisionResult {
  action: string;
  params: Record<string, any>;
  confidence: number;
  reason: string;
}

export interface DecisionContext {
  currentState: string;
  session: Record<string, any>;
  history: string;
}

function cleanJsonResponse(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

export async function makeDecision(
  userMessage: string,
  context: DecisionContext
): Promise<DecisionResult> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) return fallbackDecision(userMessage, context);

  try {
    const prompt = `Current state: ${context.currentState}
Session data: ${JSON.stringify(context.session)}
Recent conversation:
${context.history}

User message: "${userMessage}"

What single action should be taken? Remember: ONLY actions valid in state "${context.currentState}" are allowed.`;

    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: DECISION_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        max_tokens: 150,
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

    let responseText = response.data.choices?.[0]?.message?.content?.trim();
    if (!responseText) return fallbackDecision(userMessage, context);

    responseText = cleanJsonResponse(responseText);

    try {
      const decision = JSON.parse(responseText) as DecisionResult;
      const validActions = getValidActionsForState(context.currentState);
      if (!validActions.includes(decision.action)) {
        console.log(`[Decision Override] ${decision.action} invalid in state ${context.currentState}, falling back to unclear`);
        return { action: "unclear", params: {}, confidence: 0.5, reason: `AI suggested ${decision.action} but it's invalid in ${context.currentState} state` };
      }
      console.log(`[Decision] ${decision.action} (${(decision.confidence * 100).toFixed(0)}%): ${decision.reason}`);
      return decision;
    } catch (e) {
      console.error("[Decision Parse Error]", responseText);
      return fallbackDecision(userMessage, context);
    }
  } catch (error) {
    console.error("[Decision Error]", error instanceof Error ? error.message : "Unknown");
    return fallbackDecision(userMessage, context);
  }
}

function getValidActionsForState(state: string): string[] {
  const universal = ["help", "download", "get_started", "troubleshoot", "unclear"];
  switch (state) {
    case "awaiting_email":
      return ["collect_email", "menu", ...universal];
    case "awaiting_confirmation":
      return ["confirm_registration", "cancel", "change_email", ...universal];
    case "awaiting_otp":
      return ["verify_otp", "resend_otp", "change_email", ...universal];
    case "verified":
      return ["get_account_info", "get_tunnels", "get_domains", "get_token", "menu",
              "get_started_linux", "get_started_windows", "get_started_bundle", ...universal];
    default:
      return ["unclear"];
  }
}

function fallbackDecision(userMessage: string, context: DecisionContext): DecisionResult {
  const msg = userMessage.toLowerCase().trim();
  const state = context.currentState;

  if (state === "awaiting_email") {
    const emailMatch = msg.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) return { action: "collect_email", params: { email: emailMatch[0] }, confidence: 0.9, reason: "Fallback: found email" };
    if (/^(hi|hello|hey|start|\/start)$/i.test(msg)) return { action: "menu", params: {}, confidence: 0.8, reason: "Fallback: greeting" };
    if (/get.?started|how.?to|setup/i.test(msg) || msg === "get_started") return { action: "get_started", params: {}, confidence: 0.85, reason: "Fallback: get started" };
    if (/troubleshoot|not.?working|error|reconnect/i.test(msg) || msg === "troubleshoot") return { action: "troubleshoot", params: {}, confidence: 0.85, reason: "Fallback: troubleshoot" };
    return { action: "unclear", params: {}, confidence: 0.5, reason: "Fallback: awaiting email, no valid input" };
  }

  if (state === "awaiting_confirmation") {
    if (/^(yes|sure|ok|proceed|1|yes register)$/i.test(msg)) return { action: "confirm_registration", params: {}, confidence: 0.9, reason: "Fallback: positive confirmation" };
    if (/^(no|cancel|stop|2|no cancel)$/i.test(msg)) return { action: "cancel", params: {}, confidence: 0.9, reason: "Fallback: negative response" };
    return { action: "unclear", params: {}, confidence: 0.5, reason: "Fallback: awaiting confirmation, no valid input" };
  }

  if (state === "awaiting_otp") {
    const otpMatch = msg.match(/\b\d{6}\b/);
    if (otpMatch) return { action: "verify_otp", params: { otp: otpMatch[0] }, confidence: 0.9, reason: "Fallback: found 6-digit OTP" };
    if (/(resend|re-send|didn't get|haven't received|again|send again|re sending|mind.*resend)/i.test(msg)) return { action: "resend_otp", params: {}, confidence: 0.85, reason: "Fallback: resend keywords" };
    if (/(change|wrong|different|new|invalid).*email/i.test(msg) || msg === "change_email") return { action: "change_email", params: {}, confidence: 0.85, reason: "Fallback: change email keywords" };
    return { action: "unclear", params: {}, confidence: 0.5, reason: "Fallback: awaiting OTP, no valid input" };
  }

  if (state === "verified") {
    if (/^(1|account|info|profile)$/i.test(msg)) return { action: "get_account_info", params: {}, confidence: 0.9, reason: "Fallback: account request" };
    if (/^(2|tunnel|tunnels|active)$/i.test(msg)) return { action: "get_tunnels", params: {}, confidence: 0.9, reason: "Fallback: tunnels request" };
    if (/^(3|domain|domains|registered)$/i.test(msg)) return { action: "get_domains", params: {}, confidence: 0.9, reason: "Fallback: domains request" };
    if (/^(4|help|menu|\?)$/i.test(msg)) return { action: "help", params: {}, confidence: 0.9, reason: "Fallback: help request" };
    if (/^(token|\/token|my token|access token)$/i.test(msg)) return { action: "get_token", params: {}, confidence: 0.95, reason: "Fallback: token request" };
    if (/download|exposureapp|install/i.test(msg)) return { action: "download", params: {}, confidence: 0.85, reason: "Fallback: download request" };
    if (/get.?started|how.?to.?(use|run|install|expose)|setup|usage.?guide/i.test(msg) || msg === "get_started") return { action: "get_started", params: {}, confidence: 0.85, reason: "Fallback: get started request" };
    if (/troubleshoot|not.?working|error|reconnect|loop|permission.?denied|command.?not.?found|broken|crashing|dropping|issue/i.test(msg) || msg === "troubleshoot") return { action: "troubleshoot", params: {}, confidence: 0.85, reason: "Fallback: troubleshoot request" };
    if (/^(hi|hello|hey|start|\/start)$/i.test(msg)) return { action: "menu", params: {}, confidence: 0.8, reason: "Fallback: greeting in verified state" };
    return { action: "unclear", params: {}, confidence: 0.5, reason: "Fallback: verified state, unrecognized input" };
  }

  return { action: "unclear", params: {}, confidence: 0.3, reason: "Fallback: unknown state" };
}