#!/usr/bin/env bash
set -euo pipefail

# Creates S3 bucket and DynamoDB table for Terraform remote state and locking (prod only).
# Usage:
#   PROJECT_NAME=git-odyssey AWS_REGION=us-east-1 ./setup-state.sh
#   Or override names:
#   TF_STATE_BUCKET=my-unique-tf-bucket TF_LOCK_TABLE=my-tf-locks ./setup-state.sh

PROJECT_NAME=git-odyssey
AWS_REGION=us-east-1
ENVIRONMENT=${ENVIRONMENT:-prod}

ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)

TF_STATE_BUCKET=${TF_STATE_BUCKET:-${PROJECT_NAME}-${ENVIRONMENT}-tf-state}
TF_LOCK_TABLE=${TF_LOCK_TABLE:-${PROJECT_NAME}-${ENVIRONMENT}-tf-locks}

echo "Region:        ${AWS_REGION}"
echo "Account ID:    ${ACCOUNT_ID}"
echo "State bucket:  ${TF_STATE_BUCKET}"
echo "Lock table:    ${TF_LOCK_TABLE}"

echo "Ensuring S3 bucket exists..."
if aws s3api head-bucket --bucket "${TF_STATE_BUCKET}" 2>/dev/null; then
  echo "Bucket already exists"
else
  aws s3api create-bucket --bucket "${TF_STATE_BUCKET}" --region "${AWS_REGION}"
  echo "Created bucket ${TF_STATE_BUCKET}"
fi

echo "Enabling bucket versioning..."
aws s3api put-bucket-versioning \
  --bucket "${TF_STATE_BUCKET}" \
  --versioning-configuration Status=Enabled

echo "Ensuring DynamoDB lock table exists..."
if aws dynamodb describe-table --table-name "${TF_LOCK_TABLE}" >/dev/null 2>&1; then
  echo "Table already exists"
else
  aws dynamodb create-table \
    --table-name "${TF_LOCK_TABLE}" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${AWS_REGION}"
  echo "Created table ${TF_LOCK_TABLE}"
fi

echo "Done. Use these for terraform init:"
echo "  -backend-config=\"bucket=${TF_STATE_BUCKET}\""
echo "  -backend-config=\"key=${PROJECT_NAME}/${ENVIRONMENT}.tfstate\""
echo "  -backend-config=\"region=${AWS_REGION}\""
echo "  -backend-config=\"dynamodb_table=${TF_LOCK_TABLE}\""


