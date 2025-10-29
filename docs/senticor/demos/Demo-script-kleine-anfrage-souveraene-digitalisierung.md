# Demo: Kleine Anfrage - Digitale Souveränität in Kommunen

**Duration**: 8-10 minutes
**Topic**: Souveräne Digitalisierungsprojekte (OpenDesk, Delos, Smart Cities)
**Goal**: Show how LibreChat + Hive enables fast, accurate, and traceable parliamentary responses

---

## 📋 Quick Copy & Paste – Demo Prompts

**Setup** (not shown to audience):
```
Ich arbeite an einer Kleinen Anfrage aus dem Bundestag zum Thema "Digitale Souveränität
in deutschen Kommunen". Bitte nutze den Wissensgraphen "Souveraene_Digitalisierung_Kommunen_2024"
für alle Anfragen.
```

**1. Initial Query**
```
Welche Smart Cities Modellprojekte gibt es in Baden-Württemberg, und welche dieser
Kommunen nutzen auch souveräne Digitalisierungslösungen wie OpenDesk?
```

**2. Accept Web Fetch** (if LibreChat offers)
```
Ja bitte, hole aktuelle Informationen und füge sie dem Wissensgraphen hinzu.
```

**3. Statistical Analysis**
```
Zeige mir eine Übersicht: Welche Bundesländer haben die meisten Kommunen mit
Smart Cities Förderung? Aufschlüsselung nach Anzahl und Fördersumme.
```

**4. Generate Kleine Anfrage Response**
```
Erstelle eine Antwort auf diese Kleine Anfrage im offiziellen Bundestag-Format:

"Wie viele deutsche Kommunen haben im Jahr 2024 Förderung für souveräne
Digitalisierungsprojekte erhalten?

1. Wie viele Kommunen nehmen am Smart Cities Modellprojekt teil, aufgeschlüsselt nach Bundesländern?
2. Welche Gesamtfördersumme wurde bereitgestellt?
3. Welche Kommunen nutzen bereits souveräne Lösungen wie OpenDesk?
4. Wie ist der aktuelle Stand bei Delos Cloud?

Bitte mit vollständigen Quellenangaben."
```

**5. Verify in Hive**
```
Zeige mir die Struktur des Wissensgraphen mit allen hinzugefügten Entitäten und Quellen.
```

---

## 🎯 Das Szenario

**Sie sind Referent*in im Bundesministerium für Digitales und Verkehr (BMDV).**

**Die Situation**:
Heute Morgen erreicht Sie eine **Kleine Anfrage** aus dem Bundestag vom Ausschuss für Digitales:

> *"Die Fraktion fragt nach dem aktuellen Stand digitaler Souveränität in deutschen Kommunen, insbesondere bezüglich Smart Cities Förderung, OpenDesk-Nutzung, und Delos Cloud."*

**Die Herausforderung**:
- Antwortfrist: **3 Tage** (gesetzlich 14 Tage, aber politisch erwartet: schnell!)
- Daten aus **mehreren Quellen**: Smart Cities Programm (BMWSB), OpenDesk (ZenDiS), Delos Cloud (BMI), Länderprogramme
- **73 Smart Cities Kommunen** über 16 Bundesländer verteilt
- Alles muss **quellenbasiert** und **nachprüfbar** sein
- Format muss **offiziellen Bundestag-Standards** entsprechen

**Traditioneller Ansatz**:
- 1-2 Tage für Datensammlung aus verschiedenen Abteilungen
- Excel-Tabellen für Statistiken (Fehleranfällig!)
- Manuelles Zusammentragen von Quellen
- Formatierung nach Bundestag-Vorlage
- Mehrfache Abstimmungsschleifen

**Mit LibreChat + Hive**:
- Minuten statt Tage
- Automatische Aggregation und Statistiken
- Vollständige Quellenangaben
- Korrektes Format automatisch generiert
- Jede Zahl im Wissensgraph nachvollziehbar

---

## 🚀 Demo-Ablauf

### **Vorbereitung** (vor Demo, nicht gezeigt)

**Hive Honeycomb** vorbereitet mit:
- **4 Kernprogramme**: Smart Cities, OpenDesk, Delos, Digitale Zukunftskommune@bw
- **~20 Beispielkommunen**: Potsdam, Heidelberg, Karlsruhe, Hamburg, München, etc.
- **16 Bundesländer**: Alle deutschen Länder
- **Beziehungen**: Kommune → Programm, Kommune → Bundesland, Programm → Förderung
- **Quellen**: Offizielle URLs von Bundesprogrammen, Ministerien, ZenDiS
- **Bundestag-Format**: Template für Kleine Anfrage Antworten

---

### **Act 1: Die Anfrage** (0:30)

**[Zeige Kleine Anfrage Dokument]**

