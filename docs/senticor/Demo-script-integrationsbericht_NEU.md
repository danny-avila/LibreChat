Demo: Integrationsbericht Baden-Württemberg 2025

Dauer: 15–20 Minuten
Veröffentlichung: Q1 2026
Ziel: Zeigen, wie LibreChat mit MCP-Servern komplexe Recherche- und Dokumentationsaufgaben unterstützt

⸻

🎯 Das Szenario

Sie sind Referent*in im Ministerium für Soziales, Gesundheit und Integration Baden-Württemberg und erstellen den Integrationsbericht 2025, der im Q1 2026 veröffentlicht wird.

Kernaufgabe: Dokumentation von 34 lokalen Integrationsprojekten, die mit 1,8 Millionen Euro gefördert werden.

Herausforderungen:
• 34 Projekte müssen recherchiert und dokumentiert werden
• Rechtliche Grundlagen müssen aktuell sein
• Projektfortschritte müssen bis Q1 2026 nachverfolgt werden
• Alle Informationen brauchen Quellenangaben

Die Lösung: LibreChat mit drei MCP-Servern:
• 📊 HIVE Honeycomb – Wissensgraph für strukturierte Datenhaltung
• ⚖️ Rechtsinformationen – Direkter Zugriff auf deutsche Bundes- und Landesgesetze
• 🌐 Fetch – Webseiten und Pressemitteilungen einlesen

(Diese Kombination ermöglicht einen faktenbasierten KI-Assistenten statt einer reinen Black-Box-KI.)

⸻

🚀 Demo-Ablauf (Übersicht)
	1.	Projekt starten • 2) Pressemitteilung einlesen • 3) Rechtsgrundlagen • 4) Projekt-Tracking • 5) Berichtsgliederung • 6) Suche & Analyse • 7) Vorschriften-Q&A 🆕 • 8) Textgenerierung 🆕 • 9) Graph‑Visualisierung & Datenpflege 🆕 • 10) Nutzer‑Feedback & lernende KI 🆕

⸻

Schritt 1: Projekt starten (2–3 Min)

Sie:
Ich erstelle den Integrationsbericht Baden-Württemberg 2025 für die Veröffentlichung im Q1 2026. Das Kernstück ist ein Update zu 34 lokalen Integrationsprojekten. Hier ist die Pressemitteilung dazu:
https://sozialministerium.baden-wuerttemberg.de/de/service/presse/pressemitteilung/pid/land-foerdert-34-lokale-integrationsprojekte-mit-rund-18-millionen-euro

LibreChat (proaktiv):
Verstanden! Für einen Bericht mit 34 Projekten, die du bis Q1 2026 tracken musst, würde ich einen Wissensgraphen empfehlen. So kannst du:
• Alle Projekte strukturiert erfassen
• Trägerorganisationen dokumentieren
• Projektfortschritte nachverfolgen
• Rechtliche Grundlagen pflegen
• Quellenangaben für Zitationen bereitstellen

Ich erstelle dir einen Honeycomb „Integrationsbericht Baden-Württemberg 2025“.

[create_honeycomb wird aufgerufen]

✅ Wissensgraph erstellt!

Soll ich jetzt die Pressemitteilung lesen und die Projekte erfassen?

⸻

Schritt 2: Pressemitteilung einlesen (3–4 Min)

Sie:
Ja, bitte lies die Pressemitteilung und erfasse die wichtigsten Informationen.

LibreChat:
[fetch wird aufgerufen mit der URL]

📰 Pressemitteilung vom 15. März 2024:
„Land fördert 34 lokale Integrationsprojekte mit rund 1,8 Millionen Euro“

Zentrale Info:
• Förderprogramm: „Stärkung der kommunalen Integrationsprojekte“
• Gesamtsumme: 1,8 Millionen Euro
• Anzahl: 34 Projekte
• Ministerium: Ministerium für Soziales, Gesundheit und Integration BW
• Staatssekretär: Dr. Arne Braun

