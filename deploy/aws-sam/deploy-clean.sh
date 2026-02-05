#!/bin/bash

# LibreChat AWS SAM Deployment Script
# Interactive deployment for existing VPC infrastructure with Transit Gateway

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration file
CONFIG_FILE=".librechat-deploy-config"

# Default values
ENVIRONMENT="prod"
REGION="us-east-1"
STACK_NAME="librechat"
DOMAIN_NAME=""
CERTIFICATE_ARN=""
VPC_ID=""
PUBLIC_SUBNETS=""
PRIVATE_SUBNETS=""
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
ENABLE_SSO="false"
COGNITO_USER_POOL_ID=""
OPENID_CLIENT_ID=""
OPENID_CLIENT_SECRET=""
OPENID_SCOPE="openid profile email"
OPENID_BUTTON_LABEL="Sign in with SSO"
OPENID_IMAGE_URL=""
OPENID_NAME_CLAIM="name"
OPENID_EMAIL_CLAIM="email"
HELP_AND_FAQ_URL=""
CREATE_NAT_GATEWAY="false"
# Set to false when deploying staging/prod in same VPC as dev (dev already created Secrets Manager VPC endpoint with private DNS)
CREATE_SECRETS_MANAGER_VPC_ENDPOINT="true"
# Optional: set to override LibreChatImage (e.g. custom ECR image); when unset, template default is used
LIBRECHAT_IMAGE=""
# MCP secrets (optional; one per MCP server)
MCP_CONGRESS_TOKEN=""
MCP_EASTERN_TIME_TOKEN=""

# Function to generate random string
generate_random_string() {
    local length="$1"
    openssl rand -base64 "$length" | tr -d "=+/" | cut -c1-"$length"
}

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_prompt() {
    echo -e "${CYAN}[INPUT]${NC} $1"
}

print_important() {
    echo -e "${MAGENTA}[IMPORTANT]${NC} $1"
}

# Function to show usage
usage() {
    echo "LibreChat AWS SAM Interactive Deployment"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --load-config      Load configuration from saved file"
    echo "  --reset-config     Delete saved configuration and start fresh"
    echo "  --update-config    Update config file and restart containers (no full deployment)"
    echo "  -h, --help         Show this help message"
    echo ""
    echo "The script will interactively prompt for all required parameters"
    echo "and save them to '$CONFIG_FILE' for future deployments."
}

# Function to save configuration
save_config() {
    cat > "$CONFIG_FILE" << EOF
# LibreChat Deployment Configuration
# Generated on $(date)
ENVIRONMENT="$ENVIRONMENT"
REGION="$REGION"
STACK_NAME="$STACK_NAME"
DOMAIN_NAME="$DOMAIN_NAME"
CERTIFICATE_ARN="$CERTIFICATE_ARN"
VPC_ID="$VPC_ID"
PUBLIC_SUBNETS="$PUBLIC_SUBNETS"
PRIVATE_SUBNETS="$PRIVATE_SUBNETS"
AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID"
AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY"
ENABLE_SSO="$ENABLE_SSO"
COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID"
OPENID_CLIENT_ID="$OPENID_CLIENT_ID"
OPENID_CLIENT_SECRET="$OPENID_CLIENT_SECRET"
OPENID_SCOPE="$OPENID_SCOPE"
OPENID_BUTTON_LABEL="$OPENID_BUTTON_LABEL"
OPENID_IMAGE_URL="$OPENID_IMAGE_URL"
OPENID_NAME_CLAIM="$OPENID_NAME_CLAIM"
OPENID_EMAIL_CLAIM="$OPENID_EMAIL_CLAIM"
HELP_AND_FAQ_URL="$HELP_AND_FAQ_URL"
CREATE_NAT_GATEWAY="$CREATE_NAT_GATEWAY"
CREATE_SECRETS_MANAGER_VPC_ENDPOINT="$CREATE_SECRETS_MANAGER_VPC_ENDPOINT"
LIBRECHAT_IMAGE="$LIBRECHAT_IMAGE"
MCP_CONGRESS_TOKEN="$MCP_CONGRESS_TOKEN"
MCP_EASTERN_TIME_TOKEN="$MCP_EASTERN_TIME_TOKEN"
EOF
    print_success "Configuration saved to $CONFIG_FILE"
}

# Function to load configuration
load_config() {
    if [[ -f "$CONFIG_FILE" ]]; then
        print_status "Loading configuration from $CONFIG_FILE"
        source "$CONFIG_FILE"
        print_success "Configuration loaded successfully"
        return 0
    else
        print_warning "No configuration file found at $CONFIG_FILE"
        return 1
    fi
}

