# Woodland Pipeline Release Guide

This guide describes a safe, repeatable pathway to release knowledge-base changes to production.

## Environments

- staging: Dry-run, optional indexing against a staging LibreChat + RAG + Azure instance.
- production: Customer-facing instance; requires manual approval.

## CI/CD Overview

1. Pull Request Validation (auto):
   - Build unified datasets (CSV + Markdown)
   - Validate quality gates and emit report
   - Upload artifacts for review

2. Dry-run Index (auto):
   - Exercise indexer without external services (`--dry-run`)

3. Staging Index (manual):
   - Trigger workflow dispatch with `run_indexing=true` and `target_environment=staging`
   - Index to RAG and Azure using environment-scoped secrets
   - Capture `WOODLAND_QA_FILE_ID` and verify embeddings

4. Production Index (manual, after sign-off):
   - Trigger workflow dispatch with `run_indexing=true` and `target_environment=production`
   - Index to RAG and Azure
   - Verify embeddings and run smoke queries

## Required Secrets/Vars (per environment)

Blank lines are intentional to satisfy markdown lint rules.

Secrets:

- RAG_API_URL
- ADMIN_USER_ID (or TEST_USER_ID)
- JWT_SECRET
- AZURE_AI_SEARCH_SERVICE_ENDPOINT
- AZURE_AI_SEARCH_API_KEY

Vars:

- AZURE_AI_SEARCH_INDEX_NAME

## Pre-release Checklist

- [ ] PR passes build and validate stages
- [ ] Validation report reviewed (warnings acceptable or fixed)
- [ ] Dataset diff is expected (new/updated Q&A only)
- [ ] Staging index completes; `verifyEmbedding` passes
- [ ] Agent answers from QA KB look correct for 3–5 sample queries

## Rollback Plan

If production index results are not satisfactory:

1. Revert to previous `WOODLAND_QA_FILE_ID` in agent env (or remove override)
2. Re-run staging with corrected dataset
3. Re-promote to production

## Local Tips

- Use Node 20 (`nvm use`) to match CI
- If shell parsing issues occur in zsh, set NPM to use bash:

  ```bash
  npm config set script-shell /bin/bash
  ```
