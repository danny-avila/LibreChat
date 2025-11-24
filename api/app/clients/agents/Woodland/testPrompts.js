/**
 * Domain-Specific Test Prompts for Woodland Agents
 * Organized by agent type with expected behaviors annotated.
 */

const CATALOG_PARTS_AGENT_PROMPTS = {
  // Hitch Relevance Tests
  hitch_agnostic_impeller: {
    prompt: "I need to replace the impeller on my XL model Cyclone Rake",
    expected_behavior: {
      should_not_ask_hitch: true,
      should_return_sku: /05-.*-20/, // 20-inch XL impeller
      hitch_relevant: false,
      escalation_expected: true, // Housing removal required
    },
    test_case: "Impeller replacement should NOT ask about hitch type",
  },

  hitch_agnostic_bag: {
    prompt: "What collector bag do I need for my Commander rake?",
    expected_behavior: {
      should_not_ask_hitch: true,
      should_return_sku: true,
      hitch_relevant: false,
      categories_should_include: ['bag', 'collector_bag'],
    },
    test_case: "Bag replacement should NOT filter by hitch type",
  },

  hitch_agnostic_engine: {
    prompt: "I want to upgrade my engine to 10HP on my Commercial Pro",
    expected_behavior: {
      should_not_ask_hitch: true,
      should_escalate: true, // Engine upgrades not supported per policy
      hitch_relevant: false,
    },
    test_case: "Engine queries should NOT involve hitch type",
  },

  hitch_relevant_wheels: {
    prompt: "I need replacement wheels for my Commander rake",
    expected_behavior: {
      should_ask_hitch: true,
      hitch_relevant: true,
      requires_hitch_for_sku: true,
    },
    test_case: "Wheel replacement SHOULD ask about hitch type (dual-pin vs CRS)",
  },

  hitch_relevant_chassis: {
    prompt: "Looking for chassis parts for my Classic model",
    expected_behavior: {
      should_ask_hitch: true,
      hitch_relevant: true,
      categories_should_include: ['chassis', 'frame'],
    },
    test_case: "Chassis parts SHOULD filter by hitch type",
  },

  hitch_relevant_deck_hose: {
    prompt: "Need a deck hose assembly for my Commercial Pro",
    expected_behavior: {
      should_ask_hitch: true,
      hitch_relevant: true,
      tractor_fitment_may_be_needed: true,
    },
    test_case: "Deck hose SHOULD consider hitch type",
  },

  // Critical Part Validation Tests
  critical_xl_impeller: {
    prompt: "What's the correct impeller SKU for XL model serial C20-12345?",
    expected_behavior: {
      should_validate_against_history: true,
      must_match_20_inch: true,
      should_reject_commander_impeller: true,
      validation_warning_expected: true,
    },
    test_case: "XL impeller must be validated - only 20-inch allowed",
  },

  critical_engine_compatibility: {
    prompt: "Can I get a replacement engine for my 2019 Commander?",
    expected_behavior: {
      should_validate_against_history: true,
      requires_exact_model_year: true,
      cross_validation_required: true,
    },
    test_case: "Engine SKU must be cross-validated with Product History",
  },

  // Policy Enforcement Tests
  policy_xl_impeller_mismatch: {
    prompt: "I need an impeller for my XL - can I use the Commander 16-inch one?",
    expected_behavior: {
      should_block: true,
      policy_flag_severity: 'block',
      reason: 'xl-impeller-mismatch',
      should_offer_correct_sku: /05-.*-20/,
    },
    test_case: "Policy must block Commander impeller for XL model",
  },

  policy_liner_not_separate: {
    prompt: "I just need the blower housing liner, not the whole assembly",
    expected_behavior: {
      should_block: true,
      policy_flag_severity: 'block',
      reason: 'liner-not-sold-separately',
      should_offer_full_housing: true,
    },
    test_case: "Policy must block liner-only requests",
  },

  policy_dual_pin_grease_warning: {
    prompt: "How often should I grease the wheels on my dual-pin Commander?",
    expected_behavior: {
      should_warn: true,
      policy_flag_severity: 'warn',
      reason: 'dual-pin-sealed-hub',
      must_state_no_grease_needed: true,
    },
    test_case: "Dual-pin wheels should warn about sealed hubs (no grease)",
  },

  // Multi-SKU Scenarios
  multi_sku_selector: {
    prompt: "What bag options are available for Classic model?",
    expected_behavior: {
      should_return_multiple: true,
      should_include_selector: ['bag_color', 'bag_shape'],
      each_sku_should_cite: true,
    },
    test_case: "Selector scenarios should list all valid options with attributes",
  },

  // Edge Cases
  ambiguous_rake_reference: {
    prompt: "I have a 103 model and need parts",
    expected_behavior: {
      should_canonicalize: 'commander',
      alias_resolution: '103 -> Commander',
    },
    test_case: "Model aliases (103) should resolve to canonical names (Commander)",
  },

  missing_rake_context: {
    prompt: "What impellers do you have in stock?",
    expected_behavior: {
      should_request_model: true,
      cannot_quote_without_model: true,
    },
    test_case: "Missing rake model should trigger clarification request",
  },
};