# Function to prompt for input with default value
prompt_input() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    local current_value="${!var_name}"
    
    if [[ -n "$current_value" ]]; then
        default="$current_value"
    fi
    
    if [[ -n "$default" ]]; then
        print_prompt "$prompt [$default]: "
        read -r input
        if [[ -z "$input" ]]; then
            input="$default"
        fi
    else
        print_prompt "$prompt: "
        read -r input
        while [[ -z "$input" ]]; do
            print_error "This field is required!"
            print_prompt "$prompt: "
            read -r input
        done
    fi
    
    eval "$var_name=\"$input\""
}

# Function to validate AWS CLI and credentials
validate_aws() {
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi

    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Please run 'aws configure' first."
        exit 1
    fi
}

# Function to ensure ECS service-linked role exists
ensure_ecs_service_role() {
    local region="$1"
    
    print_status "Checking ECS service-linked role..."
    
    # Check if the service-linked role exists
    if aws iam get-role --role-name AWSServiceRoleForECS --region "$region" &>/dev/null; then
        print_success "ECS service-linked role already exists"
        return 0
    fi
    
    print_status "Creating ECS service-linked role..."
    
    # Create the service-linked role
    if aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com --region "$region" &>/dev/null; then
        print_success "ECS service-linked role created successfully"
        
        # Wait a moment for the role to propagate
        print_status "Waiting for role to propagate..."
        sleep 10
        
        return 0
    else
        # Check if it failed because the role already exists
        if aws iam get-role --role-name AWSServiceRoleForECS --region "$region" &>/dev/null; then
            print_success "ECS service-linked role already exists (created by another process)"
            return 0
        else
            print_error "Failed to create ECS service-linked role"
            print_error "Please create it manually with: aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com"
            return 1
        fi
    fi
}

# Function to validate AWS Bedrock access
validate_bedrock_access() {
    local access_key="$1"
    local secret_key="$2"
    local region="$3"
    
    print_status "Validating AWS Bedrock access..."
    
    # Test Bedrock access with provided credentials
    AWS_ACCESS_KEY_ID="$access_key" AWS_SECRET_ACCESS_KEY="$secret_key" \
    aws bedrock list-foundation-models --region "$region" &>/dev/null
    
    if [[ $? -eq 0 ]]; then
        print_success "AWS Bedrock access validated successfully"
        return 0
    else
        print_warning "Could not validate Bedrock access. Please ensure:"
        print_warning "1. The credentials have Bedrock permissions"
        print_warning "2. Bedrock model access is enabled in your AWS account"
        print_warning "3. The region supports Bedrock services"
        return 1
    fi
}

# Function to validate SAM CLI
validate_sam() {
    if ! command -v sam &> /dev/null; then
        print_error "SAM CLI is not installed. Please install it first."
        exit 1
    fi
}

# Function to list VPCs
list_vpcs() {
    print_status "Available VPCs in region $REGION:"
    AWS_PAGER="" aws ec2 describe-vpcs \
        --region "$REGION" \
        --query 'Vpcs[*].[VpcId,CidrBlock,Tags[?Key==`Name`].Value|[0]]' \
        --output table 2>/dev/null || print_warning "Could not list VPCs"
}

# Function to list subnets for a VPC
list_subnets() {
    local vpc_id="$1"
    if [[ -n "$vpc_id" ]]; then
        print_status "Available subnets in VPC $vpc_id:"
        AWS_PAGER="" aws ec2 describe-subnets \
            --region "$REGION" \
            --filters "Name=vpc-id,Values=$vpc_id" \
            --query 'Subnets[*].[SubnetId,CidrBlock,AvailabilityZone,Tags[?Key==`Name`].Value|[0]]' \
            --output table 2>/dev/null || print_warning "Could not list subnets"
    fi
}

# Function to upload config to S3
upload_config() {
    local stack_name="$1"
    local region="$2"
    
    # Get S3 bucket name from CloudFormation outputs
    local bucket_name=$(aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --region "$region" \
        --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
        --output text 2>/dev/null)
    
    if [[ -z "$bucket_name" ]]; then
        print_warning "Could not find S3 bucket name from stack outputs"
        return 1
    fi
    
    if [[ -f "librechat.yaml" ]]; then
        print_status "Uploading librechat.yaml to S3..."
        aws s3 cp librechat.yaml "s3://$bucket_name/configs/librechat.yaml" \
            --content-type "application/x-yaml" \
            --region "$region"
        
        if [[ $? -eq 0 ]]; then
            print_success "Configuration uploaded to s3://$bucket_name/configs/librechat.yaml"
            return 0
        else
            print_error "Failed to upload configuration to S3"
            return 1
        fi
    else
        print_warning "librechat.yaml not found - skipping config upload"
        print_status "A default configuration will be used"
        return 0
    fi
}

