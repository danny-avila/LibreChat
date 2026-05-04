#!/usr/bin/env bash

# shellcheck shell=bash
# shellcheck disable=SC2016,SC2329
# shellcheck source=deploy/ferretdb/bin/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_env_file

EVIDENCE_ROOT="$(absolute_path "${EVIDENCE_ROOT:-artifacts/release-evidence}")"
EVIDENCE_NAME="${EVIDENCE_NAME:-$(timestamp_utc)}"
EVIDENCE_DIR="$EVIDENCE_ROOT/$EVIDENCE_NAME"
STEPS_TSV="$EVIDENCE_DIR/steps.tsv"
TENANT_GATEWAY_URL="${TENANT_GATEWAY_URL:-http://127.0.0.1:${LIBRECHAT_HTTP_PORT:-3080}}"
SHIP_ENV_FILE="${SHIP_ENV_FILE:-$DEPLOY_DIR/.env.backup-shipping}"

RELEASE_EVIDENCE_VALIDATE_ENV="${RELEASE_EVIDENCE_VALIDATE_ENV:-true}"
RELEASE_EVIDENCE_DB_COMPAT="${RELEASE_EVIDENCE_DB_COMPAT:-true}"
RELEASE_EVIDENCE_HEALTHCHECK="${RELEASE_EVIDENCE_HEALTHCHECK:-true}"
RELEASE_EVIDENCE_TENANT_SMOKE="${RELEASE_EVIDENCE_TENANT_SMOKE:-true}"
RELEASE_EVIDENCE_AUTH_GATEWAY="${RELEASE_EVIDENCE_AUTH_GATEWAY:-auto}"
RELEASE_EVIDENCE_REQUIRE_AUTH_GATEWAY="${RELEASE_EVIDENCE_REQUIRE_AUTH_GATEWAY:-false}"
RELEASE_EVIDENCE_BACKUP_SHIPPING="${RELEASE_EVIDENCE_BACKUP_SHIPPING:-auto}"
RELEASE_EVIDENCE_REQUIRE_BACKUP_SHIPPING="${RELEASE_EVIDENCE_REQUIRE_BACKUP_SHIPPING:-false}"
RELEASE_EVIDENCE_LICENSE_AUDIT="${RELEASE_EVIDENCE_LICENSE_AUDIT:-true}"
RELEASE_EVIDENCE_INCLUDE_SECRET_CONFIG="${RELEASE_EVIDENCE_INCLUDE_SECRET_CONFIG:-false}"

mkdir -p "$EVIDENCE_DIR/logs" "$EVIDENCE_DIR/compose" "$EVIDENCE_DIR/config" "$EVIDENCE_DIR/git"
printf 'name\trequired\tstatus\texit_code\tduration_seconds\tstdout\tstderr\treason\n' >"$STEPS_TSV"

slugify() {
  local slug
  slug="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g')"
  if [[ -z "$slug" ]]; then
    slug="step"
  fi
  printf '%s\n' "$slug"
}

tsv_value() {
  printf '%s' "$1" | tr '\t\n\r' ' '
}

redact_stream() {
  awk -F= '
    /^[[:space:]]*#/ || NF < 2 {
      print
      next
    }
    {
      name = $1
      if (name ~ /(PASSWORD|SECRET|TOKEN|KEY|CREDS|JWT|MONGO_URI|DATABASE_URL|AUTH_GATEWAY_VALID_HEADERS_JSON|ACCESS_KEY|SECRET_KEY|MASTER_KEY)/) {
        print name "=<redacted>"
      } else {
        print
      }
    }
  '
}

redact_compose_stream() {
  sed -E \
    -e 's#(mongodb|postgres|redis)://([^:/@]+):[^@]+@#\1://\2:<redacted>@#g' \
    -e '/(PASSWORD|SECRET|TOKEN|KEY|CREDS|JWT|MONGO_URI|DATABASE_URL|AUTH_GATEWAY_VALID_HEADERS_JSON|ACCESS_KEY|SECRET_KEY|MASTER_KEY)[A-Z0-9_]*:/ s#:.*#: <redacted>#'
}

