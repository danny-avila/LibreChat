# Demo: Integrationsbericht Baden-Württemberg 2025

**Dauer:** 15-20 Minuten
**Veröffentlichung:** Q1 2026
**Ziel:** Zeigen, wie LibreChat mit MCP-Servern komplexe Recherche- und Dokumentationsaufgaben unterstützt

---

## 🎯 Das Szenario

Sie sind Referent*in im **Ministerium für Soziales, Gesundheit und Integration Baden-Württemberg** und erstellen den **Integrationsbericht 2025**, der im **Q1 2026** veröffentlicht wird.

**Kernaufgabe:** Dokumentation von 34 lokalen Integrationsprojekten, die mit 1,8 Millionen Euro gefördert werden.

**Herausforderungen:**
- 34 Projekte müssen recherchiert und dokumentiert werden
- Rechtliche Grundlagen müssen aktuell sein
- Projektfortschritte müssen bis Q1 2026 nachverfolgt werden
- Alle Informationen brauchen Quellenangaben

**Die Lösung:** LibreChat mit drei MCP-Servern:
- 📊 **HIVE Honeycomb** - Wissensgraph für strukturierte Datenhaltung
- ⚖️ **Rechtsinformationen** - Direkter Zugriff auf deutsche Bundesgesetze
- 🌐 **Fetch** - Webseiten und Pressemitteilungen einlesen

---

## 🚀 Demo-Ablauf

### Schritt 1: Projekt starten (2-3 Min)

**Sie:**
> Ich erstelle den Integrationsbericht Baden-Württemberg 2025 für die Veröffentlichung im Q1 2026. Das Kernstück ist ein Update zu 34 lokalen Integrationsprojekten. Hier ist die Pressemitteilung dazu:
>
> https://sozialministerium.baden-wuerttemberg.de/de/service/presse/pressemitteilung/pid/land-foerdert-34-lokale-integrationsprojekte-mit-rund-18-millionen-euro

**LibreChat (proaktiv):**
> Verstanden! Für einen Bericht mit 34 Projekten, die du bis Q1 2026 tracken musst, würde ich einen **Wissensgraphen** empfehlen. So kannst du:
>
> - Alle Projekte strukturiert erfassen
> - Trägerorganisationen dokumentieren
> - Projektfortschritte nachverfolgen
> - Rechtliche Grundlagen pflegen
> - Quellenangaben für Zitationen bereitstellen
>
> Ich erstelle dir einen Honeycomb "Integrationsbericht Baden-Württemberg 2025".
>
> [create_honeycomb wird aufgerufen]
>
> ✅ **Wissensgraph erstellt!**
>
> Soll ich jetzt die Pressemitteilung lesen und die Projekte erfassen?

---

### Schritt 2: Pressemitteilung einlesen (3-4 Min)

**Sie:**
> Ja, bitte lies die Pressemitteilung und erfasse die wichtigsten Informationen.

**LibreChat:**
> [fetch wird aufgerufen mit der URL]
>
> 📰 **Pressemitteilung vom 15. März 2024:**
> "Land fördert 34 lokale Integrationsprojekte mit rund 1,8 Millionen Euro"
>
> **Zentrale Info:**
> - Förderprogramm: "Stärkung der kommunalen Integrationsprojekte"
> - Gesamtsumme: 1,8 Millionen Euro
> - Anzahl: 34 Projekte
> - Ministerium: Ministerium für Soziales, Gesundheit und Integration BW
> - Staatssekretär: Dr. Arne Braun
>
> **Projektbeispiele aus der Pressemitteilung:**
> 1. Landkreis Karlsruhe: "Zusammen stark im Ehrenamt" (Internationaler Bund e.V.)
> 2. Stadt Mannheim: "Interkulturelle Öffnung" (Caritas)
> 3. Stadt Freiburg: "Mentoring für Geflüchtete" (Deutsches Rotes Kreuz)
> 4. Stadt Stuttgart: "Sprachmittlung im Alltag" (Diakonie)
> 5. Stadt Heidelberg: "Integration durch Sport" (TSV Heidelberg)
>
> Ich erfasse jetzt das Ministerium und diese 5 Beispielprojekte mit ihren Trägern.
>
> [add_entity_to_honeycomb wird mehrfach aufgerufen]
>
> ✅ **Erfasst:**
> - 1 Ministerium
> - 5 Beispielprojekte
> - 5 Trägerorganisationen
>
> Alle Daten haben die Pressemitteilungs-URL als Quelle und das heutige Datum als Abrufdatum.

---

### Schritt 3: Rechtliche Grundlagen recherchieren (3-4 Min)