# Function to trigger config update and container restart
update_config() {
    local stack_name="$1"
    local region="$2"
    
    print_status "Updating configuration and restarting containers..."
    
    # Upload config to S3
    if ! upload_config "$stack_name" "$region"; then
        return 1
    fi
    
    # Trigger Config Manager Lambda to copy S3 → EFS
    local lambda_name="${stack_name}-config-manager"
    print_status "Triggering config manager Lambda: $lambda_name"
    
    aws lambda invoke \
        --function-name "$lambda_name" \
        --region "$region" \
        --payload '{}' \
        /tmp/lambda-response.json >/dev/null 2>&1
    
    if [[ $? -eq 0 ]]; then
        print_success "Config manager Lambda executed successfully"
    else
        print_warning "Could not invoke config manager Lambda (may not exist yet)"
    fi
    
    # Force ECS service to restart containers
    local cluster_name=$(aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --region "$region" \
        --query 'Stacks[0].Outputs[?OutputKey==`ECSClusterName`].OutputValue' \
        --output text 2>/dev/null)
    
    local service_name=$(aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --region "$region" \
        --query 'Stacks[0].Outputs[?OutputKey==`ECSServiceName`].OutputValue' \
        --output text 2>/dev/null)
    
    if [[ -n "$cluster_name" && -n "$service_name" ]]; then
        print_status "Restarting ECS containers to pick up new config..."
        aws ecs update-service \
            --cluster "$cluster_name" \
            --service "$service_name" \
            --region "$region" \
            --force-new-deployment >/dev/null 2>&1
        
        if [[ $? -eq 0 ]]; then
            print_success "ECS service restart initiated"
            print_status "Containers will restart with the new configuration"
        else
            print_warning "Could not restart ECS service"
        fi
    else
        print_warning "Could not find ECS cluster/service information"
    fi
}

encode_certificate() {
    local cert="$1"
    # Remove any existing escaping and re-encode properly
    echo "$cert" | sed 's/\\n/\n/g' | tr '\n' '\\n' | sed 's/\\n$//'
}