const CYCLOPEDIA_SUPPORT_AGENT_PROMPTS = {
  // Procedural Safety Tests
  customer_safe_bag_replacement: {
    prompt: "How do I replace the collector bag on my rake?",
    expected_behavior: {
      should_provide_steps: true,
      procedure_classification: 'customer_safe',
      max_complexity: 3,
      escalation_required: false,
    },
    test_case: "Bag replacement is customer-safe - provide full instructions",
  },

  customer_safe_wheel_install: {
    prompt: "What are the steps to install the wheel assemblies?",
    expected_behavior: {
      should_provide_steps: true,
      procedure_classification: 'customer_safe',
      tools_required: ['wrench', 'socket set'],
      escalation_required: false,
    },
    test_case: "Wheel installation is customer-safe - provide instructions",
  },

  customer_safe_filter: {
    prompt: "How often should I replace the air filter and how do I do it?",
    expected_behavior: {
      should_provide_steps: true,
      procedure_classification: 'customer_safe',
      max_complexity: 2,
      escalation_required: false,
    },
    test_case: "Filter replacement is customer-safe - provide instructions",
  },

  technician_only_housing_removal: {
    prompt: "How do I remove the blower housing to access the impeller?",
    expected_behavior: {
      should_escalate: true,
      procedure_classification: 'technician_only',
      must_not_provide_steps: true,
      escalation_required: true,
      risk_factors: ['rotating_parts', 'spring_tension', 'reassembly_complexity'],
    },
    test_case: "Housing removal is TECHNICIAN-ONLY - must escalate immediately",
  },

  technician_only_impeller_replacement: {
    prompt: "Can you walk me through replacing the impeller myself?",
    expected_behavior: {
      should_escalate: true,
      procedure_classification: 'technician_only',
      must_not_provide_steps: true,
      escalation_required: true,
      must_mention_service_center: true,
    },
    test_case: "Impeller replacement is TECHNICIAN-ONLY - escalate without DIY steps",
  },

  technician_only_engine_work: {
    prompt: "How do I rebuild the carburetor on my engine?",
    expected_behavior: {
      should_escalate: true,
      procedure_classification: 'technician_only',
      must_not_provide_steps: true,
      risk_factors: ['fuel_system', 'electrical', 'warranty_void'],
    },
    test_case: "Engine work is TECHNICIAN-ONLY - must escalate",
  },

  technician_only_chassis_modification: {
    prompt: "I need to drill some holes in the frame to mount an accessory",
    expected_behavior: {
      should_escalate: true,
      procedure_classification: 'technician_only',
      must_not_provide_steps: true,
      risk_factors: ['structural_integrity', 'warranty_void', 'safety_critical'],
    },
    test_case: "Chassis modification is TECHNICIAN-ONLY - block immediately",
  },

  // Troubleshooting Scenarios
  troubleshooting_engine_choke: {
    prompt: "My engine only runs when the choke is on - what should I check?",
    expected_behavior: {
      should_provide_checklist: true,
      scenario: 'engine_runs_only_on_choke',
      steps_should_be_ordered: true,
      customer_safe_diagnostic: true,
    },
    test_case: "Choke troubleshooting should provide ordered diagnostic steps",
  },

  troubleshooting_bag_wont_fold: {
    prompt: "The collector bag won't fold up properly anymore",
    expected_behavior: {
      should_provide_checklist: true,
      scenario: 'bag_wont_fold',
      should_check_spring_mechanism: true,
    },
    test_case: "Bag folding issues should provide systematic troubleshooting",
  },

  troubleshooting_wheel_shake: {
    prompt: "There's excessive vibration coming from the wheels",
    expected_behavior: {
      should_provide_checklist: true,
      scenario: 'wheel_shake',
      should_check: ['bearing', 'balance', 'mounting'],
    },
    test_case: "Wheel vibration should provide diagnostic checklist",
  },

  // Policy and Warranty
  warranty_question: {
    prompt: "What's covered under the 3-year warranty?",
    expected_behavior: {
      should_cite_cyclopedia: true,
      should_not_invent: true,
      must_include_url: true,
    },
    test_case: "Warranty questions must cite Cyclopedia articles",
  },

  shipping_policy: {
    prompt: "How long does shipping typically take?",
    expected_behavior: {
      should_cite_cyclopedia: true,
      should_provide_timeframe: true,
    },
    test_case: "Shipping policy must come from Cyclopedia",
  },

  return_policy: {
    prompt: "Can I return a part if it doesn't fit?",
    expected_behavior: {
      should_cite_cyclopedia: true,
      should_include_conditions: true,
    },
    test_case: "Return policy must be cited from authoritative source",
  },
};

