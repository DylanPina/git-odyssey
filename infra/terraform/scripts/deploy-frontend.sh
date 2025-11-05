#!/usr/bin/env bash
set -euo pipefail

# Builds the frontend and deploys it to S3 + invalidates CloudFront.
# Usage:
#   AWS_REGION=us-east-1 ./deploy-frontend.sh

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="${SCRIPT_DIR}/.."
FRONTEND_DIR="${SCRIPT_DIR}/../../../frontend"

AWS_REGION=${AWS_REGION:-us-east-1}

# Get the backend ALB DNS name from terraform outputs
ALB_DNS=$(terraform -chdir="${TF_DIR}" output -raw alb_dns_name)

if [ -z "$ALB_DNS" ]; then
  echo "Error: Could not get ALB DNS name from terraform outputs" >&2
  exit 1
fi

echo "Building frontend with backend API URL: http://${ALB_DNS}"

pushd "${FRONTEND_DIR}" >/dev/null
if command -v npm >/dev/null 2>&1; then
  npm ci
  # Set the API_URL environment variable before building
  API_URL=${ALB_DNS} npm run build
else
  echo "npm is required to build the frontend" >&2
  exit 1
fi
popd >/dev/null

S3_BUCKET=$(terraform -chdir="${TF_DIR}" output -raw s3_website_bucket)
CF_ID=$(terraform -chdir="${TF_DIR}" output -raw frontend_distribution_id)

aws s3 sync "${FRONTEND_DIR}/dist/" "s3://${S3_BUCKET}" --delete

aws cloudfront create-invalidation \
  --distribution-id "${CF_ID}" \
  --paths "/*" \
  >/dev/null

CF_DOMAIN=$(terraform output -raw cloudfront_domain_name)
echo "Deployed. CloudFront: https://${CF_DOMAIN}"