validate_subnets() {
    local subnet_list="$1"
    local subnet_type="$2"
    
    if [[ -z "$subnet_list" ]]; then
        print_error "$subnet_type subnets cannot be empty"
        return 1
    fi
    
    # Convert comma-separated list to array
    IFS=',' read -ra subnets <<< "$subnet_list"
    
    if [[ ${#subnets[@]} -lt 2 ]]; then
        print_error "$subnet_type subnets must include at least 2 subnets in different AZs"
        return 1
    fi
    
    print_status "Validating $subnet_type subnets..."
    for subnet in "${subnets[@]}"; do
        subnet=$(echo "$subnet" | xargs) # trim whitespace
        if ! aws ec2 describe-subnets --region "$REGION" --subnet-ids "$subnet" &>/dev/null; then
            print_error "Subnet $subnet not found or not accessible"
            return 1
        fi
    done
    
    print_success "$subnet_type subnets validated successfully"
    return 0
}

# Create or update a Secrets Manager secret with a string value; output the secret ARN
ensure_secret_string() {
    local name="$1"
    local value="$2"
    local region="$3"
    if aws secretsmanager describe-secret --secret-id "$name" --region "$region" &>/dev/null; then
        aws secretsmanager put-secret-value --secret-id "$name" --secret-string "$value" --region "$region" >/dev/null
        aws secretsmanager describe-secret --secret-id "$name" --region "$region" --query ARN --output text
    else
        aws secretsmanager create-secret --name "$name" --secret-string "$value" --region "$region" --query ARN --output text
    fi
}

# Create or update Bedrock credentials secret (JSON with accessKeyId, secretAccessKey); output the secret ARN
ensure_bedrock_credentials_secret() {
    local name="$1"
    local access_key="$2"
    local secret_key="$3"
    local region="$4"
    [[ -z "$access_key" || -z "$secret_key" ]] && { print_error "Bedrock credentials (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) are required."; exit 1; }
    local json
    # Pass AK/SK as env vars so Python can read them (AK="$x" SK="$y" command sets env for command only)
    json=$(AK="$access_key" SK="$secret_key" python3 -c 'import json,os; print(json.dumps({"accessKeyId":os.environ.get("AK",""),"secretAccessKey":os.environ.get("SK","")}))')
    ensure_secret_string "$name" "$json" "$region"
}

# Interactive configuration function
interactive_config() {
    echo ""
    echo "=============================================="
    echo "  LibreChat AWS SAM Interactive Deployment"
    echo "=============================================="
    echo ""
    
    print_important "🌐 NETWORK ARCHITECTURE NOTICE 🌐"
    print_important "This deployment supports two network connectivity options:"
    print_important ""
    print_important "Option 1: Transit Gateway (Recommended for existing infrastructure)"
    print_important "✅ NO NAT GATEWAYS created (saves ~\$90/month)"
    print_important "✅ Uses existing Transit Gateway for internet access"
    print_important "✅ Private subnets remain secure with controlled routing"
    print_important ""
    print_important "Option 2: NAT Gateway (Standard AWS pattern)"
    print_important "• Creates NAT Gateways in each AZ (~\$90/month cost)"
    print_important "• Provides direct internet access for private subnets"
    print_important "• Higher availability and performance guarantees"
    print_important "• No dependency on existing Transit Gateway"
    echo ""
    
    # Environment
    print_status "Step 1: Environment Configuration"
    echo "Available environments: dev, staging, prod"
    prompt_input "Environment" "$ENVIRONMENT" "ENVIRONMENT"
    
    if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
        print_error "Invalid environment: $ENVIRONMENT. Must be dev, staging, or prod."
        exit 1
    fi
    
    # Region
    prompt_input "AWS Region" "$REGION" "REGION"
    
    # Stack name
    prompt_input "CloudFormation Stack Name" "$STACK_NAME" "STACK_NAME"
    
    echo ""
    print_status "Step 2: Network Configuration"
    
    # NAT Gateway option
    print_status "Internet Connectivity Options:"
    print_status "1. Transit Gateway (existing infrastructure) - No additional cost"
    print_status "2. NAT Gateway (standard AWS pattern) - ~\$90/month"
    echo ""
    print_prompt "Create NAT Gateways for internet connectivity? (y/N): (IF YOU ALREADY HAVE A NAT GATEWAY, THE ANSWER IS NO.) "
    read -r nat_choice
    if [[ "$nat_choice" =~ ^[Yy]$ ]]; then
        CREATE_NAT_GATEWAY="true"
        print_success "NAT Gateways will be created for internet connectivity"
        print_warning "This will add approximately \$90/month to your AWS bill"
    else
        CREATE_NAT_GATEWAY="false"
        print_success "Using existing Transit Gateway infrastructure (no NAT Gateway cost)"
        print_important "Ensure your private subnets have routes to Transit Gateway for internet access"
    fi
    
    # VPC ID
    list_vpcs
    echo ""
    prompt_input "VPC ID" "$VPC_ID" "VPC_ID"
    
    # Validate VPC
    if ! aws ec2 describe-vpcs --region "$REGION" --vpc-ids "$VPC_ID" &>/dev/null; then
        print_error "VPC $VPC_ID not found or not accessible"
        exit 1
    fi
    
    # Public Subnets
    echo ""
    list_subnets "$VPC_ID"
    echo ""
    print_status "Public subnets will be used for the Application Load Balancer"
    prompt_input "Public Subnet IDs (comma-separated, minimum 2)" "$PUBLIC_SUBNETS" "PUBLIC_SUBNETS"
    
    if ! validate_subnets "$PUBLIC_SUBNETS" "Public"; then
        exit 1
    fi
    
    # Private Subnets
    echo ""
    if [[ "$CREATE_NAT_GATEWAY" == "true" ]]; then
        print_status "Private subnets will be used for ECS tasks and databases"
        print_status "NAT Gateways will provide internet access for these subnets"
    else
        print_status "Private subnets will be used for ECS tasks and databases"
        print_status "These subnets should have internet access via Transit Gateway"
    fi
    prompt_input "Private Subnet IDs (comma-separated, minimum 2)" "$PRIVATE_SUBNETS" "PRIVATE_SUBNETS"
    
    if ! validate_subnets "$PRIVATE_SUBNETS" "Private"; then
        exit 1
    fi
    
    # Secrets Manager VPC endpoint: only one per VPC can have private DNS; skip if another stack (e.g. dev) already created it
    echo ""
    print_prompt "Does another stack in this VPC already have a Secrets Manager VPC endpoint (e.g. dev)? (y/N): "
    read -r sm_ep_choice
    if [[ "$sm_ep_choice" =~ ^[Yy]$ ]]; then
        CREATE_SECRETS_MANAGER_VPC_ENDPOINT="false"
        print_success "Will not create Secrets Manager VPC endpoint (reusing existing in VPC)"
    else
        CREATE_SECRETS_MANAGER_VPC_ENDPOINT="true"
        print_success "This stack will create the Secrets Manager VPC endpoint (with private DNS)"
    fi
    
    echo ""
    print_status "Step 3: AWS Bedrock Credentials"
    print_important "LibreChat needs AWS credentials to access Bedrock models."
    print_important "These credentials will be securely stored in AWS Secrets Manager."
    echo ""
    
    # AWS Access Key ID
    prompt_input "AWS Access Key ID for Bedrock access" "$AWS_ACCESS_KEY_ID" "AWS_ACCESS_KEY_ID"
    
    # AWS Secret Access Key
    prompt_input "AWS Secret Access Key for Bedrock access" "$AWS_SECRET_ACCESS_KEY" "AWS_SECRET_ACCESS_KEY"
    
    # Validate Bedrock access
    validate_bedrock_access "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" "$REGION"
    
    echo ""
    print_status "Step 4: SSO Configuration (Optional)"
    print_important "Configure Single Sign-On with AWS Cognito for user authentication."
    print_important ""
    print_important "📋 BEFORE ENABLING SSO, ENSURE YOU HAVE:"
    print_important "• Created a Cognito User Pool"
    print_important "• Created an App Client in the User Pool"
    print_important "• Configured the App Client with appropriate callback URLs"
    print_important "• Set up attribute mappings (name, email) in the User Pool"
    echo ""
    
    # SSO Enable
    print_prompt "Enable SSO authentication? (y/N): "
    read -r sso_choice
    if [[ "$sso_choice" =~ ^[Yy]$ ]]; then
        ENABLE_SSO="true"
        
        # Cognito User Pool ID
        prompt_input "Cognito User Pool ID" "$COGNITO_USER_POOL_ID" "COGNITO_USER_POOL_ID"
        
        # OpenID Client ID
        prompt_input "OpenID Client ID (from Cognito App Client)" "$OPENID_CLIENT_ID" "OPENID_CLIENT_ID"
        
        # OpenID Client Secret
        prompt_input "OpenID Client Secret (from Cognito App Client)" "$OPENID_CLIENT_SECRET" "OPENID_CLIENT_SECRET"
        
        # OpenID Scope
        prompt_input "OpenID Scope" "$OPENID_SCOPE" "OPENID_SCOPE"
        
        # OpenID Button Label
        prompt_input "SSO Button Label" "$OPENID_BUTTON_LABEL" "OPENID_BUTTON_LABEL"
        
        # OpenID Image URL
        prompt_input "SSO Button Image URL" "$OPENID_IMAGE_URL" "OPENID_IMAGE_URL"
        
        # OpenID Name Claim
        prompt_input "Name Claim Attribute" "$OPENID_NAME_CLAIM" "OPENID_NAME_CLAIM"
        
        # OpenID Email Claim
        prompt_input "Email Claim Attribute" "$OPENID_EMAIL_CLAIM" "OPENID_EMAIL_CLAIM"
        
        # Validate required SSO fields
        if [[ -z "$COGNITO_USER_POOL_ID" || -z "$OPENID_CLIENT_ID" || -z "$OPENID_CLIENT_SECRET" ]]; then
            print_error "All SSO fields are required when SSO is enabled"
            exit 1
        fi
        
        print_success "SSO configuration completed"
    else
        ENABLE_SSO="false"
        print_status "SSO authentication disabled - users will use email/password login"
    fi
    
    echo ""
    print_status "Step 5: Application Configuration"
    
    # Help and FAQ URL
    prompt_input "Help and FAQ URL (use '/' to disable button)" "$HELP_AND_FAQ_URL" "HELP_AND_FAQ_URL"
    
    echo ""
    print_status "Step 5b: MCP Server Secrets"
    print_status "Enter Bearer tokens for MCP servers that require auth. Press Enter to skip or use existing secret."
    prompt_input "MCP Congress token" "$MCP_CONGRESS_TOKEN" "MCP_CONGRESS_TOKEN"
    prompt_input "MCP Eastern Time token" "$MCP_EASTERN_TIME_TOKEN" "MCP_EASTERN_TIME_TOKEN"
    
    echo ""
    print_status "Step 6: SSL/Domain Configuration"
    
    # Domain name
    prompt_input "Domain Name (librechatchat.example.com)" "$DOMAIN_NAME" "DOMAIN_NAME"
    
    # Certificate ARN
    if [[ -n "$DOMAIN_NAME" ]]; then
        prompt_input "ACM Certificate ARN (required for HTTPS)" "$CERTIFICATE_ARN" "CERTIFICATE_ARN"
    fi
    
    echo ""
    print_status "Configuration Summary:"
    echo "  Environment: $ENVIRONMENT"
    echo "  Region: $REGION"
    echo "  Stack Name: $STACK_NAME"
    echo "  VPC ID: $VPC_ID"
    echo "  Public Subnets: $PUBLIC_SUBNETS"
    echo "  Private Subnets: $PRIVATE_SUBNETS"
    echo "  Create NAT Gateway: $CREATE_NAT_GATEWAY"
  echo "  Create Secrets Manager VPC Endpoint: $CREATE_SECRETS_MANAGER_VPC_ENDPOINT"
    echo "  AWS Access Key: ${AWS_ACCESS_KEY_ID:0:8}..."
    echo "  SSO Enabled: $ENABLE_SSO"
    if [[ "$ENABLE_SSO" == "true" ]]; then
        echo "  Cognito User Pool: $COGNITO_USER_POOL_ID"
        echo "  OpenID Client ID: ${OPENID_CLIENT_ID:0:8}..."
        echo "  SSO Button Label: $OPENID_BUTTON_LABEL"
        if [[ -n "$OPENID_IMAGE_URL" ]]; then
            echo "  SSO Button Image: $OPENID_IMAGE_URL"
        fi
    fi
    if [[ -n "$HELP_AND_FAQ_URL" ]]; then
        echo "  Help & FAQ URL: $HELP_AND_FAQ_URL"
    fi
    if [[ -n "$DOMAIN_NAME" ]]; then
        echo "  Domain: $DOMAIN_NAME"
        echo "  Certificate: $CERTIFICATE_ARN"
    fi
    
    echo ""
    print_important "🚀 DEPLOYMENT FEATURES:"
    print_important "• ECS Fargate with auto-scaling (2-20 instances)"
    print_important "• DocumentDB (MongoDB-compatible) with multi-AZ"
    print_important "• ElastiCache Redis with failover"
    print_important "• S3 for file storage with encryption"
    print_important "• VPC endpoints for AWS services (reduced internet traffic)"
    if [[ "$CREATE_NAT_GATEWAY" == "true" ]]; then
        print_important "• NAT Gateways for reliable internet connectivity (~\$90/month)"
    else
        print_important "• Transit Gateway routing (no NAT Gateway costs)"
    fi
    
    echo ""
    print_prompt "Save this configuration for future deployments? (y/N): "
    read -r save_choice
    if [[ "$save_choice" =~ ^[Yy]$ ]]; then
        save_config
    fi
    
    echo ""
    print_prompt "Proceed with deployment? (y/N): "
    read -r deploy_choice
    if [[ ! "$deploy_choice" =~ ^[Yy]$ ]]; then
        print_status "Deployment cancelled"
        exit 0
    fi
}

# Parse command line arguments
LOAD_CONFIG=false
RESET_CONFIG=false
UPDATE_CONFIG_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --load-config)
            LOAD_CONFIG=true
            shift
            ;;
        --reset-config)
            RESET_CONFIG=true
            shift
            ;;
        --update-config)
            UPDATE_CONFIG_ONLY=true
            LOAD_CONFIG=true  # Auto-load config for update-only mode
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Handle reset config
if [[ "$RESET_CONFIG" == true ]]; then
    if [[ -f "$CONFIG_FILE" ]]; then
        rm "$CONFIG_FILE"
        print_success "Configuration file deleted"
    else
        print_warning "No configuration file to delete"
    fi
    exit 0
