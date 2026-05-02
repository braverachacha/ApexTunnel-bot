// WhatsApp message from Twilio
export interface IncomingMessage {
  from: string;
  body: string;
  messageId: string;
  timestamp: string;
  platform: "whatsapp" | "telegram";
}

// User session state in Redis
export interface UserSession {
  email?: string;
  verified?: string;
  state?: "awaiting_email" | "awaiting_confirmation" | "awaiting_otp" | "verified";
  otp_attempts?: string;
  created_at?: string;
  last_activity?: string;
}

// Button structure for WhatsApp
export interface Button {
  id: string;
  title: string;
}

// Message response
export interface MessageResponse {
  text: string;
  buttons?: Button[];
}

// API Response types
export interface RegisterResponse {
  message: string;
  isExistingUser: boolean;
}

export interface VerifyOTPResponse {
  message: string;
  accessToken: string;
  apexToken: string;
}

export interface UserInfoResponse {
  message: string;
  userInfo: {
    email: string;
    joined_at: string;
    verified: boolean;
    token: string;
  };
}

export interface APIError {
  message: string;
  status: number;
}