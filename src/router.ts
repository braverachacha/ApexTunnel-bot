import { IncomingMessage, MessageResponse } from "./utils/types";
import { getUserSession, setUserSession, updateUserSession } from "./services/session";
import {
  handleAuthFlow,
  handleOTPVerification,
  displayUserInfo,
} from "./handlers/auth";
import { handleAccountInfo } from "./handlers/account";
import { handleTunnels } from "./handlers/tunnels";
import { handleDomains } from "./handlers/domains";
import { handleHelp } from "./handlers/help";

export async function routeMessage(
  message: IncomingMessage
): Promise<MessageResponse> {
  const { from, body } = message;
  const trimmedBody = body.trim().toLowerCase();

  // Get user's current session state
  let session = await getUserSession(from);

  // NEW USER: Initialize session with awaiting_email state
  if (!session || !session.state) {
    await setUserSession(from, {
      state: "awaiting_email",
      created_at: new Date().toISOString(),
    });
    session = await getUserSession(from);
  }

  const currentState = session!.state as string;

  // Route based on current state
  if (currentState === "awaiting_email") {
    return await handleAuthFlow(from, body, session!);
  }

  if (currentState === "awaiting_confirmation") {
    return await handleConfirmation(from, body, session!);
  }

  if (currentState === "awaiting_otp") {
    return await handleOTPVerification(from, body, session!);
  }

  if (currentState === "verified") {
    return await handleVerifiedUserActions(from, trimmedBody, session!);
  }

  return {
    text: "Invalid state. Please start over by sending any message.",
  };
}

// Handle confirmation buttons (Register/Cancel)
async function handleConfirmation(
  phoneNumber: string,
  userInput: string,
  session: Record<string, string>
): Promise<MessageResponse> {
  const input = userInput.toLowerCase().trim();

  if (input === "register me" || input === "1") {
    await updateUserSession(phoneNumber, "state", "awaiting_otp");
    return {
      text: `OTP has been sent to ${session.email}. Enter the code from your email.`,
    };
  }

  if (input === "cancel" || input === "2") {
    await updateUserSession(phoneNumber, "state", "awaiting_email");
    return {
      text: "Cancelled. Please enter your email address.",
    };
  }

  return {
    text: "Invalid input. Reply with 'Register Me' or 'Cancel'.",
  };
}

// Route verified user to appropriate handler
async function handleVerifiedUserActions(
  phoneNumber: string,
  action: string,
  session: Record<string, string>
): Promise<MessageResponse> {
  if (
    action.includes("account") ||
    action === "account info" ||
    action === "1"
  ) {
    return await displayUserInfo(phoneNumber, session);
  }

  if (action.includes("tunnel") || action === "tunnels" || action === "2") {
    return await handleTunnels(phoneNumber, session);
  }

  if (action.includes("domain") || action === "domains" || action === "3") {
    return await handleDomains(phoneNumber, session);
  }

  if (action.includes("help") || action === "help" || action === "4") {
    return await handleHelp();
  }

  // Default: show main menu
  return {
    text: "What would you like to do?",
    buttons: [
      { id: "account_info", title: "Account Info" },
      { id: "tunnels", title: "Active Tunnels" },
      { id: "domains", title: "Registered Domains" },
      { id: "help", title: "Help" },
    ],
  };
}
