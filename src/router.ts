import { IncomingMessage, MessageResponse } from "./utils/types";
import { getUserSession, setUserSession, updateUserSession } from "./services/session";
import { storeMessage } from "./services/memory";
import { makeDecision } from "./services/decision-engine";
import { generateActionResponse } from "./services/response-generator";
import {
  handleAuthFlow,
  handleOTPVerification,
} from "./handlers/auth";

export async function routeMessage(
  message: IncomingMessage
): Promise<MessageResponse> {
  const { from, body } = message;

  await storeMessage(from, "user", body);

  let session = await getUserSession(from);

  if (!session || !session.state) {
    await setUserSession(from, {
      state: "awaiting_email",
      created_at: new Date().toISOString(),
    });
    session = await getUserSession(from);
  }

  const currentState = session!.state as string;

  if (currentState === "awaiting_email") {
    const response = await handleAuthFlow(from, body, session!);
    await storeMessage(from, "bot", response.text);
    return response;
  }

  if (currentState === "awaiting_confirmation") {
    const response = await handleConfirmation(from, body, session!);
    await storeMessage(from, "bot", response.text);
    return response;
  }

  if (currentState === "awaiting_otp") {
    const response = await handleOTPVerification(from, body, session!);
    await storeMessage(from, "bot", response.text);
    return response;
  }

  if (currentState === "verified") {
    // Make decision
    const decision = await makeDecision(body);

    // Generate ONE response based on decision
    const responseText = await generateActionResponse(decision.action, {
      email: session!.email,
      joined: new Date(session!.verified_at || "").toLocaleDateString(),
    });

    const response: MessageResponse = { text: responseText };

    // Add buttons only for menu
    if (decision.action === "menu") {
      response.buttons = [
        { id: "account", title: "Account Info" },
        { id: "tunnels", title: "Active Tunnels" },
        { id: "domains", title: "Registered Domains" },
        { id: "help", title: "Help" },
      ];
    }

    await storeMessage(from, "bot", responseText);
    return response;
  }

  return { text: "Invalid state." };
}

async function handleConfirmation(
  phoneNumber: string,
  userInput: string,
  session: Record<string, string>
): Promise<MessageResponse> {
  const input = userInput.toLowerCase().trim();

  if (input.includes("yes") || input === "1") {
    await updateUserSession(phoneNumber, "state", "awaiting_otp");
    return {
      text: `OTP sent to ${session.email}. Enter the code.`,
    };
  }

  if (input.includes("no") || input === "2") {
    await updateUserSession(phoneNumber, "state", "awaiting_email");
    return {
      text: "Cancelled. Enter your email.",
    };
  }

  return {
    text: "Reply with 'Yes' or 'No'.",
  };
}
