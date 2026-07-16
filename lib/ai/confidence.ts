import type {
  ConfidenceLevel,
  ConfidenceResult,
  ContextPackage,
  IntentResult,
  UserContext,
} from "@/lib/ai/types"

/**
 * Confidence Engine. Estimates, internally, how much the assistant can trust
 * its answer before responding. If confidence is Low, the model is instructed
 * to say exactly what is missing rather than guess.
 *
 * Factors:
 *  - Intent classifier confidence
 *  - Was the referenced entity (project/member) resolved?
 *  - Was relevant context actually retrieved?
 *  - Are there explicit "missing" gaps flagged by the Context Builder?
 */
export function estimateConfidence(params: {
  intent: IntentResult
  userContext: UserContext
  contextPackage: ContextPackage
  entityResolved: boolean
}): ConfidenceResult {
  const { intent, userContext, contextPackage, entityResolved } = params
  const reasons: string[] = []

  let score = 0.5

  // Intent confidence
  if (intent.confidence >= 0.7) {
    score += 0.15
  } else if (intent.confidence < 0.4) {
    score -= 0.15
    reasons.push("Intent was ambiguous; please rephrase if I misunderstood.")
  }

  // Entity resolution
  const needsEntity = ["project_query", "member_query", "sprint_query"].includes(intent.intent)
  if (needsEntity && !entityResolved) {
    score -= 0.25
    reasons.push("The referenced project/person could not be uniquely identified.")
  } else if (needsEntity && entityResolved) {
    score += 0.1
  }

  // Context retrieved?
  const retrieved = contextPackage.sections.length > 0
  if (retrieved) {
    score += 0.1
  } else {
    score -= 0.1
    reasons.push("No matching records were found in the workspace.")
  }

  // Explicit gaps from the Context Builder
  if (contextPackage.missing.length > 0) {
    score -= 0.15 * contextPackage.missing.length
    for (const m of contextPackage.missing) {
      reasons.push(`Missing context: ${m}.`)
    }
  }

  // Permission limits
  if (contextPackage.limited) {
    score -= 0.1
    reasons.push("Some data was withheld by your role permissions.")
  }

  score = Math.max(0, Math.min(1, score))

  const level: ConfidenceLevel = score >= 0.7 ? "high" : score >= 0.45 ? "medium" : "low"

  if (level === "low" && reasons.length === 0) {
    reasons.push("I have low confidence in this answer; please confirm the details.")
  }

  return { level, score: Math.round(score * 100) / 100, reasons }
}

export function confidenceToText(c: ConfidenceResult): string {
  if (c.level === "low") {
    return (
      "⚠️ **Confidence: Low.** " +
      (c.reasons[0] ?? "I may be missing information.") +
      " I will not guess — please clarify."
    )
  }
  if (c.level === "medium") {
    return c.reasons.length
      ? `ℹ️ **Confidence: Medium.** ${c.reasons[0]}`
      : "ℹ️ **Confidence: Medium.**"
  }
  return ""
}
