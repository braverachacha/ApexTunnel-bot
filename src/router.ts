import { IncomingMessage, MessageResponse } from "./utils/types";
import { getUserSession, setUserSession, updateUserSession } from "./services/session";
import { storeMessage, getConversationHistory, formatConversationForAI } from "./services/memory";
import { executeFunction } from "./services/function-executor";
import { generateActionResponse, generateTokenResponse, generateDownloadResponse, getTokenById } from "./services/response-generator";
import { makeDecision, DecisionResult } from "./services/decision-engine";
import { checkEmailExists } from "./services/api";

export async function routeMessage(
  message: IncomingMessage
): Promise<MessageResponse> {
  const { from, body, messageId, platform } = message;

  if (body.startsWith("copy_token:")) {
    return handleTokenCopy(from, body, messageId);
  }

  if (body.startsWith("dl_")) {
    return handleDownloadSelection(from, body, platform);
  }

  await storeMessage(from, "user", body);

  let session = await getUserSession(from);
  const history = await getConversationHistory(from);
  const historyText = formatConversationForAI(history);

  if (!session?.state) {
    await setUserSession(from, {
      state: "awaiting_email",
      created_at: new Date().toISOString(),
    });
    session = await getUserSession(from);
  }

  const decision = await makeDecision(body, {
    currentState: session!.state,
    session: session!,
    history: historyText,
  });

  const response = await executeDecision(decision, from, body, session!, messageId, platform);

  await storeMessage(from, "bot", response.text);
  return response;
}

async function handleTokenCopy(
  phoneNumber: string,
  callbackData: string,
  messageId?: number
): Promise<MessageResponse> {
  const tokenId = callbackData.replace("copy_token:", "");
  const token = getTokenById(tokenId);

  if (!token) {
    return { text: "❌ Token expired or invalid. Please request a new token." };
  }

  if (messageId) {
    await deleteBotMessage(phoneNumber, messageId);
  }

  const tokenMessageId = await sendTokenMessage(phoneNumber, token);

  if (tokenMessageId) {
    setTimeout(() => {
      deleteBotMessage(phoneNumber, tokenMessageId);
    }, 15000);
  }

  return {
    text: "⏳ Token shown above will self-destruct in 15 seconds. Copy it now!",
  };
}

async function sendTokenMessage(chatId: string, token: string): Promise<number | undefined> {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `\`${token}\``,
        parse_mode: "MarkdownV2",
      }),
    });
    const data = await res.json();
    return data.result?.message_id;
  } catch (e) {
    console.error("Failed to send token:", e);
  }
}

async function handleDownloadSelection(
  phoneNumber: string,
  body: string,
  platform: "whatsapp" | "telegram"
): Promise<MessageResponse> {
  const links: Record<string, string> = {
    dl_linux_arm64: "https://github.com/braverachacha/ExposureApp/releases/download/v2.0/apex-client-linux-arm64.zip",
    dl_linux_x64: "https://github.com/braverachacha/ExposureApp/releases/download/v2.0/apex-client-linux-x64.zip",
    dl_win_x64: "https://github.com/braverachacha/ExposureApp/releases/download/v2.0/apex-client-win-x64.zip",
    dl_bundle: "https://github.com/braverachacha/ExposureApp/releases/download/v2.0/bundle.cjs",
  };

  const url = links[body];
  if (!url) {
    return { text: "❌ Unknown download option." };
  }

  const isWindows = body === "dl_win_x64";
  const isBundle = body === "dl_bundle";

  const downloadText = platform === "telegram"
    ? `📥 <b>Download ready!</b>\n${url}\n\n${isWindows ? "⚠️ <b>Windows Users:</b> The binary is unsigned. If SmartScreen appears, click <i>More Info</i> → <i>Run anyway</i>.\n\n" : ""}Tap below to get setup instructions and your auth token.`
    : `📥 Download ready!\n${url}\n\n${isWindows ? "⚠️ Windows Users: The binary is unsigned. If SmartScreen appears, tap More Info → Run anyway.\n\n" : ""}Reply *get started* for setup instructions or *token* for your auth token.`;

  return {
    text: downloadText,
    buttons: [
      { id: isBundle ? "get_started_bundle" : isWindows ? "get_started_windows" : "get_started_linux", title: "🚀 How to Get Started" },
      { id: "get_token", title: "🔑 Get My Auth Token" },
      { id: "menu", title: "🏠 Main Menu" },
    ],
  };
}

