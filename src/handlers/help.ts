import { MessageResponse } from "../utils/types";
import { generateResponse } from "../services/ai";

export async function handleHelp(): Promise<MessageResponse> {
  const response = await generateResponse("User asked for help. Briefly explain what ApexTunnel Bot can do: register accounts, check account info, view tunnels, manage domains.");

  return { text: response };
}
