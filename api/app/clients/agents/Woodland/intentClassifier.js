const { z } = require('zod');
const initializeFunctionsAgent = require('../Functions/initializeFunctionsAgent');

const CLASSIFIER_INSTRUCTIONS = `You are the Woodland Intent Classifier. Analyze the user's request using pattern matching and semantic understanding to classify into ONE primary domain with confidence scoring.

DOMAIN DEFINITIONS WITH PATTERNS:
- **parts**: Specific SKU lookup, replacement parts, kits, hardware, components, assemblies
  Patterns: "I need [part]", "replacement [component]", "part number", "SKU", "worn out", "broken", "damaged", "order [part]"
  Examples: "I need an impeller", "replacement hose for my Commander", "what's the SKU for washers"
  
- **sales**: Price comparisons, bundles, promotions, upgrade decisions, financing, discounts
  Patterns: "price", "cost", "how much", "promo", "sale", "discount", "financing", "payment plan", "senior discount"
  Examples: "How much is a Commander?", "Do you have any sales running?", "best time to buy"
  
- **support**: How-to guides, policies, warranty claims, shipping, troubleshooting, maintenance, installation
  Patterns: "how to", "instructions", "install", "setup", "troubleshoot", "won't work", "warranty", "shipping", "oil", "maintenance"
  Examples: "How do I install the top brace?", "Why won't my throttle stay open?", "shipping timeline"
  
- **tractor_fitment**: Compatibility requiring tractor specs (make/model/deck width/year), hitch/hose/MDA
  Patterns: "tractor", "mower", "John Deere", "Kubota", "deck width", "hitch", "MDA", "will it fit", "compatibility"
  Examples: "Will this work with my John Deere X350?", "What hitch do I need for 42 inch deck?"
  
- **product_history**: Model identification using physical attributes (bag color, shape, engine, blower)
  Patterns: "what model", "bag color", "tapered", "straight", "Tecumseh", "Vanguard", "yellow blower", "7 inch intake"
  Examples: "What model do I have with a green tapered bag?", "I have a Tecumseh 6 HP engine"
  
- **engine_history**: Engine specifications, filter types, horsepower, retrofit kits
  Patterns: "engine specs", "filter shape", "horsepower", "Tecumseh", "Vanguard", "air filter", "oil type"
  Examples: "What filter does my Tecumseh 5 HP use?", "Engine maintenance specs for Commander"
  
- **cases**: Explicit requests to review support case/ticket history
  Patterns: "case #", "ticket", "previous issue", "what happened with"
  Examples: "What happened with case #12345?"
  
- **service**: Service center location, find technician, in-person repair
  Patterns: "service center", "nearest dealer", "technician", "local repair", "ZIP code"
  Examples: "Where's the nearest service center?"

SAFETY OVERRIDE (HIGHEST PRIORITY):
If ANY of these patterns detected, OVERRIDE all other intents and set primary_intent="support" with safety_critical=true:
- Duct tape + throttle/governor/engine: "duct tape.*throttle", "wrap.*throttle", "tape.*governor"
- Engine modification: "modify engine", "remove governor", "bypass safety", "horsepower upgrade"
- Structural tampering: "remove safety", "disable"

LEGACY PRODUCT DETECTION:
If patterns detected, flag as legacy_product=true:
- Product names: "SPS-10", "SPS-5"
- Year ranges: 1990-2005, "before 2001", "pre-2001"
- Status queries: "still make", "discontinued", "no longer available"

CONFIDENCE SCORING (CRITICAL):
- **0.9-1.0 (High)**: Question explicitly matches one domain with clear keywords + all required anchors present
- **0.7-0.89 (Medium)**: Question likely matches domain but missing 1-2 anchors or could overlap domains
- **0.5-0.69 (Low)**: Ambiguous or missing multiple anchors; requires clarification before routing
- **<0.5 (Very Low)**: Unclear intent; MUST provide clarifying_question

MISSING ANCHORS DETECTION:
Identify SPECIFIC missing data required to answer accurately:
- For product identification: "Cyclone Rake model" (if unknown: bag color, bag shape, engine model, blower housing specs)
- For tractor fitment: "tractor make", "tractor model", "deck width", "Cyclone Rake model"
- For service locator: "ZIP code" or "postal code"
- For parts: "Cyclone Rake model", "part type" (if vague request like "I need a part")
- For engine specs: "Cyclone Rake model", "engine model/brand"

PATTERN MATCHING EXAMPLES:
Query: "I need an impeller for my Commercial Pro with Tecumseh Enduro 6 HP"
→ primary_intent: "parts" (patterns: "I need [part]", model stated, engine stated)
→ confidence: 0.95 (High - all anchors present)
→ missing_anchors: []

Query: "Motor throttle will not stay open after wrapping duct tape around the throttle"
→ primary_intent: "support" (SAFETY OVERRIDE: duct tape + throttle detected)
→ safety_critical: true
→ confidence: 1.0 (High - safety issue)

Query: "Do you still make the SPS-10 unit?"
→ primary_intent: "support" (patterns: "still make", "SPS-10")
→ legacy_product: true
→ confidence: 0.9 (High - clear legacy product query)

Query: "I need a part"
→ primary_intent: "parts" (pattern: "I need")
→ confidence: 0.5 (Low - missing part type and model)
→ missing_anchors: [{"key": "part type"}, {"key": "cyclone rake model"}]

Return strict JSON only:
{
  "primary_intent": "parts | sales | support | tractor_fitment | product_history | engine_history | cases | service",
  "secondary_intents": ["product_history"],
  "confidence": 0.87,
  "safety_critical": false,
  "legacy_product": false,
  "missing_anchors": [
    {"key": "tractor make", "type": "text", "label": "Tractor Brand"},
    {"key": "deck width", "type": "select", "options": ["32", "42", "48", "54", "60"], "label": "Deck Size (Inches)"}
  ],
  "clarifying_question": "To recommend the right adapter, I need your tractor's make, model, and deck width. What tractor are you using?"
}

VALIDATION RULES:
- If safety_critical=true, ALWAYS set primary_intent="support" and confidence=1.0
- If legacy_product=true, set confidence >= 0.85
- If confidence < 0.7, ALWAYS provide clarifying_question
- If missing_anchors detected, ALWAYS provide clarifying_question asking for those specific items
- If question is complete and clear (confidence >= 0.8), set clarifying_question to null
- Choose primary_intent as the domain that should answer FIRST (e.g., product_history before parts if model unknown)
- If parts requested BUT model not stated, set secondary_intents=["product_history"] for model identification first`;

