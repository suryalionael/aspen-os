// Public surface for the Aspen AI Context Engine.
export { processAIRequest, getAspenAIModels, getAspenHomeDashboard } from "@/lib/ai/actions"

// Shared streaming orchestration (used by the Server Action collector and the
// /api/ai/ask SSE route).
export { streamAIRequest } from "@/lib/ai/engine"

// Context Engine (orchestrator) + legacy buildContext
export {
  createContextEngine,
  runContextEngine,
  buildContext,
} from "@/lib/ai/context"

// Intent Router
export { classifyIntent, isOwnerOrAdmin, roleLabel } from "@/lib/ai/intents"

// Smart Context Builder
export { buildContextPackage } from "@/lib/ai/context-builder"

// Prompt Builder + Response Formatter
export { buildSystemPrompt, buildUserMessage } from "@/lib/ai/prompt"
export { responseGuidanceFor, postProcessResponse } from "@/lib/ai/response"

// Personalization + permissions
export {
  resolveUserContext,
  hasPermission,
  memberById,
  memberEmailById,
} from "@/lib/ai/user-context"

// Tools (preserved + workspace memory)
export { AI_TOOLS, executeTool } from "@/lib/ai/tools"

// V2 — Agent-grade modules
export { parseTemporal, temporalToDateFilter } from "@/lib/ai/temporal"
export {
  contextLevelFor,
  sortTasksByPriority,
  taskPriorityTier,
  MAX_TOKENS_BY_LEVEL,
} from "@/lib/ai/priority"
export { buildWorkspaceGraph } from "@/lib/ai/graph"
export { detectInsights } from "@/lib/ai/predictive"
export { estimateConfidence, confidenceToText } from "@/lib/ai/confidence"
export { buildPlan, planToPrompt } from "@/lib/ai/planner"
export {
  loadWorkspaceMemory,
  saveWorkspaceMemory,
  memoryToPrompt,
  hasWorkspaceMemory,
} from "@/lib/ai/workspace-memory"
export {
  RESPONSE_FORMATTER_V2,
  EXPLAINABILITY_GUIDANCE,
  insightsToRisksMarkdown,
  extractActionHints,
  buildEvidenceBlock,
} from "@/lib/ai/response"

// Provider config
export { getOpenRouterConfig, SUPPORTED_MODELS } from "@/lib/ai/config"

// Types
export type {
  AIMessage,
  AIToolCall,
  AIStreamChunk,
  AITool,
  AIRequest,
  AspenRequest,
  AIContext,
  OpenRouterRequest,
  OpenRouterResponse,
  AspenRole,
  AspenPermission,
  AspenMember,
  AspenProjectRef,
  SelectedObject,
  UserContext,
  Intent,
  IntentEntities,
  IntentResult,
  ContextSection,
  ContextPackage,
  EngineResult,
} from "@/lib/ai/types"
