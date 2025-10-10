# Hive MCP Workaround: LLM Access Without Sampling Support

## Overview

Since LibreChat **does not currently support MCP sampling**, this document describes **Option 2**: Alternative approaches for the Hive MCP server to leverage LLM capabilities without direct sampling support.

## The Challenge

Your Hive MCP server needs LLM access for:
- Semantic analysis of RDF graphs
- Ontology reasoning and suggestions
- Natural language to SPARQL query conversion
- Data enrichment with semantic annotations

**But**: Without sampling support, your MCP server cannot directly request LLM completions from LibreChat.

## Option 2: Work With the Agent's LLM Indirectly

The key insight: **The agent using your tools already has LLM access!** Instead of your MCP server calling the LLM directly, design your tools to return structured data and prompts that the agent's LLM can process.

### Strategy: Prompt-Enriched Responses

Your MCP server tools return:
1. **Data**: The actual RDF/graph information
2. **Guidance**: Suggestions or prompts for the agent's LLM to process the data

The agent's LLM sees this combined response and naturally processes it.

## Implementation Patterns

### Pattern 1: Return Data with Analysis Prompts

Instead of your server analyzing data internally, return the data WITH instructions for the LLM.

#### ❌ What You Can't Do (without sampling):
```typescript
// This won't work - MCP server tries to call LLM directly
server.registerTool("analyze_honeycomb",
  { description: "Analyze RDF graph semantically" },
  async ({ honeycombId }) => {
    const rdfData = await hiveAPI.getHoneycomb(honeycombId);

    // Can't do this - no sampling support!
    const analysis = await llm.analyze(rdfData);

    return { content: [{ type: "text", text: analysis }] };
  }
);
```

#### ✅ What You Should Do Instead:
```typescript
// Return data + prompt for the agent's LLM to process
server.registerTool("analyze_honeycomb",
  {
    description: "Retrieve honeycomb data for semantic analysis",
    inputSchema: {
      honeycombId: {
        type: "string",
        description: "ID of the honeycomb to analyze"
      }
    }
  },
  async ({ honeycombId }) => {
    const rdfData = await hiveAPI.getHoneycomb(honeycombId);

    // Format data for the agent's LLM to understand
    return {
      content: [{
        type: "text",
        text: `Here is the RDF graph data for honeycomb "${honeycombId}":

${formatRDFForReading(rdfData)}

**Semantic Structure:**
- Entities: ${rdfData.entities.length}
- Triples: ${rdfData.triples.length}
- Ontology classes used: ${rdfData.ontologyClasses.join(', ')}

**Analysis Request:**
Please analyze this RDF graph and provide:
1. Key semantic relationships identified
2. Suggested additional ontology classes that could enrich this data
3. Potential inference rules that could be applied
4. Any inconsistencies or missing relationships

The graph represents: ${rdfData.domain}`
      }]
    };
  }
);
```

**What happens:**
1. User asks: "Analyze my customer honeycomb"
2. Agent calls your `analyze_honeycomb` tool
3. Your tool returns RDF data + analysis prompt
4. Agent's LLM sees the full response and naturally provides the analysis
5. User gets semantic insights!

### Pattern 2: Query Assistance Tools

Help users construct better queries by providing structured guidance.

```typescript
server.registerTool("suggest_sparql_query",
  {
    description: "Get SPARQL query suggestions for natural language requests",
    inputSchema: {
      naturalLanguageQuery: {
        type: "string",
        description: "What the user wants to query in plain English"
      },
      honeycombId: {
        type: "string",
        description: "Target honeycomb ID"
      }
    }
  },
  async ({ naturalLanguageQuery, honeycombId }) => {
    // Get honeycomb schema/structure
    const schema = await hiveAPI.getHoneycombSchema(honeycombId);

    return {
      content: [{
        type: "text",
        text: `**User Query:** "${naturalLanguageQuery}"

**Available Honeycomb Schema:**
${formatSchemaForReading(schema)}

