#!/usr/bin/env bash
set -euo pipefail

# Initializes Terraform with S3 backend and DynamoDB locking (prod only).
# Usage:
#   PROJECT_NAME=git-odyssey AWS_REGION=us-east-1 ./init.sh
# Optional overrides:
#   TF_STATE_BUCKET=... TF_LOCK_TABLE=... ./init.sh

PROJECT_NAME=git-odyssey
AWS_REGION=us-east-1
ENVIRONMENT=${ENVIRONMENT:-prod}
ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
TF_STATE_BUCKET=${TF_STATE_BUCKET:-${PROJECT_NAME}-${ENVIRONMENT}-tf-state}
TF_LOCK_TABLE=${TF_LOCK_TABLE:-${PROJECT_NAME}-${ENVIRONMENT}-tf-locks}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="${SCRIPT_DIR}/.."

terraform -chdir="${TF_DIR}" init \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="key=${PROJECT_NAME}/${ENVIRONMENT}.tfstate" \
  -backend-config="region=${AWS_REGION}" \
  -backend-config="dynamodb_table=${TF_LOCK_TABLE}"

echo "Terraform initialized."

 