**Sie:**
> Welche Gesetze regeln Integration in Baden-Württemberg? Ich brauche die rechtliche Grundlage für Kapitel 2 des Berichts.

**LibreChat (proaktiv):**
> Ich durchsuche die deutsche Rechtsdatenbank für dich!
>
> [deutsche_gesetze_suchen mit "Integration"]
>
> 🔍 **Zentrale Integrationsgesetze auf Bundesebene:**
>
> **1. SGB XII - Sozialgesetzbuch Zwölftes Buch (Sozialhilfe)**
> - § 33: Umfang der Sozialhilfe
> - § 44: Eingliederungshilfe
> - § 67-69: Hilfe zur Überwindung sozialer Schwierigkeiten
> - Link: https://www.gesetze-im-internet.de/sgb_12/
>
> **2. AufenthG - Aufenthaltsgesetz**
> - § 43: Integrationskurs
> - § 44: Integrationsprogramm des Bundes
> - § 44a: Integrationskursverordnung
> - § 45: Beschäftigung und Integration
> - Link: https://www.gesetze-im-internet.de/aufenthg_2004/
>
> **3. IntG - Integrationsgesetz**
> - § 1: Förderung der Integration
> - § 2: Integrationskurse
> - § 3: Auflagen zur Integration
> - Link: https://www.gesetze-im-internet.de/intg/
>
> **Landesebene:**
> - PartIntG BW - Partizipations- und Integrationsgesetz Baden-Württemberg
>
> Soll ich die wichtigsten Paragraphen in den Wissensgraphen aufnehmen? Das gibt dir die rechtliche Grundlage für Kapitel 2.

**Sie:**
> Ja, füge die zentralen Paragraphen hinzu.

**LibreChat:**
> [gesetz_per_eli_abrufen und get_paragraph werden für mehrere Paragraphen aufgerufen]
> [add_entity_to_honeycomb fügt Gesetzestexte hinzu]
>
> ✅ **Hinzugefügt:**
> - 6 Paragraphen aus SGB XII
> - 5 Paragraphen aus AufenthG
> - 4 Paragraphen aus IntG
>
> Jeder Paragraph enthält:
> - Den vollständigen Gesetzestext
> - Die offizielle URL auf gesetze-im-internet.de
> - Paragraphennummer und Titel
>
> Die rechtliche Grundlage für Kapitel 2 ist jetzt komplett!

---

### Schritt 4: Projekt-Tracking vorbereiten (2-3 Min)

**Sie:**
> Bis Q1 2026 muss ich für jedes Projekt dokumentieren:
> - Zielerreichung und Kennzahlen
> - Herausforderungen
> - Best Practices
>
> Wie strukturiere ich das am besten?

**LibreChat:**
> Für einen Bericht im Q1 2026 würde ich empfehlen, für jedes der 5 erfassten Projekte (und später für alle 34) eine **Status-Update-Struktur** anzulegen.
>
> **Pro Projekt solltest du tracken:**
>
> 1. **Zielerreichung**
>    - Geplante vs. erreichte Teilnehmerzahl
>    - Durchgeführte Maßnahmen
>
> 2. **Kennzahlen**
>    - Anzahl erreichter Personen
>    - Anzahl Veranstaltungen
>    - Vermittlungsquote
>
> 3. **Nachhaltigkeit**
>    - Weiterführung nach Förderende?
>    - Etablierte Strukturen?
>
> 4. **Herausforderungen**
>    - Verzögerungen oder Schwierigkeiten
>
> 5. **Best Practices**
>    - Besonders erfolgreiche Ansätze
>    - Übertragbarkeit auf andere Kommunen
>
> Ich erstelle für jedes der 5 Projekte eine Status-Update-Entität als Platzhalter. Du kannst diese dann bis Q1 2026 mit deinen Recherchen füllen.
>
> [add_entity_to_honeycomb für 5 ProjectStatus-Entitäten]
>
> ✅ **Status-Struktur erstellt!**
>
> Du kannst jetzt für jedes Projekt die Updates ergänzen, wann immer du neue Informationen hast.

---

### Schritt 5: Berichtsgliederung generieren (2-3 Min)

**Sie:**
> Erstelle eine Gliederung für den Integrationsbericht basierend auf den Daten, die wir bisher gesammelt haben.

