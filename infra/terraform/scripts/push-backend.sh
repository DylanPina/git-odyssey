#!/usr/bin/env bash
set -euo pipefail

# Builds and pushes the backend Docker image to ECR.
# Usage:
#   AWS_REGION=us-east-1 DOCKER_IMAGE_TAG=latest ./build-push-backend.sh

PROJECT_NAME=git-odyssey
AWS_REGION=us-east-1
DOCKER_IMAGE_TAG=${DOCKER_IMAGE_TAG:-latest}

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="${SCRIPT_DIR}/.."
BACKEND_DIR="${SCRIPT_DIR}/../../../backend"

# Read ECR repo URL from Terraform outputs in the Terraform root
ECR_URL=$(terraform -chdir="${TF_DIR}" output -raw ecr_repository_url 2>/dev/null || true)
if [ -z "${ECR_URL}" ]; then
  echo "ECR repository URL not found. Have you applied the Terraform stack yet?" >&2
  echo "Run: ${SCRIPT_DIR}/apply.sh (then re-run this script)" >&2
  exit 1
fi

aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_URL}"

# Ensure we have a buildx builder (required for cross-platform)
if ! docker buildx inspect git-odyssey-builder >/dev/null 2>&1; then
  docker buildx create --name git-odyssey-builder --use >/dev/null
else
  docker buildx use git-odyssey-builder >/dev/null
fi

# Build and push amd64 image so Fargate can pull it
docker buildx build \
  --platform linux/amd64 \
  --tag "${ECR_URL}:${DOCKER_IMAGE_TAG}" \
  --file "${BACKEND_DIR}/Dockerfile.app" \
  --push \
  "${BACKEND_DIR}"

echo "Pushed image: ${ECR_URL}:${DOCKER_IMAGE_TAG}"