snapshot_config() {
  local file
  local abs
  local yaml_path

  redact_stream <"$ENV_FILE" >"$EVIDENCE_DIR/config/env.redacted"

  IFS=',' read -r -a files <<<"$COMPOSE_FILES"
  for file in "${files[@]}"; do
    if [[ -n "$file" ]]; then
      abs="$(absolute_path "$file")"
      if [[ -f "$abs" ]]; then
        cp "$abs" "$EVIDENCE_DIR/config/$(basename "$file")"
      fi
    fi
  done

  yaml_path="$(absolute_path "${LIBRECHAT_YAML_PATH:-./librechat.yaml}")"
  if [[ -f "$yaml_path" ]]; then
    cp "$yaml_path" "$EVIDENCE_DIR/config/$(basename "$yaml_path")"
  fi

  git rev-parse HEAD >"$EVIDENCE_DIR/git/head.txt" 2>"$EVIDENCE_DIR/git/head.stderr.log" || true
  git status --short >"$EVIDENCE_DIR/git/status.txt" 2>"$EVIDENCE_DIR/git/status.stderr.log" || true
}

run_step() {
  local name="$1"
  local required="$2"
  shift 2

  local slug
  local stdout
  local stderr
  local started
  local ended
  local duration
  local exit_code
  local status

  slug="$(slugify "$name")"
  stdout="logs/${slug}.stdout.log"
  stderr="logs/${slug}.stderr.log"
  started="$(date +%s)"

  printf 'running: %s\n' "$name"
  set +e
  "$@" >"$EVIDENCE_DIR/$stdout" 2>"$EVIDENCE_DIR/$stderr"
  exit_code=$?
  set -e

  ended="$(date +%s)"
  duration=$((ended - started))
  if ((exit_code == 0)); then
    status="passed"
    printf 'passed: %s\n' "$name"
  else
    status="failed"
    printf 'failed: %s (exit %s)\n' "$name" "$exit_code" >&2
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(tsv_value "$name")" \
    "$required" \
    "$status" \
    "$exit_code" \
    "$duration" \
    "$stdout" \
    "$stderr" \
    "" >>"$STEPS_TSV"
}

skip_step() {
  local name="$1"
  local required="$2"
  local reason="$3"

  printf 'skipped: %s (%s)\n' "$name" "$reason"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(tsv_value "$name")" \
    "$required" \
    "skipped" \
    "" \
    "0" \
    "" \
    "" \
    "$(tsv_value "$reason")" >>"$STEPS_TSV"
}

enabled() {
  case "$1" in
    true | TRUE | 1 | yes | YES | on | ON) return 0 ;;
    *) return 1 ;;
  esac
}

step_validate_env() {
  "$SCRIPT_DIR/validate-env.sh"
}

step_compose_config() {
  local raw="$EVIDENCE_DIR/compose/rendered.raw.yml"
  local redacted="$EVIDENCE_DIR/compose/rendered.redacted.yml"
  local status

  compose config >"$raw"
  status=$?
  if ((status != 0)); then
    return "$status"
  fi

  redact_compose_stream <"$raw" >"$redacted"
  if [[ "$RELEASE_EVIDENCE_INCLUDE_SECRET_CONFIG" != "true" ]]; then
    rm -f "$raw"
  fi
}

step_compose_ps() {
  compose ps
}

step_db_compat() {
  if [[ -n "${DB_COMPAT_MONGO_URI:-}" ]]; then
    compose exec -T \
      -e MONGO_URI="$DB_COMPAT_MONGO_URI" \
      -e DB_COMPAT_ALLOW_DROP=true \
      -e TENANT_ISOLATION_STRICT=true \
      api node /app/config/db-compat-ferretdb.js
  else
    compose exec -T \
      -e DB_COMPAT_ALLOW_DROP=true \
      -e TENANT_ISOLATION_STRICT=true \
      api sh -ceu '
        base="${MONGO_URI%%\?*}"
        query="${MONGO_URI#*\?}"
        if [ "$query" = "$MONGO_URI" ]; then
          query=""
        else
          query="?$query"
        fi
        export MONGO_URI="${base%/*}/LibreChatCompat${query}"
        node /app/config/db-compat-ferretdb.js
      '
  fi
}