const TRACTOR_FITMENT_AGENT_PROMPTS = {
  // Compatibility Checks
  tractor_compatibility_john_deere: {
    prompt: "Will the Commander rake fit my John Deere X540 with 48-inch deck?",
    expected_behavior: {
      should_check_make: 'john deere',
      should_check_model: 'x540',
      should_check_deck: 48,
      should_return_hitch_requirement: true,
      should_mention_mda_if_needed: true,
    },
    test_case: "Tractor compatibility should check make/model/deck size",
  },

  tractor_compatibility_cub_cadet: {
    prompt: "I have a Cub Cadet XT1 with 42-inch deck - which rake model works?",
    expected_behavior: {
      should_recommend_model: true,
      should_check_deck_opening: true,
      may_require_mda: true,
    },
    test_case: "Should recommend compatible rake model based on tractor specs",
  },

  // Installation Requirements
  installation_drilling_required: {
    prompt: "Do I need to drill holes for installation on my Husqvarna tractor?",
    expected_behavior: {
      should_check_customer_drilling: true,
      should_provide_yes_no_answer: true,
      should_cite_fitment_data: true,
    },
    test_case: "Customer drilling requirements should be clearly stated",
  },

  installation_mda_required: {
    prompt: "What's a mower deck adapter and do I need one?",
    expected_behavior: {
      should_explain_mda: true,
      should_check_deck_measurements: true,
      should_recommend_if_needed: true,
    },
    test_case: "MDA requirements should be explained with deck context",
  },

  installation_exhaust_deflection: {
    prompt: "Will the rake interfere with my tractor exhaust?",
    expected_behavior: {
      should_check_exhaust_deflection: true,
      should_provide_mitigation: true,
    },
    test_case: "Exhaust clearance issues should be flagged",
  },

  // Edge Cases
  tractor_missing_deck_info: {
    prompt: "I have a Craftsman tractor - will it fit?",
    expected_behavior: {
      should_request_model: true,
      should_request_deck_size: true,
      cannot_confirm_without_specs: true,
    },
    test_case: "Missing deck info should trigger clarification request",
  },

  tractor_zero_turn: {
    prompt: "I have a zero-turn mower - can I use the Cyclone Rake?",
    expected_behavior: {
      should_recommend_z10: true,
      should_explain_zero_turn_compatibility: true,
    },
    test_case: "Zero-turn mowers should route to Z-10 model",
  },
};

const WEBSITE_PRODUCT_AGENT_PROMPTS = {
  // Pricing and Promotions
  current_pricing: {
    prompt: "What's the current price for the Commander model?",
    expected_behavior: {
      should_cite_website: true,
      should_include_base_price: true,
      should_mention_promotions_if_active: true,
    },
    test_case: "Pricing must come from website snapshot data",
  },

  bundle_pricing: {
    prompt: "Is there a discount if I buy the rake with extra bags?",
    expected_behavior: {
      should_check_bundles: true,
      should_cite_website: true,
      should_compare_prices: true,
    },
    test_case: "Bundle discounts should be cited from website data",
  },

  seasonal_promotion: {
    prompt: "Are there any sales or promotions running right now?",
    expected_behavior: {
      should_check_promotions: true,
      should_include_expiration: true,
      should_cite_website: true,
    },
    test_case: "Promotions must include dates and citation",
  },

  // Ordering Process
  ordering_steps: {
    prompt: "How do I place an order for a Classic model?",
    expected_behavior: {
      should_provide_website_flow: true,
      should_include_url: true,
      should_mention_payment_options: true,
    },
    test_case: "Ordering guidance should reference website checkout flow",
  },

  financing_options: {
    prompt: "Do you offer financing for purchases?",
    expected_behavior: {
      should_cite_website: true,
      should_include_terms_if_available: true,
    },
    test_case: "Financing info must come from website data",
  },
};

