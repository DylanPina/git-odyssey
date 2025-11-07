# Deployment Guide for AWS Infrastructure

This guide explains how to deploy and configure the Git Odyssey application on AWS, including fixing CORS issues.

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Terraform installed
3. Docker installed (for building backend images)
4. Node.js and npm installed (for building frontend)

## Initial Deployment

### Step 1: Prepare Environment Variables

Create a `terraform.tfvars` file in the `infra/terraform` directory with the following variables:

```hcl
# Database configuration
db_password = "your-secure-password"
database_url_value = "postgresql://appuser:your-secure-password@<RDS_ENDPOINT>:5432/gitodyssey"

# API Keys and Secrets
openai_api_key = "your-openai-api-key"
secret_key = "your-secret-key-for-sessions"

# GitHub OAuth Configuration
github_client_id = "your-github-client-id"
github_client_secret = "your-github-client-secret"
github_webhook_secret = "your-github-webhook-secret"
github_app_id = "your-github-app-id"
github_app_private_key = "your-github-app-private-key"

# Initial CORS configuration (will update after deployment)
allowed_cors_origins = ["http://localhost:5173"]
frontend_url = "http://localhost:5173"
```

### Step 2: Initialize and Apply Terraform

```bash
cd infra/terraform
./scripts/init.sh
./scripts/plan.sh
./scripts/apply.sh
```

This will create:
- VPC and networking resources
- RDS PostgreSQL database
- ECR repository
- ECS cluster and task definitions
- Application Load Balancer
- S3 bucket for frontend
- CloudFront distribution

### Step 3: Build and Push Backend Image

```bash
./scripts/build-push-backend.sh
```

### Step 4: Get CloudFront Domain

After the initial deployment, get the CloudFront domain:

```bash
terraform output cloudfront_domain_name
# Output: d3neteq19h6cs7.cloudfront.net (example)
```

### Step 5: Update CORS Configuration

Update your `terraform.tfvars` file to include the CloudFront domain:

```hcl
allowed_cors_origins = ["https://d3neteq19h6cs7.cloudfront.net", "http://localhost:5173"]
frontend_url = "https://d3neteq19h6cs7.cloudfront.net"
```

Apply the changes:

```bash
terraform apply
```

This will update the ECS task definition with the correct CORS configuration.

### Step 6: Deploy Frontend

Deploy the frontend with the correct backend URL:

```bash
./scripts/deploy-frontend.sh
```

This script will:
1. Get the ALB DNS name from terraform outputs
2. Build the frontend with `API_URL=http://<ALB_DNS>`
3. Upload the built files to S3
4. Invalidate the CloudFront cache

## Troubleshooting CORS Issues

### Issue: "Cross-Origin Request Blocked"

This happens when:
1. The frontend is trying to connect to `localhost:8000` instead of the actual backend URL
2. The backend CORS configuration doesn't include the CloudFront domain

**Solution:**
1. Ensure the frontend was built with the correct `API_URL` environment variable
2. Redeploy both frontend and backend after making changes

### Verifying Configuration

1. Check the deployed frontend's API URL:
```bash
# Download the JS bundle from CloudFront and search for the API URL
curl https://d3neteq19h6cs7.cloudfront.net/assets/index-*.js | grep -o 'http[s]*://[^"]*' | sort -u
```

2. Check the backend CORS configuration:
```bash
# Check ECS task definition
aws ecs describe-task-definition --task-definition git-odyssey-dev-backend --query 'taskDefinition.containerDefinitions[0].environment' --output json
```

## Updating the Application

### Update Backend

1. Make changes to backend code
2. Build and push new image:
```bash
./scripts/build-push-backend.sh
```
3. Update ECS service to use new task definition (or force new deployment):
```bash
aws ecs update-service --cluster git-odyssey-dev-cluster --service git-odyssey-dev-svc --force-new-deployment
```

### Update Frontend

1. Make changes to frontend code
2. Deploy:
```bash
./scripts/deploy-frontend.sh
```

## Environment Variables Reference

### Backend Environment Variables (Set via Terraform)

- `PORT`: Container port (default: 8000)
- `DATABASE_URL`: PostgreSQL connection string
- `FRONTEND_URL`: Frontend URL for redirects

### Backend Secrets (Set via AWS Secrets Manager)

- `OPENAI_API_KEY`: OpenAI API key for AI features
- `SECRET_KEY`: Secret key for session middleware
- `GITHUB_CLIENT_ID`: GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth client secret
- `GITHUB_WEBHOOK_SECRET`: GitHub webhook secret
- `APP_ID`: GitHub App ID
- `GITHUB_APP_PRIVATE_KEY`: GitHub App private key

### Frontend Environment Variables (Set during build)

- `API_URL`: Backend API URL (set automatically by deploy script)

## Common Commands

```bash
# Get terraform outputs
./scripts/outputs.sh

# View CloudFront domain
terraform output cloudfront_domain_name

# View ALB DNS name
terraform output alb_dns_name

# Destroy infrastructure (WARNING: This will delete everything)
./scripts/destroy.sh
```

## Notes

- The initial deployment requires two terraform applies: one to create resources, and another to update CORS with the CloudFront domain
- Make sure to update your GitHub OAuth callback URLs to use the CloudFront domain
- The backend uses HTTP (not HTTPS) between ALB and ECS tasks, but CloudFront serves the frontend over HTTPS