async function deleteBotMessage(chatId: string, messageId: number): Promise<void> {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
  } catch (e) {
    console.error("Failed to delete message:", e);
  }
}

async function executeDecision(
  decision: DecisionResult,
  phoneNumber: string,
  userInput: string,
  session: Record<string, any>,
  messageId?: number,
  platform: "whatsapp" | "telegram" = "telegram"
): Promise<MessageResponse> {

  switch (decision.action) {
    case "collect_email": {
      const email = extractEmail(userInput);
      if (!email) {
        return { text: "That doesn't look like a valid email. Please send a proper email address (like user@example.com)." };
      }

      const exists = await checkEmailExists(email);

      if (exists) {
        await updateUserSession(phoneNumber, "email", email);
        await updateUserSession(phoneNumber, "state", "awaiting_otp");
        const otpResult = await executeFunction({ name: "register_email", params: { email } }, phoneNumber, session);
        return {
          text: otpResult.success
            ? `Welcome back! I've sent an OTP to ${email}. Please enter the 6-digit code to log in.`
            : `Failed to send OTP: ${otpResult.message}. Please try again.`,
          buttons: [
            { id: "resend_otp", title: "Resend OTP" },
            { id: "change_email", title: "Change Email" },
          ],
        };
      }

      await updateUserSession(phoneNumber, "pending_email", email);
      await updateUserSession(phoneNumber, "state", "awaiting_confirmation");
      return {
        text: `This email (${email}) is not registered yet. Would you like to create a new account with this email?`,
        buttons: [
          { id: "confirm_yes", title: "Yes, Register" },
          { id: "confirm_no", title: "No, Cancel" },
        ],
      };
    }

    case "confirm_registration": {
      const email = session.pending_email || session.email;
      if (!email) return { text: "Something went wrong. Please start over with your email." };
      await updateUserSession(phoneNumber, "state", "awaiting_otp");
      await updateUserSession(phoneNumber, "email", email);
      await updateUserSession(phoneNumber, "pending_email", "");
      const otpResult = await executeFunction({ name: "register_email", params: { email } }, phoneNumber, session);
      return {
        text: otpResult.success
          ? `I've sent an OTP to ${email}. Please enter the 6-digit code you received in your email to continue.`
          : `Failed to send OTP: ${otpResult.message}. Please try again or use a different email.`,
        buttons: [
          { id: "resend_otp", title: "Resend OTP" },
          { id: "change_email", title: "Change Email" },
        ],
      };
    }

    case "resend_otp": {
      const currentEmail = session.email || session.pending_email;
      if (!currentEmail) return { text: "No email found. Please start over by entering your email." };
      const resendResult = await executeFunction({ name: "resend_otp", params: {} }, phoneNumber, session);
      return {
        text: resendResult.success
          ? `OTP re-sent to ${currentEmail}. Please check your inbox and enter the 6-digit code.`
          : `Failed to resend OTP: ${resendResult.message}`,
        buttons: [
          { id: "resend_otp", title: "Resend OTP" },
          { id: "change_email", title: "Change Email" },
        ],
      };
    }

    case "change_email": {
      await updateUserSession(phoneNumber, "state", "awaiting_email");
      await updateUserSession(phoneNumber, "pending_email", "");
      await updateUserSession(phoneNumber, "email", "");
      return { text: "No problem. Please enter your email address." };
    }

    case "verify_otp": {
      const otp = extractOTP(userInput);
      if (!otp) {
        return {
          text: "Please enter a 6-digit code as your OTP. Try again with the correct format.",
          buttons: [
            { id: "resend_otp", title: "Resend OTP" },
            { id: "change_email", title: "Change Email" },
          ],
        };
      }
      const verifyResult = await executeFunction({ name: "verify_otp", params: { otp } }, phoneNumber, session);
      if (verifyResult.success) {
        await updateUserSession(phoneNumber, "state", "verified");
        await updateUserSession(phoneNumber, "accessToken", verifyResult.data?.accessToken);
        await updateUserSession(phoneNumber, "apexToken", verifyResult.data?.apexToken);
        return {
          text: `✅ Welcome to ApexTunnel! Your account is verified.\n\nWhat would you like to do?`,
          buttons: [
            { id: "get_account_info", title: "👤 Account Info" },
            { id: "get_tunnels", title: "🚇 Active Tunnels" },
            { id: "get_domains", title: "🌐 Domains" },
            { id: "get_token", title: "🔑 My Token" },
            { id: "download", title: "📥 Download App" },
            { id: "help", title: "❓ Help" },
          ],
        };
      } else {
        return {
          text: verifyResult.message || "Your OTP verification failed. Please try again with the correct email and OTP.",
          buttons: [
            { id: "resend_otp", title: "Resend OTP" },
            { id: "change_email", title: "Change Email" },
          ],
        };
      }
    }

    case "cancel": {
      await updateUserSession(phoneNumber, "state", "awaiting_email");
      await updateUserSession(phoneNumber, "pending_email", "");
      await updateUserSession(phoneNumber, "email", "");
      return { text: "Cancelled. Enter your email." };
    }

    case "menu": {
      const isVerified = session.state === "verified";
      return {
        text: isVerified
          ? `👋 Welcome back! What would you like to do?`
          : `👋 Hi! I'm the ApexTunnel assistant.\n\nTo get started, please enter your email address.`,
        buttons: isVerified
          ? [
              { id: "get_account_info", title: "👤 Account Info" },
              { id: "get_tunnels", title: "🚇 Active Tunnels" },
              { id: "get_domains", title: "🌐 Domains" },
              { id: "get_token", title: "🔑 My Token" },
              { id: "download", title: "📥 Download App" },
              { id: "help", title: "❓ Help" },
            ]
          : undefined,
      };
    }

    case "help": {
      const helpText = platform === "telegram"
        ? `ℹ️ <b>Here's what I can do for you:</b>\n\n👤 <b>Account Info</b> — view your profile\n🚇 <b>Active Tunnels</b> — see running tunnels\n🌐 <b>Domains</b> — see registered domains\n🔑 <b>My Token</b> — get your access token\n📥 <b>Download</b> — get ApexTunnel client\n🚀 <b>Get Started</b> — setup guide & usage\n🔧 <b>Troubleshooting</b> — fix common issues\n\nJust tap a button or type what you need.`
        : `ℹ️ *Here's what I can do for you:*\n\n👤 Account Info — view your profile\n🚇 Active Tunnels — see running tunnels\n🌐 Domains — see registered domains\n🔑 My Token — get your access token\n📥 Download — get ApexTunnel client\n🚀 Get Started — setup guide & usage\n🔧 Troubleshooting — fix common issues\n\nReply with a keyword to continue.`;
      return {
        text: helpText,
        buttons: session.state === "verified"
          ? [
              { id: "get_account_info", title: "👤 Account Info" },
              { id: "get_tunnels", title: "🚇 Active Tunnels" },
              { id: "get_domains", title: "🌐 Domains" },
              { id: "get_token", title: "🔑 My Token" },
              { id: "download", title: "📥 Download App" },
              { id: "get_started", title: "🚀 Get Started" },
              { id: "troubleshoot", title: "🔧 Troubleshooting" },
            ]
          : [
              { id: "download", title: "📥 Download App" },
              { id: "get_started", title: "🚀 Get Started" },
              { id: "troubleshoot", title: "🔧 Troubleshooting" },
            ],
      };
    }

    case "get_account_info":
    case "get_tunnels":
    case "get_domains": {
      const funcResult = await executeFunction(
        { name: decision.action, params: decision.params || {} },
        phoneNumber,
        session
      );
      const responseText = await generateActionResponse(decision.action, {
        success: funcResult.success,
        message: funcResult.message,
        ...funcResult.data,
        userMessage: userInput,
      }, session);
      return {
        text: responseText,
        buttons: [
          { id: "menu", title: "🏠 Main Menu" },
          { id: "help", title: "❓ Help" },
        ],
      };
    }

    case "download": {
      const downloadResp = generateDownloadResponse();
      return { text: downloadResp.text, buttons: downloadResp.buttons };
    }

    case "get_started_linux":
    case "get_started_windows":
    case "get_started_bundle":
    case "get_started": {
      const variant = decision.action === "get_started_windows" ? "windows"
        : decision.action === "get_started_bundle" ? "bundle" : "linux";
      return {
        text: getStartedGuide(variant, platform),
        buttons: [
          { id: "get_token", title: "🔑 Get My Auth Token" },
          { id: "troubleshoot", title: "🔧 Troubleshooting" },
          { id: "menu", title: "🏠 Main Menu" },
        ],
      };
    }

    case "troubleshoot": {
      return {
        text: getTroubleshootingGuide(platform),
        buttons: [
          { id: "get_started", title: "🚀 Back to Setup Guide" },
          { id: "menu", title: "🏠 Main Menu" },
        ],
      };
    }

    case "get_token": {
      const tokenResponse = await generateTokenResponse(session);
      return { text: tokenResponse.text, buttons: tokenResponse.buttons };
    }

    case "unclear":
    default: {
      const state = session.state || "unknown";
      if (state === "awaiting_email") {
        return { text: "Please enter your email address to get started. (e.g. you@example.com)" };
      } else if (state === "awaiting_confirmation") {
        return {
          text: "Please confirm — would you like to register with this email?",
          buttons: [
            { id: "confirm_yes", title: "✅ Yes, Register" },
            { id: "confirm_no", title: "❌ No, Cancel" },
          ],
        };
      } else if (state === "awaiting_otp") {
        return {
          text: "Please enter the 6-digit OTP code sent to your email.",
          buttons: [
            { id: "resend_otp", title: "🔁 Resend OTP" },
            { id: "change_email", title: "✏️ Change Email" },
          ],
        };
      } else {
        return {
          text: "I can only help with your ApexTunnel account. Please choose an option:",
          buttons: [
            { id: "get_account_info", title: "👤 Account Info" },
            { id: "get_tunnels", title: "🚇 Active Tunnels" },
            { id: "get_domains", title: "🌐 Domains" },
            { id: "get_token", title: "🔑 My Token" },
            { id: "download", title: "📥 Download App" },
            { id: "help", title: "❓ Help" },
          ],
        };
      }
    }
  }
}