fi

# Validate prerequisites
validate_aws
validate_sam

# Load existing config if requested
if [[ "$LOAD_CONFIG" == true ]]; then
    if ! load_config; then
        if [[ "$UPDATE_CONFIG_ONLY" == true ]]; then
            print_error "Cannot update config without existing configuration. Run full deployment first."
            exit 1
        fi
        print_status "Starting fresh configuration..."
    fi
fi

# Handle config-only update
if [[ "$UPDATE_CONFIG_ONLY" == true ]]; then
    print_status "Config-only update mode - updating configuration and restarting containers"
    
    if [[ -z "$STACK_NAME" || -z "$REGION" ]]; then
        print_error "Missing stack name or region in configuration"
        exit 1
    fi
    
    # Verify stack exists
    if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" &>/dev/null; then
        print_error "Stack $STACK_NAME not found in region $REGION"
        exit 1
    fi
    
    print_status "Updating configuration for stack: $STACK_NAME"
    if update_config "$STACK_NAME" "$REGION"; then
        print_success "Configuration updated successfully!"
        print_status "Containers are restarting with the new configuration"
    else
        print_error "Configuration update failed"
        exit 1
    fi
    exit 0
fi

# Run interactive configuration
interactive_config

# Ensure ECS service-linked role exists now that we have the region
if ! ensure_ecs_service_role "$REGION"; then
    exit 1
