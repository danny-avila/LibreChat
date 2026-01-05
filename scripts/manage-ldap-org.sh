#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME=$(basename "${BASH_SOURCE[0]}")
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/${SCRIPT_NAME}"

load_env_value() {
  local key=$1
  local default=${2-}
  if [ -n "${!key:-}" ]; then
    printf '%s' "${!key}"
    return
  fi
  for file in .env .env.example; do
    if [ -f "$file" ]; then
      local line
      if line=$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 || true); then
        if [ -n "$line" ]; then
          local value=${line#*=}
          printf '%s' "$value"
          return
        fi
      fi
    fi
  done
  printf '%s' "$default"
}

get_env() {
  local key=$1
  local default=${2-}
  local value
  value=$(load_env_value "$key" "")
  if [ -n "$value" ]; then
    printf '%s' "$value"
  else
    printf '%s' "$default"
  fi
}

trim() {
  local var="$*"
  var="${var#${var%%[![:space:]]*}}"
  var="${var%${var##*[![:space:]]}}"
  printf '%s' "$var"
}

split_list() {
  local input=$1
  local IFS=','
  local item
  read -ra parts <<< "$input"
  for item in "${parts[@]}"; do
    item=$(trim "$item")
    if [ -n "$item" ]; then
      printf '%s\n' "$item"
    fi
  done
}

format_ou() {
  local ou=$1
  if [[ $ou == ou=* ]]; then
    printf '%s' "$ou"
  else
    printf 'ou=%s' "$ou"
  fi
}

ou_label() {
  local ou_dn=$1
  local first_segment=${ou_dn%%,*}
  printf '%s' "${first_segment#ou=}"
}

LDAP_CONTAINER=$(get_env "LDAP_CONTAINER" "chat-ldap")
LDAP_BASE=$(get_env "LDAP_BASE" "dc=librechat,dc=local")
LDAP_DOMAIN=$(get_env "LDAP_DOMAIN" "librechat.local")
LDAP_ORGANISATION=$(get_env "LDAP_ORGANISATION" "$(get_env "LDAP_ORGANIZATION" "LibreChat")")
LDAP_USERS_OU=$(format_ou "$(get_env "LDAP_USERS_OU" "ou=users")")
LDAP_GROUPS_OU=$(format_ou "$(get_env "LDAP_GROUPS_OU" "ou=groups")")
LDAP_BIND_DN=$(get_env "LDAP_BIND_DN" "cn=admin,${LDAP_BASE}")
LDAP_BIND_CREDENTIALS=$(get_env "LDAP_BIND_CREDENTIALS" "")
LDAP_ADMIN_PASSWORD=$(get_env "LDAP_ADMIN_PASSWORD" "admin")
BIND_PWD=${LDAP_BIND_CREDENTIALS:-$LDAP_ADMIN_PASSWORD}
LDAP_DEFAULT_PASSWORD=$(get_env "LDAP_DEFAULT_PASSWORD" "password123")

USERS_BASE="${LDAP_USERS_OU},${LDAP_BASE}"
GROUPS_BASE="${LDAP_GROUPS_OU},${LDAP_BASE}"
STATUS_SCHEMA_READY=0

require_container() {
  if ! docker ps --format '{{.Names}}' | grep -q "^${LDAP_CONTAINER}$"; then
    echo "LDAP container ${LDAP_CONTAINER} is not running. Start it with 'docker compose up -d ldap'." >&2
    exit 1
  fi
}

entry_exists() {
  local dn=$1
  docker exec "${LDAP_CONTAINER}" ldapsearch -x -LLL -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" -b "$dn" "(objectClass=*)" dn >/dev/null 2>&1
}

status_schema_defined() {
  docker exec "${LDAP_CONTAINER}" ldapsearch -Y EXTERNAL -H ldapi:/// -LLL -b cn=schema,cn=config "(olcAttributeTypes=*status*)" olcAttributeTypes >/dev/null 2>&1
}

