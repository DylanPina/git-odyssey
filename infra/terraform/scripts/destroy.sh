#!/usr/bin/env bash
set -euo pipefail

# Destroys the Terraform-managed infrastructure.
# Usage:
#   DB_PASSWORD=... AWS_REGION=us-east-1 ./destroy.sh

ROOT_DIR="/Users/dillonpina/Documents/code/git-odyssey"
TF_DIR="${ROOT_DIR}/infra/terraform"

PROJECT_NAME=${PROJECT_NAME:-git-odyssey}
AWS_REGION=${AWS_REGION:-us-east-1}
DB_PASSWORD=${DB_PASSWORD:?Set DB_PASSWORD}
DOCKER_IMAGE_TAG=${DOCKER_IMAGE_TAG:-latest}

cd "${TF_DIR}"

# Provide required vars even for destroy (not used but avoids prompts)
DATABASE_URL="postgresql+psycopg2://appuser:${DB_PASSWORD}@placeholder:5432/gitodyssey"

terraform destroy -auto-approve \
  -var "project_name=${PROJECT_NAME}" \
  -var "environment=prod" \
  -var "aws_region=${AWS_REGION}" \
  -var "db_password=${DB_PASSWORD}" \
  -var "docker_image_tag=${DOCKER_IMAGE_TAG}" \
  -var "database_url_value=${DATABASE_URL}"

echo "Destroy complete."


