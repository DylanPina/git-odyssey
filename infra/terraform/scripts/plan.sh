#!/usr/bin/env bash
set -euo pipefail

# Creates a Terraform plan. Requires DB_PASSWORD for RDS. DATABASE_URL uses a placeholder host on first run.
# Usage:
#   DB_PASSWORD=... AWS_REGION=us-east-1 ./plan.sh

ROOT_DIR="/Users/dillonpina/Documents/code/git-odyssey"
TF_DIR="${ROOT_DIR}/infra/terraform"

PROJECT_NAME=${PROJECT_NAME:-git-odyssey}
AWS_REGION=${AWS_REGION:-us-east-1}
DB_PASSWORD=${DB_PASSWORD:?Set DB_PASSWORD}

DOCKER_IMAGE_TAG=${DOCKER_IMAGE_TAG:-latest}

cd "${TF_DIR}"

# Try to resolve the RDS endpoint from previous apply; fall back to placeholder
set +e
RDS_ENDPOINT=$(terraform output -raw rds_endpoint 2>/dev/null)
set -e
if [ -z "${RDS_ENDPOINT}" ]; then
  DB_HOST="placeholder"
else
  DB_HOST="${RDS_ENDPOINT}"
fi

DATABASE_URL="postgresql+psycopg2://appuser:${DB_PASSWORD}@${DB_HOST}:5432/gitodyssey"

terraform plan -out tfplan \
  -var "project_name=${PROJECT_NAME}" \
  -var "environment=prod" \
  -var "aws_region=${AWS_REGION}" \
  -var "db_password=${DB_PASSWORD}" \
  -var "docker_image_tag=${DOCKER_IMAGE_TAG}" \
  -var "database_url_value=${DATABASE_URL}"

echo "Plan saved to tfplan."


