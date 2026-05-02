import { registerWithEmail, verifyOTPCode } from "./api";
import { updateUserSession } from "./session";

export interface FunctionCall {
  name: string;
  params: Record<string, any>;
}

export async function executeFunction(
  call: FunctionCall,
  phoneNumber: string,
  session: Record<string, string>
): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    switch (call.name) {
      case "resend_otp":
        return await resendOTP(session.email as string);

      case "change_email":
        return await changeEmail(phoneNumber);

      case "register_email":
        return await registerNewEmail(call.params.email);

      case "verify_otp":
        return await verifyOTP(session.email as string, call.params.otp);

      case "get_account_info":
        return { success: true, message: "Fetching account info...", data: session };

      case "get_tunnels":
        return { success: true, message: "Fetching tunnels..." };

      case "get_domains":
        return { success: true, message: "Fetching domains..." };

      default:
        return { success: false, message: "Unknown function" };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Function execution failed",
    };
  }
}

async function resendOTP(email: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const result = await registerWithEmail(email);
    return {
      success: result.success,
      message: result.success
        ? `OTP re-sent to ${email}`
        : "Failed to resend OTP",
    };
  } catch (error) {
    return { success: false, message: "Failed to resend OTP" };
  }
}

async function changeEmail(phoneNumber: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    // Reset state to awaiting_email
    await updateUserSession(phoneNumber, "state", "awaiting_email");

    return {
      success: true,
      message: "Please enter your new email address.",
    };
  } catch (error) {
    return { success: false, message: "Failed to change email" };
  }
}

async function registerNewEmail(email: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const result = await registerWithEmail(email);
    return {
      success: result.success,
      message: result.message,
    };
  } catch (error) {
    return { success: false, message: "Registration failed" };
  }
}

async function verifyOTP(email: string, otp: string): Promise<{
  success: boolean;
  message: string;
  data?: any;
}> {
  try {
    const result = await verifyOTPCode(email, otp);
    return {
      success: result.success,
      message: result.message,
      data: result.success
        ? { accessToken: result.accessToken, apexToken: result.apexToken }
        : undefined,
    };
  } catch (error) {
    return { success: false, message: "OTP verification failed" };
  }
}