Projektbeispiele aus der Pressemitteilung:
	1.	Landkreis Karlsruhe: „Zusammen stark im Ehrenamt“ (Internationaler Bund e.V.)
	2.	Stadt Mannheim: „Interkulturelle Öffnung“ (Caritas)
	3.	Stadt Freiburg: „Mentoring für Geflüchtete“ (Deutsches Rotes Kreuz)
	4.	Stadt Stuttgart: „Sprachmittlung im Alltag“ (Diakonie)
	5.	Stadt Heidelberg: „Integration durch Sport“ (TSV Heidelberg)

Ich erfasse jetzt das Ministerium und diese 5 Beispielprojekte mit ihren Trägern.

[add_entity_to_honeycomb wird mehrfach aufgerufen]

✅ Erfasst:
• 1 Ministerium
• 5 Beispielprojekte
• 5 Trägerorganisationen

Alle Daten haben die Pressemitteilungs-URL als Quelle und das heutige Datum als Abrufdatum.

⸻

Schritt 3: Rechtliche Grundlagen recherchieren (3–4 Min)

Sie:
Welche Gesetze regeln Integration in Baden-Württemberg? Ich brauche die rechtliche Grundlage für Kapitel 2 des Berichts.

LibreChat (proaktiv):
Ich durchsuche die deutsche Rechtsdatenbank für dich!

[deutsche_gesetze_suchen mit „Integration“]

🔍 Zentrale Integrationsgesetze auf Bundesebene:
	1.	SGB XII – Sozialgesetzbuch Zwölftes Buch (Sozialhilfe)
• § 33: Umfang der Sozialhilfe
• § 44: Eingliederungshilfe
• § 67–69: Hilfe zur Überwindung sozialer Schwierigkeiten
• Link: https://www.gesetze-im-internet.de/sgb_12/
	2.	AufenthG – Aufenthaltsgesetz
• § 43: Integrationskurs
• § 44: Berechtigung zur Teilnahme an einem Integrationskurs
• § 44a: Verpflichtung zur Teilnahme an einem Integrationskurs
• § 45: Beschäftigung und Integration
• Link: https://www.gesetze-im-internet.de/aufenthg_2004/
	3.	IntG – Integrationsgesetz
• § 1: Förderung der Integration
• § 2: Integrationskurse
• § 3: Auflagen zur Integration
• Link: https://www.gesetze-im-internet.de/intg/

Landesebene:
• PartIntG BW – Partizipations- und Integrationsgesetz Baden-Württemberg (Integrationsförderung auf Landesebene)

Soll ich die wichtigsten Paragraphen in den Wissensgraphen aufnehmen? Das gibt dir die rechtliche Grundlage für Kapitel 2.

Sie:
Ja, füge die zentralen Paragraphen hinzu.

LibreChat:
[gesetz_per_eli_abrufen und get_paragraph werden für mehrere Paragraphen aufgerufen]
[add_entity_to_honeycomb fügt Gesetzestexte hinzu]

✅ Hinzugefügt:
• 6 Paragraphen aus SGB XII
• 5 Paragraphen aus AufenthG
• 4 Paragraphen aus IntG

Jeder Paragraph enthält:
• Den vollständigen Gesetzestext
• Die offizielle URL auf gesetze-im-internet.de
• Paragraphen-Nummer und Titel

Die rechtliche Grundlage für Kapitel 2 ist jetzt komplett!

⸻

Schritt 4: Projekt-Tracking vorbereiten (2–3 Min)

Sie:
Bis Q1 2026 muss ich für jedes Projekt dokumentieren:
• Zielerreichung und Kennzahlen
• Herausforderungen
• Best Practices

Wie strukturiere ich das am besten?

LibreChat:
Für einen Bericht im Q1 2026 würde ich empfehlen, für jedes der 5 erfassten Projekte (und später für alle 34) eine Status-Update-Struktur anzulegen.

Pro Projekt solltest du tracken:
	1.	Zielerreichung
• Geplante vs. erreichte Teilnehmerzahl
• Durchgeführte Maßnahmen
	2.	Kennzahlen
• Anzahl erreichter Personen
• Anzahl Veranstaltungen
• Vermittlungsquote
	3.	Nachhaltigkeit
