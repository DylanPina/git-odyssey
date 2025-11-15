# GitOdyssey AWS Terraform

This Terraform config provisions AWS infrastructure for the app:

- VPC with public/private subnets and NAT
- RDS PostgreSQL (private)
- ECR repository for backend image
- ECS Fargate service behind an ALB
- S3 static site + CloudFront for frontend

## Prerequisites

- Terraform >= 1.6 and AWS credentials configured
- An S3 bucket and DynamoDB table for remote state (create once, outside this stack)

Example backend init:

```
terraform init \
  -backend-config="bucket=YOUR_TF_STATE_BUCKET" \
  -backend-config="key=git-odyssey/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=YOUR_TF_LOCK_TABLE"
```

## Variables

See `variables.tf` for defaults. Sensitive inputs (set via env):

- `TF_VAR_db_password`
- `TF_VAR_database_url_value` (temporary; prefer SSM/Secrets Manager in prod)

## Apply

1. Init remote state (above)
2. Plan and apply:

```
terraform plan -out tfplan \
  -var "project_name=git-odyssey" \
  -var "environment=dev" \
  -var "database_url_value=postgresql+psycopg2://appuser:${TF_VAR_db_password}@REPLACEME:5432/gitodyssey"

terraform apply tfplan
```

After apply, outputs include:

- `ecr_repository_url`: push your built backend image with the supplied tag
- `alb_dns_name`: backend API base URL
- `cloudfront_domain_name`: frontend CDN URL

## Deploy backend image

```
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
docker build -t git-odyssey-backend -f ../../backend/Dockerfile.app ../../backend
docker tag git-odyssey-backend:latest $(terraform output -raw ecr_repository_url):latest
docker push $(terraform output -raw ecr_repository_url):latest
```

If you pushed a non-latest tag, set `-var docker_image_tag=YOUR_TAG` and re-apply.

## Upload frontend

Build and sync to S3, then invalidate CloudFront:

```
pushd ../../frontend
npm ci && npm run build
aws s3 sync dist/ s3://$(terraform output -raw s3_website_bucket) --delete
aws cloudfront create-invalidation --distribution-id $(terraform output -raw frontend_distribution_id 2>/dev/null || echo MISSING) --paths "/*"
popd
```

The `frontend_domain` output maps to the canonical hostname serving the SPA (for this stack, `www.gitodyssey.com`) and `https://www.gitodyssey.com/api` resolves to the backend through CloudFront. `frontend_domain_aliases` lists every hostname on the distribution.

## Notes

- For production, move secrets to SSM Parameter Store or Secrets Manager and inject via ECS task `secrets` instead of plain env vars.
- Custom domains: update `config.yaml` with `domain_name`, `apex_domain_name`, optional `alternate_domain_names`, `hosted_zone_name`, and `certificate_domain_name`. Terraform automatically issues/validates an ACM cert in us-east-1 for those hostnames, maps each alias (including the apex) to CloudFront, and proxies `/api/*` to the ALB.



