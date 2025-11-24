#!/usr/bin/env node
/**
 * buildWoodlandQAScenarios.js
 * Parses the Sample Airtable QA CSV and derives structured test scenarios with heuristic classification.
 * Run: node scripts/qa/buildWoodlandQAScenarios.js [--out tests/agents/woodland/generated/qa_scenarios.json]
 */

const fs = require('fs');
const path = require('path');

const SOURCE_CSV = path.resolve(__dirname, '../Sample Airtable Data - QA.csv');
const DEFAULT_OUT = path.resolve(process.cwd(), 'tests/agents/woodland/generated/qa_scenarios.json');

// Regex patterns
const SKU_REGEX = /\b\d{2}-\d{2}-\d{3,4}[A-Z]?\b/g; // Basic Cyclone Rake SKU pattern
const MODEL_ALIAS_REGEX = /(101|102|103|104|105|106|107|109|110|111|112)/;
const TECHNICIAN_ONLY_REGEX = /(remove.*housing|rebuild|carburetor|impeller replacement|replace.*impeller|install.*impeller|drill|modify frame|electrical repair|engine swap|engine work|wiring|circuit|solenoid)/i;
const HITCH_RELEVANT_TERMS = /(chassis|wheel|deck|hitch|side tubes|fork|axle|mount)/i;
const FITMENT_QUERY_REGEX = /(connect|hook up|compatible|finishing mower|articulating|electric mower|ventrac)/i;
const POLICY_DENIAL_REGEX = /(convert.*commercial pro bag|use third[- ]party parts|honda engine)/i;
const DIMENSION_QUERY_REGEX = /(tongue weight|decibel|inner diameter|outer diameter|dimensions|width)/i;
const MULTI_OPTION_HINT = /(upgrade kit|two compatible|two options|both will work|you have two)/i;

// Canonical model map
const MODEL_CANONICAL = {
  '101': 'classic',
  '102': 'commercial',
  '103': 'pro',
  '104': 'commercial_pro',
  '105': 'classic',
  '106': 'commander_pro',
  '107': 'commercial_pro_jetpath',
  '109': 'commander',
  '110': 'commercial_pro',
  '111': 'xl',
  '112': 'z10',
};

function readCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  // Handle potential CRLF
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headerLine = lines.shift();
  const headers = headerLine.split(',').map((h) => h.trim());
  return lines.map((line) => {
    // Naive CSV split (no quoted commas beyond sample context). If complexity arises, replace with proper parser.
    const cols = line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => (row[h] = cols[i] || ''));
    return row;
  });
}

function extractSkus(text) {
  if (!text) return [];
  const matches = text.match(SKU_REGEX);
  return matches ? Array.from(new Set(matches)) : [];
}

function canonicalizeModel(modelField) {
  if (!modelField) return undefined;
  const match = modelField.match(MODEL_ALIAS_REGEX);
  if (match) {
    const num = match[1];
    return MODEL_CANONICAL[num] || num;
  }
  // Fallback lowercasing cleanup
  return modelField.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
}

function classifyPrimaryAgent(question, answer, component, model) {
  if (TECHNICIAN_ONLY_REGEX.test(question)) return 'CyclopediaSupportAgent';
  if (FITMENT_QUERY_REGEX.test(question)) return 'TractorFitmentAgent';
  if (POLICY_DENIAL_REGEX.test(question)) return 'CatalogPartsAgent';
  if (DIMENSION_QUERY_REGEX.test(question)) return 'CyclopediaSupportAgent';
  if (/warranty|fuel|decibel|tongue weight|dust|battery|hour meter/i.test(question)) return 'CyclopediaSupportAgent';
  if (/part number|replacement|upgrade|impeller|engine|chassis|bag|blow(er)?/i.test(question)) return 'CatalogPartsAgent';
  return 'CyclopediaSupportAgent';
}

function deriveScenario(row) {
  const id = row['Question ID'] || row['ID'];
  const question = row['Question'] || '';
  const answer = row['Answer'] || '';
  const model = row['Model'] || '';
  const component = row['Component'] || row['Component Description'] || '';
  const docUrl = row['Doc360 URL'] || '';

  const skus = Array.from(new Set([...extractSkus(question), ...extractSkus(answer)]));
  const canonicalModel = canonicalizeModel(model);
  const technicianOnly = TECHNICIAN_ONLY_REGEX.test(question);
  const hitchRelevant = HITCH_RELEVANT_TERMS.test(component) || HITCH_RELEVANT_TERMS.test(question);
  const fitmentQuery = FITMENT_QUERY_REGEX.test(question);
  const policyDenial = POLICIES.questionDenial(question);
  const dimensionQuery = DIMENSION_QUERY_REGEX.test(question);
  const multiOption = MULTI_OPTION_HINT.test(answer) || skus.length > 1;
  const criticalPart = /impeller|engine|blower|chassis/i.test(component + question);

  return {
    id,
    question,
    component,
    model_raw: model,
    model_canonical: canonicalModel,
    answer_excerpt: answer.slice(0, 300),
    doc_url: docUrl || undefined,
    skus,
    flags: {
      technician_only: technicianOnly,
      hitch_relevant: hitchRelevant,
      fitment_query: fitmentQuery,
      policy_denial_intent: policyDenial,
      dimension_query: dimensionQuery,
      multi_option: multiOption,
      critical_part: criticalPart,
    },
    expected: {
      primary_agent: classifyPrimaryAgent(question, answer, component, canonicalModel),
      should_escalate: technicianOnly || false,
      should_not_ask_hitch: !hitchRelevant && /impeller|engine|bag|filter/i.test(question + component),
      citation_required: !!docUrl,
      sku_required: skus.length > 0 && /part number|replacement|impeller|engine|chassis|bag/i.test(question),
    },
  };
}

const POLICIES = {
  questionDenial(q) {
    return POLY_DENIAL_TERMS.some((r) => r.test(q));
  },
};
const POLY_DENIAL_TERMS = [
  /convert.*commercial pro bag/i,
  /use third[- ]party parts/i,
  /honda engine/i,
];

function buildScenarios(rows) {
  return rows.map(deriveScenario);
}

function writeOut(filePath, scenarios) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(scenarios, null, 2), 'utf8');
}

function main() {
  const outIndex = process.argv.indexOf('--out');
  const outFile = outIndex !== -1 ? path.resolve(process.argv[outIndex + 1]) : DEFAULT_OUT;
  if (!fs.existsSync(SOURCE_CSV)) {
    console.error('Source CSV not found:', SOURCE_CSV);
    process.exit(1);
  }
  const rows = readCsv(SOURCE_CSV);
  const scenarios = buildScenarios(rows);
  writeOut(outFile, scenarios);
  console.log(`Generated ${scenarios.length} QA scenarios -> ${outFile}`);
  // Basic summary stats
  const summary = scenarios.reduce(
    (acc, s) => {
      acc.primary_agent[s.expected.primary_agent] = (acc.primary_agent[s.expected.primary_agent] || 0) + 1;
      if (s.flags.critical_part) acc.critical_parts += 1;
      if (s.flags.technician_only) acc.technician_only += 1;
      if (s.flags.hitch_relevant) acc.hitch_relevant += 1;
      return acc;
    },
    { primary_agent: {}, critical_parts: 0, technician_only: 0, hitch_relevant: 0 },
  );
  console.log('Summary:', JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  readCsv,
  buildScenarios,
  deriveScenario,
  classifyPrimaryAgent,
  extractSkus,
};