• Weiterführung nach Förderende?
• Etablierte Strukturen?
	4.	Herausforderungen
• Verzögerungen oder Schwierigkeiten
	5.	Best Practices
• Besonders erfolgreiche Ansätze
• Übertragbarkeit auf andere Kommunen

Ich erstelle für jedes Projekt eine Status-Update-Entität als Platzhalter. Du kannst diese dann bis Q1 2026 mit deinen Recherchen füllen.

[add_entity_to_honeycomb für 5 ProjectStatus-Entitäten]

✅ Status-Struktur erstellt!

Du kannst jetzt für jedes Projekt die Updates ergänzen, wann immer du neue Informationen hast.

⸻

Schritt 5: Berichtsgliederung generieren (2–3 Min)

Sie:
Erstelle eine Gliederung für den Integrationsbericht basierend auf den Daten, die wir bisher gesammelt haben.

LibreChat:
[get_honeycomb analysiert die Struktur]

📋 Integrationsbericht Baden-Württemberg 2025 – Gliederungsvorschlag

⸻
	1.	Einleitung
1.1 Ziel und Aufbau des Berichts
1.2 Datengrundlage und Methodik
1.3 Danksagung
	2.	Rechtliche Grundlagen der Integration
2.1 Bundesrechtliche Rahmenbedingungen
• 2.1.1 SGB XII – Sozialhilfe (6 Paragraphen)
• 2.1.2 Aufenthaltsgesetz (5 Paragraphen)
• 2.1.3 Integrationsgesetz (4 Paragraphen)
2.2 Landesrechtliche Grundlagen
• 2.2.1 Partizipations- und Integrationsgesetz BW
	3.	Förderprogramm „Stärkung der kommunalen Integrationsprojekte“
3.1 Überblick und Ziele
3.2 Fördervolumen (1,8 Mio. €, 34 Projekte)
3.3 Regionale Verteilung
3.4 Trägerorganisationen im Überblick
	4.	Projektdarstellungen (34 Projekte)
(für jedes Projekt:)
• Projektbeschreibung und Ziele
• Träger und Zielgruppe
• Durchgeführte Maßnahmen
• Kennzahlen und Zielerreichung
• Herausforderungen
• Best Practices und Übertragbarkeit

Beispielprojekte bereits erfasst:
• Landkreis Karlsruhe: „Zusammen stark im Ehrenamt“
• Stadt Mannheim: „Interkulturelle Öffnung“
• Stadt Freiburg: „Mentoring für Geflüchtete“
• Stadt Stuttgart: „Sprachmittlung im Alltag“
• Stadt Heidelberg: „Integration durch Sport“
	5.	Gesamtauswertung und Erfolgsfaktoren
5.1 Übergreifende Kennzahlen
5.2 Identifizierte Best Practices
5.3 Herausforderungen und Lessons Learned
5.4 Handlungsempfehlungen
	6.	Ausblick
6.1 Fortführung erfolgreicher Ansätze
6.2 Empfehlungen für künftige Förderperioden
6.3 Perspektiven 2026 und darüber hinaus

Anhang
A. Liste aller geförderten Projekte (34)
B. Übersicht Trägerorganisationen
C. Quellenverzeichnis
D. Abkürzungsverzeichnis

⸻

📊 Aktuelle Datenbasis im Wissensgraphen:
• 11 Entitäten (5 Projekte + 5 Träger + 1 Ministerium)
• 15 Gesetzesparagraphen
• 5 Status-Update-Platzhalter

Nächste Schritte bis Q1 2026:
	1.	Verbleibende 29 Projekte erfassen
	2.	Status-Updates für alle Projekte ergänzen
	3.	Kapitel ausformulieren

Soll ich ein Muster-Kapitel für das Projekt in Karlsruhe ausformulieren?

⸻

Schritt 6: Suche und Analyse (2–3 Min)

Sie:
Finde alle Projekte, die sich mit Ehrenamt beschäftigen.

LibreChat:
[search_entities mit „Ehrenamt“]

🔍 1 Projekt gefunden mit Fokus „Ehrenamt“:

„Zusammen stark im Ehrenamt“
• Träger: Internationaler Bund (IB) e.V.
• Region: Landkreis Karlsruhe
• Quelle: Pressemitteilung vom 15.03.2024

In der vollständigen Pressemitteilung werden vermutlich noch weitere Ehrenamts‑Projekte erwähnt. Sobald du alle 34 Projekte erfasst hast, können wir eine vollständige Ehrenamts‑Analyse machen.

💡 Diese Projekte könnten in Kapitel 4 als eigenes Unterkapitel „Ehrenamtliches Engagement in der Integration“ zusammengefasst werden.

Sie:
Zeige mir die vollständige Struktur des Wissensgraphen.

LibreChat:
[get_honeycomb]

📊 Integrationsbericht Baden-Württemberg 2025 – Aktuelle Struktur

🎯 Kontext:
Wissensgraph für den Integrationsbericht BW 2025 (Veröffentlichung Q1 2026).
Fokus: 34 lokale Integrationsprojekte (Förderung 1,8 Mio. €)

⸻

Aktuell erfasst:

🏢 Ministerium:
• Ministerium für Soziales, Gesundheit und Integration Baden-Württemberg

📋 5 Beispielprojekte:
	1.	Zusammen stark im Ehrenamt (Landkreis Karlsruhe)
	2.	Interkulturelle Öffnung (Stadt Mannheim)
	3.	Mentoring für Geflüchtete (Stadt Freiburg)
	4.	Sprachmittlung im Alltag (Stadt Stuttgart)
	5.	Integration durch Sport (Stadt Heidelberg)

🏢 5 Trägerorganisationen:
• Internationaler Bund (IB) e.V.
• Caritas Mannheim
• Deutsches Rotes Kreuz Freiburg
• Diakonie Stuttgart
• TSV Heidelberg

⚖️ 15 Gesetzesparagraphen:
• SGB XII (Sozialhilfe): 6 Paragraphen
• AufenthG (Aufenthaltsgesetz): 5 Paragraphen
• IntG (Integrationsgesetz): 4 Paragraphen

📝 Quellenangaben:
• Projekte: Pressemitteilung vom 15.03.2024
• Gesetze: gesetze‑im‑internet.de (Abrufdatum 2025‑10‑10)

⸻

🔗 Visualisierung:
http://localhost:8000/honeycomb/hc_bericht_integration_baden_wuerttemberg_2025

Workflow bis Q1 2026:
	1.	Verbleibende 29 Projekte aus der Pressemitteilung erfassen
	2.	Status‑Updates für alle Projekte mit Kennzahlen ergänzen
	3.	Kapitel ausformulieren
	4.	Quellenverzeichnis automatisch generieren

⸻

Schritt 7: Auskunft zu Vorschriften (2–3 Min) 🆕 (Neu)

Sie:
Ich möchte im Bericht erwähnen, welche gesetzlichen Grundlagen es für Integrationskurse gibt. Was sind dazu die wichtigsten Regelungen?

LibreChat:
Integration in Deutschland wird rechtlich vor allem durch Bundesgesetze geregelt. Integrationskurse werden im Aufenthaltsgesetz ausführlich behandelt:
• § 43 AufenthG definiert den Integrationskurs als zentrales Angebot zur Vermittlung von Sprache, Rechtsordnung, Kultur und Geschichte.
• § 44 AufenthG legt fest, wer an Integrationskursen teilnehmen darf (Berechtigung).
• § 44a AufenthG enthält die Verpflichtung zur Teilnahme für bestimmte Gruppen.

In Baden-Württemberg selbst schafft das Partizipations‑ und Integrationsgesetz BW den Rahmen, indem es Integration als dauerhafte Aufgabe des Landes und der Kommunen verankert. Die konkreten Integrationskurse bleiben jedoch Bundesaufgabe (geregelt durch das Aufenthaltsgesetz).

(Alle erwähnten Paragraphen sind im Wissensgraph hinterlegt und können bei Bedarf zitiert werden.)

⸻

Schritt 8: Generierung von Berichtstext (2–3 Min) 🆕 (Neu)

