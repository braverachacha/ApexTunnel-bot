import { IncomingMessage, MessageResponse } from "./utils/types";
import { getUserSession, setUserSession, updateUserSession } from "./services/session";
import { storeMessage, getConversationHistory, formatConversationForAI } from "./services/memory";
import { executeFunction } from "./services/function-executor";
import { generateActionResponse, generateTokenResponse } from "./services/response-generator";
import { makeDecision, DecisionResult } from "./services/decision-engine";

// Store message IDs for deletion mapping
const messageIdStore = new Map<string, number>();

export async function routeMessage(
  message: IncomingMessage
): Promise<MessageResponse> {
  const { from, body, messageId } = message;

  // Handle button callbacks (token hidden in callback data)
  if (body.startsWith("copy_token:")) {
    return handleTokenCopy(from, body, messageId);
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

  const response = await executeDecision(decision, from, body, session!, messageId);

  await storeMessage(from, "bot", response.text);
  return response;
}

async function handleTokenCopy(
  phoneNumber: string,
  callbackData: string,
  messageId?: number
): Promise<MessageResponse> {
  const token = callbackData.replace("copy_token:", "");

  // Delete the original message containing the button (hides the callback data)
  if (messageId) {
    await deleteBotMessage(phoneNumber, messageId);
  }

  return {
    text: "✅ Token copied to clipboard. For security, clear this chat history after use.",
  };
}

async function deleteBotMessage(chatId: string, messageId: number): Promise<void> {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
      }),
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
  messageId?: number
): Promise<MessageResponse> {

  switch (decision.action) {
    case "collect_email": {
      const email = extractEmail(userInput);
      if (!email) {
        return {
          text: "That doesn't look like a valid email. Please send a proper email address (like user@example.com).",
        };
      }
      await updateUserSession(phoneNumber, "pending_email", email);
      await updateUserSession(phoneNumber, "state", "awaiting_confirmation");
      return {
        text: `You want to create a new account with the email ${email}. Please confirm if you really want to register with this email address. Are you sure you want to proceed with ${email}?`,
        buttons: [
          { id: "confirm_yes", title: "Yes, Register" },
          { id: "confirm_no", title: "No, Cancel" },
        ],
      };
    }

    case "confirm_registration": {
      const email = session.pending_email || session.email;
      if (!email) {
        return { text: "Something went wrong. Please start over with your email." };
      }
      await updateUserSession(phoneNumber, "state", "awaiting_otp");
      await updateUserSession(phoneNumber, "email", email);
      const otpResult = await executeFunction(
        { name: "register_email", params: { email } },
        phoneNumber,
        session
      );
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
      if (!currentEmail) {
        return { text: "No email found. Please start over by entering your email." };
      }
      const resendResult = await executeFunction(
        { name: "resend_otp", params: {} },
        phoneNumber,
        session
      );
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
      return {
        text: "No problem. Please enter your new email address.",
      };
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
      const verifyResult = await executeFunction(
        { name: "verify_otp", params: { otp } },
        phoneNumber,
        session
      );
      if (verifyResult.success) {
        await updateUserSession(phoneNumber, "state", "verified");
        await updateUserSession(phoneNumber, "accessToken", verifyResult.data?.accessToken);
        await updateUserSession(phoneNumber, "apexToken", verifyResult.data?.apexToken);
        return {
          text: "Welcome to ApexTunnel! Your account is verified. What would you like to do?\n\n1. Account Info\n2. Active Tunnels\n3. Registered Domains\n4. Help\n\nOr type 'token' to get your access token.",
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
      return { text: "Cancelled. Enter your email." };
    }

    case "get_account_info":
    case "get_tunnels":
    case "get_domains":
    case "help":
    case "download":
    case "menu": {
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
      return { text: responseText };
    }

    case "get_token": {
      const tokenResponse = await generateTokenResponse(session);
      return {
        text: tokenResponse.text,
        buttons: tokenResponse.buttons,
      };
    }

    case "unclear":
    default: {
      const state = session.state || "unknown";
      let helpText = "";

      if (state === "awaiting_email") {
        helpText = "Please enter your email address to get started.";
      } else if (state === "awaiting_confirmation") {
        helpText = "Please confirm your email by replying 'Yes' or 'No'.";
      } else if (state === "awaiting_otp") {
        helpText = "Please enter the 6-digit OTP code sent to your email.\n\nOr say:\n• 'resend' if you didn't get it\n• 'change email' to use a different email";
      } else {
        helpText = "I'm not sure what you mean. You can:\n• Check account info (say 'account' or '1')\n• View active tunnels (say 'tunnels' or '2')\n• See registered domains (say 'domains' or '3')\n• Ask for help (say 'help' or '4')\n• Get your token (say 'token')";
      }

      return {
        text: helpText,
        buttons: state === "awaiting_otp"
          ? [
              { id: "resend_otp", title: "Resend OTP" },
              { id: "change_email", title: "Change Email" },
            ]
          : [
              { id: "menu", title: "Show Menu" },
              { id: "help", title: "Help" },
            ],
      };
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