**Example SPARQL Patterns:**
\`\`\`sparql
# Pattern for entity queries:
SELECT ?entity ?property ?value
WHERE {
  ?entity rdf:type ${schema.primaryClass} .
  ?entity ?property ?value .
}

# Pattern for relationship queries:
SELECT ?subject ?predicate ?object
WHERE {
  ?subject ?predicate ?object .
  FILTER(?predicate = ${schema.commonPredicates[0]})
}
\`\`\`

Please construct an appropriate SPARQL query to answer: "${naturalLanguageQuery}"
Use the schema and patterns above as guidance.`
      }]
    };
  }
);
```

### Pattern 3: Intelligent Defaults with Explanation

Provide smart defaults and explain why they're good choices.

```typescript
server.registerTool("add_entity_to_honeycomb",
  {
    description: "Add a new entity to a honeycomb with semantic enrichment",
    inputSchema: {
      honeycombId: { type: "string" },
      entityType: { type: "string" },
      entityData: {
        type: "object",
        description: "Key-value pairs for the entity"
      }
    }
  },
  async ({ honeycombId, entityType, entityData }) => {
    // Get ontology suggestions based on entity type
    const ontologySuggestions = await getOntologySuggestions(entityType);

    // Add entity with basic structure
    const entityId = await hiveAPI.addEntity(honeycombId, {
      type: entityType,
      data: entityData
    });

    return {
      content: [{
        type: "text",
        text: `✅ Entity created successfully!

**Entity ID:** ${entityId}
**Type:** ${entityType}
**Base Properties:** ${Object.keys(entityData).join(', ')}

**Semantic Enrichment Suggestions:**

Based on the entity type "${entityType}", consider adding these semantic annotations:

${ontologySuggestions.map(s => `
**${s.ontologyClass}** (${s.namespace})
- Why: ${s.reasoning}
- Example properties: ${s.suggestedProperties.join(', ')}
- Would you like me to add this ontology class to the entity?
`).join('\n')}

**Relationship Suggestions:**
${ontologySuggestions.map(s => s.suggestedRelationships.map(rel =>
  `- Connect to ${rel.targetType} via ${rel.predicate} (${rel.reasoning})`
).join('\n')).join('\n')}

Would you like me to enrich this entity with any of these semantic annotations?`
      }]
    };
  }
);
```

### Pattern 4: Multi-Step Workflows

Break complex operations into steps where the agent's LLM makes decisions.

```typescript
// Step 1: Prepare data enrichment
server.registerTool("prepare_data_enrichment",
  {
    description: "Analyze entity and suggest enrichment opportunities",
    inputSchema: {
      honeycombId: { type: "string" },
      entityId: { type: "string" }
    }
  },
  async ({ honeycombId, entityId }) => {
    const entity = await hiveAPI.getEntity(honeycombId, entityId);
    const context = await hiveAPI.getEntityContext(honeycombId, entityId);

    return {
      content: [{
        type: "text",
        text: `**Current Entity State:**
${formatEntityForReading(entity)}

**Context in Graph:**
${formatContextForReading(context)}

**Enrichment Opportunities:**

1. **Missing Ontology Classes:**
   ${entity.suggestedClasses.map(c => `- ${c.name}: ${c.benefit}`).join('\n   ')}

2. **Potential Relationships:**
   ${context.nearbyEntities.map(e =>
     `- Link to ${e.id} (${e.type}) via ${e.suggestedPredicate}`
   ).join('\n   ')}

3. **Property Enhancements:**
   ${entity.properties.map(p =>
     p.enrichable ? `- ${p.name}: Could add ${p.enrichmentType}` : null
   ).filter(Boolean).join('\n   ')}

Please review these suggestions and let me know which enrichments to apply.
You can say things like:
- "Add all ontology classes"
- "Link to entity X via predicate Y"
- "Add property enrichment for Z"`
      }]
    };
  }
);