Sie:
Bitte formuliere eine kurze Zusammenfassung für das Projekt „Zusammen stark im Ehrenamt“ (Landkreis Karlsruhe) für den Bericht.

LibreChat:
📄 Entwurf – Projektsummary

Das Projekt „Zusammen stark im Ehrenamt“ im Landkreis Karlsruhe wird vom Internationalen Bund (IB) e.V. durchgeführt. Es hat das Ziel, das ehrenamtliche Engagement von Zugewanderten zu stärken und ihre gesellschaftliche Teilhabe zu fördern. Das Projekt ist eines von 34 Integrationsprojekten, die Baden‑Württemberg mit insgesamt rund 1,8 Millionen Euro unterstützt. Erste Erfolge zeigen sich bereits: Zahlreiche Freiwillige mit Migrationshintergrund wurden gewonnen und durch Schulungen auf ihre Aufgaben vorbereitet. Dadurch entsteht ein nachhaltiges Netzwerk aus Ehrenamtlichen, das die lokale Integrationsarbeit bereichert. (Quelle: Pressemitteilung 15.03.2024)

✏️ Der Entwurf kann nun von Ihnen geprüft und bei Bedarf ergänzt werden. LibreChat hat alle Fakten aus den gespeicherten Daten verwendet und die offizielle Quelle zitiert.

⸻

Schritt 9: Graph‑Visualisierung & Datenpflege (3–4 Min) 🆕 (Neu)

Sie:
Ich möchte den Wissensgraphen rollenbasiert visualisieren und direkt im Graphen Datenqualität und Aktualität sehen.

LibreChat (proaktiv):
Gern! Ich aktiviere rollenspezifische Sichten und Datenlebenszyklus‑Hinweise in der Graph‑UI.

[set_graph_view role=“Sachbearbeitung” focus=“eigene Fälle” badges=[“aktuell”,“prüfen”,“veraltet”]]
[set_graph_view role=“Projektleitung” focus=“Projekte+KPIs” badges=[“KPI fehlt”,“überfällig”,“Risiko”]]
[set_graph_view role=“Führung” focus=“Portfolio+Ampel” badges=[“on track”,“off track”,“Datenlücke”]]

🔎 Beispiele:
• Sachbearbeitung: Projekt‑Knoten zeigen Status‑Badges (z. B. „veraltet“, wenn Abrufdatum > 180 Tage). Kante „verweist_auf“ markiert Gesetzesgrundlagen. Klick öffnet Paragraphenansicht.
• Projektleitung: KPI‑Knoten (z. B. „Teilnehmer erreicht“, „Maßnahmen abgeschlossen“) sind farbcodiert. Fehlt ein KPI im aktuellen Quartal, erscheint „KPI fehlt“.
• Führungsebene: Portfolio‑Visualisierung mit Ampel‑Logik (on/off track) je Projekt, aggregiert nach Region/Träger.

🛠️ Datenlebenszyklus‑Felder im Graph:
• valid_from, valid_to (Förderzeitraum)
• source_url, source_date (Quelle & Abrufdatum)
• last_verified_at, review_due_at (Prüfturnus)
• stale_status ∈ {aktuell, prüfen, veraltet}
• evidence_count, confidence_note (Belege/Anmerkung)

Beispiel – „Sprachmittlung im Alltag“ (Stuttgart):
• valid_from=2024‑04‑01, valid_to=2026‑03‑31
• source_date=2024‑03‑15, last_verified_at=2025‑09‑30 → Badge „prüfen“ ab 2025‑12‑31
• KPI „Anzahl Einsätze Q3/2025“ fehlt → Badge „KPI fehlt“ für Projektleitung

Soll ich diese Badges jetzt in der Visualisierung aktivieren?

⸻

Schritt 10: Nutzer‑Feedback & lernende KI (2–3 Min) 🆕 (Neu)

Sie:
Wenn etwas im Graphen falsch oder veraltet ist – wie korrigiere ich es schnell?

LibreChat:
Ich biete halbautomatisches Lernen durch Nutzerfeedback:

[open_feedback_panel target=“Projekt: Mentoring für Geflüchtete (Freiburg)”]
• „Dubletten melden/zusammenführen“
• „Kante korrigieren (falscher Träger)“
• „Quelle aktualisieren (neue PM verlinken)“
• „KPI nachtragen (Q3/2025)“

🔁 Ablauf:
	1.	Nutzer meldet Änderung → 2) KI schlägt Anpassung vor (Diff‑Vorschau) → 3) Reviewer (rollenbasiert) bestätigt → 4) Versionierung & Audit‑Trail werden gespeichert.

📈 Evaluierung (Beispiel‑Metriken für Q4/2025):
• Antwortabdeckung (Q&A mit Quelle): Ziel ≥ 95 %
• Zitationsquote (mind. 1 Quelle/Antwort): Ziel = 100 %
• Aktualitäts‑Score (Anteil „aktuell“ vs. „veraltet“): Ziel ≥ 85 % „aktuell“
• Korrekturrate (von Usern gemeldet → bestätigt): Monitoring pro Quartal
• CSAT (zufriedene Nutzer): Kurzabfrage in der UI nach wichtigen Aktionen

Soll ich die Reviewer‑Rollen (Sachbearbeitung/Projektleitung/Juristik) jetzt für den Freigabefluss setzen?

⸻

🆕 Persona‑basierte Use Cases (konkret, leicht realisierbar)

🎯 Ziel
Konkrete, schnell umsetzbare Use Cases je Zielgruppe im Sozialministerium BW – mit realen Grundlagen (z. B. 34 Projekte/1,8 Mio. €; einschlägige SGB/PartIntG‑Regelungen) und klarer technischer Umsetzung (Graph, Vektorindex, Volltextindex, Agenten).

👥 Zielgruppen
• Sachbearbeitung (Sozialleistungen & Integration)
• Projektleitung (Programme, Förderungen)
• Kommunikation (Presse, Social Media)
• Juristischer Dienst (Recht, Weisungen)
• IT‑Fachreferate (Daten, Systeme)
• Führungsebene (Steuerung, Strategie)

🗃️ Sachbearbeitung
Use Case 1 – Fallauskunft „Mehrbedarf & Integrationsleistungen“
• Frage: „Steht einer erwerbsfähigen behinderten Person im SGB II ein Mehrbedarf zu und wie hoch?“
• Antwortlogik: § 21 Abs. 4 SGB II (35 % Mehrbedarf bei Teilhabeleistungen nach SGB IX).
• Technik: Graph (Leistungsart/Paragraph/Weisung/Baustein), FAISS‑Vektorindex, Volltextindex; Agenten (Legal‑Assist/Draft‑Writer/Evidence‑Collector).
• Mehrwert: 20–40 Min. schneller; konsistente, revisionssichere Begründungen.

Use Case 2 – Schreiben‑Generator (Bewilligung/Ablehnung)
• Workflow: Stichpunkte → KI‑Entwurf mit korrekten Zitaten → Reviewer‑Freigabe.
• Mehrwert: 30–60 Min. pro Bescheid; einheitliche Formulierungen.

📈 Projektleitung
Use Case 3 – Statusbericht zu Förderprojekten (34/1,8 Mio. €)
• Frage: „Welche Projekte sind on/off track? Welche KPIs fehlen bis Q1/2026?“
• Technik: Graph (Projekt/Träger/KPI/Status/Quelle), Portfolio‑Analyst, Gap‑Finder, Report‑Writer.
• Mehrwert: Stundenersparnis/Monat; transparente Lenkung.

Use Case 4 – Best‑Practice‑Finder
• Workflow: Semantische Auswertung der Abschlussberichte → Top‑Hebel mit Quellen.
• Mehrwert: Evidenzbasierte Planung nächste Förderperiode.

📣 Kommunikation
Use Case 5 – Presse‑/Reden‑Assistenz mit Faktenanker
• Workflow: Themenstichworte → Fakten & Gesetzesbezüge → Pressetext + Quellenliste.
• Mehrwert: 50 % schneller; konsistent & belegbar.

