#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME=$(basename "$0")

load_env_value() {
  local key=$1
  local value=""

  # prefer already exported variables
  if [ -n "${!key:-}" ]; then
    printf '%s' "${!key}"
    return
  fi

  for file in .env .env.example; do
    if [ -f "$file" ]; then
      local line
      if line=$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 || true); then
        if [ -n "$line" ]; then
          value=${line#*=}
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
LDAP_DEFAULT_USER=$(get_env "LDAP_DEFAULT_USER" "ssouser")
LDAP_DEFAULT_PASSWORD=$(get_env "LDAP_DEFAULT_PASSWORD" "password123")
LDAP_DEFAULT_EMAIL=$(get_env "LDAP_DEFAULT_USER_EMAIL" "")
LDAP_DEFAULT_GIVEN_NAME=$(get_env "LDAP_DEFAULT_GIVENNAME" "Sso")
LDAP_DEFAULT_SN=$(get_env "LDAP_DEFAULT_SN" "User")

USERS_BASE="${LDAP_USERS_OU},${LDAP_BASE}"
GROUPS_BASE="${LDAP_GROUPS_OU},${LDAP_BASE}"

require_container() {
  if ! docker ps --format '{{.Names}}' | grep -q "^${LDAP_CONTAINER}$"; then
    echo "LDAP container ${LDAP_CONTAINER} is not running. Start it with 'docker compose up -d ldap'." >&2
    exit 1
  fi
}

list_users() {
	require_container
	local entries
	entries=$(docker exec "${LDAP_CONTAINER}" ldapsearch -x -LLL -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" -b "${USERS_BASE}" "(objectClass=inetOrgPerson)" dn uid givenName sn o 2>/dev/null || true)
	if [ -z "$entries" ]; then
		echo "No LDAP users found (ensure the LDAP container is running)."
		return
	fi
	echo "LDAP users under ${USERS_BASE}:"
	printf '%s' "$entries" | awk '
    function row() {
      if (uid == "") {
        return
      }
      printf "| %-22s | %-18s | %-13s | %-13s |\n", org, uid, givenName, sn
      uid = ""; givenName = ""; sn = ""; org = ""
    }
    BEGIN {
      printf "+------------------------+--------------------+---------------+---------------+\n"
      printf "| %-22s | %-18s | %-13s | %-13s |\n", "ORG", "USERNAME", "FIRSTNAME", "LASTNAME"
      printf "+------------------------+--------------------+---------------+---------------+\n"
    }
    $1 == "dn:" { row(); next }
    $1 == "uid:" { uid = $2; next }
    $1 == "givenName:" { givenName = $2; next }
    $1 == "sn:" { sn = $2; next }
    $1 == "o:" { org = $2; next }
    END { row(); printf "+------------------------+--------------------+---------------+---------------+\n" }' 2>/dev/null
}

entry_exists() {
  local dn=$1
  docker exec "${LDAP_CONTAINER}" ldapsearch -x -LLL -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" -b "$dn" "(objectClass=*)" dn >/dev/null 2>&1
}

ensure_ou() {
  local ou_dn=$1
  local label=$2
  if entry_exists "$ou_dn"; then
    return
  fi
  docker exec -i "${LDAP_CONTAINER}" ldapadd -c -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" <<EOF
dn: ${ou_dn}
objectClass: top
objectClass: organizationalUnit
ou: ${label}
description: Organizational unit created by ${SCRIPT_NAME}
EOF
  echo "Ensured ${label} exists at ${ou_dn}"
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
    echo "Cannot add ${member_dn} to ${group_dn}: user entry is missing." >&2
    return 1
  fi
  if ! entry_exists "$group_dn"; then
    echo "Group ${group_dn} does not exist. Create it with --name before adding members." >&2
    return 1
  fi
  if group_has_member "$group_dn" "$member_dn"; then
    echo "${member_dn} already a member of ${group_dn}";
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

import_users_from_csv() {
  local file=$1
  local delimiter=$2
  shift 2
  if [ ! -f "$file" ]; then
    echo "CSV file not found: ${file}" >&2
    exit 1
  fi
  while IFS= read -r line; do
    IFS=$'\x1F' read -r username firstname lastname email password groups org <<< "$line"
    username=${username:-}
    if [ -z "$username" ]; then
      continue
    fi
    firstname=${firstname:-$username}
    lastname=${lastname:-$username}
    email=${email:-"${username}@${LDAP_DOMAIN}"}
    password=${password:-$LDAP_DEFAULT_PASSWORD}
    create_or_update_user "$username" "$firstname" "$lastname" "$email" "$password" "$groups" "${org:-$LDAP_ORGANISATION}"
  done < <(python3 - "$file" "$delimiter" "$@" <<'PY'
import csv, sys

file_path = sys.argv[1]
delimiter = sys.argv[2]
if delimiter == '\\t':
    delimiter = '\t'
maps = {}
for entry in sys.argv[3:]:
    if '=' in entry:
        key, value = entry.split('=', 1)
        maps[key.strip().lower()] = value.strip()

fields = ['username', 'firstname', 'lastname', 'email', 'password', 'groups', 'org']
header_names = {field: maps.get(field, field) for field in fields}
with open(file_path, newline='') as fh:
    reader = csv.reader(fh, delimiter=delimiter)
    headers = [col.strip().lower() for col in next(reader, [])]
    indexes = {}
    for field, header in header_names.items():
        target = header.strip().lower()
        for idx, col in enumerate(headers):
            if col == target:
                indexes[field] = idx
                break
    for row in reader:
        if not any(cell.strip() for cell in row):
            continue
        values = []
        for field in fields:
            idx = indexes.get(field)
            if idx is not None and idx < len(row):
                values.append(row[idx].strip())
            else:
                values.append('')
        print('\x1F'.join(values))
PY
  )
}

create_or_update_group() {
  local name=$1
  local services=$2
  local members=$3
  local org=${4:-$LDAP_ORGANISATION}

  ensure_ou "$GROUPS_BASE" "$(ou_label "$LDAP_GROUPS_OU")"
  local desc="org=${org}"
  if [ -n "$services" ]; then
    desc="${desc};services=${services}"
  fi
  local dn
  dn=$(group_dn "$name")
  if entry_exists "$dn"; then
    docker exec -i "${LDAP_CONTAINER}" ldapmodify -c -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" <<EOF
dn: ${dn}
changetype: modify
replace: description
description: ${desc}
EOF
    echo "Updated group ${name} description"
  else
    docker exec -i "${LDAP_CONTAINER}" ldapadd -c -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" <<EOF
dn: ${dn}
objectClass: top
objectClass: groupOfNames
cn: ${name}
description: ${desc}
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

create_or_update_user() {
  local username=$1
  local given_name=$2
  local sn=$3
  local email=$4
  local password=$5
  local groups=$6
  local org=${7:-$LDAP_ORGANISATION}
  ensure_ou "$USERS_BASE" "$(ou_label "$LDAP_USERS_OU")"
  local cn_value
  if [ -n "$given_name" ] && [ -n "$sn" ]; then
    cn_value="${given_name} ${sn}"
  elif [ -n "$given_name" ]; then
    cn_value="$given_name"
  elif [ -n "$sn" ]; then
    cn_value="$sn"
  else
    cn_value="$username"
  fi
  local dn
  dn=$(user_dn "$username")
  if entry_exists "$dn"; then
    docker exec -i "${LDAP_CONTAINER}" ldapmodify -c -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" <<EOF
dn: ${dn}
changetype: modify
replace: cn
cn: ${cn_value}
-
replace: givenName
givenName: ${given_name}
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
EOF
    echo "Updated LDAP user ${username}"
  else
    docker exec -i "${LDAP_CONTAINER}" ldapadd -c -x -D "${LDAP_BIND_DN}" -w "${BIND_PWD}" <<EOF
dn: ${dn}
objectClass: top
objectClass: person
objectClass: organizationalPerson
objectClass: inetOrgPerson
cn: ${cn_value}
sn: ${sn}
givenName: ${given_name}
uid: ${username}
mail: ${email}
userPassword: ${password}
o: ${org}
EOF
    echo "Created LDAP user ${username}"
  fi
  if [ -n "$groups" ]; then
    while IFS= read -r group; do
      add_member_to_group "$dn" "$(group_dn "$group")"
    done < <(split_list "$groups")
  fi
}

show_help() {
  cat <<EOF
Usage: ${SCRIPT_NAME} <command> [options]

Commands:
  seed                      Ensure the default LDAP user (${LDAP_DEFAULT_USER}) exists (used by Makefile hooks)
  user                      Create or update a user. Requires --username and --password.
  group                     Create or update a group and attach service metadata.
  import                    Create or update users via a CSV (see --file + --map below)
  list                      List LDAP users (uid/cn/mail) under the configured users OU
  help|-h|--help            Show this help text

User options (after 'user'):
  --username USERNAME       LDAP uid attribute (required for user command)
  --firstname GIVEN_NAME    Optional givenName (defaults to username when omitted)
  --lastname LAST_NAME      Optional sn
  --email EMAIL             Email address (defaults to username@${LDAP_DOMAIN})
  --password PASSWORD       Plain-text password (defaults to ${LDAP_DEFAULT_PASSWORD})
  --groups GROUPS           Comma-separated list of group names to add this user to
  --org ORG_NAME            Override the organisation attribute (falls back to ${LDAP_ORGANISATION})

Group options (after 'group'):
  --name GROUP_NAME         Group cn to create or update
  --services LIST           Comma-separated list of services (stored in description)
  --members USERS           Comma-separated list of uid values to add as members
  --org ORG_NAME            Override the organisation metadata recorded for the group

CSV options (after 'import'):
  --file PATH               Required file path to the CSV source (must contain headers)
  --delimiter CHAR          Optional delimiter (default is ,). Use "\\t" for tabs.
  --map FIELD=HEADER        Map a CSV column header to a field (can repeat). Fields: username*, firstname, lastname, email, password, groups, org


Environment variables understood:
  LDAP_CONTAINER            which container to operate on (default ${LDAP_CONTAINER})
  LDAP_BASE                 LDAP suffix (default ${LDAP_BASE})
  LDAP_USERS_OU             OU used for users (default ${LDAP_USERS_OU})
  LDAP_GROUPS_OU            OU used for groups (default ${LDAP_GROUPS_OU})
  LDAP_BIND_DN              credentials used to bind when mutating entries
  LDAP_BIND_CREDENTIALS     the bind password (falls back to LDAP_ADMIN_PASSWORD)
  LDAP_ORGANISATION         organisation string inserted into every entry
  LDAP_DEFAULT_USER         username created when running 'seed'
  LDAP_DEFAULT_PASSWORD     password used for the seeded user

Examples:
  ${SCRIPT_NAME} user --username alice --firstname Alice --lastname Doe --email alice@example.com --password P@ssw0rd --groups admins,support
  ${SCRIPT_NAME} group --name support --services api,vector --members ssouser
  ${SCRIPT_NAME} seed
EOF
}

seed_default_user() {
  ensure_ou "$USERS_BASE" "$(ou_label "$LDAP_USERS_OU")"
  ensure_ou "$GROUPS_BASE" "$(ou_label "$LDAP_GROUPS_OU")"
  local email=${LDAP_DEFAULT_EMAIL:-"${LDAP_DEFAULT_USER}@${LDAP_DOMAIN}"}
  create_or_update_user "$LDAP_DEFAULT_USER" "$LDAP_DEFAULT_GIVEN_NAME" "$LDAP_DEFAULT_SN" "$email" "$LDAP_DEFAULT_PASSWORD" "" "$LDAP_ORGANISATION"
}

command=${1:-seed}
shift || true

case "$command" in
  help|-h|--help)
    show_help
    exit 0
    ;;
  seed)
    require_container
    seed_default_user
    exit 0
    ;;
  list)
    list_users
    exit 0
    ;;
  group)
    require_container
    local group_name=""
    local services=""
    local members=""
    local org_override=""
    while [ $# -gt 0 ]; do
      case $1 in
        --name)
          group_name=$2
          shift 2
          ;;
        --services)
          services=$2
          shift 2
          ;;
        --members)
          members=$2
          shift 2
          ;;
        --org|--organisation)
          org_override=$2
          shift 2
          ;;
        --help|-h|help)
          show_help
          exit 0
          ;;
        *)
          echo "Unknown option $1" >&2
          show_help
          exit 1
          ;;
      esac
    done
    if [ -z "$group_name" ]; then
      echo "--name is required when creating a group." >&2
      exit 1
    fi
    ensure_ou "$GROUPS_BASE" "$(ou_label "$LDAP_GROUPS_OU")"
    create_or_update_group "$group_name" "$services" "$members" "${org_override:-$LDAP_ORGANISATION}"
    exit 0
    ;;
  import)
    require_container
    local file=""
    local delimiter=','
    local map_args=()
    while [ $# -gt 0 ]; do
      case $1 in
        --file)
          file=$2
          shift 2
          ;;
        --delimiter)
          delimiter=$2
          shift 2
          ;;
        --map)
          map_args+=("$2")
          shift 2
          ;;
        --help|-h|help)
          show_help
          exit 0
          ;;
        *)
          echo "Unknown option $1" >&2
          show_help
          exit 1
          ;;
      esac
    done
    if [ -z "$file" ]; then
      echo "--file is required for the import command." >&2
      exit 1
    fi
    import_users_from_csv "$file" "$delimiter" "${map_args[@]}"
    exit 0
    ;;
  *)
    echo "Unknown command '$command'" >&2
    show_help
    exit 1
    ;;
esac
