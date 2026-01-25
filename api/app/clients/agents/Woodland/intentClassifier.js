const initializeFunctionsAgent = require('../Functions/initializeFunctionsAgent');

const CLASSIFIER_INSTRUCTIONS = `You are the Woodland Intent Classifier. Analyze the user's request and classify it into ONE primary domain with confidence scoring.

DOMAIN DEFINITIONS:
- **sales**: Price comparisons, bundles, promotions, upgrade decisions, "which model should I buy"
- **parts**: Specific SKU lookup, replacement parts, kits, hardware, impellers, "I need part X"
- **support**: How-to guides, policies, warranty claims, shipping questions, troubleshooting, procedures
- **tractor_fitment**: Compatibility requiring tractor specs (make/model/deck width/year), hitch/hose/MDA questions
- **cases**: Explicit requests to review support case/ticket history, "what happened with case #123"
- **service**: Service center location, find technician, in-person repair, "where's the nearest dealer"

CONFIDENCE SCORING (CRITICAL):
- **0.9-1.0 (High)**: Question explicitly matches one domain with clear keywords (e.g., "What's the price" = sales)
- **0.7-0.89 (Medium)**: Question likely matches domain but could overlap (e.g., "best rake for my tractor" = sales + tractor_fitment)
- **0.5-0.69 (Low)**: Ambiguous or missing context; requires clarification before routing
- **<0.5 (Very Low)**: Unclear intent; MUST provide clarifying_question

MISSING ANCHORS DETECTION:
Identify SPECIFIC missing data required to answer accurately:
- For product identification: "Cyclone Rake model" (if unknown: bag color, bag shape, engine model, blower housing specs)
- For tractor fitment: "tractor make", "tractor model", "deck width", "Cyclone Rake model"
- For service locator: "ZIP code" or "postal code"
- For parts: "Cyclone Rake model", "part type" (if vague request like "I need a part")

Return strict JSON only:
{
  "primary_intent": "sales | parts | support | tractor_fitment | cases | service",
  "secondary_intents": ["parts"],
  "confidence": 0.87,
  "missing_anchors": [
    {"key": "tractor make", "type": "text", "label": "Tractor Brand"},
    {"key": "deck width", "type": "select", "options": ["32", "42", "48", "54", "60"], "label": "Deck Size (Inches)"}
  ],
  "clarifying_question": "To recommend the right adapter, I need your tractor's make, model, and deck width. What tractor are you using?"
}

VALIDATION RULES:
- If confidence < 0.7, ALWAYS provide clarifying_question
- If missing_anchors detected, ALWAYS provide clarifying_question asking for those specific items
- If question is complete and clear (confidence >= 0.8), set clarifying_question to null
- Choose primary_intent as the domain that should answer FIRST (e.g., product ID before part lookup)`;

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

module.exports = async function createIntentClassifier(params) {
  const { model, pastMessages, currentDateString, ...rest } = params;
  const classifier = await initializeFunctionsAgent({
    tools: [],
    model,
    pastMessages,
    currentDateString,
    customName: 'IntentClassifier',
    customInstructions: CLASSIFIER_INSTRUCTIONS,
    ...rest,
  });

  return {
    async classify(text) {
      if (!text) {
        return null;
      }

      try {
        const response = await classifier.invoke({ input: text });
        const raw = response?.output ?? response;
        if (typeof raw === 'string') {
          return safeParse(raw);
        }
        if (raw && typeof raw.output === 'string') {
          return safeParse(raw.output);
        }
      } catch (error) {
        // swallow classification errors; supervisor will fall back to default behavior
      }
      return null;
    },
  };
};