function safeParse(text) {
  if (typeof text !== 'string') {
    return null;
  }
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch (error) {
    return null;
  }
}

const INTENT_VALUES = [
  'parts',
  'sales',
  'support',
  'tractor_fitment',
  'product_history',
  'engine_history',
  'cases',
  'service',
  'unknown',
];

const intentSchema = z.object({
  primary_intent: z.enum(INTENT_VALUES),
  secondary_intents: z.array(z.enum(INTENT_VALUES)).default([]),
  confidence: z.number().min(0).max(1),
  safety_critical: z.boolean().default(false),
  legacy_product: z.boolean().default(false),
  missing_anchors: z
    .array(
      z.object({
        key: z.string().min(1),
        type: z.string().optional(),
        label: z.string().optional(),
        options: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  clarifying_question: z.string().nullable().default(null),
});

const fallbackIntent = (text = '') => ({
  primary_intent: 'unknown',
  secondary_intents: [],
  confidence: 0.45,
  safety_critical: false,
  legacy_product: false,
  missing_anchors: [{ key: 'customer intent', label: 'Customer intent' }],
  clarifying_question:
    text && text.trim().length > 0
      ? 'Could you share whether you need parts, fitment, troubleshooting, or pricing help?'
      : 'Could you share what you need help with (parts, fitment, troubleshooting, or pricing)?',
});

function normalizeMissingAnchors(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => {
      if (typeof entry === 'string') {
        return { key: entry, label: entry };
      }
      if (entry && typeof entry === 'object') {
        const key = typeof entry.key === 'string' && entry.key.trim() ? entry.key.trim() : null;
        if (!key) {
          return null;
        }
        return {
          key,
          type: typeof entry.type === 'string' ? entry.type : undefined,
          label: typeof entry.label === 'string' ? entry.label : key,
          options: Array.isArray(entry.options)
            ? entry.options.map((opt) => String(opt)).filter(Boolean)
            : undefined,
        };
      }
      return null;
    })
    .filter(Boolean);
}

function enforceIntentRules(raw, inputText) {
  const normalized = {
    ...fallbackIntent(inputText),
    ...(raw && typeof raw === 'object' ? raw : {}),
  };

  const primaryIntent = INTENT_VALUES.includes(normalized.primary_intent)
    ? normalized.primary_intent
    : 'unknown';
  const secondaryIntents = Array.isArray(normalized.secondary_intents)
    ? normalized.secondary_intents.filter((intent) => INTENT_VALUES.includes(intent))
    : [];
  const numericConfidence = Number(normalized.confidence);
  const confidence = Number.isFinite(numericConfidence)
    ? Math.max(0, Math.min(1, numericConfidence))
    : fallbackIntent(inputText).confidence;

  const safetyCritical = Boolean(normalized.safety_critical);
  const legacyProduct = Boolean(normalized.legacy_product);
  const missingAnchors = normalizeMissingAnchors(normalized.missing_anchors);

  let clarifyingQuestion =
    typeof normalized.clarifying_question === 'string'
      ? normalized.clarifying_question.trim() || null
      : null;

  let effectivePrimary = primaryIntent;
  let effectiveConfidence = confidence;

  if (safetyCritical) {
    effectivePrimary = 'support';
    effectiveConfidence = 1;
  }

  if (legacyProduct && effectiveConfidence < 0.85) {
    effectiveConfidence = 0.85;
  }

  if ((effectiveConfidence < 0.7 || missingAnchors.length > 0) && !clarifyingQuestion) {
    clarifyingQuestion =
      missingAnchors.length > 0
        ? `To proceed, please provide: ${missingAnchors.map((a) => a.label || a.key).join(', ')}.`
        : 'Could you share a bit more detail so I can route this correctly?';
  }

  if (effectiveConfidence >= 0.8 && missingAnchors.length === 0) {
    clarifyingQuestion = null;
  }

  const candidate = {
    primary_intent: effectivePrimary,
    secondary_intents: secondaryIntents,
    confidence: Number(effectiveConfidence.toFixed(2)),
    safety_critical: safetyCritical,
    legacy_product: legacyProduct,
    missing_anchors: missingAnchors,
    clarifying_question: clarifyingQuestion,
  };

  const parsed = intentSchema.safeParse(candidate);
  return parsed.success ? parsed.data : fallbackIntent(inputText);
}

module.exports = async function createIntentClassifier(params = {}) {
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
        return fallbackIntent('');
      }

      try {
        const response = await classifier.invoke({ input: text });
        const raw = response?.output ?? response;
        if (typeof raw === 'string') {
          return enforceIntentRules(safeParse(raw), text);
        }
        if (raw && typeof raw.output === 'string') {
          return enforceIntentRules(safeParse(raw.output), text);
        }
      } catch (error) {
        // swallow classification errors; supervisor will fall back to default behavior
      }
      return fallbackIntent(text);
    },
  };
};