const CASES_REFERENCE_AGENT_PROMPTS = {
  // Case Lookup
  specific_case_lookup: {
    prompt: "What was the resolution for case #55859?",
    expected_behavior: {
      should_search_by_case_id: '55859',
      should_return_resolution: true,
      should_validate_url: true, // This case has broken link - should be filtered
    },
    test_case: "Case #55859 lookup - broken link should be removed by URL validation",
  },

  similar_case_pattern: {
    prompt: "Have we seen impeller replacement issues before?",
    expected_behavior: {
      should_search_by_keyword: 'impeller replacement',
      should_return_precedents: true,
      should_summarize_resolutions: true,
    },
    test_case: "Similar case search should find precedents",
  },

  // Stale Case Detection (Phase 2 enhancement placeholder)
  recent_cases_only: {
    prompt: "What are recent cases about wheel problems?",
    expected_behavior: {
      should_filter_by_recency: true,
      should_flag_stale_if_old: true,
    },
    test_case: "Recent case queries should prioritize fresh data",
  },
};

const SUPERVISOR_ROUTER_PROMPTS = {
  // Multi-Agent Coordination
  complex_multi_agent: {
    prompt: "I have a Commander with dual-pin hitch on a John Deere X540, need a replacement impeller and wondering if installation will affect my exhaust",
    expected_behavior: {
      should_route_to: ['CatalogPartsAgent', 'TractorFitmentAgent', 'CyclopediaSupportAgent'],
      should_synthesize_answers: true,
      should_escalate_impeller: true, // Technician-only
    },
    test_case: "Complex query should coordinate multiple agents and escalate unsafe procedures",
  },

  sales_focus: {
    prompt: "What's the price difference between Commander and Commercial Pro?",
    expected_behavior: {
      should_route_to: ['WebsiteProductAgent'],
      intent_classification: 'sales',
    },
    test_case: "Sales queries should route to Website agent",
  },

  parts_focus: {
    prompt: "I need part number for Commander side tubes",
    expected_behavior: {
      should_route_to: ['CatalogPartsAgent'],
      intent_classification: 'parts',
    },
    test_case: "Parts queries should route to Catalog agent",
  },

  support_focus: {
    prompt: "My rake won't fold up - troubleshooting steps?",
    expected_behavior: {
      should_route_to: ['CyclopediaSupportAgent'],
      intent_classification: 'support',
    },
    test_case: "Support queries should route to Cyclopedia agent",
  },

  tractor_fitment_focus: {
    prompt: "Will this fit my Craftsman tractor with 46-inch deck?",
    expected_behavior: {
      should_route_to: ['TractorFitmentAgent'],
      intent_classification: 'tractor_fitment',
    },
    test_case: "Fitment queries should route to Tractor agent",
  },
};

