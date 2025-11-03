#!/usr/bin/env bash
set -euo pipefail

# Applies the Terraform plan (or creates one on the fly).
# Usage:
#   DB_PASSWORD=... AWS_REGION=us-east-1 ./apply.sh
# Optional:
#   DOCKER_IMAGE_TAG=... USE_REAL_DB=1

PROJECT_NAME=git-odyssey
AWS_REGION=us-east-1
ENVIRONMENT=${ENVIRONMENT:-prod}
DB_PASSWORD=${DB_PASSWORD:?Set DB_PASSWORD}
DOCKER_IMAGE_TAG=${DOCKER_IMAGE_TAG:-latest}
USE_REAL_DB=${USE_REAL_DB:-0}

if [ "${USE_REAL_DB}" = "1" ]; then
  RDS_ENDPOINT=$(terraform output -raw rds_endpoint)
  DB_HOST="${RDS_ENDPOINT}"
else
  DB_HOST="placeholder"
fi

DATABASE_URL="postgresql+psycopg2://appuser:${DB_PASSWORD}@${DB_HOST}:5432/gitodyssey"

cd ..
terraform apply -auto-approve \
  -var "project_name=${PROJECT_NAME}" \
  -var "environment=prod" \
  -var "aws_region=${AWS_REGION}" \
  -var "db_password=${DB_PASSWORD}" \
  -var "docker_image_tag=${DOCKER_IMAGE_TAG}" \
  -var "database_url_value=${DATABASE_URL}"

echo "Apply complete."