add_status_schema() {
  if docker exec -i "${LDAP_CONTAINER}" ldapmodify -Y EXTERNAL -H ldapi:/// -c <<'EOF'; then
dn: cn=config
changetype: modify
add: olcAttributeTypes
olcAttributeTypes: ( 1.3.6.1.4.1.55555.1 NAME 'status' DESC 'LibreChat user status' EQUALITY caseIgnoreMatch SUBSTR caseIgnoreSubstringsMatch SYNTAX 1.3.6.1.4.1.1466.115.121.1.15 SINGLE-VALUE )
-
add: olcObjectClasses
olcObjectClasses: ( 1.3.6.1.4.1.55555.2 NAME 'librechatStatusAux' DESC 'Auxiliary class for status attribute' SUP top AUXILIARY MAY ( status ) )
EOF
    echo "Loaded LibreChat status schema"
    return
  fi
  echo "LibreChat status schema already defined; continuing"
}

ensure_status_schema() {
  if [ "$STATUS_SCHEMA_READY" -eq 1 ]; then
    return
  fi
  if status_schema_defined; then
    STATUS_SCHEMA_READY=1
    return
  fi
  echo "Adding LibreChat status schema"
  add_status_schema
  STATUS_SCHEMA_READY=1
}

entry_has_object_class() {
  local dn=$1
  local class=$2
  docker exec "${LDAP_CONTAINER}" ldapsearch -x -LLL -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" -b "$dn" "(objectClass=${class})" dn >/dev/null 2>&1
}

add_object_class() {
  local dn=$1
  local class=$2
  if ! docker exec -i "${LDAP_CONTAINER}" ldapmodify -c -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" <<EOF; then
dn: ${dn}
changetype: modify
add: objectClass
objectClass: ${class}
EOF
    :
  fi
}

ensure_ou() {
  local ou_dn=$1
  local label=$2
  local description=${3-}
  if entry_exists "$ou_dn"; then
    if [ -n "$description" ]; then
      docker exec -i "${LDAP_CONTAINER}" ldapmodify -c -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" <<EOF
Dn: ${ou_dn}
changetype: modify
replace: description
description: ${description}
EOF
    fi
    return
  fi
  local desc_value=${description:-"Organizational unit created by ${SCRIPT_NAME}"}
  docker exec -i "${LDAP_CONTAINER}" ldapadd -c -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" <<EOF
dn: ${ou_dn}
objectClass: top
objectClass: organizationalUnit
ou: ${label}
description: ${desc_value}
EOF
  echo "Ensured OU ${label} at ${ou_dn}"
}

group_dn() {
  local name=$1
  printf 'cn=%s,%s' "$name" "$GROUPS_BASE"
}

user_dn() {
  local username=$1
  printf 'uid=%s,%s' "$username" "$USERS_BASE"
}

group_has_member() {
  local group_dn=$1
  local member_dn=$2
  docker exec "${LDAP_CONTAINER}" ldapsearch -x -LLL -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" -b "$group_dn" "(&(objectClass=groupOfNames)(member=${member_dn}))" member >/dev/null 2>&1
}

add_member_to_group() {
  local member_dn=$1
  local group_dn=$2
  if ! entry_exists "$member_dn"; then
    echo "Cannot add ${member_dn} to ${group_dn}: user entry is missing yet." >&2
    return 0
  fi
  if ! entry_exists "$group_dn"; then
    echo "Group ${group_dn} does not exist. Create it with --name before adding members." >&2
    return 1
  fi
  if group_has_member "$group_dn" "$member_dn"; then
    echo "${member_dn} already a member of ${group_dn}"
    return 0
  fi
  docker exec -i "${LDAP_CONTAINER}" ldapmodify -c -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" <<EOF
dn: ${group_dn}
changetype: modify
add: member
member: ${member_dn}
EOF
  echo "Added ${member_dn} to ${group_dn}"
}

create_org() {
  local name=""
  local description=""
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --name)
        name="$2"
        shift 2
        ;;
      --description)
        description="$2"
        shift 2
        ;;
      *)
        echo "Unknown option $1" >&2
        exit 1
        ;;
    esac
  done
  if [ -z "$name" ]; then
    echo "--name is required for create-org" >&2
    exit 1
  fi
  local label=${name}
  if [[ $label == ou=* ]]; then
    label=${label#ou=}
  fi
  local ou_dn
  if [[ $name == ou=* ]]; then
    ou_dn="${name},${LDAP_BASE}"
  else
    ou_dn="ou=${label},${LDAP_BASE}"
  fi
  ensure_ou "$ou_dn" "$label" "$description"
}