// Product History Agent Test Prompts
const PRODUCT_HISTORY_AGENT_PROMPTS = {
  // Combination Filtering Tests
  combination_basic_locked: {
    prompt: "I have a green collector bag that's straight, 7-inch blower opening, and a Tecumseh 5 HP engine. What model is this?",
    expected_behavior: {
      should_use_filters: {
        bagColor: 'Green',
        bagShape: 'Straight',
        deckHose: '7 inch',
        engineModel: 'Tecumseh 5 HP',
      },
      should_not_use_query_concat: true,
      status: 'Locked',
      model_should_be: '101 - Standard Complete Platinum',
      confidence: 'High',
    },
    test_case: "Combination of visual cues should lock to specific model using structured filters",
  },

  combination_engine_revision: {
    prompt: "My rake has a green tapered bag, 7-inch opening, and Vanguard 6.5 HP engine. Which model?",
    expected_behavior: {
      should_use_filters: {
        bagColor: 'Green',
        bagShape: 'Tapered',
        deckHose: '7 inch',
        engineModel: 'Vanguard 6.5 HP',
      },
      status: 'Locked',
      model_should_be: '101 - Standard Complete Platinum',
      should_note_engine_revision: true,
      timeline_should_mention: 'Sept 2007 - Sept 2010',
    },
    test_case: "Engine revision should be noted with timeline when multiple engines exist for same model",
  },

  attribute_lookup_xr950_models: {
    prompt: "Which Cyclone Rake models came with the XR 950 engine?",
    expected_behavior: {
      should_use_filters: {
        engineModel: 'XR 950',
        query: '',
      },
      attribute_lookup_mode: true,
      should_return_multiple_models: true,
      expected_models: ['101', '104', '106', '109'],
      should_list_model_plus_attribute: true,
    },
    test_case: "Attribute lookup should use engineModel filter to find all matching models",
  },

  attribute_lookup_tapered_bag: {
    prompt: "What models have the tapered green collector bag?",
    expected_behavior: {
      should_use_filters: {
        bagColor: 'Green',
        bagShape: 'Tapered',
        query: '',
      },
      attribute_lookup_mode: true,
      should_return_multiple_models: true,
    },
    test_case: "Attribute lookup should combine bagColor + bagShape filters",
  },

  missing_cues_shortlist: {
    prompt: "I have a green bag and 7-inch opening but don't know the engine",
    expected_behavior: {
      should_use_filters: {
        bagColor: 'Green',
        deckHose: '7 inch',
      },
      should_ask_for: ['bagShape', 'engineModel'],
      status: 'Shortlist',
      confidence: 'Medium',
      should_provide_clarifying_questions: true,
    },
    test_case: "Missing cues should trigger clarification protocol with specific parameter requests",
  },

  conflicting_cues_blocked: {
    prompt: "My rake has a black bag but the product history shows it should be green for this model",
    expected_behavior: {
      status: 'Blocked',
      should_escalate: true,
      confidence: 'Low',
      should_request_photo: true,
      must_log_conflict: true,
    },
    test_case: "Conflicting cues should return 'needs human review' status",
  },

  deck_size_unavailable: {
    prompt: "What deck size does my 101 Standard Complete Platinum use?",
    expected_behavior: {
      should_state_unavailable: true,
      should_route_to: 'TractorFitmentAgent',
      data_limitation_acknowledged: true,
    },
    test_case: "Deck size queries should acknowledge data limit and route to Tractor agent",
  },
};

// Engine History Agent Test Prompts
const ENGINE_HISTORY_AGENT_PROMPTS = {
  // Combination Filtering Tests
  combination_basic_locked: {
    prompt: "I have a 101 model with a Flat Square air filter and 5HP engine. What engine is this?",
    expected_behavior: {
      should_use_filters: {
        rakeModel: '101',
        filterShape: 'Flat Square',
        horsepower: '5HP',
      },
      should_not_use_query_concat: true,
      status: 'Locked',
      engine_should_be: 'Tecumseh 5 HP - OHH50',
      timeline_should_show: '1997 - 2004',
      confidence: 'High',
    },
    test_case: "Combination of rake model + filter shape + HP should lock to specific engine using structured filters",
  },

  combination_engine_family: {
    prompt: "My Commander Pro has a 6.5HP engine with Flat Square filter. Which engine model?",
    expected_behavior: {
      should_use_filters: {
        rakeModel: 'Commander Pro',
        horsepower: '6.5HP',
        filterShape: 'Flat Square',
      },
      status: 'Locked',
      engine_should_include: 'Vanguard 6.5 HP Phase I',
      should_note_timeline: true,
    },
    test_case: "Engine family identification should use rake + HP + filter combination",
  },

  attribute_lookup_flat_square_filter: {
    prompt: "Which Cyclone Rake models use a Flat Square air filter?",
    expected_behavior: {
      should_use_filters: {
        filterShape: 'Flat Square',
        query: '',
      },
      attribute_lookup_mode: true,
      should_return_multiple_models: true,
      should_pair_model_with_engine: true,
    },
    test_case: "Attribute lookup should use filterShape filter to find all matching models",
  },

  attribute_lookup_xr950_hose_diameter: {
    prompt: "What hose diameter comes with XR 950 engines?",
    expected_behavior: {
      should_use_filters: {
        engineModel: 'XR 950',
        query: '',
      },
      attribute_lookup_mode: true,
      should_return_hose_diameter: true,
      expected_values: ['7 inch', '8 inch'],
      should_pair_with_models: true,
    },
    test_case: "Attribute lookup should use engineModel filter and return associated attributes",
  },

  missing_cues_shortlist: {
    prompt: "I have a 101 model but don't know the filter shape or HP",
    expected_behavior: {
      should_use_filters: {
        rakeModel: '101',
      },
      should_ask_for: ['filterShape', 'horsepower', 'engineModel'],
      status: 'Shortlist',
      confidence: 'Medium',
      should_provide_clarifying_questions: true,
      should_mention_engine_label_location: true,
    },
    test_case: "Missing engine cues should trigger specific clarification questions",
  },

  timeline_revision_multiple_engines: {
    prompt: "My 101 Standard Complete Platinum was ordered in 2008. What engine does it have?",
    expected_behavior: {
      should_use_filters: {
        rakeModel: '101',
        query: '2008',
      },
      should_show_timeline_revisions: true,
      expected_engines: ['Tecumseh 5 HP', 'Intek 6 HP', 'Vanguard 6.5 HP'],
      should_ask_engine_label: true,
      status: 'Shortlist',
    },
    test_case: "Timeline query should use year in query text but model as filter",
  },

  maintenance_kit_reference: {
    prompt: "What maintenance kit do I need for my Vanguard 6.5 HP Phase I engine?",
    expected_behavior: {
      should_use_filters: {
        engineModel: 'Vanguard 6.5 HP Phase I',
      },
      should_reference_kit: true,
      should_redirect_to_catalog: true,
      must_include_citation: true,
    },
    test_case: "Kit queries should identify engine then route to Catalog for confirmation",
  },

  conflicting_hp_blocked: {
    prompt: "CRM shows 5HP but customer reports 6.5HP on the engine label",
    expected_behavior: {
      status: 'Blocked',
      should_escalate: true,
      confidence: 'Low',
      should_request_photo: true,
      must_log_conflict: true,
    },
    test_case: "Conflicting HP ratings should return 'needs human review'",
  },
};