**LibreChat:**
> [get_honeycomb analysiert die Struktur]
>
> 📋 **Integrationsbericht Baden-Württemberg 2025**
> **Gliederungsvorschlag:**
>
> ---
>
> ## 1. Einleitung
> 1.1 Ziel und Aufbau des Berichts
> 1.2 Datengrundlage und Methodik
> 1.3 Danksagung
>
> ## 2. Rechtliche Grundlagen der Integration
> 2.1 Bundesrechtliche Rahmenbedingungen
> - 2.1.1 SGB XII - Sozialhilfe (6 Paragraphen)
> - 2.1.2 Aufenthaltsgesetz (5 Paragraphen)
> - 2.1.3 Integrationsgesetz (4 Paragraphen)
>
> 2.2 Landesrechtliche Grundlagen
> - 2.2.1 Partizipations- und Integrationsgesetz BW
>
> ## 3. Förderprogramm "Stärkung der kommunalen Integrationsprojekte"
> 3.1 Überblick und Ziele
> 3.2 Fördervolumen (1,8 Mio. €, 34 Projekte)
> 3.3 Regionale Verteilung
> 3.4 Trägerorganisationen im Überblick
>
> ## 4. Projektdarstellung (34 Projekte)
>
> **Für jedes Projekt:**
> - Projektbeschreibung und Ziele
> - Träger und Zielgruppe
> - Durchgeführte Maßnahmen
> - Kennzahlen und Zielerreichung
> - Herausforderungen
> - Best Practices und Übertragbarkeit
>
> **Beispielprojekte bereits erfasst:**
> - Landkreis Karlsruhe: "Zusammen stark im Ehrenamt"
> - Stadt Mannheim: "Interkulturelle Öffnung"
> - Stadt Freiburg: "Mentoring für Geflüchtete"
> - Stadt Stuttgart: "Sprachmittlung im Alltag"
> - Stadt Heidelberg: "Integration durch Sport"
>
> ## 5. Gesamtauswertung und Erfolgsfaktoren
> 5.1 Übergreifende Kennzahlen
> 5.2 Identifizierte Best Practices
> 5.3 Herausforderungen und Lessons Learned
> 5.4 Handlungsempfehlungen
>
> ## 6. Ausblick und Empfehlungen
> 6.1 Fortführung erfolgreicher Ansätze
> 6.2 Handlungsempfehlungen für künftige Förderperioden
> 6.3 Perspektiven 2026 und darüber hinaus
>
> ## Anhang
> A. Liste aller geförderten Projekte (34)
> B. Übersicht Trägerorganisationen
> C. Quellenverzeichnis
> D. Abkürzungsverzeichnis
>
> ---
>
> 📊 **Aktuelle Datenbasis im Wissensgraphen:**
> - 11 Entitäten (5 Projekte + 5 Träger + 1 Ministerium)
> - 15 Gesetzesparagraphen
> - 5 Status-Update-Platzhalter
>
> **Nächste Schritte bis Q1 2026:**
> 1. Verbleibende 29 Projekte erfassen
> 2. Status-Updates für alle Projekte ergänzen
> 3. Kapitel ausformulieren
>
> Soll ich ein Muster-Kapitel für das Projekt in Karlsruhe ausformulieren?

---

### Schritt 6: Suche und Analyse (2-3 Min)

**Sie:**
> Finde alle Projekte, die sich mit Ehrenamt beschäftigen.

**LibreChat:**
> [search_entities mit "Ehrenamt"]
>
> 🔍 **1 Projekt gefunden mit Fokus "Ehrenamt":**
>
> **"Zusammen stark im Ehrenamt"**
> - Träger: Internationaler Bund (IB) e.V.
> - Region: Landkreis Karlsruhe
> - Quelle: Pressemitteilung vom 15.03.2024
>
> In der vollständigen Pressemitteilung werden vermutlich noch weitere Ehrenamts-Projekte erwähnt. Sobald du alle 34 Projekte erfasst hast, können wir eine vollständige Ehrenamts-Analyse machen.
>
> 💡 Diese Projekte könnten in Kapitel 4 als eigenes Unterkapitel "Ehrenamtliches Engagement in der Integration" zusammengefasst werden.

**Sie:**
> Zeige mir die vollständige Struktur des Wissensgraphen.

