import { MessageResponse } from "../utils/types";
import { displayUserInfo } from "./auth";

export async function handleAccountInfo(
  phoneNumber: string,
  session: Record<string, string>
): Promise<MessageResponse> {
  return await displayUserInfo(phoneNumber, session);
}
