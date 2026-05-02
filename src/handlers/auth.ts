import { MessageResponse, UserSession } from "../utils/types";
import {
  setUserSession,
  updateUserSession,
  getUserSession,
} from "../services/session";
import { validateEmail, validateOTP } from "../utils/validator";
import {
  registerWithEmail,
  verifyOTPCode,
  getUserInfo,
} from "../services/api";

/**
 * Handle email entry
 * User provides email → validate → call API to register/check email
 */
export async function handleAuthFlow(
  phoneNumber: string,
  email: string,
  session: Record<string, string>
): Promise<MessageResponse> {
  // Validate email format
  if (!validateEmail(email)) {
    return {
      text: "Invalid email format. Please enter a valid email address.",
    };
  }

  // Call ApexTunnel API to register email and send OTP
  const registerResult = await registerWithEmail(email);

  if (!registerResult.success) {
    return {
      text: `Error: ${registerResult.message}. Please try again.`,
    };
  }

  // Store email and state in Redis
  await setUserSession(phoneNumber, {
    email: email,
    state: "awaiting_confirmation",
    created_at: new Date().toISOString(),
  });

  // If existing user, go straight to OTP verification
  if (registerResult.isExistingUser) {
    await updateUserSession(phoneNumber, "state", "awaiting_otp");
    return {
      text: `OTP sent to ${email}. Enter the code from your email.`,
    };
  }

  // New user, ask for confirmation
  return {
    text: `Register account with ${email}?`,
    buttons: [
      { id: "register", title: "Register Me" },
      { id: "cancel", title: "Cancel" },
    ],
  };
}

/**
 * Handle OTP code verification
 * User provides OTP → validate → call API to verify
 */
export async function handleOTPVerification(
  phoneNumber: string,
  otp: string,
  session: Record<string, string>
): Promise<MessageResponse> {
  const email = session.email as string;

  // Validate OTP format (6 digits)
  if (!validateOTP(otp)) {
    return {
      text: "Invalid OTP format. Please enter a 6-digit code.",
    };
  }

  // Call ApexTunnel API to verify OTP
  const verifyResult = await verifyOTPCode(email, otp);

  if (!verifyResult.success) {
    return {
      text: `Error: ${verifyResult.message}`,
    };
  }

  // OTP verified! Store tokens in Redis
  await setUserSession(phoneNumber, {
    email: email,
    state: "verified",
    accessToken: verifyResult.accessToken || "",
    apexToken: verifyResult.apexToken || "",
    verified: "true",
    verified_at: new Date().toISOString(),
  });

  // Show welcome message with main menu
  return {
    text: `Welcome! Account verified. What would you like to do?`,
    buttons: [
      { id: "account_info", title: "Account Info" },
      { id: "tunnels", title: "Active Tunnels" },
      { id: "domains", title: "Registered Domains" },
      { id: "help", title: "Help" },
    ],
  };
}

/**
 * Fetch and display user account info
 */
export async function displayUserInfo(
  phoneNumber: string,
  session: Record<string, string>
): Promise<MessageResponse> {
  const accessToken = session.accessToken as string;

  if (!accessToken) {
    return {
      text: "Session invalid. Please start over.",
    };
  }

  // Call ApexTunnel API to get user info
  const userInfoResult = await getUserInfo(accessToken);

  if (!userInfoResult.success) {
    return {
      text: `Error: ${userInfoResult.message}`,
    };
  }

  const info = userInfoResult.userInfo;
  const joinedDate = info
    ? new Date(info.joined_at).toLocaleDateString()
    : "N/A";

  return {
    text: `Account Info\n\nEmail: ${info?.email}\nJoined: ${joinedDate}\nVerified: ${info?.verified ? "Yes" : "No"}\nStatus: Active`,
  };
}