function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function extractOTP(text: string): string | null {
  const match = text.match(/\b\d{6}\b/);
  return match ? match[0] : null;
}

function getStartedGuide(variant: "linux" | "windows" | "bundle", platform: "whatsapp" | "telegram"): string {
  const isTg = platform === "telegram";
  const b = (t: string) => isTg ? `<b>${t}</b>` : `*${t}*`;
  const c = (t: string) => isTg ? `<code>${t}</code>` : `\`${t}\``;
  const i = (t: string) => isTg ? `<i>${t}</i>` : `_${t}_`;

  if (variant === "bundle") {
    return [
      `🚀 ${b("Getting Started — Bundle (CJS)")}`,
      ``,
      `${b("1. Prerequisites")}`,
      `Make sure Node.js v18+ is installed on your system.`,
      ``,
      `${b("2. Run directly")}`,
      `${c("node bundle.cjs authtoken <your-token>")}`,
      `${c("node bundle.cjs http 3000")}`,
      ``,
      `${b("3. (Optional) Make it a global command")}`,
      `${c("npm install -g .")}  ${i("— from the folder containing bundle.cjs")}`,
      `Then use ${c("apex")} from anywhere.`,
      ``,
      `${b("4. Expose your app")}`,
      `${c("apex http 3000")}`,
      `${c("apex http 3000 --subdomain myapp")}`,
      ``,
      `${b("5. Check status")}`,
      `${c("apex status")}`,
      ``,
      `💡 ${b("Tip:")} Always save your token first with ${c("apex authtoken <token>")} — tunnels won't start without it.`,
    ].join("\n");
  }

  if (variant === "windows") {
    return [
      `🚀 ${b("Getting Started — Windows")}`,
      ``,
      `${b("1. Extract the zip")}`,
      `Unzip the downloaded file. You'll find ${c("apex.exe")} inside.`,
      ``,
      `${b("2. SmartScreen warning")}`,
      `⚠️ The binary is ${b("unsigned")}. If Windows SmartScreen appears:`,
      `  • Click ${b("More Info")}`,
      `  • Then click ${b("Run anyway")}`,
      `This is expected — the binary is safe.`,
      ``,
      `${b("3. Add to PATH (recommended)")}`,
      `Move ${c("apex.exe")} to a folder like ${c("C:\\Tools")} and add it to your system PATH, or run it directly from its folder.`,
      ``,
      `${b("4. Save your auth token")}`,
      `${c("apex.exe authtoken <your-token>")}`,
      ``,
      `${b("5. Expose a local port")}`,
      `${c("apex.exe http 3000")}`,
      `${c("apex.exe http 3000 --subdomain myapp")}`,
      ``,
      `${b("6. Check status")}`,
      `${c("apex.exe status")}`,
      ``,
      `💡 ${b("Tip:")} Run from the folder containing ${c("apex.exe")} or add it to PATH to use it from anywhere.`,
    ].join("\n");
  }

  return [
    `🚀 ${b("Getting Started — Linux")}`,
    ``,
    `${b("1. Extract and make executable")}`,
    `${c("unzip apex-client-linux-*.zip")}`,
    `${c("chmod +x apex")}`,
    ``,
    `${b("2. Move to PATH (optional but recommended)")}`,
    `${c("sudo mv apex /usr/local/bin/apex")}`,
    `Now you can run ${c("apex")} from anywhere.`,
    ``,
    `${b("3. Save your auth token")}`,
    `${c("apex authtoken <your-token>")}`,
    `You only need to do this once.`,
    ``,
    `${b("4. Expose a local port")}`,
    `${c("apex http 3000")}`,
    `${c("apex http 3000 --subdomain myapp")}`,
    `Your app will be live at ${c("myapp.apextunnel.top")}`,
    ``,
    `${b("5. Check status")}`,
    `${c("apex status")}`,
    ``,
    `💡 ${b("Tip:")} Always run ${c("apex authtoken")} before starting a tunnel. Tap ${b("Get My Auth Token")} below to retrieve yours.`,
  ].join("\n");
}

