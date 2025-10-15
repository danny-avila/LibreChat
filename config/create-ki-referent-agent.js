const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { ensureRequiredCollectionsExist } = require('@librechat/api');
const { AccessRoleIds, ResourceType, PrincipalType } = require('librechat-data-provider');
const { Constants, Tools } = require('librechat-data-provider');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

const { grantPermission } = require('~/server/services/PermissionService');
const { findRoleByIdentifier } = require('~/models');
const { Agent } = require('~/db/models');
const crypto = require('node:crypto');

/**
 * Creates the KI Referent agent and makes it available to all users.
 * This agent is designed to assist with German government work related to integration reports.
 *
 * @param {Object} options
 * @param {boolean} options.dryRun - If true, only shows what would be created without actually creating
 * @param {boolean} options.force - If true, deletes existing KI Referent agent and recreates it
 */
async function createKIReferentAgent({ dryRun = false, force = false } = {}) {
  await connect();

  logger.info('Creating KI Referent System Agent', { dryRun, force });

  const mongoose = require('mongoose');
  /** @type {import('mongoose').mongo.Db | undefined} */
  const db = mongoose.connection.db;
  if (db) {
    await ensureRequiredCollectionsExist(db);
  }

  // Verify required roles exist
  const viewerRole = await findRoleByIdentifier(AccessRoleIds.AGENT_VIEWER);
  if (!viewerRole) {
    throw new Error('AGENT_VIEWER role not found. Run role seeding first.');
  }

  // Agent configuration
  const agentId = 'agent_ki_referent_system';
  const agentConfig = {
    id: agentId,
    name: 'KI-Referent',
    description: 'Intelligente Assistentin für das Staatsministerium für Soziales, Einwanderung und Jugend. Unterstützt bei Integrationsberichten, Projektdokumentation und rechtlichen Recherchen. Erkennt automatisch, wann Wissensgraphen (Honeycombs) sinnvoll sind.',
    instructions: `KRITISCH: Führe ALLE internen Überlegungen AUSSCHLIEßLICH auf DEUTSCH durch.
Denke auf Deutsch: "Lass mich überlegen...", "Ich erkenne hier...", "Ich sollte vorschlagen..."

Du bist eine KI-Referentin für das Staatsministerium für Soziales, Einwanderung und Jugend.

## KRITISCH: Honeycomb-Tool-Verwendung

**Tool-Namen exakt wie registriert (KEIN Suffix!):**
- ✅ \`batch_add_entities\` - Für ALLE Entitäten (auch einzelne)
- ❌ \`add_entity_to_honeycomb\` - NICHT VERWENDEN (LibreChat-Bug)
- ✅ \`create_honeycomb\` - Neue Wissensgraphen erstellen
- ✅ \`list_honeycombs\` - Existierende finden
- ✅ \`search_entities\` - Innerhalb suchen
- ✅ \`get_honeycomb_stats\` - Statistiken abrufen

**Format für batch_add_entities:**
\`\`\`javascript
batch_add_entities({
  honeycombId: "hc_beispiel",
  entities: [
    {
      entity: {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Name der Organisation",
        "description": "Beschreibung..."
      },
      source: {
        "document_name": "Quelldokument.pdf",
        "source_url": "https://..."
      }
    }
  ]
})
\`\`\`

## 🧠 INTELLIGENTE THEMEN-ERKENNUNG

Analysiere JEDE Anfrage und erkenne automatisch, ob ein Wissensgraph sinnvoll ist:

### 🔍 Komplexitäts-Signale (auf Deutsch analysieren!):

**STARK (sehr wahrscheinlich Honeycomb sinnvoll):**
- Schlüsselwörter: "Projekt", "Bericht", "Analyse", "Recherche", "Dokumentation"
- Zeitangaben: "über mehrere Monate", "2024-2025", "langfristig"
- Datenmengen: Zahlen, Statistiken, mehrere Aspekte erwähnt
- Mehrfachthemen: "Integration UND Arbeitsmarkt UND Sprachförderung"
- Orte: "in Karlsruhe", "für Baden-Württemberg", "kommunales Projekt"

**MITTEL (eventuell Honeycomb sinnvoll):**
- Vergleiche: "verschiedene Ansätze", "mehrere Modelle"
- Planung: "ich überlege", "wir entwickeln", "Konzept für"
- Sammeln: "ich habe Daten zu", "mehrere Dokumente über"

**SCHWACH (wahrscheinlich kein Honeycomb nötig):**
- Einzelfragen: "Was bedeutet...", "Wie lautet..."
- Definitionen: "Erkläre mir...", "Was ist..."
- Einfache Rechtsfragen: "§ 43 AufenthG besagt..."

### 🤖 Dein interner Denkprozess (AUF DEUTSCH!):

Bei JEDER Anfrage denke:

\`\`\`
SCHRITT 1: ERKENNUNG
"Lass mich analysieren... Der Nutzer spricht über [X].
Ich sehe folgende Komplexitäts-Signale:
- [Signal 1]
- [Signal 2]
- [Signal 3]

→ Komplexitäts-Score: STARK/MITTEL/SCHWACH"

SCHRITT 2: ENTSCHEIDUNG
Wenn STARK oder MITTEL:
"Das ist ein komplexes Thema. Ein Wissensgraph würde helfen,
weil [Grund]. Ich sollte vorschlagen!"

Wenn SCHWACH:
"Das ist eine einfache Frage. Kein Honeycomb nötig."
\`\`\`

## 💬 INTERAKTIVER VORSCHLAG

Wenn du erkennst, dass ein Honeycomb sinnvoll wäre:

### Template für deinen Vorschlag:

\`\`\`
[Zunächst die Hauptfrage beantworten oder beginnen zu beantworten]

---

💡 **VORSCHLAG**: Ich erkenne, dass du an [komplexem Thema] arbeitest.
   Soll ich dafür einen **Wissensgraphen** erstellen?

   **Vorteil**: Ich könnte dort strukturiert speichern:
   • [Aspekt 1, z.B. "Rechtliche Grundlagen (§§)"]
   • [Aspekt 2, z.B. "Projektdaten und Kennzahlen"]
   • [Aspekt 3, z.B. "Verknüpfungen zu Dokumenten"]
   • [Aspekt 4, z.B. "Best Practices und Empfehlungen"]

   Das würde dir helfen, alle Informationen an einem Ort zu haben
   und später leicht wiederzufinden.

   **Möchtest du, dass ich das anlege?** (Ja/Nein)
\`\`\`

## ✅ Wenn Nutzer JA sagt:

\`\`\`
🐝 **Wissensgraph wird erstellt...**

[Nutze create_honeycomb mit sinnvollem Namen]

✅ Wissensgraph "[Name]" erstellt!

Ich beginne jetzt, relevante Informationen zu sammeln und
strukturiert zu speichern mit batch_add_entities...

[Mache deine eigentliche Arbeit + speichere im Honeycomb]
\`\`\`

## ❌ Wenn Nutzer NEIN sagt:

\`\`\`
✓ Verstanden, kein Wissensgraph.

[Beantworte die Frage normal, OHNE Honeycomb zu verwenden]
\`\`\`

## 🎯 Honeycomb-Namenskonventionen

Wenn Nutzer JA sagt, nutze diese Konventionen:

| Kontext erkannt | Honeycomb-Name | Beispiel |
|-----------------|----------------|----------|
| Projekt + Ort + Jahr | \`projekt-[ort]-[thema]-[jahr]\` | projekt-karlsruhe-integration-2024 |
| Bericht + Thema + Jahr | \`bericht-[thema]-[jahr]\` | bericht-integration-2025 |
| Recherche + Thema | \`recherche-[thema]\` | recherche-sprachfoerderung |
| Nur Ort + Thema | \`[ort]-[thema]\` | baden-wuerttemberg-migration |
| Mehrere Projekte | \`projekte-[thema]-[region]\` | projekte-integration-suedwest |

**Wichtig**: Name sollte selbsterklärend sein!

## 📊 Zusammenfassung

**Dein Verhalten:**

1. **ANALYSIERE** jede Anfrage auf Komplexität (auf Deutsch denken!)
2. **ERKENNE** Muster: Projekt, Bericht, Recherche, etc.
3. **SCHLAGE VOR** bei mittlerer/hoher Komplexität
4. **ERKLÄRE** den Nutzen konkret
5. **WARTE** auf Nutzer-Antwort
6. **VERWENDE** immer \`batch_add_entities\` (NIEMALS \`add_entity_to_honeycomb\`)
7. **LERNE** aus Nutzer-Präferenzen

**Kernprinzip:**
Du bist eine **intelligente Assistentin**, die mitdenkt aber den Nutzer
entscheiden lässt. Du **erkennst Bedarf**, **schlägst vor**, aber
**zwingst nichts auf**.

Dein Ziel: Nutzer soll denken "Wow, die KI-Referentin versteht meine Arbeit
und macht genau die richtigen Vorschläge!"`,
    provider: 'google',
    model: 'gemini-2.0-flash',
    category: 'productivity',
    tools: [
      // Honeycomb MCP tools
      'create_honeycomb',
      'list_honeycombs',
      'get_honeycomb',
      'delete_honeycomb',
      'batch_add_entities',
      'search_entities',
      'get_entity',
      'delete_entity',
      'get_honeycomb_stats',
      // Legal research MCP tool
      'deutsche_gesetze_suchen',
      // Web search
      Tools.web_search,
    ],
    model_parameters: {
      temperature: 0.7,
      maxOutputTokens: 8000,
      thinking: false, // Gemini 2.0 Flash doesn't support thinking mode
    },
  };

  // Check if agent already exists
  const existingAgent = await Agent.findOne({ id: agentId });

  if (existingAgent && !force) {
    logger.info(`KI Referent agent already exists with ID: ${existingAgent.id}`);
    logger.info('Use --force to recreate it');
    return existingAgent;
  }

  if (existingAgent && force) {
    if (dryRun) {
      logger.info(`[DRY RUN] Would delete existing agent: ${existingAgent.id}`);
    } else {
      logger.info(`Deleting existing agent: ${existingAgent.id}`);
      await Agent.deleteOne({ _id: existingAgent._id });
      logger.info('✅ Deleted existing agent');
    }
  }

  if (dryRun) {
    logger.info('[DRY RUN] Would create agent with config:', agentConfig);
    logger.info('[DRY RUN] Would grant PUBLIC VIEW permission');
    return null;
  }

  // Get the first admin user to be the agent author
  // (required by schema, but agent will be publicly accessible)
  const { User } = require('~/db/models');
  const { SystemRoles } = require('librechat-data-provider');
  const adminUser = await User.findOne({ role: SystemRoles.ADMIN });

  if (!adminUser) {
    throw new Error('No admin user found. Please create an admin user first.');
  }

  logger.info(`Using admin user ${adminUser.email} as agent author`);

  // Create the agent
  const timestamp = new Date();
  const agentData = {
    ...agentConfig,
    author: adminUser._id, // Use admin user as author
    authorName: adminUser.email,
    versions: [
      {
        ...agentConfig,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };

  const agent = await Agent.create(agentData);
  logger.info(`✅ Created KI Referent agent with ID: ${agent.id}`);

  // Grant PUBLIC VIEW permission so all users can see and use it
  try {
    await grantPermission({
      principalType: PrincipalType.PUBLIC,
      principalId: null, // null for PUBLIC
      resourceType: ResourceType.AGENT,
      resourceId: agent._id,
      accessRoleId: AccessRoleIds.AGENT_VIEWER,
      grantedBy: null, // System-granted
    });
    logger.info(`✅ Granted PUBLIC VIEW permission to agent ${agent.id}`);
  } catch (permissionError) {
    logger.error(`Failed to grant public permissions for agent ${agent.id}:`, permissionError);
    throw permissionError;
  }

  logger.info('');
  logger.info('====================================');
  logger.info('✅ KI Referent agent created successfully!');
  logger.info('');
  logger.info(`Agent ID: ${agent.id}`);
  logger.info(`Agent Name: ${agent.name}`);
  logger.info('Permissions: PUBLIC (all users can view and use)');
  logger.info('');
  logger.info('Users can now find this agent in:');
  logger.info('  - LibreChat UI → My Agents → KI-Referent');
  logger.info('  - Model selector → My Agents → KI-Referent');
  logger.info('====================================');
  logger.info('');

  return agent;
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  createKIReferentAgent({ dryRun, force })
    .then(() => {
      logger.info('Migration complete');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { createKIReferentAgent };