// Step 2: Apply enrichment based on LLM/user decision
server.registerTool("apply_data_enrichment",
  {
    description: "Apply specific enrichments to an entity",
    inputSchema: {
      honeycombId: { type: "string" },
      entityId: { type: "string" },
      enrichments: {
        type: "object",
        properties: {
          ontologyClasses: { type: "array", items: { type: "string" } },
          relationships: { type: "array", items: { type: "object" } },
          propertyEnhancements: { type: "array", items: { type: "object" } }
        }
      }
    }
  },
  async ({ honeycombId, entityId, enrichments }) => {
    // Apply the enrichments
    await hiveAPI.enrichEntity(honeycombId, entityId, enrichments);

    return {
      content: [{
        type: "text",
        text: `✅ Enrichments applied successfully!\n\n${formatEnrichmentResults(enrichments)}`
      }]
    };
  }
);
```

## Advanced Patterns

### Pattern 5: Context-Rich Error Messages

When operations fail, provide context that helps the agent's LLM guide the user.

```typescript
server.registerTool("query_honeycomb",
  {
    description: "Execute a SPARQL query against a honeycomb",
    inputSchema: {
      honeycombId: { type: "string" },
      sparqlQuery: { type: "string" }
    }
  },
  async ({ honeycombId, sparqlQuery }) => {
    try {
      const results = await hiveAPI.executeSparqlQuery(honeycombId, sparqlQuery);
      return {
        content: [{
          type: "text",
          text: `Query executed successfully!\n\nResults:\n${formatQueryResults(results)}`
        }]
      };
    } catch (error) {
      // Don't just return the error - provide context for fixing it!
      const schema = await hiveAPI.getHoneycombSchema(honeycombId);

      return {
        content: [{
          type: "text",
          text: `❌ SPARQL query failed with error: ${error.message}

**Your Query:**
\`\`\`sparql
${sparqlQuery}
\`\`\`

**Available Schema:**
${formatSchemaForReading(schema)}

**Common Issues:**
- Ensure all prefixes are declared (e.g., PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>)
- Check that entity types match available classes: ${schema.classes.join(', ')}
- Verify predicates exist in the schema: ${schema.predicates.join(', ')}

**Suggested Fix:**
${suggestQueryFix(error, sparqlQuery, schema)}

Please provide a corrected SPARQL query.`
        }]
      };
    }
  }
);
```

### Pattern 6: Progressive Disclosure

Start simple, then offer more complex options based on context.

```typescript
server.registerTool("explore_honeycomb",
  {
    description: "Explore and understand a honeycomb's structure",
    inputSchema: {
      honeycombId: { type: "string" },
      depth: {
        type: "string",
        enum: ["overview", "detailed", "expert"],
        description: "Level of detail to provide"
      }
    }
  },
  async ({ honeycombId, depth = "overview" }) => {
    const data = await hiveAPI.getHoneycomb(honeycombId);

    if (depth === "overview") {
      return {
        content: [{
          type: "text",
          text: `**Honeycomb Overview: ${data.name}**

📊 **Statistics:**
- Entities: ${data.entityCount}
- Relationships: ${data.tripleCount}
- Ontology Classes: ${data.ontologyClasses.length}

🎯 **Domain:** ${data.domain}

**Quick Actions:**
- Ask me to analyze semantic relationships
- Request SPARQL query suggestions
- Explore specific entity types
- Add new entities

For more details, ask me to explore with "detailed" or "expert" depth.`
        }]
      };
    }

    if (depth === "detailed") {
      return {
        content: [{
          type: "text",
          text: `**Detailed Honeycomb Analysis: ${data.name}**

${generateDetailedAnalysis(data)}

**Semantic Structure Analysis:**
${analyzeSemanticStructure(data)}

**Suggested Improvements:**
${suggestImprovements(data)}

For expert-level RDF details and query optimization suggestions, ask for "expert" depth.`
        }]
      };
    }

    // expert level...
  }
);
```

## Best Practices

### 1. Design Tools for Conversation

Your tools should facilitate a dialogue between the user and agent's LLM:

```typescript
// ❌ Bad: Returns only data
return { content: [{ type: "text", text: JSON.stringify(data) }] };

// ✅ Good: Returns data with conversational context
return {
  content: [{
    type: "text",
    text: `I found ${results.length} matching entities:\n\n${formatResults(results)}\n\nWhat would you like to do next?`
  }]
};
```

### 2. Include Examples in Responses

Help the agent's LLM understand what's possible:

```typescript
return {
  content: [{
    type: "text",
    text: `...data here...

**Example queries you can ask:**
- "Show me all connections between X and Y"
- "Add relationship Z between entities"
- "Enrich this entity with additional semantic annotations"`
  }]
};
```

### 3. Format Complex Data for LLM Understanding

```typescript
// ❌ Bad: Raw RDF that's hard for LLMs to parse
const rdfTurtle = `@prefix ex: <http://example.org/> .
ex:John ex:knows ex:Mary .
ex:Mary ex:age "30"^^xsd:integer .`;

