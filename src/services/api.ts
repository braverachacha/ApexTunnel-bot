import axios from "axios";
import {
  RegisterResponse,
  VerifyOTPResponse,
  UserInfoResponse,
  APIError,
} from "../utils/types";

const APEXTUNNEL_API_URL =
  process.env.APEXTUNNEL_API_URL || "https://apextunnel-api.vercel.app";

function handleAPIError(error: unknown): APIError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as any;
    return {
      message: axiosError.response?.data?.message || "An error occurred",
      status: axiosError.response?.status || 500,
    };
  }

  return {
    message: "Failed to connect to ApexTunnel API",
    status: 500,
  };
}

export async function registerWithEmail(email: string): Promise<{
  success: boolean;
  message: string;
  isExistingUser?: boolean;
  error?: string;
}> {
  try {
    console.log(`Calling API: POST /auth/register with email ${email}`);

    const response = await axios.post<RegisterResponse>(
      `${APEXTUNNEL_API_URL}/auth/register`,
      { email },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    console.log(`✓ Registration successful. Is existing user: ${response.data.isExistingUser}`);

    return {
      success: true,
      message: response.data.message,
      isExistingUser: response.data.isExistingUser,
    };
  } catch (error) {
    const apiError = handleAPIError(error);
    console.error(`✗ Registration error: ${apiError.message}`);

    return {
      success: false,
      message: apiError.message,
      error: apiError.message,
    };
  }
}

export async function verifyOTPCode(
  email: string,
  otp: string
): Promise<{
  success: boolean;
  message: string;
  accessToken?: string;
  apexToken?: string;
  error?: string;
}> {
  try {
    console.log(`Calling API: POST /auth/verify with email ${email}`);

    const response = await axios.post<VerifyOTPResponse>(
      `${APEXTUNNEL_API_URL}/auth/verify`,
      { email, otp },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    console.log("✓ OTP verified successfully");

    return {
      success: true,
      message: response.data.message,
      accessToken: response.data.accessToken,
      apexToken: response.data.apexToken,
    };
  } catch (error) {
    const apiError = handleAPIError(error);
    console.error(`✗ OTP verification error: ${apiError.message}`);

    return {
      success: false,
      message: apiError.message,
      error: apiError.message,
    };
  }
}

export async function getUserInfo(accessToken: string): Promise<{
  success: boolean;
  message: string;
  userInfo?: {
    email: string;
    joined_at: string;
    verified: boolean;
    token: string;
  };
  error?: string;
}> {
  try {
    console.log("Calling API: GET /user/me");

    const response = await axios.get<UserInfoResponse>(
      `${APEXTUNNEL_API_URL}/user/me`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    console.log("✓ User info fetched successfully");

    return {
      success: true,
      message: response.data.message,
      userInfo: response.data.userInfo,
    };
  } catch (error) {
    const apiError = handleAPIError(error);
    console.error(`✗ User info fetch error: ${apiError.message}`);

    return {
      success: false,
      message: apiError.message,
      error: apiError.message,
    };
  }
}

export async function checkEmailExists(email: string): Promise<boolean> {
  try {
    const result = await registerWithEmail(email);
    return result.isExistingUser === true;
  } catch {
    return false;
  }
}
