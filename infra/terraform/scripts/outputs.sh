#!/usr/bin/env bash
set -euo pipefail

# Prints key Terraform outputs.

ROOT_DIR="/Users/dillonpina/Documents/code/git-odyssey"
TF_DIR="${ROOT_DIR}/infra/terraform"

cd "${TF_DIR}"

echo "ECR:        $(terraform output -raw ecr_repository_url)"
echo "API (ALB):  http://$(terraform output -raw alb_dns_name)"
echo "RDS:        $(terraform output -raw rds_endpoint)"
echo "S3 Bucket:  $(terraform output -raw s3_website_bucket)"
echo "CloudFront: https://$(terraform output -raw cloudfront_domain_name)"


