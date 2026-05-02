import { MessageResponse } from "../utils/types";

export async function handleHelp(): Promise<MessageResponse> {
  return {
    text: "ApexTunnel Bot Help\n\n1. Register: Create a new account\n2. Account: View your account info\n3. Tunnels: Manage your tunnels\n4. Domains: Manage your domains",
  };
}
