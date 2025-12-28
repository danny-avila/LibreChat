# LDAP Sample Data

This folder contains example users and groups that demonstrate the fields LibreChat and Keycloak expect
when connecting to OpenLDAP. Use these samples as a reference or import them directly by passing the
values into `scripts/add-ldap-user.sh`.

## Structure

- `users.json`: describes users that LibreChat can recognize via LDAP. Each record maps to one `uid` and
  includes the CRM fields (`givenName`, `sn`, email, and password) plus the groups that should receive
  access rights.
- `groups.json`: defines `groupOfNames` entries where the `description` encodes the services/roles that
  group members are allowed to use. LibreChat reads this as RBAC metadata while Keycloak uses it when
  mapping LDAP groups to realm roles.

## Sample Workflow

1. Start OpenLDAP and Keycloak via the Makefile helpers:
   ```sh
   make ldap-up
   make keycloak-up
   ```
2. Load the sample groups (which stub the services they can consume):
   ```sh
   scripts/add-ldap-user.sh group --name sessions --services api,ui --members ssouser
   scripts/add-ldap-user.sh group --name support --services routing,helpdesk
   ```
3. Import the sample users (adjust `LDAP_DOMAIN` or `LDAP_ORGANISATION` in `.env` if the defaults change):
   ```sh
   scripts/add-ldap-user.sh user --username support --firstname Support --lastname Agent \
     --email support@librechat.local --password Support123! --groups support,sessions
   scripts/add-ldap-user.sh user --username audit --firstname Audit --lastname User \
     --email audit@librechat.local --password Audit123! --groups sessions
   ```
   or use the CSV import sample to load the batch in one go:
   ```sh
   scripts/add-ldap-user.sh import --file scripts/ldap-samples/users.csv --map username=Username --map firstname="First Name" --map lastname="Last Name" --map email=E-mail
   ```
4. In LibreChat, configure `config/packages/api/src/endpoints/custom/config.ts` or the LDAP strategy so the
   `LDAP_SEARCH_FILTER` picks up `mail` or `uid`. Keycloak can use the same filter in the realm mapper.
   The `services` metadata stored in `description` enables the UI to hide or enable functionality per
   organization.

## Integration Notes

- LibreChat expects LDAP entries to expose `givenName`, `sn`, `mail`, and `uid`; the sample JSON shows how to
  supply those values via the script.
- Keycloak will import this LDAP directory, and you can map `cn`/`uid` to realm usernames. When you add a
  new group in Keycloak, reference the `cn` defined here (e.g., `support`) in the LDAP provider's group
  mapper so group membership syncs automatically.
- The `services` list encoded in each group's `description` helps LibreChat build RBAC policies if you
  extend `api/server/services/Config/permissions.js`. Groupless users default to the services they
  already own in their account record.
- When operating across organizations, set `LDAP_ORGANISATION` in `.env` to the customer name so any new
  user/group entry reflects the correct tenancy.
