export function getOpenRouterConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY
  const model = process.env.ASPEN_AI_MODEL || "deepseek/deepseek-chat"

  if (!apiKey) {
    throw new Error(
      "Missing OPENROUTER_API_KEY. Set it in your .env.local file."
    )
  }

  return { apiKey, model }
}

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

export const SUPPORTED_MODELS = [
  "deepseek/deepseek-chat",
  "qwen/qwen2.5-72b-instruct",
  "kimi/kimi-vl-2025",
] as const

export type SupportedModel = (typeof SUPPORTED_MODELS)[number]
