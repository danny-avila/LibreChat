# LibreChat Admin Scripts

This directory contains utility scripts for managing your LibreChat deployment.

## Managing Admin Users

### Grant Admin Permissions

To grant admin permissions to a user:

```bash
./scripts/make-admin.sh user@domain.edu
```

### Remove Admin Permissions

To remove admin permissions from a user (demote to regular user):

```bash
./scripts/make-admin.sh user@domain.edu --remove
```

### How It Works

The script:
1. Spins up a one-off ECS task using your existing task definition
2. Connects to MongoDB using the same credentials as your running application
3. Updates the user's role to ADMIN or USER
4. Waits for completion and reports success/failure
5. Automatically cleans up the task

The user will need to log out and log back in for changes to take effect.

## Managing User Balance

### Add Balance to a User

To add tokens to a user's balance:

```bash
./scripts/add-balance.sh user@domain.edu 1000
```

This will add 1000 tokens to the user's account.

### Requirements

- Balance must be enabled in `librechat.yaml`:
  ```yaml
  balance:
    enabled: true
    startBalance: 600000
    autoRefillEnabled: true
    refillIntervalValue: 1440
    refillIntervalUnit: 'minutes'
    refillAmount: 100000
  ```

### How It Works

The script:
1. Validates that balance is enabled in your configuration
2. Finds the user by email
3. Creates a transaction record with the specified amount
4. Updates the user's balance
5. Reports the new balance

### Common Use Cases

```bash
# Give a new user initial credits
./scripts/add-balance.sh newuser@domain.edu 5000

# Top up a user who ran out
./scripts/add-balance.sh user@domain.edu 10000

# Grant bonus credits
./scripts/add-balance.sh poweruser@domain.edu 50000
```

## Manual AWS CLI Commands

If you prefer to run commands manually or need to troubleshoot:

### 1. Get your cluster and network configuration

```bash
# Load your deployment config
source .librechat-deploy-config

CLUSTER_NAME="${STACK_NAME}-cluster"
REGION="${REGION:-us-east-1}"

# Get network configuration from existing service
aws ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services "${STACK_NAME}-service" \
    --region "$REGION" \
    --query 'services[0].networkConfiguration.awsvpcConfiguration'
```

### 2. Run a one-off task to manage admin role

```bash
# Set the user email and action
USER_EMAIL="user@domain.edu"
TARGET_ROLE="ADMIN"  # or "USER" to remove admin

# Get task definition
TASK_DEF=$(aws ecs describe-task-definition \
    --task-definition "${STACK_NAME}-task" \
    --region "$REGION" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)

# Create the command
SHELL_CMD="cd /app/api && cat > manage-admin.js << 'EOFSCRIPT'
const path = require('path');
require('module-alias')({ base: path.resolve(__dirname) });
const mongoose = require('mongoose');
const { updateUser, findUser } = require('~/models');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const user = await findUser({ email: '$USER_EMAIL' });
    if (!user) {
      console.error('User not found');
      process.exit(1);
    }
    await updateUser(user._id, { role: '$TARGET_ROLE' });
    console.log('User role updated to $TARGET_ROLE');
    await mongoose.connection.close();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
EOFSCRIPT
node manage-admin.js"

# Build JSON with jq
OVERRIDES=$(jq -n --arg cmd "$SHELL_CMD" '{
  containerOverrides: [{
    name: "librechat",
    command: ["sh", "-c", $cmd]
  }]
}')

# Run the task (replace SUBNETS and SECURITY_GROUPS with values from step 1)
aws ecs run-task \
    --cluster "$CLUSTER_NAME" \
    --task-definition "$TASK_DEF" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxxxx],assignPublicIp=DISABLED}" \
    --overrides "$OVERRIDES" \
    --region "$REGION"
```

## Troubleshooting

### Task fails to start
- Check that your ECS service is running
- Verify network configuration (subnets, security groups)
- Check CloudWatch Logs: `/aws/ecs/${STACK_NAME}`

### User not found error
- Verify the email address is correct
- Check that the user has logged in at least once
- Email addresses are case-sensitive

### MongoDB connection fails
- Verify the MONGO_URI environment variable is set correctly in the task
- Check that the security group allows access to DocumentDB (port 27017)
- Ensure the task is running in the same VPC as DocumentDB

### Changes don't take effect
- User must log out and log back in for role changes to apply
- Check CloudWatch Logs to confirm the update was successful
- Verify the exit code was 0 (success)

### Balance not enabled error
- Ensure `balance.enabled: true` is set in `librechat.yaml`
- Restart your ECS service after updating the configuration
- Verify the config file is properly mounted in the container

### Invalid amount error
- Amount must be a positive integer
- Do not use decimals or negative numbers
- Example: `1000` not `1000.5` or `-1000`

## Security Notes

- These scripts use your existing task definition with all environment variables
- The MongoDB connection uses the same credentials as your running application
- Tasks run in your private subnets with no public IP
- All commands are logged to CloudWatch Logs
- One-off tasks automatically stop after completion

## Alternative: Use OpenID Groups (Recommended for Production)

Instead of manually managing admin users, consider using OpenID groups for automatic role assignment:

### Setup

1. **In AWS Cognito**, create a group called "admin"
2. **Add users** to that group through the Cognito console
3. **Configure LibreChat** (already done in `.env.local`):
   ```bash
   OPENID_ADMIN_ROLE=admin
   OPENID_ADMIN_ROLE_PARAMETER_PATH=cognito:groups
   OPENID_ADMIN_ROLE_TOKEN_KIND=id_token
   ```
4. **Users automatically get admin permissions** on their next login

### Benefits

- No database access required
- Centralized user management in Cognito
- Automatic role assignment on login
- Easier to audit and manage at scale
- Role changes take effect immediately on next login

### When to Use the Script vs OpenID Groups

**Use the script when:**
- You need to quickly grant/revoke admin access
- You're troubleshooting or testing
- You have a one-time admin setup need

**Use OpenID groups when:**
- Managing multiple admins
- You want centralized access control
- You need audit trails through Cognito
- You want automatic role management
