import express, { Express, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import { initRedis } from "./services/session";
import { handleWebhook } from "./webhook";
import { handleTelegramWebhook } from "./telegram-webhook";

dotenv.config();

const app: Express = express();
const PORT: number = parseInt(process.env.PORT || "9000", 10);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/health", (req: Request, res: Response): void => {
  res.status(200).json({
    status: "ok",
    message: "ApexTunnel Bot is running",
    timestamp: new Date().toISOString(),
  });
});

// WhatsApp Webhook (legacy, keep for now)
app.post("/webhook", handleWebhook);
app.get("/webhook", (req: Request, res: Response): void => {
  const verifyToken: string = process.env.WEBHOOK_VERIFY_TOKEN || "";
  const token: string | undefined = req.query.hub_verify_token as string;
  const challenge: string | undefined = req.query.hub_challenge as string;

  if (token === verifyToken && challenge) {
    console.log("✓ Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.status(403).send("Forbidden");
  }
});

// Telegram Webhook
app.post("/telegram-webhook", handleTelegramWebhook);

// 404 handler
app.use((req: Request, res: Response): void => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction): void => {
  console.error("[Error]", err.message);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "production" ? undefined : err.message,
  });
});

async function start(): Promise<void> {
  try {
    await initRedis();
    console.log("✓ Redis connected");

    app.listen(PORT, (): void => {
      console.log(`✓ ApexTunnel Bot running on port ${PORT}`);
      console.log(`  Telegram: POST https://apextunnel-bot.apextunnel.top/telegram-webhook`);
      console.log(`  Health:   GET  http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("Failed to start:", error);
    process.exit(1);
  }
}

start();
