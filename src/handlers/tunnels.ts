import { MessageResponse } from "../utils/types";

export async function handleTunnels(
  phoneNumber: string,
  session: Record<string, string>
): Promise<MessageResponse> {
  // TODO: Fetch from ApexTunnel API
  return {
    text: "You have 0 active tunnels.",
  };
}