create_group() {
  local name=""
  local org="${LDAP_ORGANISATION}"
  local guardrail=""
  local services=""
  local vector_db=""
  local members=""
  local desc=""
  local rules=""
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --name)
        name="$2"
        shift 2
        ;;
      --org)
        org="$2"
        shift 2
        ;;
      --guardrail)
        guardrail="$2"
        shift 2
        ;;
      --services)
        services="$2"
        shift 2
        ;;
      --vector-db)
        vector_db="$2"
        shift 2
        ;;
      --members)
        members="$2"
        shift 2
        ;;
      --description)
        desc="$2"
        shift 2
        ;;
      --rules)
        rules="$2"
        shift 2
        ;;
      *)
        echo "Unknown option $1" >&2
        exit 1
        ;;
    esac
  done
  if [ -z "$name" ]; then
    echo "--name is required for create-group" >&2
    exit 1
  fi
  require_container
  ensure_ou "${GROUPS_BASE}" "$(ou_label "${LDAP_GROUPS_OU}")"
  local dn
  dn=$(group_dn "$name")
  local metadata="org=${org}"
  if [ -n "$guardrail" ]; then
    metadata+=";guardrail=${guardrail}"
  fi
  if [ -n "$services" ]; then
    metadata+=";services=${services}"
  fi
  if [ -n "$vector_db" ]; then
    metadata+=";vectorDb=${vector_db}"
  fi
  local desc_value
  if [ -n "$desc" ]; then
    desc_value="$desc"
  else
    desc_value="${metadata}"
  fi
  if [ -n "$rules" ]; then
    desc_value+=";rules=${rules}"
  fi
  if entry_exists "$dn"; then
    docker exec -i "${LDAP_CONTAINER}" ldapmodify -c -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" <<EOF
dn: ${dn}
changetype: modify
replace: description
description: ${desc_value}
EOF
    echo "Updated group ${name}"
  else
    docker exec -i "${LDAP_CONTAINER}" ldapadd -c -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" <<EOF
dn: ${dn}
objectClass: top
objectClass: groupOfNames
cn: ${name}
description: ${desc_value}
member: ${LDAP_BIND_DN}
EOF
    echo "Created group ${name}"
  fi
  if [ -n "$members" ]; then
    while IFS= read -r member; do
      add_member_to_group "$(user_dn "$member")" "$dn"
    done < <(split_list "$members")
  fi
}

create_user() {
  local username=""
  local given=""
  local sn=""
  local email=""
  local password=""
  local groups=""
  local org="${LDAP_ORGANISATION}"
  local status="active"
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --username)
        username="$2"
        shift 2
        ;;
      --firstname)
        given="$2"
        shift 2
        ;;
      --lastname)
        sn="$2"
        shift 2
        ;;
      --email)
        email="$2"
        shift 2
        ;;
      --password)
        password="$2"
        shift 2
        ;;
      --groups)
        groups="$2"
        shift 2
        ;;
      --org)
        org="$2"
        shift 2
        ;;
      --status)
        status="$2"
        shift 2
        ;;
      *)
        echo "Unknown option $1" >&2
        exit 1
        ;;
    esac
  done
  if [ -z "$username" ]; then
    echo "--username is required for create-user" >&2
    exit 1
  fi
  if [ -z "$password" ]; then
    password="${LDAP_DEFAULT_PASSWORD}"
  fi
  email=${email:-"${username}@${LDAP_DOMAIN}"}
  local normalized_groups
  normalized_groups=$(trim "$groups")
  if [ -z "$normalized_groups" ]; then
    normalized_groups="users"
  elif ! [[ ",${normalized_groups}," == *",users,"* ]]; then
    normalized_groups="users,${normalized_groups}"
  fi
  require_container
  ensure_status_schema
  ensure_ou "${USERS_BASE}" "$(ou_label "${LDAP_USERS_OU}")"
  local cn_value
  if [ -n "$given" ] && [ -n "$sn" ]; then
    cn_value="${given} ${sn}"
  elif [ -n "$given" ]; then
    cn_value="$given"
  elif [ -n "$sn" ]; then
    cn_value="$sn"
  else
    cn_value="$username"
  fi
  local dn
  dn=$(user_dn "$username")
  if entry_exists "$dn"; then
    if ! entry_has_object_class "$dn" "librechatStatusAux"; then
      add_object_class "$dn" "librechatStatusAux"
    fi
    docker exec -i "${LDAP_CONTAINER}" ldapmodify -c -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" <<EOF
