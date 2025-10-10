# Integrationsbericht BW 2025 - E2E Test Suite

## 🎯 Zweck

Diese E2E-Tests stellen sicher, dass die **Sales-Demo-Reise** für den Integrationsbericht Baden-Württemberg 2025 **jederzeit funktioniert**.

**Ziel:** Engineering validiert automatisch, dass die Demo nicht kaputt geht, bevor Sales sie beim Kunden vorführt.

---

## 📋 Test-Dateien

### 1. **Complete Journey Test** (Haupt-Test)
**Datei:** `integrationsbericht-complete-journey.spec.ts`

**Was wird getestet:**
- ✅ Komplette 6-Schritt Demo-Reise aus [INTEGRATIONSBERICHT-2025-DEMO.md](../../docs/senticor/INTEGRATIONSBERICHT-2025-DEMO.md)
- ✅ Step 1: Projekt starten & Honeycomb erstellen
- ✅ Step 2: Pressemitteilung einlesen
- ✅ Step 3: Rechtliche Grundlagen recherchieren
- ✅ Step 3b: Paragraphen zum Wissensgraph hinzufügen
- ✅ Step 4: Projekt-Tracking-Struktur
- ✅ Step 5: Berichtsgliederung generieren
- ✅ Step 6: Suche & Analyse (Ehrenamt-Projekte, Gesamtstruktur)

**Dauer:** ~20 Minuten (mit echten AI-Antworten)

### 2. **Simple Tests** (Komponenten-Tests)
**Datei:** `integrationsbericht-demo-simple.spec.ts`

**Was wird getestet:**
- ✅ UI-Verfügbarkeit (Agents endpoint)
- ✅ Honeycomb MCP Server erreichbar
- ✅ Fetch MCP Server funktioniert
- ✅ Rechtsinformationen MCP Server funktioniert
- ✅ Proaktive KI-Vorschläge

**Dauer:** ~5-10 Minuten pro Test

---

## 🚀 Tests ausführen

### Voraussetzungen

1. **LibreChat läuft:**
   ```bash
   podman-compose up -d
   ```

2. **HIVE API erreichbar:**
   ```bash
   curl http://localhost:8000/api/honeycombs
   # Sollte JSON mit honeycombs zurückgeben
   ```

3. **Playwright installiert:**
   ```bash
   npx playwright install chromium
   ```

### Complete Journey Test (Empfohlen vor Sales-Demo)

```bash
# Mit sichtbarem Browser (für Debugging)
npx playwright test e2e/specs/integrationsbericht-complete-journey.spec.ts --headed --workers=1

# Headless (für CI/CD)
npx playwright test e2e/specs/integrationsbericht-complete-journey.spec.ts --workers=1

# Mit detailliertem Output
npx playwright test e2e/specs/integrationsbericht-complete-journey.spec.ts --headed --workers=1 --reporter=line
```

### Einzelne Komponenten testen

```bash
# Nur Smoke Test (MCP Servers)
npx playwright test e2e/specs/integrationsbericht-complete-journey.spec.ts --headed --grep "Smoke Test"

# Alle einfachen Tests
npx playwright test e2e/specs/integrationsbericht-demo-simple.spec.ts --headed --workers=1
```

---

## 📊 Test-Output verstehen

### Erfolgreicher Test

```
🎬 Starting Complete Integrationsbericht BW 2025 Demo Journey

📋 Step 0: Selecting Agents endpoint...
✅ Agents endpoint selected

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 STEP 1: Projekt starten & Wissensgraph erstellen
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📤 Sent: Ich erstelle den Integrationsbericht Baden-Württemberg 2025...
⏳ Waiting for AI response...
✅ Response received containing: honeycomb
✅ Step 1 Complete: AI suggested honeycomb creation

... (weitere Schritte)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 DEMO JOURNEY COMPLETE!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ All 6 steps executed successfully
📊 Sales team can now confidently perform this demo
🔗 Honeycomb URL: http://localhost:8000/honeycomb/...
📸 Screenshot saved: /tmp/integrationsbericht-demo-complete.png
```

### Fehlgeschlagener Test