fi

print_status "Starting LibreChat deployment..."

# Build the SAM application
print_status "Building SAM application..."
sam build

# Create or update MCP secrets in Secrets Manager when tokens are provided
MCP_CONGRESS_SECRET_ARN=""
MCP_EASTERN_TIME_SECRET_ARN=""
if [[ -n "$MCP_CONGRESS_TOKEN" ]]; then
    print_status "Creating/updating MCP Congress secret in Secrets Manager..."
    MCP_CONGRESS_SECRET_ARN=$(ensure_secret_string "${STACK_NAME}/mcp/congress" "$MCP_CONGRESS_TOKEN" "$REGION")
fi
if [[ -n "$MCP_EASTERN_TIME_TOKEN" ]]; then
    print_status "Creating/updating MCP Eastern Time secret in Secrets Manager..."
    MCP_EASTERN_TIME_SECRET_ARN=$(ensure_secret_string "${STACK_NAME}/mcp/eastern-time" "$MCP_EASTERN_TIME_TOKEN" "$REGION")
fi


# Create Bedrock credentials secret and OpenID client secret so we pass only ARNs to CloudFormation
BEDROCK_CREDENTIALS_SECRET_ARN=""
OPENID_CLIENT_SECRET_ARN=""
print_status "Creating/updating Bedrock credentials secret in Secrets Manager..."
BEDROCK_CREDENTIALS_SECRET_ARN=$(ensure_bedrock_credentials_secret "${STACK_NAME}/bedrock/credentials" "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" "$REGION")
if [[ "$ENABLE_SSO" == "true" && -n "$OPENID_CLIENT_SECRET" ]]; then
    print_status "Creating/updating OpenID client secret in Secrets Manager..."
    OPENID_CLIENT_SECRET_ARN=$(ensure_secret_string "${STACK_NAME}/openid/client-secret" "$OPENID_CLIENT_SECRET" "$REGION")