dn: ${dn}
changetype: modify
replace: cn
cn: ${cn_value}
-
replace: givenName
givenName: ${given}
-
replace: sn
sn: ${sn}
-
replace: mail
mail: ${email}
-
replace: userPassword
userPassword: ${password}
-
replace: o
o: ${org}
-
replace: status
status: ${status}
EOF
    echo "Updated user ${username}"
  else
    docker exec -i "${LDAP_CONTAINER}" ldapadd -c -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" <<EOF
dn: ${dn}
objectClass: top
objectClass: person
objectClass: organizationalPerson
objectClass: inetOrgPerson
objectClass: librechatStatusAux
cn: ${cn_value}
sn: ${sn}
givenName: ${given}
uid: ${username}
mail: ${email}
userPassword: ${password}
o: ${org}
status: ${status}
EOF
    echo "Created user ${username}"
  fi
  if [ -n "$normalized_groups" ]; then
    while IFS= read -r group; do
      add_member_to_group "$dn" "$(group_dn "$group")"
    done < <(split_list "$normalized_groups")
  fi
}

show_users() {
  require_container
  if [ $# -lt 1 ]; then
    echo "At least one username is required for show-user" >&2
    exit 1
  fi
  for username in "$@"; do
    echo "=== ${username} ==="
    local entry
    entry=$(docker exec "${LDAP_CONTAINER}" ldapsearch -x -LLL -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" -b "${USERS_BASE}" "(&(objectClass=inetOrgPerson)(uid=${username}))" dn uid cn givenName sn mail o status memberOf 2>/dev/null || true)
    if [ -z "${entry}" ]; then
      echo "  not found"
      echo
      continue
    fi
    printf '%s' "${entry}" | awk '
      NF == 0 { next }
      { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0) }
      { printf "  %s\n", $0 }
    '
    echo
  done
}

cleanup_user() {
  require_container
  if [ $# -lt 1 ]; then
    echo "At least one username is required for cleanup-user" >&2
    exit 1
  fi
  for username in "$@"; do
    local canonical_dn
    canonical_dn=$(user_dn "$username")
    local dns
    dns=$(docker exec "${LDAP_CONTAINER}" ldapsearch -x -LLL -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" -b "${USERS_BASE}" "(&(objectClass=inetOrgPerson)(uid=${username}))" dn 2>/dev/null || true)
    local deleted=0
    while IFS= read -r line; do
      if [[ $line =~ ^dn:[[:space:]]*(.+)$ ]]; then
        local dn=${BASH_REMATCH[1]}
        if [ "$dn" != "$canonical_dn" ]; then
          echo "Removing duplicate entry $dn"
          docker exec "${LDAP_CONTAINER}" ldapdelete -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" "$dn" >/dev/null 2>&1 || true
          deleted=1
        fi
      fi
    done <<< "$dns"
    if [ $deleted -eq 0 ]; then
      echo "No duplicates found for ${username}"
    fi
  done
}

add_user_to_group() {
  require_container
  local username=""
  local group=""
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --username)
        username="$2"
        shift 2
        ;;
      --group)
        group="$2"
        shift 2
        ;;
      *)
        echo "Unknown option $1" >&2
        exit 1
        ;;
    esac
  done
  if [ -z "$username" ] || [ -z "$group" ]; then
    echo "--username and --group are required for add-user-to-group" >&2
    exit 1
  fi
  ensure_ou "${GROUPS_BASE}" "$(ou_label "${LDAP_GROUPS_OU}")"
  add_member_to_group "$(user_dn "$username")" "$(group_dn "$group")"
}

remove_user_from_group() {
  require_container
  local username=""
  local group=""
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --username)
        username="$2"
        shift 2
        ;;
      --group)
        group="$2"
        shift 2
        ;;
      *)
        echo "Unknown option $1" >&2
        exit 1
        ;;
    esac
  done
  if [ -z "$username" ] || [ -z "$group" ]; then
    echo "--username and --group are required for remove-user-from-group" >&2
    exit 1
  fi
  local group_dn_value
  group_dn_value=$(group_dn "$group")
  local user_dn_value
  user_dn_value=$(user_dn "$username")
  docker exec -i "${LDAP_CONTAINER}" ldapmodify -c -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" <<EOF
dn: ${group_dn_value}
changetype: modify
delete: member
member: ${user_dn_value}
EOF
  echo "Removed ${username} from ${group}"
}