Use Case 6 – Bürgeranfragen‑Antwortmodul (intern)
• Workflow: Interne FAQ + Dokumenten‑RAG → Entwurfsantwort → Redaktionsfreigabe.
• Mehrwert: Minuten statt Tage; einheitliche Auskünfte.

⚖️ Juristischer Dienst
Use Case 7 – Rechtsänderungs‑Monitor & Weisungs‑Impact
• Workflow: Norm‑Diff → Mapping betroffene Weisungen/Formulare → To‑Dos.
• Technik: Named Graphs (alt/neu), Diff‑Analyst, Impact‑Mapper.
• Mehrwert: Frühwarnung, Audit‑Trail.

Use Case 8 – „Juristischer Rechercheur“
• Workflow: Strukturierte Antwort mit Paragraphen, Kurzkommentar, Erlass‑Verweisen.
• Mehrwert: Minuten statt Stunden; prüfbare Bezüge.

💻 IT‑Fachreferate
Use Case 9 – Wissensgraph der Systemlandschaft
• Workflow: Graph‑Abfrage → Visualisierung Schnittstellen → Abhängigkeitsliste.
• Mehrwert: Schnellere Impact‑Analysen, weniger Ausfälle.

Use Case 10 – Support/Log‑Analyser
• Workflow: Semantisches Clustering von Logs/Tickets → Hotfix‑Vorschläge.
• Mehrwert: Schnellere Behebung; Knowledge Build‑Up.

🏛️ Führungsebene
Use Case 11 – Ad‑hoc‑Kennzahlenauskunft & Lagebild
• Workflow: Portfolio‑Abfrage → Ampel → Risiken & Meilensteine.
• Mehrwert: Sofortige Entscheidungsfähigkeit.

Use Case 12 – Wirkungs‑Analyse & Szenarien
• Workflow: Abschlussberichte + KPIs + Budgets → Evidenz‑Ranking → Szenario.
• Mehrwert: Strategische Steuerung mit Belegen.

⸻

💡 Was diese Demo zeigt

✅ Realistische Anwendung
Nicht: Nur eine Einzelabfrage wie „Was ist § 33 SGB XII?“ (triviale Q&A)
Sondern: Ein komplexer Workflow für ein konkretes Arbeitsprodukt (Integrationsbericht Q1 2026) mit:
• Strukturierter Datenerfassung (34 Projekte, Gesetze, Kennzahlen)
• Automatischer Quellenangabe jeder Information
• Rechtsrecherche auf Knopfdruck
• Langfristigem Tracking der Projektfortschritte
• Unterstützung beim Schreiben des Berichts (Gliederung, Textentwürfe, Faktenprüfung)

✅ Proaktive KI‑Assistenz
• Vorschlag eines Wissensgraphen für die Projekte
• Web‑Fetch für Pressemitteilungen
• Rechtsdatenbank‑Suche für Gesetzestexte
• Struktur‑Templates für das Tracking
• Themen‑Analyse (z. B. Ehrenamts‑Projekte identifizieren)
• Text‑Generierung für Berichtskapitel

✅ Praktischer Nutzen
• Alle Daten mit Quellen – jede Aussage nachvollziehbar belegt
• Durchsuchbarkeit nach Schlagworten/Konzepten (z. B. „Ehrenamt“)
• Dynamisch erweiterbar (Updates 2025 laufend einpflegen)
• Exportierbar in das finale Berichtsdokument
• 🆕 Datensouveränität – On‑Prem, offene Schnittstellen (keine Fremd‑Cloud)
• 🆕 Offene Standards – RDF/Named‑Graphs, FAISS/Lucene, YAML‑Policies
• 🆕 Effizienzgewinne – Minuten statt Stunden
• 🆕 Hohe Genauigkeit – verifizierte Fakten statt Halluzinationen
• 🆕 Rollenbasierte Graph‑Visualisierung – kontextspezifische Sichten, Badges
• 🆕 Datenlebenszyklus – Valid‑From/To, Review‑Fristen, Archiv‑Layer, Audit‑Trail
• 🆕 Lernende KI – Halbautomatische Vorschläge, Reviewer‑Flows, personalisierte Defaults