function getTroubleshootingGuide(platform: "whatsapp" | "telegram"): string {
  const isTg = platform === "telegram";
  const b = (t: string) => isTg ? `<b>${t}</b>` : `*${t}*`;
  const c = (t: string) => isTg ? `<code>${t}</code>` : `\`${t}\``;

  return [
    `🔧 ${b("Troubleshooting")}`,
    ``,
    `${b("❌ Reconnecting loop / tunnel keeps dropping")}`,
    `This usually means one of two things:`,
    `  • ${b("Outdated client:")} v1.1.3 and below are no longer supported. Download the latest v2.0 from the Download menu.`,
    `  • ${b("Network issue:")} Check your connection. Firewalls or proxies that block WebSocket connections can cause this. Try a different network or disable the proxy.`,
    ``,
    `${b("❌ permission denied when running apex")}`,
    `Run ${c("chmod +x apex")} to make the binary executable, then try again.`,
    ``,
    `${b("❌ apex: command not found")}`,
    `Run it as ${c("./apex http 3000")} from its folder, or move it to PATH:`,
    `${c("sudo mv apex /usr/local/bin/apex")}`,
    ``,
    `${b("❌ Tunnel starts but app is unreachable")}`,
    `  • Make sure your local app is running on the port you specified.`,
    `  • Check ${c("apex status")} to confirm the relay and token are correct.`,
    `  • Try ${c("APEX_LOCAL_HOST=127.0.0.1 apex http 3000")} if your app binds to 127.0.0.1.`,
    ``,
    `${b("❌ Windows SmartScreen blocks the binary")}`,
    `Click ${b("More Info")} → ${b("Run anyway")}. The binary is unsigned but safe.`,
    ``,
    `${b("❌ Invalid or expired token")}`,
    `Grab a fresh token from your account and run ${c("apex authtoken <new-token>")} again.`,
    ``,
    `Still stuck? Share the exact error message and we'll help you out.`,
  ].join("\n");
}