fi

# Prepare deployment parameters with proper quoting (only ARNs, no raw credentials)
DEPLOY_PARAMS=(
    "Environment=$ENVIRONMENT"
    "VpcId=$VPC_ID"
    "PublicSubnetIds=$PUBLIC_SUBNETS"
    "PrivateSubnetIds=$PRIVATE_SUBNETS"
    "CreateNATGateway=$CREATE_NAT_GATEWAY"
    "CreateSecretsManagerVPCEndpoint=$CREATE_SECRETS_MANAGER_VPC_ENDPOINT"
    "BedrockCredentialsSecretArn=$BEDROCK_CREDENTIALS_SECRET_ARN"
    "EnableSSO=$ENABLE_SSO"
)
if [[ -n "$LIBRECHAT_IMAGE" ]]; then
    DEPLOY_PARAMS+=("LibreChatImage=$LIBRECHAT_IMAGE")
fi

if [[ "$ENABLE_SSO" == "true" ]]; then
    DEPLOY_PARAMS+=(
        "CognitoUserPoolId=$COGNITO_USER_POOL_ID"
        "OpenIdClientId=$OPENID_CLIENT_ID"
        "OpenIdScope=$OPENID_SCOPE"
        "OpenIdButtonLabel=\"$OPENID_BUTTON_LABEL\""
        "OpenIdNameClaim=$OPENID_NAME_CLAIM"
        "OpenIdEmailClaim=$OPENID_EMAIL_CLAIM"
    )
    if [[ -n "$OPENID_CLIENT_SECRET_ARN" ]]; then
        DEPLOY_PARAMS+=("OpenIdClientSecretArn=$OPENID_CLIENT_SECRET_ARN")
    else
        DEPLOY_PARAMS+=("OpenIdClientSecret=$OPENID_CLIENT_SECRET")
    fi
    
    # Add image URL if provided
    if [[ -n "$OPENID_IMAGE_URL" ]]; then
        DEPLOY_PARAMS+=("OpenIdImageUrl=\"$OPENID_IMAGE_URL\"")
    fi
fi

if [[ -n "$HELP_AND_FAQ_URL" ]]; then
    DEPLOY_PARAMS+=("HelpAndFaqUrl=$HELP_AND_FAQ_URL")
fi

if [[ -n "$DOMAIN_NAME" ]]; then
    DEPLOY_PARAMS+=("DomainName=$DOMAIN_NAME")
fi

if [[ -n "$CERTIFICATE_ARN" ]]; then
    DEPLOY_PARAMS+=("CertificateArn=$CERTIFICATE_ARN")
fi

if [[ -n "$MCP_CONGRESS_SECRET_ARN" ]]; then
    DEPLOY_PARAMS+=("MCPCongressSecretArn=$MCP_CONGRESS_SECRET_ARN")
fi
if [[ -n "$MCP_EASTERN_TIME_SECRET_ARN" ]]; then
    DEPLOY_PARAMS+=("MCPEasternTimeSecretArn=$MCP_EASTERN_TIME_SECRET_ARN")
fi

# When reusing existing Secrets Manager VPC endpoint, discover its SG so the stack can add this stack's ECS SG before ECS Service starts
if [[ "$CREATE_SECRETS_MANAGER_VPC_ENDPOINT" == "false" ]]; then
    print_status "Discovering existing Secrets Manager VPC endpoint security group..."
    EXISTING_SM_ENDPOINT_SG_ID=$(aws ec2 describe-vpc-endpoints --region "$REGION" \
        --filters \
            "Name=service-name,Values=com.amazonaws.${REGION}.secretsmanager" \
            "Name=vpc-id,Values=$VPC_ID" \
            "Name=vpc-endpoint-type,Values=Interface" \
        --query 'VpcEndpoints[0].Groups[0].GroupId' --output text 2>/dev/null)
    if [[ -z "$EXISTING_SM_ENDPOINT_SG_ID" || "$EXISTING_SM_ENDPOINT_SG_ID" == "None" ]]; then
        print_error "CreateSecretsManagerVPCEndpoint is false but no Secrets Manager VPC endpoint found in VPC $VPC_ID. Create an endpoint in this VPC first, or set CreateSecretsManagerVPCEndpoint=true for the first stack."
        exit 1
    fi
    DEPLOY_PARAMS+=("ExistingSecretsManagerEndpointSecurityGroupId=$EXISTING_SM_ENDPOINT_SG_ID")
