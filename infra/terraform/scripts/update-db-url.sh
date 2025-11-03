#!/usr/bin/env bash
set -euo pipefail

# Re-applies Terraform with the real RDS endpoint in DATABASE_URL.
# Usage:
#   DB_PASSWORD=... AWS_REGION=us-east-1 ./update-db-url.sh

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="${SCRIPT_DIR}/.."

PROJECT_NAME=${PROJECT_NAME:-git-odyssey}
AWS_REGION=${AWS_REGION:-us-east-1}
DB_PASSWORD=${DB_PASSWORD:?Set DB_PASSWORD}
DOCKER_IMAGE_TAG=${DOCKER_IMAGE_TAG:-latest}

RDS_ENDPOINT=$(terraform -chdir="${TF_DIR}" output -raw rds_endpoint)
DATABASE_URL="postgresql+psycopg2://appuser:${DB_PASSWORD}@${RDS_ENDPOINT}:5432/gitodyssey"

terraform -chdir="${TF_DIR}" apply -auto-approve \
  -var "project_name=${PROJECT_NAME}" \
  -var "environment=prod" \
  -var "aws_region=${AWS_REGION}" \
  -var "db_password=${DB_PASSWORD}" \
  -var "docker_image_tag=${DOCKER_IMAGE_TAG}" \
  -var "database_url_value=${DATABASE_URL}"

echo "Service updated with real DATABASE_URL."


