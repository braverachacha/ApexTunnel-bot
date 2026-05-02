import { MessageResponse } from "../utils/types";
import { generateResponse } from "../services/ai";

export async function handleTunnels(
  phoneNumber: string,
  session: Record<string, string>
): Promise<MessageResponse> {
  const response = await generateResponse("User asked about their active tunnels. They have 0 active tunnels. Suggest they create one via the web dashboard and ask if they want the link.");

  return { text: response };
}
