/**
 * Procedural Safety Classification
 * Determines customer-safe vs technician-only procedures.
 */
const CUSTOMER_SAFE_PROCEDURES = {
  bag_replacement: {
    keywords: ['bag', 'collector bag', 'replace bag', 'install bag'],
    safety_level: 'customer_safe',
    max_complexity: 3,
    tools_required: ['none'],
    description: 'Replacing collector bag assembly',
  },
  wheel_installation: {
    keywords: ['wheel', 'install wheels', 'attach wheels'],
    safety_level: 'customer_safe',
    max_complexity: 4,
    tools_required: ['wrench', 'socket set'],
    description: 'Installing wheel assemblies',
  },
  filter_replacement: {
    keywords: ['filter', 'air filter', 'replace filter'],
    safety_level: 'customer_safe',
    max_complexity: 2,
    tools_required: ['none'],
    description: 'Replacing air filter',
  },
  basic_cleaning: {
    keywords: ['clean', 'wash', 'debris removal'],
    safety_level: 'customer_safe',
    max_complexity: 2,
    tools_required: ['hose', 'brush'],
    description: 'Basic cleaning and maintenance',
  },
  belt_tension_check: {
    keywords: ['belt tension', 'check belt', 'belt alignment'],
    safety_level: 'customer_safe',
    max_complexity: 3,
    tools_required: ['none'],
    description: 'Visual belt inspection (no adjustment)',
  },
};

const TECHNICIAN_ONLY_PROCEDURES = {
  housing_removal: {
    keywords: ['remove housing', 'blower housing', 'housing disassembly', 'take apart housing'],
    safety_level: 'technician_only',
    risk_factors: ['rotating_parts', 'spring_tension', 'reassembly_complexity'],
    escalation_required: true,
    description: 'Removing or disassembling blower housing',
  },
  impeller_replacement: {
    keywords: ['replace impeller', 'impeller removal', 'install impeller', 'impeller swap'],
    safety_level: 'technician_only',
    risk_factors: ['housing_access', 'spring_mechanism', 'balance_critical'],
    escalation_required: true,
    description: 'Replacing impeller assembly (requires housing removal)',
  },
  engine_work: {
    keywords: ['engine repair', 'engine swap', 'carburetor', 'engine rebuild'],
    safety_level: 'technician_only',
    risk_factors: ['fuel_system', 'electrical', 'warranty_void'],
    escalation_required: true,
    description: 'Engine repair or replacement',
  },
  chassis_modification: {
    keywords: ['drill', 'cut', 'weld', 'modify frame', 'chassis alteration'],
    safety_level: 'technician_only',
    risk_factors: ['structural_integrity', 'warranty_void', 'safety_critical'],
    escalation_required: true,
    description: 'Structural modifications to chassis',
  },
  electrical_repair: {
    keywords: ['wiring', 'electrical', 'circuit', 'solenoid replacement'],
    safety_level: 'technician_only',
    risk_factors: ['shock_hazard', 'fire_risk', 'warranty_void'],
    escalation_required: true,
    description: 'Electrical system repair',
  },
};

function classifyProcedure(query) {
  const lowerQuery = String(query || '').toLowerCase();
  for (const [id, cfg] of Object.entries(TECHNICIAN_ONLY_PROCEDURES)) {
    if (cfg.keywords.some((kw) => lowerQuery.includes(kw.toLowerCase()))) {
      return {
        procedure_id: id,
        safety_level: 'technician_only',
        escalation_required: true,
        risk_factors: cfg.risk_factors,
        description: cfg.description,
        customer_safe: false,
      };
    }
  }
  for (const [id, cfg] of Object.entries(CUSTOMER_SAFE_PROCEDURES)) {
    if (cfg.keywords.some((kw) => lowerQuery.includes(kw.toLowerCase()))) {
      return {
        procedure_id: id,
        safety_level: 'customer_safe',
        escalation_required: false,
        max_complexity: cfg.max_complexity,
        tools_required: cfg.tools_required,
        description: cfg.description,
        customer_safe: true,
      };
    }
  }
  return {
    procedure_id: 'unknown',
    safety_level: 'unknown',
    escalation_required: false,
    customer_safe: null,
    description: 'Procedure classification unknown',
  };
}

function validateResponseSafety(responseText, originalQuery) {
  const classification = classifyProcedure(originalQuery);
  const responseLower = String(responseText || '').toLowerCase();
  const warnings = [];
  if (classification.safety_level === 'technician_only') {
    if (
      !responseLower.includes('technician') &&
      !responseLower.includes('service center') &&
      !responseLower.includes('professional')
    ) {
      warnings.push({
        severity: 'critical',
        message:
          'Response may contain customer-unsafe instructions for technician-only procedure',
        procedure: classification.description,
        risk_factors: classification.risk_factors,
      });
    }
  }
  const housingRemovalTerms = ['remove housing', 'take apart', 'disassemble housing'];
  if (
    housingRemovalTerms.some((t) => responseLower.includes(t)) &&
    classification.safety_level !== 'technician_only'
  ) {
    warnings.push({
      severity: 'critical',
      message: 'Response contains housing removal instructions without proper escalation',
      suggested_action:
        'Replace with: "This requires housing removal - contact service center"',
    });
  }
  return {
    is_safe: warnings.filter((w) => w.severity === 'critical').length === 0,
    classification,
    warnings,
    requires_escalation: classification.escalation_required,
  };
}

module.exports = {
  CUSTOMER_SAFE_PROCEDURES,
  TECHNICIAN_ONLY_PROCEDURES,
  classifyProcedure,
  validateResponseSafety,
};