Wenn ein Schritt fehlschlägt, zeigt der Test genau wo:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 STEP 2: Pressemitteilung einlesen & Projekte erfassen
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📤 Sent: Ja, bitte lies die Pressemitteilung...
⏳ Waiting for AI response...
❌ Error: Timeout waiting for response
```

**Action:** Prüfen ob fetch MCP Server läuft und URL erreichbar ist.

---

## ⚙️ Konfiguration

### Test-Benutzer

Der Test erstellt automatisch einen dedizierten Demo-Benutzer:

```typescript
const DEMO_USER = {
  email: 'sales-demo@senticor.de',
  name: 'Senticor Sales Demo',
  password: 'SalesDemo2025!Secure',
};
```

Dieser Benutzer wird **automatisch registriert** beim ersten Testlauf.

### Timeouts

```typescript
FULL_JOURNEY_TIMEOUT = 1200000; // 20 Minuten für komplette Reise
PER_RESPONSE_TIMEOUT = 180000;  // 3 Minuten pro AI-Antwort
```

**Warum so lang?**
- Echte AI-Modelle (Gemini 2.5 Pro) brauchen 30-120s pro Antwort
- MCP-Aufrufe addieren 5-15s pro Tool-Call
- Komplexe Workflows (fetch + add_entity) können > 2 Min dauern

### Browser-Einstellungen

```typescript
headless: false,  // Browser sichtbar (zum Debugging)
slowMo: 300,      // 300ms Verzögerung zwischen Aktionen
viewport: { width: 1920, height: 1080 }  // Full HD
```

---

## 🔍 Troubleshooting

### Test failed: "Cannot find Agents endpoint"

**Ursache:** LibreChat läuft nicht oder Agents endpoint nicht konfiguriert

**Lösung:**
```bash
# Prüfen ob LibreChat läuft
podman ps | grep LibreChat

# Neu starten
podman-compose down && podman-compose up -d

# librechat.yaml prüfen
cat librechat.yaml | grep -A5 "endpoints:"
```

### Test failed: "MCP server not responding"

**Ursache:** Einer der MCP-Server (honeycomb, fetch, rechtsinformationen) ist nicht erreichbar

**Lösung:**
```bash
# HIVE API prüfen
curl http://localhost:8000/api/honeycombs

# Container logs prüfen
podman logs LibreChat | grep MCP

# MCP-Konfiguration prüfen
cat librechat.yaml | grep -A10 "mcpServers:"
```

### Test timeout: "Waiting for AI response"

**Ursache:** AI-Modell braucht länger als erwartet (normal!)

**Lösung:**
1. **Kurzfristig:** Test erneut ausführen (manchmal ist Gemini einfach langsam)
2. **Mittelfristig:** Timeout erhöhen auf 240s
3. **Langfristig:** Schnelleres Modell für Tests (Gemini Flash statt Pro)

### Screenshot nicht erstellt

**Ursache:** Test ist vor Ende abgebrochen

**Lösung:**
```bash
# Manuell Screenshot erzeugen
npx playwright test --headed --debug
# Im Debug-Modus: Pause before screenshot
```

---

## 🤖 CI/CD Integration

### GitHub Actions Workflow

```yaml
name: Integrationsbericht Demo E2E

on:
  schedule:
    - cron: '0 8 * * 1'  # Jeden Montag um 8:00
  push:
    branches:
      - main
    paths:
      - 'librechat.yaml'
      - 'docs/senticor/INTEGRATIONSBERICHT-2025-DEMO.md'

jobs:
  demo-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Start LibreChat
        run: docker-compose up -d

      - name: Install Playwright
        run: npx playwright install chromium

      - name: Run Complete Journey Test
        run: npx playwright test e2e/specs/integrationsbericht-complete-journey.spec.ts --workers=1
        timeout-minutes: 25

      - name: Upload Screenshot
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: demo-screenshot
          path: /tmp/integrationsbericht-demo-complete.png

      - name: Notify Sales Team
        if: failure()
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
            -d '{"text":"⚠️ Integrationsbericht Demo ist kaputt! Sales-Demo NICHT durchführen bis Engineering gefixed hat."}'
