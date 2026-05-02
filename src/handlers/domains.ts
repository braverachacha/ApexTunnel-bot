import { MessageResponse } from "../utils/types";
import { generateResponse } from "../services/ai";

export async function handleDomains(
  phoneNumber: string,
  session: Record<string, string>
): Promise<MessageResponse> {
  const response = await generateResponse("User asked about registered domains. They have 0 registered domains. Suggest they manage domains via the web dashboard.");

  return { text: response };
}
