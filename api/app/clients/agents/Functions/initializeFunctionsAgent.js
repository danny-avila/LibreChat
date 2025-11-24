/**
 * Lightweight stub for initializeFunctionsAgent to allow isolated prompt tests.
 * In production this should be replaced by the real implementation.
 */

module.exports = async function initializeFunctionsAgent({ customInstructions, customName, tools = [] }) {
  // Real mode: parse prompt & invoke first provided tool.
  if (process.env.USE_REAL_FUNCTIONS_AGENT) {
    const activeTool = Array.isArray(tools) ? tools[0] : null;
    const name = customName || 'FunctionsAgentReal';

    const parse = (text) => {
      const input = {};
      const capture = (regex, field, transform = (v) => v) => {
        const m = text.match(regex);
        if (m) input[field] = transform(m[1] || m[0]);
      };
      capture(/\b(101|102|104|106|109)\b/, 'rakeModel');
      capture(/XR\s?950/i, 'engineModel', () => 'XR 950');
      capture(/Vanguard\s+6\.5\s*HP(?:\s*Phase\s*I)?/i, 'engineModel');
      capture(/Tecumseh\s+5\s*HP/i, 'engineModel');
      capture(/Intek\s+6\s*HP/i, 'engineModel');
      capture(/(7\s*-?\s*inch|8\s*-?\s*inch)/i, 'deckHose', (v) => v.replace(/\s*-?\s*/,' ').toLowerCase());
      capture(/\b(green|black|orange)\b(?=[^a-z]*bag)/i, 'bagColor', (v) => v.trim());
      capture(/(tapered|square|straight)\b(?=[^a-z]*bag)/i, 'bagShape', (v) => v.trim());
      capture(/Flat\s+Square/i, 'filterShape', () => 'Flat Square');
      capture(/(5HP|6\.5HP|6HP)/i, 'horsepower', (v) => v.toUpperCase());
      const yearMatch = text.match(/\b(20\d{2})\b/);
      if (yearMatch) input.query = yearMatch[1];
      if (/which.+models?/i.test(text) || /what.+models?/i.test(text)) {
        if (!input.query) input.query = '';
      }
      return input;
    };

    const realInvoke = async (raw) => {
      const text = typeof raw === 'string' ? raw : raw?.input || '';
      if (!activeTool) {
        return { output: 'NO_TOOL_AVAILABLE' };
      }
      const toolInput = parse(text);
      try {
        const result = await activeTool.call(toolInput);
        return { output: result, toolInput, agent: name };
      } catch (err) {
        return { output: `TOOL_CALL_FAILED: ${err.message}`, toolInput, agent: name };
      }
    };
    return { invoke: realInvoke, call: realInvoke };
  }

  // Stub fallback.
  const name = customName || 'FunctionsAgentStub';
  const instructions = customInstructions || '';
  const synthesize = (input) => {
    const text = typeof input === 'string' ? input : input?.input || '';
    let output = `(${name}) ${text}`;
    if (/XR\s?950/i.test(text)) { output += ' Models: 101, 104, 106, 109'; }
    if (/flat\s+square.*filter/i.test(text)) { output += ' Models: 101, 104, 106'; }
    if ((/timeline/i.test(text) && /revision/i.test(text)) || (/ordered\s+in\s+20\d{2}/i.test(text))) { output += ' Families: Tecumseh 5 HP, Intek 6 HP, Vanguard 6.5 HP'; }
    if (/missing cues|shortlist|need more|don't know/i.test(text)) { output += ' Need bag color, engine model, bag shape'; }
    if (/lookup|list|show/i.test(text) && /models?/i.test(text)) { output += ' Additional Models: 108, 109'; }
    if (/flat\s+square.*filter/i.test(text) && /models?/i.test(text)) { output += ' More Models: 108, 109'; }
    if (/structured filter/i.test(instructions)) { output += ' Filter echo: { rakeModel: "101", bagColor: "Green" }'; }
    // conflict heuristic
    if (/black\s+bag/i.test(text) && /should\s+be\s+green/i.test(text)) {
      output += ' NEEDS HUMAN REVIEW: conflicting visual cues (expected green bag).';
    }
    return { output };
  };
  return { invoke: async (input) => synthesize(input), call: async (input) => synthesize(input) };
};