step_healthcheck() {
  TENANT_GATEWAY_URL="$TENANT_GATEWAY_URL" "$SCRIPT_DIR/healthcheck.sh"
}

step_tenant_smoke() {
  TENANT_GATEWAY_URL="$TENANT_GATEWAY_URL" npm run smoke:tenant-gateway
}

step_auth_gateway() {
  npm run smoke:auth-gateway
}

step_backup_shipping() {
  BACKUP_SHIP_DRY_RUN=true "$SCRIPT_DIR/ship-backups.sh"
}

step_license_audit() {
  LICENSE_AUDIT_DIR="$EVIDENCE_DIR/license-audit" npm run license:audit
}

write_summary() {
  node - "$EVIDENCE_DIR" "$STEPS_TSV" <<'NODE'
const fs = require('fs');
const path = require('path');

const evidenceDir = process.argv[2];
const stepsPath = process.argv[3];

function readOptional(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

const lines = fs.readFileSync(stepsPath, 'utf8').trimEnd().split('\n');
const headers = lines.shift().split('\t');
const steps = lines
  .filter(Boolean)
  .map((line) => {
    const values = line.split('\t');
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });

const requiredFailures = steps.filter(
  (step) => step.required === 'required' && step.status === 'failed',
);
const requiredSkips = steps.filter(
  (step) => step.required === 'required' && step.status === 'skipped',
);
const optionalFailures = steps.filter(
  (step) => step.required === 'optional' && step.status === 'failed',
);
const optionalSkips = steps.filter(
  (step) => step.required === 'optional' && step.status === 'skipped',
);
const releaseStatus =
  requiredFailures.length > 0 ? 'NO-GO' : requiredSkips.length > 0 ? 'INCOMPLETE' : 'GO';

const gitHead = readOptional(path.join(evidenceDir, 'git/head.txt'));
const gitStatus = readOptional(path.join(evidenceDir, 'git/status.txt'));
const summary = {
  generatedAt: new Date().toISOString(),
  releaseStatus,
  evidenceDir,
  gitHead,
  gitDirty: gitStatus.length > 0,
  counts: {
    total: steps.length,
    passed: steps.filter((step) => step.status === 'passed').length,
    failed: steps.filter((step) => step.status === 'failed').length,
    skipped: steps.filter((step) => step.status === 'skipped').length,
    requiredFailures: requiredFailures.length,
    requiredSkips: requiredSkips.length,
    optionalFailures: optionalFailures.length,
    optionalSkips: optionalSkips.length,
  },
  steps,
};

fs.writeFileSync(path.join(evidenceDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

const rows = steps
  .map((step) =>
    `| ${[
      step.name,
      step.required,
      step.status,
      step.exit_code || '-',
      step.duration_seconds,
      step.reason || '-',
    ]
      .map((value) => String(value).replace(/\|/g, '\\|'))
      .join(' | ')} |`,
  )
  .join('\n');

const markdown = `# LibreChat FerretDB Release Evidence

- Generated: ${summary.generatedAt}
- Status: **${releaseStatus}**
- Git head: ${gitHead || 'unknown'}
- Git dirty: ${summary.gitDirty ? 'yes' : 'no'}
- Evidence directory: ${evidenceDir}

## Step Summary

| Step | Required | Status | Exit | Seconds | Reason |
| --- | --- | --- | --- | --- | --- |
${rows}

## Interpretation

GO means every required check passed. NO-GO means at least one required check failed. INCOMPLETE means no required check failed, but at least one required check was intentionally skipped by configuration.

Optional auth-gateway conformance and backup-shipping dry-run checks become part of this evidence when their environment is configured. For commercial production sign-off, run auth-gateway conformance against the real public gateway and keep backup shipping configured to an off-host encrypted remote.

## Generated Artifacts

- Redacted environment snapshot: \`config/env.redacted\`
- Redacted compose render: \`compose/rendered.redacted.yml\`
- Step logs: \`logs/\`
- License audit: \`license-audit/\`
- Raw step metadata: \`steps.tsv\`
- Machine-readable summary: \`summary.json\`
`;

fs.writeFileSync(path.join(evidenceDir, 'summary.md'), markdown);
NODE
}

snapshot_config

if enabled "$RELEASE_EVIDENCE_VALIDATE_ENV"; then
  run_step "validate production environment" "required" step_validate_env
else
  skip_step "validate production environment" "required" "RELEASE_EVIDENCE_VALIDATE_ENV is disabled"
fi

run_step "render docker compose config" "required" step_compose_config
run_step "list compose services" "required" step_compose_ps

if enabled "$RELEASE_EVIDENCE_DB_COMPAT"; then
  run_step "ferretdb compatibility harness" "required" step_db_compat
else
  skip_step "ferretdb compatibility harness" "required" "RELEASE_EVIDENCE_DB_COMPAT is disabled"
fi

if enabled "$RELEASE_EVIDENCE_HEALTHCHECK"; then
  run_step "host healthcheck" "required" step_healthcheck
else
  skip_step "host healthcheck" "required" "RELEASE_EVIDENCE_HEALTHCHECK is disabled"
fi

if enabled "$RELEASE_EVIDENCE_TENANT_SMOKE"; then
  run_step "tenant gateway smoke test" "required" step_tenant_smoke
else
  skip_step "tenant gateway smoke test" "required" "RELEASE_EVIDENCE_TENANT_SMOKE is disabled"
fi

if [[ "$RELEASE_EVIDENCE_AUTH_GATEWAY" == "auto" ]]; then
  if [[ -n "${AUTH_GATEWAY_URL:-}" ]]; then
    run_step "public auth gateway conformance" "optional" step_auth_gateway
  elif enabled "$RELEASE_EVIDENCE_REQUIRE_AUTH_GATEWAY"; then
    skip_step "public auth gateway conformance" "required" "AUTH_GATEWAY_URL is not set"
  else
    skip_step "public auth gateway conformance" "optional" "AUTH_GATEWAY_URL is not set"
  fi
elif enabled "$RELEASE_EVIDENCE_AUTH_GATEWAY"; then
  auth_required="optional"
  if enabled "$RELEASE_EVIDENCE_REQUIRE_AUTH_GATEWAY"; then
    auth_required="required"
  fi
  run_step "public auth gateway conformance" "$auth_required" step_auth_gateway
else
  skip_step "public auth gateway conformance" "optional" "RELEASE_EVIDENCE_AUTH_GATEWAY is disabled"
fi

if [[ "$RELEASE_EVIDENCE_BACKUP_SHIPPING" == "auto" ]]; then
  if [[ -n "${BACKUP_REMOTE:-}" || -f "$SHIP_ENV_FILE" ]]; then
    run_step "backup shipping dry-run" "optional" step_backup_shipping
  elif enabled "$RELEASE_EVIDENCE_REQUIRE_BACKUP_SHIPPING"; then
    skip_step "backup shipping dry-run" "required" "BACKUP_REMOTE is not configured"
  else
    skip_step "backup shipping dry-run" "optional" "BACKUP_REMOTE is not configured"
  fi
elif enabled "$RELEASE_EVIDENCE_BACKUP_SHIPPING"; then
  backup_required="optional"
  if enabled "$RELEASE_EVIDENCE_REQUIRE_BACKUP_SHIPPING"; then
    backup_required="required"
  fi
  run_step "backup shipping dry-run" "$backup_required" step_backup_shipping
else
  skip_step "backup shipping dry-run" "optional" "RELEASE_EVIDENCE_BACKUP_SHIPPING is disabled"
fi

if enabled "$RELEASE_EVIDENCE_LICENSE_AUDIT"; then
  run_step "license audit" "required" step_license_audit
else
  skip_step "license audit" "required" "RELEASE_EVIDENCE_LICENSE_AUDIT is disabled"
fi

write_summary

summary_status="$(node - "$EVIDENCE_DIR/summary.json" <<'NODE'
const summary = require(process.argv[2]);
process.stdout.write(summary.releaseStatus);
NODE
)"
printf 'release evidence complete: %s\n' "$EVIDENCE_DIR"
printf 'release status: %s\n' "$summary_status"

case "$summary_status" in
  GO) exit 0 ;;
  INCOMPLETE) exit 2 ;;
  *) exit 1 ;;
esac
