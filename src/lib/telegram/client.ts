// src/lib/telegram/client.ts
// Thin client for the Telegram Bot API (https://core.telegram.org/bots/api).
// No SDK dependency — it's a handful of plain HTTPS calls.

export type TelegramConfig = { botToken: string };

export function telegramConfigFromEnv(): TelegramConfig {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN environment variable.");
  }
  return { botToken };
}

export class TelegramError extends Error {
  errorCode?: number;
  constructor(message: string, errorCode?: number) {
    super(message);
    this.name = "TelegramError";
    this.errorCode = errorCode;
  }
}

type TelegramApiResponse<T> = { ok: boolean; result?: T; description?: string; error_code?: number };

async function callTelegramApi<T>(config: TelegramConfig, method: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json().catch(() => ({}))) as TelegramApiResponse<T>;
  if (!res.ok || !body.ok) {
    throw new TelegramError(body.description ?? `Telegram API call to ${method} failed (HTTP ${res.status}).`, body.error_code);
  }
  return body.result as T;
}

export type TelegramBotInfo = { id: number; is_bot: boolean; username: string; first_name: string };

export async function getBotInfo(config: TelegramConfig): Promise<TelegramBotInfo> {
  return callTelegramApi<TelegramBotInfo>(config, "getMe", {});
}

// The one-time deep link a recipient taps to link their account — resolving
// the bot's own username live (rather than trusting a client-supplied value)
// so this can't be spoofed into pointing at a different bot.
export async function buildRecipientLink(config: TelegramConfig, linkToken: string): Promise<string> {
  const bot = await getBotInfo(config);
  return `https://t.me/${bot.username}?start=${linkToken}`;
}

// parse_mode HTML lets reports use <b>/<i> for light formatting without
// needing to escape Markdown's special characters (terminal names, amounts).
export async function sendTelegramMessage(config: TelegramConfig, chatId: string, text: string): Promise<void> {
  await callTelegramApi(config, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
}

// sendDocument needs multipart/form-data (not JSON), so it bypasses
// callTelegramApi's JSON-only request path. Node's built-in fetch/FormData/
// Blob (global since Node 18) handle the multipart encoding — no extra
// dependency needed.
export async function sendTelegramDocument(
  config: TelegramConfig,
  chatId: string,
  buffer: Buffer,
  filename: string,
  mimeType: string = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  caption?: string
): Promise<void> {
  const form = new FormData();
  form.set("chat_id", chatId);
  if (caption) form.set("caption", caption);
  form.set("document", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

  const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendDocument`, {
    method: "POST",
    body: form,
  });
  const body = (await res.json().catch(() => ({}))) as TelegramApiResponse<unknown>;
  if (!res.ok || !body.ok) {
    throw new TelegramError(body.description ?? `Telegram sendDocument failed (HTTP ${res.status}).`, body.error_code);
  }
}

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    chat: { id: number };
    from?: { id: number; is_bot: boolean; first_name: string; username?: string };
  };
};

// Long-poll fallback for recipient linking — deliberately NOT a webhook, so
// this works identically in local dev and production without needing a
// public HTTPS URL. `offset` excludes every update up to and including the
// last one already processed (Telegram's own getUpdates semantics).
export async function getTelegramUpdates(config: TelegramConfig, offset?: number): Promise<TelegramUpdate[]> {
  return callTelegramApi<TelegramUpdate[]>(config, "getUpdates", {
    offset,
    timeout: 0,
    allowed_updates: ["message"],
  });
}