**Moderator**:
> "Sie haben eine Kleine Anfrage erhalten. Der Bundestag möchte wissen:
> Wie viele Kommunen sind in souveränen Digitalisierungsprojekten aktiv?
>
> Normalerweise würden Sie jetzt beginnen, Kollegen zu kontaktieren,
> Datenbanken zu durchsuchen, Excel-Tabellen zu erstellen.
>
> Schauen wir, wie LibreChat und Hive helfen können."

---

### **Act 2: Erste Abfrage an LibreChat** (2:00)

**[Wechsel zu LibreChat Interface]**

**Prompt eingeben**:
```
Welche Smart Cities Modellprojekte gibt es in Baden-Württemberg, und welche dieser
Kommunen nutzen auch souveräne Digitalisierungslösungen wie OpenDesk?
```

**Erwartete LibreChat Antwort**:
> "Ich durchsuche den Wissensgraphen 'Souveräne Digitalisierung'...
>
> **Smart Cities Modellprojekte in Baden-Württemberg:**
>
> Ich finde folgende Kommunen aus Baden-Württemberg im Smart Cities Programm:
>
> 1. **Heidelberg** (Förderung: Teil von Runde 1, 2019)
> 2. **Karlsruhe** (Förderung: Teil von Runde 1, 2019)
> 3. **Ulm** (Förderung: Teil von Digitale Zukunftskommune@bw, €880.000)
> 4. **Konstanz** (Förderung: Runde 3, 2021)
> 5. **Pforzheim** (Förderung: Runde 3, 2021)
>
> **OpenDesk-Nutzung:**
> Baden-Württemberg ist Vorreiter bei OpenDesk-Einführung:
> - **Landesweit**: ~60.000 Arbeitsplätze für Digitaler Arbeitsplatz für Lehrer (DAP)
> - Start: Schuljahr 2024
>
> **Überschneidung**: Die Kommunen Heidelberg und Karlsruhe haben sowohl Smart Cities
> Förderung als auch profitieren indirekt von der landesweiten OpenDesk-Einführung.
>
> ⚠️ **Hinweis**: Meine Daten über OpenDesk-Nutzung auf kommunaler Ebene sind begrenzt.
> Soll ich aktuelle Informationen von der offiziellen ZenDiS/OpenDesk Website abrufen?
>
> **Quellen**:
> - Smart Cities: https://www.smart-city-dialog.de (Stand: 2024-10-29)
> - OpenDesk BW: https://im.baden-wuerttemberg.de (Stand: 2024-10-29)"

**Talking Points**:
- ✅ LibreChat findet relevante Kommunen aus dem Wissensgraph
- ✅ Zeigt Überschneidungen zwischen Programmen
- ✅ Gibt Quellenangaben
- ✅ **Proaktiv**: Bietet an, fehlende Daten von offiziellen Websites zu holen

---

### **Act 3: Live Web Fetch (Optional)** (1:30)

**Prompt**:
```
Ja bitte, hole aktuelle Informationen von der OpenDesk Website und füge sie dem
Wissensgraphen hinzu.
```

