import { IncomingMessage, MessageResponse } from "./utils/types";
import { getUserSession, setUserSession, updateUserSession } from "./services/session";
import { storeMessage } from "./services/memory";
import { interpretIntent } from "./services/intent-engine";
import { executeFunction } from "./services/function-executor";
import { generateActionResponse } from "./services/response-generator";
import {
  handleAuthFlow,
  handleOTPVerification,
  displayUserInfo,
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
    // Check if user wants to change email
    const intent = await interpretIntent(body);

    if (intent.function === "change_email" && intent.confidence > 0.7) {
      const result = await executeFunction(
        { name: "change_email", params: {} },
        from,
        session!
      );
      
      // Refresh session after state change
      session = await getUserSession(from);
      
      const response: MessageResponse = {
        text: result.message,
      };
      await storeMessage(from, "bot", response.text);
      return response;
    }

    // Check if user wants to resend OTP
    if (intent.function === "resend_otp" && intent.confidence > 0.7) {
      const result = await executeFunction(
        { name: "resend_otp", params: {} },
        from,
        session!
      );
      const response: MessageResponse = {
        text: result.message,
        buttons: [
          { id: "resend_otp", title: "Resend OTP" },
          { id: "change_email", title: "Change Email" },
        ],
      };
      await storeMessage(from, "bot", response.text);
      return response;
    }

    // Otherwise, handle OTP verification
    const response = await handleOTPVerification(from, body, session!);
    response.buttons = [
      { id: "resend_otp", title: "Resend OTP" },
      { id: "change_email", title: "Change Email" },
    ];
    await storeMessage(from, "bot", response.text);
    return response;
  }

  if (currentState === "verified") {
    const intent = await interpretIntent(body);

    const funcResult = await executeFunction(
      { name: intent.function, params: intent.params },
      from,
      session!
    );

    const responseText = await generateActionResponse(intent.function, {
      success: funcResult.success,
      message: funcResult.message,
      ...funcResult.data,
    });

    const response: MessageResponse = { text: responseText };
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
      buttons: [
        { id: "resend_otp", title: "Resend OTP" },
        { id: "change_email", title: "Change Email" },
      ],
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
