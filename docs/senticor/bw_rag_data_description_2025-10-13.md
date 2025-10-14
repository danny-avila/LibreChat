# RAG Grounding Data Description (as of 2025-10-13)

This document lists the sources, paragraphs and preprocessing guidelines for the BW evaluation.

## Core Legal Sources

- **AufenthG**: §§ 43, 44, 44a, 45 (integration courses; eligibility/obligation; employment & integration)

- **SGB XII**: § 33; § 44; §§ 67–69 (social assistance; integration-related support)

- **SGB II**: § 21 Abs. 4 (additional needs for persons with disabilities)

- **PartIntG BW**: Framework for participation & integration at state/municipal level

- **Press Source**: MSGI BW press release 15.03.2024 (34 projects; €1.8M)


## Non-legal Program Sources
- Project factsheets & status updates (per project)
- Träger (providers) registry with contact & region
- Abschlussberichte (for best‑practice extraction)


## Retrieval Setup

- **GraphRAG**: Entity graph (Project ↔ Träger ↔ KPI ↔ Region ↔ Source; Law ↔ Paragraph ↔ Weisung). Use for portfolio/status and change‑impact.

- **VectorRAG**: FAISS over paragraphs, press texts, procedures; semantic search for drafting (procedures, press, best‑practice).

- **IndexRAG**: Lucene/ES over statutes/IDs for exact paragraph matches and citation checks.

- **NoGrounding**: 10% control items (should reveal hallucinations or weak citations).


## Preprocessing Guidelines

- Normalize sections into JSONL: `{id, title, body, law_code, paragraph, url, updated_at}`.

- Keep paragraph granularity: one record per paragraph subsection (e.g., § 44a (1), (2)).

- Attach provenance: `source_url`, `source_date`, `retrieved_at`.

- For press/projects, store KPIs as typed fields: `participants_qX_YYYY`, `budget_eur`, `region`, `provider_id`.

- For Weisungen/form templates, store versioned docs: `version`, `effective_from`, `supersedes`.


## Evaluation Mapping

- **legal_qna / legal_research / checklist / jurisdiction** → IndexRAG primary; VectorRAG secondary; check citations.

- **status_report / portfolio_kpi / legal_change_monitor / it_graph** → GraphRAG primary; VectorRAG for summaries.

- **procedure / press_draft / best_practice / mindmap / support_log_analysis** → VectorRAG primary; IndexRAG for anchors.


## Acceptance & Scoring

- Required: at least one citation for grounded tasks; state dataset date in answers.

- Factuality target ≥0.8; style match to role; grounding mode match.


## Notes
- Keep stateful fields `valid_from`, `valid_to`, `last_verified_at`, `review_due_at`, `stale_status` in graph.
- Mindmaps should return hierarchical bullets; procedures must list roles/steps/deadlines; checklists in step form.