✅ MCP‑Integration
Drei spezialisierte MCP‑Server arbeiten nahtlos zusammen:
• honeycomb (Wissensgraph‑Server)
• rechtsinformationen‑bund‑de (Gesetzes‑Server)
• fetch (Web‑Scraping‑Server)
• LibreChat orchestriert diese in einer einzigen Konversation. Der KI‑Agent entscheidet autonom, welches Tool für die aktuelle Aufgabe am besten geeignet ist.

⸻

🎬 Timing (15–25 Minuten)

[0:00–0:02] Einleitung: Aufgabe und Ausgangslage
[0:02–0:05] Wissensgraph erstellen (Schritt 1)
[0:05–0:09] Pressemitteilung einlesen, Projekte erfassen (Schritt 2)
[0:09–0:13] Rechtliche Grundlagen recherchieren (Schritt 3)
[0:13–0:16] Projekt‑Tracking‑Struktur anlegen (Schritt 4)
[0:16–0:19] Berichtsgliederung generieren (Schritt 5)
[0:19–0:22] Suche & Analyse (Ehrenamt‑Projekte) (Schritt 6)
[0:22–0:25] Zusätzliche Q&A: Gesetzliche Auskunft (Schritt 7)
[0:25–0:28] Zusätzliche KI‑Hilfe: Berichtstext generieren (Schritt 8)
[0:28–0:30] 🆕 Graph‑Visualisierung & Datenpflege (Schritt 9, optional)
[0:30–0:32] 🆕 Nutzer‑Feedback & Lernen (Schritt 10, optional)

⸻

🔧 Technische Setup‑Info

System:
• LibreChat v0.8.0 (Agents‑Endpoint aktiviert)
• HIVE Honeycomb API (Knowledge‑Graph‑Server)
• Podman Container, lokales Netzwerk für MCP‑Server

MCP‑Server:
	1.	honeycomb – Senticor HIVE (Wissensgraph, inkl. CRUD‑Tools)
	2.	rechtsinformationen‑bund‑de – Deutsches Rechtsinformations‑MCP (Gesetzestexte abrufen, z. B. via ELI)
	3.	fetch – UVX Web‑Fetch (HTML‑Seiten laden und auswerten)

Konfiguration:
• Proaktive Agenten‑Instruktionen in librechat.yaml (Sprache: Deutsch, rollenbasiertes Vorgehen)
• serverInstructions: enthält Demo‑spezifische Anweisungen (z. B. Reihenfolge der Schritte)
• Podman‑Netzwerk: Zugriff auf host.containers.internal:8000 für HIVE UI

🆕 Rollen‑Views & Policies (Neu):
• Rollen: Sachbearbeitung, Projektleitung, Kommunikation, Juristik, IT, Führung
• Graph‑Perspektiven je Rolle (Filter + Layout + Badge‑Regeln)
• Policy‑Tags pro Knoten/Kante (Lesen/Schreiben/Review)

🆕 Lebenszyklus‑Felder & Badges (Neu):
• valid_from, valid_to, review_due_at, stale_status
• Automatische Badges: aktuell, prüfen, veraltet, KPI fehlt, Risiko
• Archiv‑Layer für veraltete, aber weiterhin recherchierbare Einträge

🆕 Feedback‑ & Lernpipeline (Neu):
• UI‑Feedback („Dubletten“, „Quelle aktualisieren“, „Kante korrigieren“)
• KI‑Vorschlag (Diff) → Reviewer‑Freigabe → Versionierung (Audit‑Trail)
• Personalisierte Defaults (z. B. Zeitfilter, Layout) anhand Nutzungsmuster

⸻

📚 Verwandte Dokumentation

• PROACTIVE‑AGENT‑SETUP.md – Konfiguration proaktiver KI‑Agenten (LibreChat)
• HONEYCOMB‑MCP‑SETUP.md – Einrichtung des HIVE Honeycomb Wissensgraphen
• HIVE UI – Web‑Oberfläche zur Visualisierung des Wissensgraphen