// Test Execution Helpers
const TEST_SCENARIOS = {
  phase_1_critical: [
    // Hitch Relevance
    CATALOG_PARTS_AGENT_PROMPTS.hitch_agnostic_impeller,
    CATALOG_PARTS_AGENT_PROMPTS.hitch_agnostic_bag,
    CATALOG_PARTS_AGENT_PROMPTS.hitch_relevant_wheels,
    
    // Procedural Safety
    CYCLOPEDIA_SUPPORT_AGENT_PROMPTS.customer_safe_bag_replacement,
    CYCLOPEDIA_SUPPORT_AGENT_PROMPTS.technician_only_housing_removal,
    CYCLOPEDIA_SUPPORT_AGENT_PROMPTS.technician_only_impeller_replacement,
    
    // URL Validation
    CASES_REFERENCE_AGENT_PROMPTS.specific_case_lookup,
    
    // Cross-Tool Validation
    CATALOG_PARTS_AGENT_PROMPTS.critical_xl_impeller,
  ],

  phase_1_comprehensive: [
    ...Object.values(CATALOG_PARTS_AGENT_PROMPTS),
    ...Object.values(CYCLOPEDIA_SUPPORT_AGENT_PROMPTS),
  ],

  all_agents: {
    catalog: CATALOG_PARTS_AGENT_PROMPTS,
    cyclopedia: CYCLOPEDIA_SUPPORT_AGENT_PROMPTS,
    tractor: TRACTOR_FITMENT_AGENT_PROMPTS,
    website: WEBSITE_PRODUCT_AGENT_PROMPTS,
    cases: CASES_REFERENCE_AGENT_PROMPTS,
    supervisor: SUPERVISOR_ROUTER_PROMPTS,
    productHistory: PRODUCT_HISTORY_AGENT_PROMPTS,
    engineHistory: ENGINE_HISTORY_AGENT_PROMPTS,
  },
};

module.exports = {
  CATALOG_PARTS_AGENT_PROMPTS,
  CYCLOPEDIA_SUPPORT_AGENT_PROMPTS,
  TRACTOR_FITMENT_AGENT_PROMPTS,
  WEBSITE_PRODUCT_AGENT_PROMPTS,
  CASES_REFERENCE_AGENT_PROMPTS,
  SUPERVISOR_ROUTER_PROMPTS,
  PRODUCT_HISTORY_AGENT_PROMPTS,
  ENGINE_HISTORY_AGENT_PROMPTS,
  TEST_SCENARIOS,
};