```

### Wann Tests laufen sollten

1. **Vor jedem Sales-Call:** Manuell ausführen
   ```bash
   npx playwright test e2e/specs/integrationsbericht-complete-journey.spec.ts --headed --workers=1
   ```

2. **Nach Config-Änderungen:** Automatisch in CI/CD
   - Änderungen an `librechat.yaml`
   - Änderungen an MCP-Server-Konfiguration
   - Änderungen an Demo-Dokumentation

3. **Wöchentlich:** Scheduled CI/CD Run
   - Jeden Montag morgen
   - Stellt sicher, dass externe APIs noch funktionieren (gesetze-im-internet.de)

---

## 📈 Test-Metriken

### Was wird gemessen

1. **Test-Dauer:** Sollte < 25 Minuten sein
2. **AI-Antwortzeit:** Pro Schritt 30-180 Sekunden
3. **MCP-Verfügbarkeit:** 100% (alle 3 Server erreichbar)
4. **Erfolgsrate:** > 95% (gelegentliche Timeouts sind normal)

### Aktuelle Baseline (2025-10-10)

```
Complete Journey Test:
  ├─ Step 1 (Honeycomb):        45s
  ├─ Step 2 (Fetch):             120s
  ├─ Step 3 (Legal Research):    90s
  ├─ Step 3b (Add Laws):         150s
  ├─ Step 4 (Tracking):          60s
  ├─ Step 5 (Outline):           80s
  └─ Step 6 (Search):            75s

Total: ~12 Minuten
```

---

## 📚 Verwandte Dokumentation

### Für Engineering
- [DEMO-TEST-REPORT.md](../../docs/senticor/DEMO-TEST-REPORT.md) - Test-Ergebnisse
- [LIBRECHAT-MCP-BUG-REPORT.md](../../docs/senticor/LIBRECHAT-MCP-BUG-REPORT.md) - Bekannte Bugs
- [PROACTIVE-AGENT-SETUP.md](../../docs/senticor/PROACTIVE-AGENT-SETUP.md) - MCP-Konfiguration

### Für Sales
- [INTEGRATIONSBERICHT-2025-DEMO.md](../../docs/senticor/INTEGRATIONSBERICHT-2025-DEMO.md) - Demo-Skript
- [populate-integrationsbericht.sh](../../docs/senticor/populate-integrationsbericht.sh) - Demo-Daten erstellen

---

## 🎯 Erfolgs-Kriterien

Ein Test gilt als **erfolgreich**, wenn:

✅ Alle 6 Schritte durchlaufen wurden
✅ AI hat proaktiv Honeycomb vorgeschlagen (Step 1)
✅ Pressemitteilung wurde gelesen (Step 2)
✅ Deutsche Gesetze wurden gefunden (Step 3)
✅ Berichtsgliederung wurde generiert (Step 5)
✅ Suche nach Ehrenamt-Projekten liefert Ergebnisse (Step 6)
✅ Screenshot wurde erstellt
✅ Keine kritischen Fehler in Console

Ein Test ist **fehlgeschlagen**, wenn:

❌ MCP-Server nicht erreichbar
❌ AI antwortet nicht (Timeout > 3 Min)
❌ LibreChat UI lädt nicht
❌ Agents endpoint nicht verfügbar
❌ Demo-Benutzer kann nicht erstellt werden

---

## 💡 Best Practices

### Vor Sales-Demo (Engineering Checklist)

```bash
# 1. Test ausführen
npx playwright test e2e/specs/integrationsbericht-complete-journey.spec.ts --headed --workers=1

# 2. Bei Erfolg: Demo-Daten populieren
bash docs/senticor/populate-integrationsbericht.sh

# 3. HIVE UI öffnen und visuell prüfen
open http://localhost:8000/honeycomb/hc_bericht_integration_baden_wuerttemberg_2025

# 4. Sales-Team informieren
echo "✅ Demo ist ready - all systems go!"
```

### Nach fehlgeschlagenem Test

1. **NICHT Sales-Demo durchführen** bis der Test grün ist!
2. Logs prüfen: `/tmp/complete-journey-test.log`
3. MCP-Server-Status prüfen: `podman logs LibreChat | grep MCP`
4. Bei Bedarf LibreChat neu starten
5. Test erneut ausführen
6. Bei weiterem Fehler: Engineering-Team eskalieren

---

**Maintainer:** Engineering Team
**Letzte Aktualisierung:** 2025-10-10
**Test-Version:** 1.0.0