**LibreChat:**
> [get_honeycomb]
>
> 📊 **Integrationsbericht Baden-Württemberg 2025 - Aktuelle Struktur**
>
> 🎯 **Kontext:**
> Wissensgraph für den Integrationsbericht BW 2025 (Veröffentlichung Q1 2026).
> Fokus: 34 lokale Integrationsprojekte (Förderung 1,8 Mio. €)
>
> ---
>
> **Aktuell erfasst:**
>
> 🏢 **Ministerium:**
> - Ministerium für Soziales, Gesundheit und Integration Baden-Württemberg
>
> 📋 **5 Beispielprojekte:**
> 1. Zusammen stark im Ehrenamt (Landkreis Karlsruhe)
> 2. Interkulturelle Öffnung (Stadt Mannheim)
> 3. Mentoring für Geflüchtete (Stadt Freiburg)
> 4. Sprachmittlung im Alltag (Stadt Stuttgart)
> 5. Integration durch Sport (Stadt Heidelberg)
>
> 🏢 **5 Trägerorganisationen:**
> - Internationaler Bund (IB) e.V.
> - Caritas Mannheim
> - Deutsches Rotes Kreuz Freiburg
> - Diakonie Stuttgart
> - TSV Heidelberg
>
> ⚖️ **15 Gesetzesparagraphen:**
> - SGB XII (Sozialhilfe): 6 Paragraphen
> - AufenthG (Aufenthaltsgesetz): 5 Paragraphen
> - IntG (Integrationsgesetz): 4 Paragraphen
>
> 📝 **Quellenangaben:**
> - Alle Projekte: Pressemitteilung vom 15.03.2024
> - Alle Paragraphen: gesetze-im-internet.de
> - Abrufdatum: 2025-10-10
>
> ---
>
> 🔗 **Visualisierung:**
> http://localhost:8000/honeycomb/hc_bericht_integration_baden_wuerttemberg_2025
>
> **Workflow bis Q1 2026:**
> 1. Verbleibende 29 Projekte aus der Pressemitteilung erfassen
> 2. Status-Updates für alle Projekte mit Kennzahlen ergänzen
> 3. Kapitel ausformulieren
> 4. Quellenverzeichnis automatisch generieren

---

## 💡 Was diese Demo zeigt

### ✅ Realistische Anwendung

**Nicht:** "Was ist § 33 SGB XII?" (triviale Einzelabfrage)

**Sondern:** Komplexer Workflow für ein echtes Deliverable (Bericht Q1 2026) mit:
- Strukturierter Datenerfassung (34 Projekte)
- Automatischer Quellenangabe
- Rechtlicher Recherche
- Langfristigem Tracking
- Automatischer Gliederungserstellung

### ✅ Proaktive KI-Assistenz

Die KI schlägt **von sich aus** vor:
- Wissensgraph für komplexe Projekte
- Web-Fetching für Pressemitteilungen
- Rechtsdatenbank-Suche
- Struktur-Templates für Tracking
- Thematische Analysen (Ehrenamt-Projekte)

### ✅ Praktischer Nutzen

- **Alle Daten haben Quellenangaben** (für wissenschaftliche Zitation)
- **Durchsuchbar und analysierbar** (z.B. "Finde Ehrenamts-Projekte")
- **Bis Q1 2026 erweiterbar** (Status-Updates ergänzen)
- **Exportierbar** für das finale Berichtsdokument

### ✅ MCP-Integration

Drei MCP-Server arbeiten nahtlos zusammen:
- `honeycomb`: 9 Tools für Wissensgraph-Operationen
- `rechtsinformationen-bund-de`: 6 Tools für Gesetzesabruf
- `fetch`: 1 Tool für Web-Scraping

---

## 🎬 Timing (15-20 Minuten)

```
[0:00-0:02]  Einleitung: Aufgabe erklären
[0:02-0:05]  Wissensgraph erstellen
[0:05-0:09]  Pressemitteilung einlesen, Projekte erfassen
[0:09-0:13]  Rechtliche Grundlagen recherchieren
[0:13-0:16]  Projekt-Tracking-Struktur anlegen
[0:16-0:19]  Berichtsgliederung generieren
[0:19-0:22]  Suche und Analyse (Ehrenamt)
[0:22-0:25]  Abschluss: Visualisierung zeigen, nächste Schritte
```

---

## 🔧 Technische Setup-Info

**System:**
- LibreChat v0.8.0 mit Agents-Endpoint
- HIVE Honeycomb API (http://localhost:8000)
- Podman Container

**MCP-Server:**
1. `honeycomb` (senticor-hive-mcp)
2. `rechtsinformationen-bund-de` (rechtsinformationen-bund-de-mcp)
3. `fetch` (mcp-server-fetch via uvx)

**Konfiguration:**
- Proaktive Instruktionen in [librechat.yaml](../../librechat.yaml)
- `serverInstructions: |` mit deutschen Demo-Anweisungen
- Podman-Netzwerk: `host.containers.internal:8000`

---

## 📚 Verwandte Dokumentation

- [PROACTIVE-AGENT-SETUP.md](PROACTIVE-AGENT-SETUP.md) - MCP-Proaktivität konfigurieren
- [HONEYCOMB-MCP-SETUP.md](HONEYCOMB-MCP-SETUP.md) - HIVE Honeycomb Setup
- [HIVE UI](http://localhost:8000) - Wissensgraph visualisieren

---

**Diese Demo zeigt einen realistischen, wertschöpfenden Workflow! 🎯📊**
