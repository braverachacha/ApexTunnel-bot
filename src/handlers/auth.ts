import { MessageResponse } from "../utils/types";
import {
  setUserSession,
  updateUserSession,
} from "../services/session";
import { validateEmail, validateOTP } from "../utils/validator";
import {
  registerWithEmail,
  verifyOTPCode,
  getUserInfo,
} from "../services/api";
import { generateResponse, generateMenuResponse } from "../services/ai";

export async function handleAuthFlow(
  phoneNumber: string,
  email: string,
  session: Record<string, string>
): Promise<MessageResponse> {
  if (!validateEmail(email)) {
    const response = await generateResponse("User provided invalid email format. Tell them politely to enter a valid email address.");
    return { text: response };
  }

  const registerResult = await registerWithEmail(email);

  if (!registerResult.success) {
    const response = await generateResponse(`Registration error: ${registerResult.message}. Ask user to try again.`);
    return { text: response };
  }

  await setUserSession(phoneNumber, {
    email: email,
    state: "awaiting_confirmation",
    created_at: new Date().toISOString(),
  });

  if (registerResult.isExistingUser) {
    await updateUserSession(phoneNumber, "state", "awaiting_otp");
    const response = await generateResponse(`OTP has been sent to ${email}. Ask user to enter the 6-digit code from their email.`);
    return { text: response };
  }

  const introText = await generateMenuResponse(
    `User wants to register with email ${email}. Confirm this is correct and ask if they want to proceed.`
  );

  return {
    text: introText,
    buttons: [
      { id: "register", title: "Register Me" },
      { id: "cancel", title: "Cancel" },
    ],
  };
}

export async function handleOTPVerification(
  phoneNumber: string,
  otp: string,
  session: Record<string, string>
): Promise<MessageResponse> {
  const email = session.email as string;

  if (!validateOTP(otp)) {
    const response = await generateResponse("User provided invalid OTP format. Tell them to enter a 6-digit code.");
    return { text: response };
  }

  const verifyResult = await verifyOTPCode(email, otp);

  if (!verifyResult.success) {
    const response = await generateResponse(`OTP verification failed: ${verifyResult.message}. Tell user to try again.`);
    return { text: response };
  }

  await setUserSession(phoneNumber, {
    email: email,
    state: "verified",
    accessToken: verifyResult.accessToken || "",
    apexToken: verifyResult.apexToken || "",
    verified: "true",
    verified_at: new Date().toISOString(),
  });

  const introText = await generateMenuResponse(
    "User's account has been verified successfully. Ask what they'd like to do: check account info, view tunnels, manage domains, or get help."
  );

  return {
    text: introText,
    buttons: [
      { id: "account_info", title: "Account Info" },
      { id: "tunnels", title: "Active Tunnels" },
      { id: "domains", title: "Registered Domains" },
      { id: "help", title: "Help" },
    ],
  };
}

export async function displayUserInfo(
  phoneNumber: string,
  session: Record<string, string>
): Promise<MessageResponse> {
  const accessToken = session.accessToken as string;

  if (!accessToken) {
    const response = await generateResponse("User's session has expired. Ask them to start over.");
    return { text: response };
  }

  const userInfoResult = await getUserInfo(accessToken);

  if (!userInfoResult.success) {
    const response = await generateResponse(`Failed to fetch user info: ${userInfoResult.message}. Tell user to try again.`);
    return { text: response };
  }

  const info = userInfoResult.userInfo;
  const joinedDate = info
    ? new Date(info.joined_at).toLocaleDateString()
    : "N/A";

  const context = `User's account info:
Email: ${info?.email}
Joined: ${joinedDate}
Verified: ${info?.verified ? "Yes" : "No"}
Status: Active

Present this information in a friendly way.`;

  const response = await generateResponse(context);

  return { text: response };
}
