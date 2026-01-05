# LibreChat Scripts Documentation

This directory contains utility scripts for managing LibreChat deployment, LDAP integration, user management, and testing.

---

## 📋 Table of Contents

1. [LDAP Management](#ldap-management)
2. [User Management](#user-management)
3. [Testing](#testing)
4. [System Utilities](#system-utilities)
5. [Templates](#templates)

---

## 🔐 LDAP Management

### `add-ldap-user.sh`
**Purpose**: Manage LDAP users, groups, and bulk imports

**Commands**:
```bash
# Create default SSO user
./add-ldap-user.sh seed

# Create a user
./add-ldap-user.sh user \
  --username alice \
  --firstname Alice \
  --lastname Doe \
  --email alice@example.com \
  --password P@ssw0rd \
  --groups admins,support

# Create a group
./add-ldap-user.sh group \
  --name support \
  --services api,vector \
  --members ssouser

# Import users from CSV
./add-ldap-user.sh import \
  --file users.csv \
  --delimiter "," \
  --map username=Username \
  --map email=Email

# List LDAP users
./add-ldap-user.sh list
```

**Environment Variables**:
- `LDAP_CONTAINER` - Container name (default: chat-ldap)
- `LDAP_BASE` - LDAP suffix (default: dc=librechat,dc=local)
- `LDAP_USERS_OU` - Users OU (default: ou=users)
- `LDAP_GROUPS_OU` - Groups OU (default: ou=groups)
- `LDAP_BIND_DN` - Bind credentials DN
- `LDAP_BIND_CREDENTIALS` - Bind password
- `LDAP_ORGANISATION` - Organization name
- `LDAP_DEFAULT_USER` - Default username for seed
- `LDAP_DEFAULT_PASSWORD` - Default password for seed

**Features**:
- Create/update LDAP users with full attributes
- Manage LDAP groups and memberships
- Bulk import from CSV with flexible column mapping
- List all users in the directory
- Support for custom OUs and organizations

---

### `manage-ldap-org.sh`
**Purpose**: High-level LDAP organization management with guardrails and permissions

**Commands**:
```bash
# Create organization
./manage-ldap-org.sh create-org \
  --name "MyOrg" \
  --description "My Organization"

# Create group with guardrails
./manage-ldap-org.sh create-group \
  --name marketing \
  --org LibreChat \
  --guardrail marketing \
  --services llm \
  --vector-db marketing-db \
  --members alice,bob \
  --description "Marketing team" \
  --rules '{"promptScope":"marketing","documentScope":"marketing"}'

# Create user
./manage-ldap-org.sh create-user \
  --username john \
  --password SecurePass123! \
  --firstname John \
  --lastname Doe \
  --email john@example.com \
  --groups users,marketing \
  --org LibreChat \
  --status active

# Show user details
./manage-ldap-org.sh show-user alice bob

# Add user to group
./manage-ldap-org.sh add-user-to-group \
  --username alice \
  --group marketing

# Remove user from group
./manage-ldap-org.sh remove-user-from-group \
  --username alice \
  --group marketing

# Delete user (with cleanup)
./manage-ldap-org.sh delete-user --username alice

# Apply JSON template
./manage-ldap-org.sh apply-template \
  --file templates/org-template.json
```

**Features**:
- Organization-level LDAP management
- Guardrail and permission integration
- Vector DB assignment per group
- JSON template import for bulk setup
- User lifecycle management (create, update, delete, cleanup)
- Group membership management

**Template Structure** (`templates/org-template.json`):
```json
{
  "organizations": [
    {"name": "LibreChat", "description": "Main org"}
  ],
  "groups": [
    {
      "name": "users",
      "org": "LibreChat",
      "guardrail": "general",
      "services": "llm",
      "vectorDb": "users-global",
      "members": ["alice"],
      "description": "Standard users",
      "rules": {
        "modelAccess": "general",
        "permissions": ["chat"]
      }
    }
  ],
  "users": [
    {
      "username": "alice",
      "firstname": "Alice",
      "lastname": "Doe",
      "email": "alice@example.com",
      "password": "Pass123!",
      "groups": "users,normal",
      "org": "LibreChat",
      "status": "active"
    }
  ]
}
```

---

## 👥 User Management

### `unban-user.sh`
**Purpose**: Unban LibreChat users from MongoDB

**Usage**:
```bash
# Unban specific user
./unban-user.sh user@example.com

# Unban all users
./unban-user.sh --all
```

**What it does**:
- Removes `bannedAt`, `banExpires`, `refreshTokens` fields
- Sets `isEnabled: true`
- Deletes ban records from `bans` collection
- Works with both individual users and bulk operations

**When to use**:
- User accidentally banned by rate limiting
- Testing with frequent logins/signups
- After adjusting `BAN_VIOLATIONS` settings
- Emergency user access restoration

---

## 🧪 Testing

### `test-document-upload.sh`
**Purpose**: Comprehensive document upload and processing validation

**Usage**:
```bash
# Basic test
./test-document-upload.sh /path/to/document.pdf "Summarize this"

# With custom credentials
LIBRECHAT_USER=user@example.com \
LIBRECHAT_PASS=password \
./test-document-upload.sh document.pdf "Analyze this data"

# Test different file types
./test-document-upload.sh report.docx "Key points?"
./test-document-upload.sh data.xlsx "What trends?"
./test-document-upload.sh presentation.pptx "Summarize"
```

**Environment Variables**:
- `LIBRECHAT_URL` - LibreChat URL (default: http://localhost:3080)
- `LIBRECHAT_USER` - Test user email
- `LIBRECHAT_PASS` - Test user password

**Test Steps**:
1. **Authentication** - Login with credentials
2. **File Upload** - Upload document via API
3. **Processing Validation** - Check text extraction
4. **Message Sending** - Send query with file attachment
5. **Response Validation** - Verify no errors, no raw binary
6. **Log Analysis** - Check Docker logs for issues

**Success Criteria**:
- ✅ File uploads successfully
- ✅ Text extraction completed
- ✅ No "invalid message format" errors
- ✅ No `file_data` in logs or responses
- ✅ LLM generates response
- ✅ Document sanitization working

**Failure Detection**:
- ❌ "invalid message format" → Raw binary sent to LLM
- ❌ `file_data` in logs → Binary data leak
- ❌ No text extraction → Parsing failed
- ❌ Upload errors → File handling broken

**Output**:
```
================================
LibreChat Document Upload Test
================================
ℹ Testing file: report.pdf
ℹ Prompt: Summarize this
ℹ LibreChat URL: http://localhost:3080

✓ Login successful
✓ File uploaded successfully
✓ Text extraction detected
✓ Message sent successfully
✓ No errors detected
✓ All tests passed!
```

---

## 🛠️ System Utilities

### `ensure-volume-permissions.sh`
**Purpose**: Fix Docker volume permissions before startup

**Usage**:
```bash
# Usually called automatically by Makefile
./ensure-volume-permissions.sh

# Or with elevated permissions
sudo ./ensure-volume-permissions.sh
```

**What it does**:
- Reads `UID`, `GID`, `HOST_UID`, `HOST_GID` from `.env`
- Creates required volume directories if missing
- Sets ownership to match host user (prevents permission errors)
- Handles these volumes:
  - `images/` - Image uploads
  - `uploads/` - File uploads
  - `logs/` - Application logs
  - `data-node/` - MongoDB data
  - `meili_data_v1.12/` - MeiliSearch data
  - `data/ldap-no-tls/` - LDAP data
  - `data/ldap_config-no-tls/` - LDAP config
  - `keycloak/data/` - Keycloak data
  - `keycloak/realm/` - Keycloak realm
  - `data/keycloak-db/` - Keycloak database
  - `data/ollama/` - Ollama models

**When to use**:
- Before first `docker compose up`
- After changing `UID`/`GID` in `.env`
- When seeing "permission denied" errors
- When volumes owned by wrong user

---

## 📚 Templates

### `templates/org-template.json`
**Purpose**: Pre-configured organizational structure template

**Contains**:
- **Organizations**: Top-level tenant definitions
- **Groups**: With guardrails, services, vector DB assignments
- **Users**: Complete user profiles with group memberships

**Usage**:
```bash
# Apply entire template
./manage-ldap-org.sh apply-template --file templates/org-template.json
```

**Example Groups**:
- `superuser` - Platform administrators (all permissions)
- `orgadmin` - Organization supervisors (user management, backups)
- `users` - Baseline users (chat access)
- `marketing` - Marketing dept (marketing-scoped documents/prompts)
- `finance` - Finance dept (finance-scoped documents/prompts)
- `hr` - HR dept (HR-specific vector DB and prompts)
- `normal` - General audience (basic questions)

**Example Users**:
- `admin@librechat.local` - Full platform admin
- `supervisor@librechat.local` - Org supervisor
- `alpha@librechat.local` - Marketing + general user
- `beta@librechat.local` - Finance + general user
- `gamma@librechat.local` - Basic user
- `sigma@librechat.local` - HR user

---

## 📖 Documentation

### `TEST-DOCUMENT-UPLOAD.md`
Complete guide for the document upload test script including:
- Quick start examples
- Expected behavior (pass/fail criteria)
- Environment variables
- Troubleshooting guide
- CI/CD integration examples

### `DOCUMENT-FIX-SUMMARY.md`
Technical summary of document handling fixes:
- Problem description and root cause
- Implementation details of all fixes
- Architecture and data flow diagrams
- Security guarantees
- Validation results

---

## 🔄 Common Workflows

### Initial Setup
```bash
# 1. Fix volume permissions
./ensure-volume-permissions.sh

# 2. Apply org template
./manage-ldap-org.sh apply-template --file templates/org-template.json

# 3. Verify users created
./add-ldap-user.sh list
```

### Adding New User
```bash
# Method 1: Direct creation
./manage-ldap-org.sh create-user \
  --username newuser \
  --password SecurePass123! \
  --email newuser@example.com \
  --groups users,marketing

# Method 2: Via add-ldap-user.sh
./add-ldap-user.sh user \
  --username newuser \
  --password SecurePass123! \
  --email newuser@example.com \
  --groups users,marketing
```

### Testing Document Upload
```bash
# 1. Test with existing user
LIBRECHAT_USER=gamma@librechat.local \
LIBRECHAT_PASS=GammaPass123! \
./test-document-upload.sh document.pdf "Summarize"

# 2. Check logs for issues
docker compose logs api | grep -i "error\|file_data"
```

### Troubleshooting Ban Issues
```bash
# 1. Unban user
./unban-user.sh user@example.com

# 2. Or unban all
./unban-user.sh --all

# 3. Disable bans temporarily (in .env)
# BAN_VIOLATIONS=false

# 4. Restart services
docker compose restart api
```

### Bulk User Import
```bash
# 1. Create CSV file
cat > users.csv << EOF
username,email,password,firstname,lastname,groups
alice,alice@example.com,Pass123!,Alice,Smith,users
bob,bob@example.com,Pass123!,Bob,Jones,users,marketing
EOF

# 2. Import
./add-ldap-user.sh import \
  --file users.csv \
  --map username=username \
  --map email=email \
  --map password=password \
  --map firstname=firstname \
  --map lastname=lastname \
  --map groups=groups
```

---

## 🚨 Error Handling

### LDAP Connection Errors
```bash
# Check LDAP container is running
docker compose ps | grep ldap

# Check LDAP logs
docker compose logs chat-ldap

# Test LDAP connection
docker compose exec chat-ldap ldapsearch -x -b "dc=librechat,dc=local"
```

### Permission Errors
```bash
# Fix volume permissions
sudo ./ensure-volume-permissions.sh

# Or manually
sudo chown -R $(id -u):$(id -g) images/ uploads/ logs/ data-node/
```

### Test Script Failures
```bash
# Enable debug logging
docker compose logs -f api &

# Run test
./test-document-upload.sh file.pdf "test"

# Check for specific errors
docker compose logs api | grep -A5 "file_data\|error\|invalid"
```

---

## 📝 Notes

- All scripts source environment variables from `.env` and `.env.example`
- LDAP scripts use `docker compose exec` to run commands in containers
- Test scripts use curl for API calls (no dependencies on client libraries)
- Permission scripts handle both root and non-root execution contexts
- Template-based provisioning ensures consistent org structure across environments

---

## 🔗 Related Files

- `/root/Projects/LibreChat/.env` - Environment configuration
- `/root/Projects/LibreChat/librechat.yaml` - LibreChat config
- `/root/Projects/LibreChat/docker-compose.yml` - Container definitions
- `/root/Projects/LibreChat/scripts/templates/` - JSON templates
