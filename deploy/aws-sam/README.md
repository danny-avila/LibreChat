# LibreChat AWS SAM Deployment

This repository contains AWS SAM templates and scripts to deploy LibreChat on AWS with maximum scalability and high availability.

## What is LibreChat?

LibreChat is an enhanced, open-source ChatGPT clone that provides:
- **Multi-AI Provider Support**: OpenAI, Anthropic, Google Gemini, AWS Bedrock, Azure OpenAI, and more
- **Advanced Features**: Agents, function calling, file uploads, conversation search, code interpreter
- **Secure Multi-User**: Authentication, user management, conversation privacy
- **Extensible**: Plugin system, custom endpoints, RAG integration
- **Self-Hosted**: Complete control over your data and infrastructure

## Architecture Overview

This deployment creates a highly scalable, production-ready LibreChat environment optimized for enterprise use:

### Core Infrastructure (Scalability-First Design)
- **ECS Fargate**: Serverless container orchestration with auto-scaling (2-20 instances)
- **Application Load Balancer**: High availability with health checks and SSL termination
- **VPC**: Multi-AZ setup with public/private subnets and flexible internet connectivity options
- **Internet Connectivity**: Choose between NAT Gateways (standard AWS pattern) or Transit Gateway (existing infrastructure)
- **Auto Scaling**: CPU-based scaling with target tracking (70% CPU utilization)

### Data & Storage Layer
- **DocumentDB**: MongoDB-compatible database with multi-AZ deployment and automatic failover
- **ElastiCache Redis**: In-memory caching, session storage, and conversation search with failover
- **S3**: Encrypted file storage for user uploads, avatars, documents, and static assets



### Internet Connectivity Options

The deployment supports two network connectivity patterns:

**Option 1: NAT Gateway (Standard AWS Pattern)**
- **High Availability**: NAT Gateways in each AZ with automatic failover
- **Enterprise Performance**: Up to 45 Gbps bandwidth per gateway
- **Zero Maintenance**: Fully managed by AWS with 99.95% SLA
- **Cost**: ~$90/month for 2 NAT Gateways + data processing fees
- **Use Case**: New deployments or when maximum reliability is required

**Option 2: Transit Gateway (Existing Infrastructure)**
- **Cost Optimization**: No NAT Gateway costs (~$90/month savings)
- **Existing Infrastructure**: Leverages existing Transit Gateway setup
- **Controlled Routing**: Uses existing network policies and routing
- **Use Case**: Organizations with existing Transit Gateway infrastructure

### Security & Monitoring
- **Secrets Manager**: Secure storage for database passwords, JWT secrets, and API keys
- **CloudWatch**: Centralized logging, monitoring, and alerting
- **Security Groups**: Network-level security with least privilege access
- **IAM Roles**: Fine-grained permissions for ECS tasks and AWS service access

### Advanced Scalability Features
- **Fargate Spot Integration**: 80% Spot instances + 20% On-Demand for cost optimization
- **Multi-AZ High Availability**: Automatic failover across multiple availability zones
- **Horizontal Auto Scaling**: Scales from 2-20 instances based on CPU utilization
- **Load Balancing**: Intelligent traffic distribution across healthy instances
- **Container Health Checks**: Automatic replacement of unhealthy containers
- **Database Read Replicas**: DocumentDB supports read scaling for high-traffic scenarios
- **Redis Clustering**: ElastiCache supports cluster mode for memory scaling

## Prerequisites