fi

# Deploy the application
print_status "Deploying to AWS..."
sam deploy \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides "${DEPLOY_PARAMS[@]}" \
    --confirm-changeset \
    --resolve-s3

if [[ $? -eq 0 ]]; then
    print_success "Deployment completed successfully!"
    
    # Upload config to S3 and trigger EFS sync
    print_status "Uploading configuration and syncing to EFS..."
    if upload_config "$STACK_NAME" "$REGION"; then
        print_success "Configuration deployed successfully"
    else
        print_warning "Configuration upload failed, but deployment succeeded"
    fi
    
    # Get the load balancer URL
    LB_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerURL`].OutputValue' \
        --output text)
    
    if [[ -n "$LB_URL" ]]; then
        print_success "LibreChat is available at: $LB_URL"
        print_status "Note: It may take a few minutes for the service to be fully available."
    fi
    
    # Show other important outputs
    print_status "Getting deployment information..."
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
        --output table
    
    # Show SSO-specific information if enabled
    if [[ "$ENABLE_SSO" == "true" ]]; then
        echo ""
        print_important "🔐 SSO CONFIGURATION SUMMARY:"
        print_important "• SSO Authentication: ENABLED"
        print_important "• Cognito User Pool: $COGNITO_USER_POOL_ID"
        print_important "• OpenID Issuer: https://cognito-idp.$REGION.amazonaws.com/$COGNITO_USER_POOL_ID"
        
        # Get callback URL from outputs
        CALLBACK_URL=$(aws cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --query 'Stacks[0].Outputs[?OutputKey==`CallbackURL`].OutputValue' \
            --output text 2>/dev/null)
        
        if [[ -n "$CALLBACK_URL" ]]; then
            print_important "• Callback URL: $CALLBACK_URL"
            print_important ""
            print_important "📝 COGNITO APP CLIENT CONFIGURATION:"
            print_important "• Add this callback URL to your Cognito App Client settings"
            print_important "• Ensure 'Authorization code grant' is enabled"
            print_important "• Configure attribute mappings for 'name' and 'email'"
        fi
    else
        echo ""
        print_important "🔐 AUTHENTICATION: Email/Password login enabled"
    fi
        
else
    print_error "Deployment failed!"
    exit 1
fi

print_status "Deployment complete!"
echo ""
print_important "🎉 DEPLOYMENT SUMMARY:"
print_important "• Environment: $ENVIRONMENT"
print_important "• Region: $REGION"
print_important "• Stack: $STACK_NAME"
if [[ -n "$LB_URL" ]]; then
    print_important "• Application URL: $LB_URL"
fi
if [[ "$ENABLE_SSO" == "true" ]]; then
    print_important "• Authentication: SSO (Cognito) + Email/Password disabled"
else
    print_important "• Authentication: Email/Password login"
fi
if [[ -n "$HELP_AND_FAQ_URL" && "$HELP_AND_FAQ_URL" != "/" ]]; then
    print_important "• Help & FAQ: $HELP_AND_FAQ_URL"
elif [[ "$HELP_AND_FAQ_URL" == "/" ]]; then
    print_important "• Help & FAQ: Disabled"
fi
echo ""
print_important ""
print_important "🤖 PARTIAL LIST OF AVAILABLE BEDROCK MODELS:"
print_important "• Claude Opus 4 (us.anthropic.claude-opus-4-20250514-v1:0)"
print_important "• Claude Sonnet 4 (us.anthropic.claude-sonnet-4-20250514-v1:0)"
print_important "• Claude 3.7 Sonnet (us.anthropic.claude-3-7-sonnet-20250219-v1:0)"
print_important "• Claude 3.5 Haiku (us.anthropic.claude-3-5-haiku-20241022-v1:0)"
print_important "• Llama 3.3 70B (us.meta.llama3-3-70b-instruct-v1:0)"
print_important ""
print_important "💰 COST SAVINGS:"
if [[ "$CREATE_NAT_GATEWAY" == "true" ]]; then
    print_important "• NAT Gateways provide reliable internet connectivity (~\$90/month)"
    print_important "• High availability with automatic failover"
    print_important "• Enterprise-grade performance and security"
else
    print_important "• No NAT Gateway costs (~\$90/month saved)"
    print_important "• Using existing Transit Gateway infrastructure"
    print_important "    SHOULD BE REVIEWED, might be too slow"
fi
print_important "• VPC endpoints reduce data transfer costs"

echo ""
print_status "To redeploy with the same configuration, run:"
print_status "  $0 --load-config"
print_status ""
print_status "To update config file and restart containers only, run:"
print_status "  $0 --update-config"
print_status ""
print_status "To start with fresh configuration, run:"
print_status "  $0 --reset-config"

# Clean up temporary files
rm -f /tmp/lambda-response.json 2>/dev/null || true