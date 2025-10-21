const initializeFunctionsAgent = require('../Functions/initializeFunctionsAgent');

const CLASSIFIER_INSTRUCTIONS = `You are the Woodland Intent Classifier. Examine the user's most recent request and classify it into one primary domain:
- sales (comparisons, bundles, pricing, upgrade eligibility)
- parts (replacement SKUs, kits, hardware, impellers)
- support (policies, warranty, shipping, procedures, returns)
- tractor_fitment (compatibility questions requiring tractor make/model/engine/year)
- cases (explicit request to review or reference a support case/ticket)
- service (requests to locate service centers, technicians, or in-person assistance)

Return strict JSON only with this shape:
{
  "primary_intent": "sales | parts | support | tractor_fitment | cases | service",
  "secondary_intents": ["parts", "support"],
  "confidence": 0.87,
  "missing_anchors": ["tractor make", "engine size"],
  "clarifying_question": "Could you share your mower's make and engine size?" // or null if none needed
}

If the question spans multiple domains, choose the one that should answer first and list the others in secondary_intents.`;

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