1. **AWS CLI** - [Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
2. **SAM CLI** - [Installation Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
3. **AWS Account** with appropriate permissions and network topology
4. **Domain & SSL Certificate** (for custom domain)
5. **AWS Cognito User Pool** (optional - for SSO authentication)

### SSO Prerequisites (Optional)
If you plan to use SSO authentication:
- **AWS Cognito User Pool** with configured identity providers
- **App Client** created in the Cognito User Pool with appropriate settings
- **Identity Provider** (SAML, OIDC, or social) configured in Cognito
- **Attribute mappings** configured in Cognito for user claims (name, email)

### Required AWS Permissions

Your AWS user/role needs permissions for:
- CloudFormation (full access)
- ECS (full access)
- EC2 (VPC, Security Groups, Load Balancers)
- DocumentDB (full access)
- ElastiCache (full access)
- S3 (bucket creation and management)
- IAM (role creation)
- Secrets Manager (secret creation)
- CloudWatch (log groups)
- STS (checking caller identity)

## Quick Start

### Interactive Deployment (Recommended)

1. **Clone and configure:**
   ```bash
   git clone <this-repo>
   cd librechat-aws-sam
   
   # Configure AWS credentials
   aws configure
   ```

2. **Run interactive deployment:**
   ```bash
   ./deploy-clean.sh
   ```
   
   The script will interactively prompt for:
   - Environment (dev/staging/prod)
   - AWS region
   - Stack name
   - Internet connectivity option (NAT Gateway vs Transit Gateway)
   - VPC ID (with helpful VPC listing)
   - Public subnet IDs (for load balancer)
   - Private subnet IDs (for ECS tasks and databases)
   - AWS Bedrock credentials for AI model access
   - Optional SSO configuration with AWS Cognito
   - Optional domain name and SSL certificate

3. **Save configuration for future deployments:**
   The script automatically offers to save your configuration to `.librechat-deploy-config`

4. **Redeploy with saved configuration:**
   ```bash
   ./deploy-clean.sh --load-config
   ```

5. **Update YAML config file only option:**
   To update yaml config file and restart containers only
   ```bash
   ./deploy-clean.sh --update-config
   ```


## Deployment Options

### Interactive Deployment (Recommended)
```bash
# First-time deployment
./deploy-clean.sh

# Redeploy with saved configuration
./deploy-clean.sh --load-config

# Reset saved configuration
./deploy-clean.sh --reset-config

# Update yaml config file and restart containers only
./deploy-clean.sh --update-config
```

The interactive deployment provides:
- **Guided Setup**: Step-by-step prompts for all parameters
- **AWS Resource Discovery**: Lists available VPCs and subnets
- **Validation**: Checks VPC and subnet accessibility
- **Configuration Persistence**: Saves settings for future deployments
- **Smart Defaults**: Remembers previous choices

## Configuration

### Deploy script configuration (`.librechat-deploy-config`)

The deploy script saves your choices to `.librechat-deploy-config` and reloads them with `--load-config`. You can also edit this file to set or change options without re-prompting.

**Optional: Custom container image (`LIBRECHAT_IMAGE`)**

By default, the stack uses the container image defined in the template (e.g. the official `librechat/librechat:latest` or a template default). To use a custom image (e.g. your own ECR build), set `LIBRECHAT_IMAGE` in your deploy config:

```bash
LIBRECHAT_IMAGE="<account>.dkr.ecr.<region>.amazonaws.com/<repository>:<tag>"
```

Then deploy with the config loaded so the parameter is applied:

```bash
./deploy-clean.sh --load-config
```

If `LIBRECHAT_IMAGE` is unset or empty, the template’s default image is used.

### Environment Variables

The deployment automatically configures these environment variables for LibreChat:

**Core Application Settings:**
- `NODE_ENV`: Set to "production"
- `MONGO_URI`: DocumentDB connection string with SSL and authentication
- `REDIS_URI`: ElastiCache Redis connection string
- `NODE_TLS_REJECT_UNAUTHORIZED`: Set to "0" for DocumentDB SSL compatibility
- `ALLOW_REGISTRATION`: Set to "false" (configure SAML post-deployment)

**Security & Authentication:**
- `JWT_SECRET`: Auto-generated secure JWT secret (stored in Secrets Manager)
- `JWT_REFRESH_SECRET`: Auto-generated refresh token secret (stored in Secrets Manager)
- `CREDS_KEY`: Auto-generated credentials encryption key (stored in Secrets Manager)
- `CREDS_IV`: Auto-generated encryption IV (stored in Secrets Manager)

**SSO Authentication (Optional):**
- `ENABLE_SSO`: Set to "true" to enable SSO authentication
- `COGNITO_USER_POOL_ID`: AWS Cognito User Pool ID
- `OPENID_CLIENT_ID`: App Client ID from Cognito User Pool
- `OPENID_CLIENT_SECRET`: App Client Secret from Cognito User Pool
- `OPENID_SCOPE`: OpenID scope for authentication (default: `openid profile email`)
- `OPENID_BUTTON_LABEL`: Login button text (default: `Sign in with SSO`)
- `OPENID_NAME_CLAIM`: Name attribute mapping (default: `name`)
- `OPENID_EMAIL_CLAIM`: Email attribute mapping (default: `email`)
- `OPENID_SESSION_SECRET`: Auto-generated session secret (stored in Secrets Manager)
- `OPENID_ISSUER`: Auto-configured Cognito issuer URL
- `OPENID_CALLBACK_URL`: Auto-configured callback URL (`/oauth/openid/callback`)

**AWS Bedrock Configuration:**
- `AWS_REGION`: Deployment region for AWS services
- `BEDROCK_AWS_DEFAULT_REGION`: AWS region for Bedrock API calls
- `BEDROCK_AWS_ACCESS_KEY_ID`: AWS access key for Bedrock access (from deployment parameters)
- `BEDROCK_AWS_SECRET_ACCESS_KEY`: AWS secret key for Bedrock access (from deployment parameters)
- `BEDROCK_AWS_MODELS`: Pre-configured Bedrock models including:
  - `us.anthropic.claude-3-7-sonnet-20250219-v1:0`
  - `us.anthropic.claude-opus-4-20250514-v1:0`
  - `us.anthropic.claude-sonnet-4-20250514-v1:0`
  - `us.anthropic.claude-3-5-haiku-20241022-v1:0`
  - `us.meta.llama3-3-70b-instruct-v1:0`
  - `us.amazon.nova-pro-v1:0`

**Configuration Management:**
- `CONFIG_PATH`: Set to "/app/config/librechat.yaml" (mounted from EFS)
- `CACHE`: Set to "false" to disable prompt caching (avoids Bedrock caching issues)

### EFS Configuration System:

The deployment includes an EFS-based configuration management system:
- **Real-time Updates**: Configuration changes without container rebuilds
- **S3 → EFS Pipeline**: Automated sync from S3 to EFS via Lambda
- **Container Mounting**: EFS volume mounted at `/app/config/librechat.yaml` and CONFIG_PATH environmental variable set to match it
- **Update Commands**: Use `./deploy-clean.sh --update-config` for config-only updates

### Scaling Configuration

Default scaling settings:
- **Min Capacity**: 2 instances
- **Max Capacity**: 20 instances
- **Target CPU**: 70% utilization
- **Scale Out Cooldown**: 5 minutes
- **Scale In Cooldown**: 5 minutes

To modify scaling, edit the `ECSAutoScalingTarget` and `ECSAutoScalingPolicy` resources in `template.yaml`.

### Database Configuration

**DocumentDB (MongoDB-compatible):**
- Instance Class: `db.t3.medium` (2 instances)
- Backup Retention: 7 days
- Encryption: Enabled
- Multi-AZ: Yes

**ElastiCache Redis:**
- Node Type: `cache.t3.micro` (2 nodes)
- Engine Version: 7.0
- Encryption: At-rest and in-transit
- Multi-AZ: Yes with automatic failover

## LibreChat Dependencies & Features

### Core Dependencies Deployed
- **MongoDB/DocumentDB**: Primary database for conversations, users, and metadata
- **Redis/ElastiCache**: Session management, caching, and real-time features
- **S3**: File storage with support for multiple strategies:
  - **Avatars**: User and agent profile images
  - **Images**: Chat image uploads and generations
  - **Documents**: PDF uploads, text files, and attachments
  - **Static Assets**: CSS, JavaScript, and other static content

### Optional Components (Can Be Added)
- **Meilisearch**: Full-text search for conversation history with typo tolerance
- **Vector Database**: For RAG (Retrieval-Augmented Generation) functionality
- **CDN**: CloudFront integration for global content delivery

### File Storage Strategies
LibreChat supports multiple storage strategies that can be mixed:
- **S3**: Scalable cloud storage (configured in this deployment)


## Post-Deployment Setup

### 1. Access LibreChat
After deployment completes (15-20 minutes), access LibreChat using the Load Balancer URL:

```bash
# Get the application URL
aws cloudformation describe-stacks \
  --stack-name librechat \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerURL`].OutputValue' \
  --output text
```

The application will be available at: `http://your-load-balancer-url` (or `https://` if you configured SSL)

### 2. Initial Admin Setup
1. **First User Registration**: The first user to register becomes the admin
<!-- 2. **Admin Panel Access**: Navigate to `/admin` after logging in as admin
3. **User Management**: Control user registration and permissions -->

### 3. Configure SSO Authentication (Optional)

**Prerequisites:**
- AWS Cognito User Pool created and configured
- App Client created in the User Pool with appropriate settings
- Identity Provider configured in Cognito (SAML, OIDC, or social providers)
- Attribute mappings configured in Cognito

**SSO Configuration Options:**

The deployment supports optional SSO authentication through AWS Cognito with OpenID Connect:

**Required SSO Settings:**
- `ENABLE_SSO`: Set to "true" to enable SSO authentication
- `COGNITO_USER_POOL_ID`: Your AWS Cognito User Pool ID (e.g., `us-east-1_8o9DM3lHZ`)
- `OPENID_CLIENT_ID`: App Client ID from your Cognito User Pool
- `OPENID_CLIENT_SECRET`: App Client Secret from your Cognito User Pool

**Optional SSO Settings:**
- `OPENID_SCOPE`: OpenID scope for authentication (default: `openid profile email`)
- `OPENID_BUTTON_LABEL`: Login button text (default: `Sign in with SSO`)
- `OPENID_NAME_CLAIM`: Name attribute mapping (default: `name`)
- `OPENID_EMAIL_CLAIM`: Email attribute mapping (default: `email`)

**Automatic Configuration:**
The deployment automatically configures:
- `OPENID_ISSUER`: Cognito issuer URL (`https://cognito-idp.{region}.amazonaws.com/{user-pool-id}`)
- `OPENID_CALLBACK_URL`: OAuth callback URL (`/oauth/openid/callback`)
- `OPENID_SESSION_SECRET`: Secure session secret (auto-generated and stored in Secrets Manager)

**Configuration Methods:**

1. **During Deployment**: The interactive deployment script will prompt for SSO settings
2. **Post-Deployment**: Update the CloudFormation stack with SSO parameters
3. **Environment Variables**: Configure directly in the ECS task definition

**SSO Setup Steps:**

1. **Create AWS Cognito User Pool**:
   - Create a new User Pool in AWS Cognito
   - Configure sign-in options (email, username, etc.)
   - Set up password policies and MFA if desired
   - Configure attribute mappings for name and email

2. **Create App Client**:
   - Create an App Client in your User Pool
   - Enable "Generate client secret"
   - Configure OAuth 2.0 settings:
     - Allowed OAuth Flows: Authorization code grant
     - Allowed OAuth Scopes: openid, profile, email
     - Callback URLs: `https://your-domain/oauth/openid/callback`
     - Sign out URLs: `https://your-domain`

3. **Configure Identity Provider (Optional)**:
   - Add SAML, OIDC, or social identity providers to Cognito
   - Configure attribute mappings between IdP and Cognito
   - Test the identity provider integration

4. **Deploy with SSO**:
   ```bash
   ./deploy-clean.sh
   # Choose "y" when prompted for SSO configuration
   # Provide the required Cognito User Pool ID, Client ID, and Client Secret
   ```

5. **Verify SSO Integration**:
   - Access LibreChat URL
   - Click the SSO login button (customizable label)
   - Complete authentication flow through Cognito
   - Verify user attributes are mapped correctly

**Important Notes:**
- SSO configuration is completely optional
- If SSO is not configured, LibreChat uses standard email/password authentication
- SSO settings can be added or modified after initial deployment
- Ensure Cognito User Pool and App Client configuration is complete before enabling SSO
- The callback URL must match exactly what's configured in your Cognito App Client

**Adding SSO After Initial Deployment:**

If you deployed without SSO initially, you can add it later:

1. **Update CloudFormation Stack**:
   ```bash
   aws cloudformation update-stack \
     --stack-name your-stack-name \
     --use-previous-template \
     --parameters ParameterKey=EnableSSO,ParameterValue="true" \
                  ParameterKey=CognitoUserPoolId,ParameterValue="your-user-pool-id" \
                  ParameterKey=OpenIdClientId,ParameterValue="your-client-id" \
                  ParameterKey=OpenIdClientSecret,ParameterValue="your-client-secret" \
     --capabilities CAPABILITY_IAM
   ```

2. **Or Re-run Deployment Script**:
   ```bash
   ./deploy-clean.sh --load-config
   # Choose "y" for SSO configuration when prompted
   ```

**Supported Identity Providers:**
Through AWS Cognito, you can integrate with:
- **SAML 2.0**: Enterprise identity providers (Active Directory, Okta, etc.)
- **OpenID Connect**: OIDC-compliant providers
- **Social Providers**: Google, Facebook, Amazon, Apple
- **Custom Providers**: Any OAuth 2.0 or SAML 2.0 compliant system

### 4. Set Up AI Provider API Keys
Configure your AI providers in the LibreChat interface:

**Supported Providers:**
- **OpenAI**: GPT-4, GPT-3.5, DALL-E, Whisper
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus/Haiku
- **Google**: Gemini Pro, Gemini Vision
- **Azure OpenAI**: Enterprise OpenAI models
- **AWS Bedrock**: Claude, Titan, Llama models
- **Groq**: Fast inference for Llama, Mixtral
- **OpenRouter**: Access to multiple model providers
- **Custom Endpoints**: Any OpenAI-compatible API

**Configuration Methods:**
- **Environment Variables**: Pre-configure in deployment (more secure)
- **YAML FILE**: Certain configuration options are configured via librechat.yaml

<!-- ### 5. File Upload & Storage Configuration
The deployment automatically configures S3 for file storage:

- **Upload Limits**: Configure max file sizes in admin panel
- **Supported Formats**: PDFs, images, text files, code files
- **Storage Strategy**: S3 (configured automatically)
- **CDN Integration**: Ready for CloudFront if needed -->

### 5. Advanced Configuration Options

<!-- **Conversation Search (Optional):**
- Deploy Meilisearch for full-text conversation search
- Enables typo-tolerant search across chat history
- Can be added as additional ECS service

**RAG Integration (Optional):**
- Configure vector database for document Q&A
- Supports PDF uploads with semantic search
- Integrates with embedding providers

**Rate Limiting:**
- Configure per-user rate limits
- Set up token usage tracking
- Monitor costs across providers -->

### 6. Monitoring & Maintenance

**CloudWatch Dashboards:**
- ECS service metrics (CPU, memory, task count)
- Load balancer performance (response time, error rates)
- Database metrics (DocumentDB and Redis)
- Application logs and error tracking

**Automated Scaling:**
- Monitors CPU utilization (target: 70%)
- Scales from 2-20 instances automatically
- Uses 80% Spot instances for cost optimization

**Health Checks:**
- Application-level health checks
- Database connectivity monitoring
- Automatic unhealthy task replacement

## Monitoring and Maintenance

### CloudWatch Logs
View application logs:
```bash
aws logs tail /ecs/librechat --follow
```

### ECS Service Status
Check service health:
```bash
aws ecs describe-services --cluster librechat-cluster --services librechat-service
```

### Database Monitoring
- DocumentDB metrics available in CloudWatch
- ElastiCache Redis metrics and performance insights
- Set up CloudWatch alarms for critical metrics

### Cost Optimization
- Monitor Fargate Spot vs On-Demand usage
- Review DocumentDB and ElastiCache instance sizes
- Set up billing alerts


## Scaling Considerations

### Horizontal Scaling (Automatic)
The deployment automatically handles horizontal scaling:

**ECS Auto Scaling:**
- **Minimum**: 2 instances (high availability)
- **Maximum**: 20 instances (configurable)
- **Trigger**: 70% CPU utilization average
- **Scale Out**: Add instances when CPU > 70% for 5 minutes
- **Scale In**: Remove instances when CPU < 70% for 5 minutes
- **Cooldown**: 5-minute intervals between scaling actions

**Database Scaling:**
- **DocumentDB**: Supports up to 15 read replicas for read scaling
- **ElastiCache Redis**: Supports cluster mode for memory scaling
- **Connection Pooling**: Efficient database connection management

### Vertical Scaling (Manual)
For higher per-instance performance:

**ECS Task Scaling:**
```yaml
# In template.yaml, modify:
Cpu: 2048        # Double CPU (1024 -> 2048)
Memory: 4096     # Double memory (2048 -> 4096)
```

**Database Scaling:**
```yaml
# Upgrade DocumentDB instances:
DBInstanceClass: db.r5.large    # From db.t3.medium
DBInstanceClass: db.r5.xlarge   # For heavy workloads

# Upgrade Redis instances:
NodeType: cache.r6g.large       # From cache.t3.micro
```

### Global Scaling (Multi-Region)
For worldwide deployment:

<!-- 1. **Deploy in Multiple Regions**:
   ```bash
   ./deploy.sh -r us-east-1 -s librechat-us-east
   ./deploy.sh -r eu-west-1 -s librechat-eu-west
   ./deploy.sh -r ap-southeast-1 -s librechat-asia
   ```

2. **Route 53 Setup**:
   - Health checks for each region
   - Latency-based routing
   - Automatic failover

3. **Data Synchronization**:
   - DocumentDB Global Clusters
   - S3 Cross-Region Replication
   - Redis Global Datastore -->

### Load Testing
Before production deployment, perform load testing:

```bash
# Example load test with Apache Bench
ab -n 10000 -c 100 http://your-load-balancer-url/

# Or use more sophisticated tools:
# - Artillery.io for API testing
# - JMeter for comprehensive testing
# - Locust for Python-based testing
```

### Capacity Planning
Plan for growth with these guidelines:

**User Scaling:**
- **Light Users**: 1 instance per 100 concurrent users
- **Medium Users**: 1 instance per 50 concurrent users  
- **Heavy Users**: 1 instance per 25 concurrent users

**Database Scaling:**
- **DocumentDB**: 1000 connections per db.t3.medium
- **Redis**: 65,000 connections per cache.t3.micro
- **Storage**: Plan 1GB per 1000 conversations

## Security Best Practices

### Network Security
- All databases in private subnets
- Security groups with minimal required access
- Optional NAT gateways or Transit Gateway for outbound internet access
- Flexible internet connectivity based on existing infrastructure

### Data Security
- Encryption at rest for all data stores
- Encryption in transit for Redis
- S3 bucket encryption and versioning
- Secrets Manager for sensitive data

### Access Control
- IAM roles with least privilege
- ECS task roles for service-specific permissions
- No hardcoded credentials

## Troubleshooting

### Common Issues

**Deployment Fails:**
```bash
# Check CloudFormation events
aws cloudformation describe-stack-events --stack-name librechat

# Check SAM logs
sam logs -n ECSService --stack-name librechat
```

**Service Won't Start:**
```bash
# Check ECS task logs
aws ecs describe-tasks --cluster librechat-cluster --tasks <task-arn>

# Check CloudWatch logs
aws logs tail /ecs/librechat --follow
```

**Database Connection Issues:**
- Verify security group rules
- Check DocumentDB cluster status
- Validate connection strings in Secrets Manager

### Performance Issues
- Monitor ECS service CPU/memory utilization
- Check DocumentDB performance insights
- Review ElastiCache Redis metrics
- Analyze ALB target group health

## Cleanup

To remove all resources:
```bash
aws cloudformation delete-stack --stack-name librechat
```

**Note:** This will delete all data. Ensure you have backups if needed.

## Cost Optimization & Estimation

### Cost Optimization Features
This deployment is optimized for cost efficiency while maintaining high availability:

**Fargate Spot Integration:**
- **80% Spot Instances**: Up to 70% cost savings on compute
- **20% On-Demand**: Ensures availability during Spot interruptions
- **Automatic Failover**: Seamless transition between Spot and On-Demand

**Right-Sizing Strategy:**
- **Auto Scaling**: Only pay for resources you need (2-20 instances)
- **Efficient Instance Types**: Optimized CPU/memory ratios
- **Database Optimization**: DocumentDB and Redis sized for typical workloads

**Storage Optimization:**
- **S3 Intelligent Tiering**: Automatic cost optimization for file storage
- **Lifecycle Policies**: Automatic cleanup of incomplete uploads
- **Compression**: Efficient storage of conversation data

### Monthly Cost Estimation (US-East-1)

**Base Infrastructure (Minimum 2 instances):**
- **ECS Fargate (2 instances)**: ~$30-50/month
  - 80% Spot pricing: ~$24-40/month
  - 20% On-Demand: ~$6-10/month
- **DocumentDB (2x db.t3.medium)**: ~$100-120/month
- **ElastiCache Redis (2x cache.t3.micro)**: ~$30-40/month
- **Application Load Balancer**: ~$20/month
- **NAT Gateway (2 AZs) - Optional**: ~$90/month
  - **Base cost**: $45/month per NAT Gateway × 2 = $90/month
  - **Data processing**: $0.045 per GB processed
  - **High availability**: Automatic failover between AZs
  - **Performance**: Up to 45 Gbps bandwidth per gateway
- **S3 Storage**: ~$5-25/month (depending on usage)
- **Data Transfer**: ~$10-30/month (depending on traffic)

**Total Monthly Cost Ranges:**

**With NAT Gateways (Standard AWS Pattern):**
- **Light Usage (2-3 instances)**: ~$285-335/month
- **Medium Usage (5-8 instances)**: ~$380-480/month
- **Heavy Usage (10-20 instances)**: ~$530-830/month

**Without NAT Gateways (Transit Gateway Pattern):**
- **Light Usage (2-3 instances)**: ~$195-245/month
- **Medium Usage (5-8 instances)**: ~$290-390/month
- **Heavy Usage (10-20 instances)**: ~$440-740/month

**NAT Gateway vs Transit Gateway Comparison:**
- **NAT Gateway Benefits**: 99.95% SLA, zero maintenance, 45 Gbps performance, built-in DDoS protection
- **Transit Gateway Benefits**: ~$90/month cost savings, leverages existing infrastructure, centralized routing
- **Cost Difference**: ~$90/month for NAT Gateway option
- **Performance**: NAT Gateway typically faster for internet access, Transit Gateway may have additional latency

**Cost Comparison:**
- **Traditional EC2**: 40-60% more expensive
- **Managed Services**: 70-80% more expensive than self-managed
- **Multi-Cloud**: This deployment is 50-70% cheaper than equivalent GCP/Azure

### Cost Monitoring & Alerts
- **AWS Cost Explorer**: Track spending by service
- **Billing Alerts**: Set up budget notifications
- **Resource Tagging**: Track costs by environment/team
- **Spot Instance Savings**: Monitor Spot vs On-Demand usage

### Additional Cost Optimization Tips
1. **Use Reserved Instances**: For DocumentDB if usage is predictable
2. **Enable S3 Intelligent Tiering**: Automatic storage class optimization
3. **Monitor Data Transfer**: Optimize between AZs and regions
4. **Regular Cleanup**: Remove unused resources and old backups
5. **Right-Size Databases**: Monitor and adjust instance types based on usage

## Support

For issues related to:
- **LibreChat**: [LibreChat GitHub](https://github.com/danny-avila/LibreChat)
- **AWS SAM**: [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)
- **This deployment**: Create an issue in this repository

## License

This deployment template is provided under the MIT License. LibreChat itself is licensed under the MIT License.