delete_user() {
  require_container
  local username=""
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --username)
        username="$2"
        shift 2
        ;;
      *)
        echo "Unknown option $1" >&2
        exit 1
        ;;
    esac
  done
  if [ -z "$username" ]; then
    echo "--username is required for delete-user" >&2
    exit 1
  fi
  docker exec "${LDAP_CONTAINER}" ldapdelete -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" "$(user_dn "$username")"
  echo "Deleted LDAP user ${username}"
}

apply_template() {
  local file=$1
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    echo "Template file not found: ${file}" >&2
    exit 1
  fi
  python3 - "$file" "$SCRIPT_PATH" "${LDAP_ORGANISATION}" <<'PY'
import json
import subprocess
import sys

template = json.load(open(sys.argv[1]))
script = sys.argv[2]
default_org = sys.argv[3] if len(sys.argv) > 3 else 'LibreChat'

for org in template.get('organizations', []):
  cmd = [script, 'create-org', '--name', org['name']]
  if org.get('description'):
    cmd.extend(['--description', org['description']])
  subprocess.run(cmd, check=True)

for group in template.get('groups', []):
  cmd = [script, 'create-group', '--name', group['name']]
  if group.get('org'):
    cmd.extend(['--org', group['org']])
  if group.get('guardrail'):
    cmd.extend(['--guardrail', group['guardrail']])
  if group.get('services'):
    cmd.extend(['--services', group['services']])
  if group.get('vectorDb'):
    cmd.extend(['--vector-db', group['vectorDb']])
  if group.get('description'):
    cmd.extend(['--description', group['description']])
  if group.get('rules'):
    cmd.extend(['--rules', json.dumps(group['rules'])])
  if group.get('members'):
    cmd.extend(['--members', ','.join(group['members'])])
  subprocess.run(cmd, check=True)

for user in template.get('users', []):
  cmd = [
    script,
    'create-user',
    '--username', user['username'],
    '--password', user.get('password', ''),
    '--email', user.get('email', ''),
    '--org', user.get('org', default_org),
  ]
  if user.get('firstname'):
    cmd.extend(['--firstname', user['firstname']])
  if user.get('lastname'):
    cmd.extend(['--lastname', user['lastname']])
  if user.get('groups'):
    cmd.extend(['--groups', user['groups']])
  if user.get('status'):
    cmd.extend(['--status', user['status']])
  subprocess.run(cmd, check=True)
PY
}

usage() {
  cat <<EOF
Usage: ${SCRIPT_NAME} <command> [options]

Commands:
  create-org --name NAME [--description TEXT]
  create-group --name NAME [--org ORG] [--guardrail TAG] [--services LIST] [--vector-db NAME] [--members CSV] [--description TEXT] [--rules JSON]
  create-user --username USERNAME --password PASSWORD [--firstname NAME] [--lastname NAME] [--email EMAIL] [--groups CSV] [--org ORG] [--status active|inactive]
  show-user USERNAME [USERNAME ...]
  cleanup-user USERNAME [USERNAME ...]
  add-user-to-group --username USERNAME --group GROUP
  remove-user-from-group --username USERNAME --group GROUP
  delete-user --username USERNAME
  apply-template --file PATH
  help | -h
EOF
}

main() {
  if [ $# -lt 1 ]; then
    usage
    exit 1
  fi
  local command=$1
  shift
  case "$command" in
    create-org)
      create_org "$@"
      ;;
    create-group)
      create_group "$@"
      ;;
    create-user)
      create_user "$@"
      ;;
    show-user)
      show_users "$@"
      ;;
    cleanup-user)
      cleanup_user "$@"
      ;;
    add-user-to-group)
      add_user_to_group "$@"
      ;;
    remove-user-from-group)
      remove_user_from_group "$@"
      ;;
    delete-user)
      delete_user "$@"
      ;;
    apply-template)
      local file=""
      while [[ "$#" -gt 0 ]]; do
        case "$1" in
          --file)
            file="$2"
            shift 2
            ;;
          *)
            echo "Unknown option $1" >&2
            exit 1
            ;;
        esac
      done
      if [ -z "$file" ]; then
        echo "--file is required for apply-template" >&2
        exit 1
      fi
      apply_template "$file"
      ;;
    help | -h)
      usage
      ;;
    *)
      echo "Unknown command ${command}" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