// ✅ Good: Structured format that LLMs understand
const formatted = `
**RDF Graph Structure:**

Entities:
- ex:John (Person)
  - knows → ex:Mary

- ex:Mary (Person)
  - age → 30 (integer)

Relationships:
- ex:John → knows → ex:Mary
`;
```

### 4. Provide Actionable Next Steps

```typescript
return {
  content: [{
    type: "text",
    text: `${results}

**Next Actions:**
You can now:
1. Add more entities: "Add entity X to this honeycomb"
2. Query the data: "Find all entities of type Y"
3. Analyze relationships: "Show me connections between A and B"

What would you like to do?`
  }]
};
```

## Example: Complete User Journey

Here's how a complete interaction would work:

### User Request:
"I want to create a customer knowledge graph and add some customers"

### Tool Calls by Agent:

**1. Create Honeycomb:**
```
Tool: create_honeycomb
Args: { name: "customer_graph", domain: "CRM" }
Response: "✅ Honeycomb created! Suggested ontologies for CRM: schema.org/Person, foaf:Person..."
```

**2. Add Customer:**
```
Tool: add_entity_to_honeycomb
Args: {
  honeycombId: "customer_graph",
  entityType: "Customer",
  entityData: { name: "John Doe", email: "john@example.com" }
}
Response: "✅ Entity created! Consider adding: vcard:email for email, schema:name for name..."
```

**3. Enrich Entity:**
```
Tool: prepare_data_enrichment
Args: { honeycombId: "customer_graph", entityId: "entity_123" }
Response: "Enrichment opportunities: [list of suggestions with reasoning]..."
```

**4. Agent's LLM decides and calls:**
```
Tool: apply_data_enrichment
Args: { enrichments: { ontologyClasses: ["schema:Person", "vcard:Individual"], ... } }
Response: "✅ Enrichments applied! Your customer entity now has semantic annotations..."
```

### Result:
User gets a semantically rich knowledge graph without your MCP server ever directly calling an LLM!

## Limitations to Be Aware Of

### What This Approach Can't Do:

1. **Autonomous Multi-Step Reasoning**: Your server can't independently perform complex reasoning chains
2. **Real-Time Learning**: Can't adapt based on LLM feedback within a single tool call
3. **Dynamic Prompt Adjustment**: Can't adjust prompts based on intermediate LLM responses

### What This Approach CAN Do:

1. ✅ Provide rich, contextual data that enables the agent's LLM to reason effectively
2. ✅ Guide the agent through multi-step workflows
3. ✅ Offer intelligent suggestions and defaults
4. ✅ Create conversational, user-friendly interactions
5. ✅ Leverage the agent's LLM for semantic analysis, query generation, and decision-making

## When to Use This vs. Waiting for Sampling

### Use This Approach Now If:
- ✅ You need to ship functionality soon
- ✅ Your use cases fit the patterns above
- ✅ The agent's LLM doing the reasoning is acceptable
- ✅ You want to build iteratively

### Wait for Sampling Support If:
- ⏸️ Your server needs autonomous reasoning (not just data + prompts)
- ⏸️ You require multiple LLM calls within a single tool execution
- ⏸️ You need to process LLM responses internally before returning results
- ⏸️ You're building agentic workflows where the MCP server orchestrates multiple LLM calls

## Conclusion

**Option 2 is very viable for most use cases!** By designing your MCP tools to return structured data with conversational prompts, you can leverage the agent's LLM effectively without needing sampling support.

### Key Takeaway:

> Instead of your server calling the LLM, design your tools to return data + prompts that the agent's LLM naturally processes. This enables rich semantic interactions while working within current LibreChat capabilities.

### Next Steps:

1. **Review your Hive MCP server's current tools**
2. **Identify which tools need LLM access**
3. **Redesign those tools using the patterns in this document**
4. **Test with LibreChat agents**
5. **Iterate based on how well the agent's LLM handles your prompts**

When LibreChat eventually adds sampling support, you can enhance your tools to do even more autonomous reasoning—but you don't need to wait for that to build powerful semantic integrations!

## Questions?

This is a practical workaround that should unblock your development. If you have specific use cases that don't fit these patterns, let's discuss them—there might be creative solutions we haven't covered yet.