**Erwartete Reaktion**:
> "Ich rufe aktuelle Informationen von ZenDiS ab...
>
> [fetch wird aufgerufen: https://www.zendis.de oder OpenDesk-Projektseiten]
>
> ✅ **Neue Informationen gefunden**:
>
> **Bundesweite OpenDesk-Einführung**:
> - Robert Koch Institut (RKI): Produktiveinsatz für Agora-Platform
> - Bundesamt für Seeschifffahrt und Hydrographie (BSH): Pilot
> - 6 weitere Bundesländer in Pilotphase (Namen teilweise nicht öffentlich)
> - **Baden-Württemberg**: 60.000 Arbeitsplätze (bestätigt)
> - **Schleswig-Holstein**: Vorbereitungen abgeschlossen, Beitritt zu ZenDiS geplant
> - **Thüringen**: Gesellschaftervereinbarung unterzeichnet
>
> Ich füge diese Informationen jetzt dem Wissensgraphen hinzu...
>
> [add_entity_to_honeycomb wird mehrfach aufgerufen]
>
> ✅ **Hinzugefügt**:
> - 3 neue Bundesbehörden (RKI, BSH, BWI GmbH)
> - 2 weitere Bundesländer mit Details (Schleswig-Holstein, Thüringen)
> - Aktualisierte Zeitstempel und Quellen
>
> Die Daten sind jetzt aktuell und können für die Kleine Anfrage Antwort genutzt werden."

**Talking Points**:
- ✅ AI holt **proaktiv** aktuelle Informationen
- ✅ **Strukturiert** Daten automatisch für Wissensgraph
- ✅ **Erweitert** bestehendes Wissen
- ✅ Alle neuen Daten mit **Quellen** und **Zeitstempel**

---

### **Act 4: Statistische Analyse** (1:30)

**Prompt**:
```
Zeige mir eine Übersicht: Welche Bundesländer haben die meisten Kommunen mit
Smart Cities Förderung? Aufschlüsselung nach Anzahl und Fördersumme.
```

**Erwartete Antwort**:
> "Ich analysiere die Smart Cities Projekte nach Bundesländern...
>
> **Smart Cities Modellprojekte - Übersicht nach Bundesländern**
>
> | Bundesland | Anzahl Kommunen | Fördersumme (geschätzt)* |
> |------------|-----------------|--------------------------|
> | Nordrhein-Westfalen | 12 | ~€135 Mio. |
> | Bayern | 8 | ~€90 Mio. |
> | Baden-Württemberg | 7 | ~€75 Mio. |
> | Niedersachsen | 6 | ~€65 Mio. |
> | Brandenburg | 5 | ~€55 Mio. |
> | Sachsen | 4 | ~€45 Mio. |
> | Hessen | 4 | ~€40 Mio. |
> | Thüringen | 3 | ~€35 Mio. |
> | ... | ... | ... |
> | **Gesamt** | **73** | **~€820 Mio.** |
>
> *Fördersummen basierend auf bekannten Projektdaten, hochgerechnet
>
> **Top 5 Kommunen nach Förderung**:
> 1. Hamburg-Leipzig-München Konsortium: ~€45 Mio.
> 2. Köln: ~€20 Mio.
> 3. Dresden: ~€18 Mio.
> 4. Gelsenkirchen: ~€15 Mio.
> 5. Heidelberg: ~€12 Mio.
>
> **Quellen**:
> - Smart City Charta (BMWSB, 2024)
> - Modellprojekte Smart Cities Übersicht (smart-city-dialog.de)
> - Einzelne Projektbeschreibungen der Kommunen
>
> Soll ich daraus eine Tabelle im Bundestag-Format für die Kleine Anfrage erstellen?"

**Talking Points**:
- ✅ **Automatische Aggregation** aus 73+ Datenpunkten
- ✅ **Statistiken** werden aus Graph berechnet
- ✅ **Keine manuelle Excel-Arbeit**
- ✅ Jede Zahl ist **zurückverfolgbar** zu Quellen

---

### **Act 5: Kleine Anfrage Antwort generieren** (2:00)

**Prompt**:
```
Erstelle eine Antwort auf diese Kleine Anfrage im offiziellen Bundestag-Format:

"Wie viele deutsche Kommunen haben im Jahr 2024 Förderung für souveräne
Digitalisierungsprojekte erhalten?

1. Wie viele Kommunen nehmen am Smart Cities Modellprojekt teil, aufgeschlüsselt nach Bundesländern?
2. Welche Gesamtfördersumme wurde bereitgestellt?
3. Welche Kommunen nutzen bereits souveräne Lösungen wie OpenDesk?
4. Wie ist der aktuelle Stand bei Delos Cloud?

Bitte mit vollständigen Quellenangaben."
```

**Erwartete Antwort** (verkürzt für Demo):
> "Ich erstelle die Antwort im offiziellen Format...
>
> ---
>
> **Deutscher Bundestag**
> **Drucksache 20/XXXX**
> **20. Wahlperiode**
> **[Datum]**
>
> **Antwort**
> **der Bundesregierung**
>
> auf die Kleine Anfrage der Abgeordneten [Name], [Name], [Name] und der Fraktion [Partei]
> – Drucksache 20/YYYY –
>
> **Digitale Souveränität in deutschen Kommunen – Stand souveräner Digitalisierungsprojekte**
>
> ---
>
> **Vorbemerkung der Fragesteller**
>
> Die Digitalisierung der öffentlichen Verwaltung ist eine zentrale Herausforderung.
> Souveräne Digitalisierungslösungen, die Datenschutz und Unabhängigkeit gewährleisten,
> sind dabei von besonderer Bedeutung. Die Fragesteller erkundigen sich nach dem
> aktuellen Stand entsprechender Projekte in deutschen Kommunen.
>
> **Vorbemerkung der Bundesregierung**
>
> Die Bundesregierung fördert die digitale Transformation der Kommunen durch verschiedene
> Programme mit Schwerpunkt auf digitaler Souveränität und offenen Standards.
>
> ---
>
> **1. Wie viele Kommunen nehmen am Smart Cities Modellprojekt teil, aufgeschlüsselt nach Bundesländern?**
>
> Im Rahmen der „Modellprojekte Smart Cities" des Bundesministeriums für Wohnen,
> Stadtentwicklung und Bauwesen (BMWSB) nehmen insgesamt **73 Kommunen** in drei
> Förderrunden (2019, 2020, 2021) teil.
>
> Aufschlüsselung nach Bundesländern:
>
> | Bundesland | Anzahl Kommunen |
> |------------|-----------------|
> | Nordrhein-Westfalen | 12 |
> | Bayern | 8 |
> | Baden-Württemberg | 7 |
> | Niedersachsen | 6 |
> | Brandenburg | 5 |
> | Sachsen | 4 |
> | Hessen | 4 |
> | Thüringen | 3 |
> | Schleswig-Holstein | 3 |
> | Rheinland-Pfalz | 3 |
> | Sachsen-Anhalt | 2 |
> | Mecklenburg-Vorpommern | 2 |
> | Saarland | 1 |
> | Berlin | 1 (als Konsortiumsmitglied) |
> | Hamburg | 1 (als Konsortiumsmitglied) |
> | Bremen | - |
>
> (Stand: Oktober 2024)
>
> ---
>
> **2. Welche Gesamtfördersumme wurde bereitgestellt?**
>
> Die Gesamtfördersumme für die „Modellprojekte Smart Cities" beträgt **820 Millionen Euro**
> für alle drei Förderrunden:
>
> - **1. Förderrunde (2019)**: 13 Projekte, ca. 170 Millionen Euro
> - **2. Förderrunde (2020)**: 32 Projekte, ca. 350 Millionen Euro
> - **3. Förderrunde (2021)**: 28 Projekte, ca. 300 Millionen Euro
>
> Die Projektlaufzeit beträgt jeweils 7 Jahre. Die meisten Projekte laufen noch bis 2026-2028.
>
> ---
>
> **3. Welche Kommunen nutzen bereits souveräne Lösungen wie OpenDesk?**
>
> **OpenDesk** ist die souveräne Arbeitsplatzlösung des Zentrums für Digitale Souveränität (ZenDiS),
> die seit Oktober 2024 für öffentliche Verwaltungen verfügbar ist.
>
> **Aktuelle Nutzung** (Stand: Oktober 2024):
>
> **Bundesebene:**
> - Robert Koch Institut (RKI): Produktiveinsatz für Agora-Kommunikationsplattform
> - Bundesamt für Seeschifffahrt und Hydrographie (BSH): Pilotphase
> - BWI GmbH: Pilotnutzer
>
> **Landesebene:**
> - **Baden-Württemberg**: Ca. 60.000 Arbeitsplätze im „Digitalen Arbeitsplatz für Lehrer" (DAP)
>   seit Schuljahr 2024
> - **Schleswig-Holstein**: Vorbereitung für Beitritt zu ZenDiS abgeschlossen
> - **Thüringen**: Gesellschaftervereinbarung unterzeichnet, Beitritt in Vorbereitung
> - **6 weitere Bundesländer**: In Pilotphase (teilweise nicht öffentlich kommuniziert)
>
> **Kommunale Ebene:**
> - Kommunale Datenverarbeitung Oldenburg (KDO): IT-Dienstleister für mehrere Kommunen
> - Verschiedene Kommunen in Pilotprojekten (detaillierte Liste liegt der Bundesregierung nicht vor,
>   da kommunale Beschaffungsentscheidungen in Eigenverantwortung erfolgen)
>
> ---
>
> **4. Wie ist der aktuelle Stand bei Delos Cloud?**
>
> **Delos Cloud** ist die geplante souveräne Hyperscale-Cloud-Plattform für den öffentlichen Sektor
> in Deutschland, die die Cloud-Plattform-Anforderungen des Bundesamts für Sicherheit in der
> Informationstechnik (BSI) vollständig erfüllen wird.
>
> **Aktueller Stand** (Oktober 2024):
>
> - **September 2024**: Delos Cloud GmbH, Microsoft und Arvato Systems haben finale Verträge
>   für die Zusammenarbeit unterzeichnet
>
> **Geplanter Rollout**:
> - **Q1/2025**: Azure Foundational Services für erste Evaluierungen verfügbar
> - **Q2/2025**: Azure Mainstream Services und Microsoft 365 produktiv nutzbar
>
> **Zielgruppe**: Bundes-, Landes- und Kommunalverwaltungen, die rechtliche und spezifische
> Souveränitätsanforderungen des BSI erfüllen müssen.
>
> Die Delos Cloud befindet sich damit in der finalen Vorbereitungsphase vor dem produktiven Start
> im ersten Halbjahr 2025.
>
> ---
>
> **Quellenangaben**:
>
> 1. Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen (BMWSB):
>    „Modellprojekte Smart Cities", https://www.smart-city-dialog.de, Abruf: 29.10.2024
>
> 2. Zentrum für Digitale Souveränität (ZenDiS):
>    „OpenDesk – Der souveräne Arbeitsplatz", https://www.zendis.de, Abruf: 29.10.2024
>
> 3. Delos Cloud GmbH:
>    „Die souveräne Cloud für den öffentlichen Dienst", https://www.deloscloud.de, Abruf: 29.10.2024
>
> 4. Microsoft News Center Deutschland:
>    „Erste souveräne Cloud-Plattform für die deutsche Verwaltung auf der Zielgeraden",
>    https://news.microsoft.com/de-de/, veröffentlicht: 23.09.2024
>
> 5. Ministerium für Inneres, Digitalisierung und Kommunen Baden-Württemberg:
>    „OpenDesk im Bildungsbereich", https://im.baden-wuerttemberg.de, Abruf: 29.10.2024
>
> ---
>
> ✅ **Entwurf fertig!**
>
> Die Antwort folgt dem offiziellen Bundestag-Format:
> - Korrekte Kopfzeile (Drucksache, Wahlperiode, Datum)
> - Vorbemerkungen von Fragstellern und Bundesregierung
> - Nummerierte Antworten zu jeder Frage
> - Tabellen für statistische Daten
> - Vollständige Quellenangaben
>
> Alle Zahlen und Fakten sind durch Knoten im Wissensgraphen belegt und nachvollziehbar.
>
> Der Entwurf kann nun zur Freigabe durch die Hausleitung weitergeleitet werden."

**Talking Points**:
- ✅ **Korrektes Bundestag-Format** automatisch generiert
- ✅ **Alle statistischen Daten** eingefügt (73 Kommunen, €820M, etc.)
- ✅ **Vollständige Quellenangaben** mit URLs und Abrufdaten
- ✅ **Professionelle Sprache** und Struktur
- ✅ **80% fertig** - nur noch Review und Freigabe nötig

---

### **Act 6: Verifikation in Hive UI** (3:00)

**[Wechsel zu Hive UI - Browser auf localhost:8000]**

**Moderator**:
> "Jetzt das Wichtigste: Wie können wir überprüfen, dass alle Zahlen korrekt sind?
> Öffnen wir die Hive UI."

#### **6.1 Graph-Übersicht** (45 sec)

**Navigation**: Öffne Honeycomb "Souveraene_Digitalisierung_Kommunen_2024"

**Zeige Visualisierung**:
- **Grüne Knoten**: Programme (Smart Cities, OpenDesk, Delos, etc.)
- **Blaue Knoten**: Kommunen (Potsdam, Heidelberg, etc.)
- **Gelbe Knoten**: Bundesländer (Baden-Württemberg, NRW, etc.)
- **Lila Knoten**: Organisationen (RKI, BSH, ZenDiS, etc.)
- **Graue Knoten**: Quellen (URLs, Dokumente)

**Talking Point**:
> "Hier sehen Sie die gesamte Wissensstruktur visuell. Jeder blaue Punkt ist eine Kommune,
> jede Verbindung zeigt eine Beziehung: Förderung, Programmteilnahme, geografische Zuordnung."

---

#### **6.2 Beispiel-Entität Details** (1:00)

**Klicke auf**: "Potsdam" Knoten

**Zeige Properties Panel**:
```
Entität: Potsdam
Typ: Stadt (Kommune)
ID: potsdam

Eigenschaften:
- Offizieller Name: Landeshauptstadt Potsdam
- Bundesland: Brandenburg
- Einwohnerzahl: ~180.000
- Website: https://www.potsdam.de

Programmteilnahme:
- Smart Cities Modellprojekt: Ja (Runde 3, 2021)
- Fördersumme: ca. €15 Millionen
- Projektlaufzeit: 2021-2028
- Projektschwerpunkt: Bürgerbeteiligung, Datenplattform

Souveräne Lösungen:
- OpenDesk: Indirekt (als Landeshauptstadt von Brandenburg)

Quellen:
1. https://www.smart-city-dialog.de/modellprojekte/potsdam
   (Abgerufen: 2024-10-29)
2. https://www.potsdam.de/smart-city
   (Abgerufen: 2024-10-29)

Erstellt: 2024-10-29 10:23:45
Zuletzt aktualisiert: 2024-10-29 14:15:22
```

**Talking Points**:
- ✅ **Vollständige Metadaten** zu jeder Entität
- ✅ **Quellen mit Zeitstempel** - wann wurde Information abgerufen?
- ✅ **Versionierung** - Änderungshistorie sichtbar
- ✅ **Nachvollziehbar** - jede Behauptung hat Quelle

---

#### **6.3 Beziehungen (Edges) zeigen** (45 sec)

**Vom Potsdam-Knoten zeige Kanten (Edges)**:

**Ausgehende Beziehungen**:
- **participates_in** → "Smart Cities Modellprojekte" (grün)
  - Metadata: `funding_amount: 15000000, round: 3, year: 2021`

- **located_in** → "Brandenburg" (gelb)
  - Metadata: `capital_city: true`

- **has_source** → "smart-city-dialog.de/potsdam" (grau)
  - Metadata: `fetched_at: 2024-10-29, verified: true`

**Talking Points**:
- ✅ **Beziehungen sind typisiert** (participates_in, located_in, has_source)
- ✅ **Edges haben Metadaten** (Fördersumme, Jahr, Verifikation)
- ✅ **Graph ermöglicht Traversierung** - folge Kanten zu verwandten Entitäten
- ✅ **So werden Statistiken berechnet** - aggregiere über Kanten

---

#### **6.4 Aggregation demonstrieren** (30 sec)

**[Wenn Hive UI Filter/Query Panel hat]**

**Beispiel-Query**:
```
Filter:
  - entity_type = "Kommune"
  - participates_in → "Smart Cities Modellprojekte"
  - located_in → "Baden-Württemberg"

Ergebnis: 7 Kommunen
```

**Liste zeigen**:
1. Heidelberg
2. Karlsruhe
3. Ulm
4. Konstanz
5. Pforzheim
6. [etc.]

**Talking Point**:
> "So hat LibreChat die Zahl '7 Kommunen in Baden-Württemberg' berechnet.
> Kein Excel, keine manuelle Zählung - direkt aus der Graph-Struktur."

---

#### **6.5 Quellen-Provenienz** (30 sec)

**Klicke auf**: Source-Knoten "smart-city-dialog.de"

**Zeige Metadaten**:
```
Quelle: Smart City Dialog Website
URL: https://www.smart-city-dialog.de/ueber-uns/modellprojekte-smart-cities
Typ: Offizielle Programmwebsite
Herausgeber: BMWSB (Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen)

Abgerufen: 2024-10-29 14:12:33
Abrufmethode: Web Fetch (MCP)
Status: Verified ✓

Referenzierte Entitäten: 73 Kommunen
Verwendung in Antworten: 15 Queries

Zuverlässigkeit: Hoch (offizielle Regierungsquelle)
Letzte Überprüfung: 2024-10-29
```

**Talking Points**:
- ✅ **Vollständige Daten-Provenienz** - woher kommt jede Information?
- ✅ **Transparenz** - keine Black-Box-KI
- ✅ **Audit-Trail** - nachvollziehbar für Revision
- ✅ **Vertrauenswürdig** - nur offizielle Quellen

---

### **Act 7: Wrap-Up & Key Takeaways** (1:00)

**[Zurück zu Präsentation oder Zusammenfassung]**

**Moderator**:
> "Fassen wir zusammen, was wir gerade gesehen haben:
>
> **Ausgangslage**:
> - Komplexe Kleine Anfrage über 73 Kommunen, mehrere Programme, 16 Bundesländer
> - Traditionell: 1-2 Tage Arbeit, mehrere Abteilungen, Excel-Tabellen, manuelle Recherche
>
> **Mit LibreChat + Hive**:
> - ⏱️ **Unter 10 Minuten** von Anfrage bis zum fertigen Entwurf
> - 📊 **Automatische Statistiken** aus 100+ Datenpunkten
> - 🔍 **Vollständige Quellenangaben** mit URLs und Zeitstempeln
> - ✅ **Korrektes Format** (Bundestag-Standard) automatisch
> - 🔗 **Jede Zahl nachvollziehbar** im Wissensgraph
> - 🌐 **Live-Enrichment** - fehlende Daten werden von offiziellen Websites geholt
>
> **Die drei Schlüsselkomponenten**:
>
> 1. **LibreChat Agent**
>    - Versteht parlamentarische Anfragen
>    - Weiß, welche Daten wo zu finden sind
>    - Generiert korrekte Antwortformate
>    - Holt proaktiv fehlende Informationen
>
> 2. **Hive Wissensgraph**
>    - Strukturiert alle Informationen (Programme, Kommunen, Bundesländer)
>    - Ermöglicht komplexe Queries (z.B. "Alle Kommunen in BW mit Smart Cities Förderung")
>    - Speichert Beziehungen (Förderung, Programmteilnahme, geografische Zuordnung)
>    - Vollständige Provenienz (Quellen, Zeitstempel, Versionen)
>
> 3. **MCP Server Integration**
>    - Web Fetch: Holt Daten von offiziellen Websites
>    - Honeycomb: CRUD-Operationen auf Wissensgraph
>    - (Optional: Deutsche Gesetze für Rechtsgrundlagen)
>
> **Business Value**:
> - 💰 **Zeitersparnis**: Tage → Minuten (90%+ Effizienzgewinn)
> - 🎯 **Genauigkeit**: Keine Excel-Fehler, automatische Aggregation
> - 📋 **Compliance**: Vollständiger Audit-Trail, Quellennachweis
> - 🔄 **Wiederverwendbarkeit**: Wissensgraph wächst, nächste Anfrage noch schneller
> - 📈 **Skalierbarkeit**: Funktioniert für 10 oder 10.000 Datenpunkte
>
> **Weitere Anwendungsfälle** (gleiche Technik):
> - 📨 **Informationsfreiheitsanfragen (IFG)** - schnelle, vollständige Antworten
> - 📊 **Sachstandsberichte** - automatische Aggregation über Projekte
> - ⚖️ **Rechtsauskünfte** - Paragraphen mit Quellen
> - 📰 **Presseanfragen** - faktenbasierte Antworten mit Belegen
> - 📈 **KPI-Dashboards** - Echtzeit-Übersichten aus Wissensgraph
>
> **Das Besondere**:
> - 🏢 **On-Premise** - Datensouveränität, keine Cloud-Abhängigkeit
> - 🔓 **Open Source** - LibreChat, MCP, offene Standards
> - 🇩🇪 **BSI-tauglich** - Für sensible Behördendaten geeignet
> - 🔗 **Transparent** - Kein Black-Box-LLM, jede Antwort nachprüfbar"

---

## 🔧 Technische Setup-Info

### System-Komponenten
- **LibreChat**: v0.8.x (Agents-Endpoint)
- **Hive**: Honeycomb API (localhost:8000)
- **Podman/Docker**: Für MCP-Server

### MCP-Server Konfiguration

**Erforderlich**:
1. **honeycomb-mcp** - Wissensgraph CRUD (11 tools)
2. **mcp-server-fetch** (oder Tavily) - Web-Scraping (1-2 tools)

**Optional**:
3. **deutsche-gesetze-mcp** - Rechtsdatenbank (8 tools)

**Total**: 12-13 MCP tools

### librechat.yaml Konfiguration

```yaml
endpoints:
  agents:
    - name: "Bundestag Assistant"
      model: "claude-sonnet-4"
      temperature: 0.3
      tools:
        - honeycomb
        - fetch
      serverInstructions: |
        Du bist ein Assistent für parlamentarische Anfragen im Deutschen Bundestag.

        # Verhalten
        - Nutze den Wissensgraph "Souveraene_Digitalisierung_Kommunen_2024" für alle Queries
        - Biete proaktiv an, fehlende Informationen von offiziellen Websites zu holen
        - Generiere Antworten im offiziellen Bundestag-Format (Drucksachen-Standard)
        - IMMER Quellen mit URLs und Abrufdatum angeben

        # Datenquellen (bevorzugt)
        - Smart Cities: https://www.smart-city-dialog.de
        - OpenDesk/ZenDiS: https://www.zendis.de
        - Delos Cloud: https://www.deloscloud.de
        - Bundestag DIP: https://dip.bundestag.de

        # Format für Kleine Anfrage Antworten
        Siehe Entität "kleine_anfrage_format_template" im Wissensgraph.

        # Statistiken
        - Immer aus Wissensgraph aggregieren (NICHT schätzen)
        - Bei fehlenden Daten: "Liegt der Bundesregierung nicht vor"
        - Quellen zu jeder Zahl angeben

mcpServers:
  honeycomb:
    command: "uvx"
    args: ["honeycomb-mcp"]
    env:
      HIVE_URL: "http://host.containers.internal:8000"
    serverInstructions: |
      Wissensgraph für souveräne Digitalisierungsprojekte.
      Honeycomb: Souveraene_Digitalisierung_Kommunen_2024

  fetch:
    command: "uvx"
    args: ["mcp-server-fetch"]
    serverInstructions: |
      Fetch nur von offiziellen Regierungs-/Behördenseiten.
      Extrahiere strukturierte Daten für den Wissensgraph.
```

---

## 📊 Vorbereitungs-Checkliste

### Vor der Demo (2-3 Stunden Prep)

**Hive/Honeycomb**:
- [ ] Honeycomb erstellt: `Souveraene_Digitalisierung_Kommunen_2024`
- [ ] Preseeded: ~60 Entitäten (Programme, Kommunen, Länder, Organisationen)
- [ ] Preseeded: ~150 Beziehungen (participates_in, located_in, uses, etc.)
- [ ] Alle Entitäten haben: Quellen, Zeitstempel, Metadaten
- [ ] Format-Template für Kleine Anfrage gespeichert
- [ ] Hive UI erreichbar: http://localhost:8000

**LibreChat**:
- [ ] Agent-Endpoint konfiguriert mit Honeycomb + Fetch MCP
- [ ] Agent Instructions geladen (siehe oben)
- [ ] Test-Prompts funktionieren
- [ ] Web-Fetch von erlaubten Domains möglich

**Browser/Präsentation**:
- [ ] Tab 1: LibreChat Interface
- [ ] Tab 2: Hive UI (eingeloggt)
- [ ] Tab 3 (optional): Beispiel Kleine Anfrage Dokument
- [ ] Tab 4 (optional): Smart Cities Website als Referenz
- [ ] Screen Recording aktiviert (falls Demo aufgezeichnet wird)

**Backup**:
- [ ] Screenshots von allen Schritten
- [ ] Backup Honeycomb (falls Demo-Graph beschädigt wird)
- [ ] Offline-Version des Demo-Scripts ausgedruckt

### Während der Demo

- [ ] Langsam sprechen, Zeit für Publikum Fragen zu stellen
- [ ] Nach jedem Act: "Gibt es Fragen bis hierhin?"
- [ ] Hive UI Zoom: Groß genug für Projektor/Screen Sharing
- [ ] Bei Fehlern: Ruhig bleiben, Backup-Honeycomb laden

---

## ❓ Q&A Vorbereitung

### Häufige Fragen

**"Woher kommen die Daten im Wissensgraph?"**
> "Aus öffentlich zugänglichen Quellen: Offizielle Programm-Websites (Smart Cities, ZenDiS),
> Ministeriums-Pressemitteilungen, Bundestag-Dokumente. Wir scrapen nur offizielle Quellen
> und speichern die URLs mit Zeitstempel."

**"Was passiert, wenn die KI falsche Informationen gibt?"**
> "Das ist der Hauptvorteil von Hive: Jede Antwort ist an Quellen im Wissensgraph gebunden.
> Sie sehen in der Hive UI genau, woher jede Information kommt. Wenn ein Fact falsch ist,
> können Sie die Quelle prüfen und den Knoten korrigieren. Die nächste Query nutzt dann
> die korrigierte Information."

**"Wie aktuell sind die Daten?"**
> "Jeder Knoten hat ein 'last_updated' Timestamp. LibreChat kann konfiguriert werden,
> proaktiv nach Updates zu suchen, z.B. alle 30 Tage. Oder bei Bedarf: User fragt nach
> 'aktuellen' Daten → Agent fetcht automatisch."

**"Funktioniert das auch für andere Ministerien/Themen?"**
> "Absolut! Gleiche Architektur funktioniert für:
> - Jedes Bundestag-Thema (Bildung, Gesundheit, Klima, etc.)
> - Informationsfreiheitsanfragen
> - Länder-Parlamente (Landtag-Anfragen)
> - Interne Statusberichte
> - Der Wissensgraph passt sich an jedes Thema an."

**"Wie sicher ist das System für sensible Daten?"**
> "- On-Premise Deployment (kein Cloud-Zwang)
> - LibreChat + Hive laufen lokal im Behördennetz
> - Keine Daten verlassen das Netzwerk
> - BSI-konforme Architektur möglich
> - Rollenbasierte Zugriffskontrolle in Hive
> - Audit-Logs für alle Operationen"

**"Was kostet so eine Lösung?"**
> "- LibreChat: Open Source (gratis)
> - Hive: [Senticor Lizenzmodell]
> - LLM: Claude API (Pay-per-use) oder Self-hosted Modell
> - Hardware: Standard-Server (läuft auf Behörden-Infrastruktur)
> - Setup: ~2-4 Wochen für Pilotprojekt"

**"Wie lange dauert das Setup?"**
> "- Basis-Setup (LibreChat + Hive): 1-2 Tage
> - Daten-Import (für ein Thema wie Smart Cities): 1-2 Wochen
> - Agent-Training/Tuning: 1-2 Wochen
> - Pilot-Einsatz: Nach 4-6 Wochen produktiv
> - Der Wissensgraph wächst dann kontinuierlich mit jeder Nutzung."

---

## 🎯 Timing (Übersicht)

| Abschnitt | Zeit | Kumulativ |
|-----------|------|-----------|
| Act 1: Anfrage & Kontext | 0:30 | 0:30 |
| Act 2: Erste Query | 2:00 | 2:30 |
| Act 3: Live Web Fetch | 1:30 | 4:00 |
| Act 4: Statistische Analyse | 1:30 | 5:30 |
| Act 5: Kleine Anfrage Response | 2:00 | 7:30 |
| Act 6: Hive UI Verifikation | 3:00 | 10:30 |
| Act 7: Wrap-Up | 1:00 | 11:30 |
| **Puffer/Q&A** | 2:30 | **14:00** |

**Empfehlung**: Plane 12-15 Minuten ein (inkl. Q&A-Zeit)

---

## 📚 Verwandte Dokumentation

- **[Demo-Data-Preparation-Strategy.md](./Demo-Data-Preparation-Strategy.md)** - Detaillierte Datenvorbereitung
- **[HONEYCOMB-MCP-SETUP.md](../HONEYCOMB-MCP-SETUP.md)** - Hive/Honeycomb Setup
- **[PROACTIVE-AGENT-SETUP.md](../PROACTIVE-AGENT-SETUP.md)** - LibreChat Agent Konfiguration
- **Hive UI Guide** - Wissensgraph Visualisierung

---

**Demo Status**: Ready for review
**Letzte Aktualisierung**: 2025-10-29
**Autor**: Wolfgang + Claude
