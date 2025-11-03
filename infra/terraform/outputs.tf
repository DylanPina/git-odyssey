output "ecr_repository_url" {
  description = "URL of the ECR repository for the backend"
  value       = aws_ecr_repository.backend.repository_url
}

output "alb_dns_name" {
  description = "Public ALB DNS name for the backend API"
  value       = aws_lb.app_alb.dns_name
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.app_db.address
}

output "rds_db_name" {
  description = "RDS database name"
  value       = aws_db_instance.app_db.db_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.app_cluster.name
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name for the frontend"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "s3_website_bucket" {
  description = "S3 bucket name hosting the frontend"
  value       = aws_s3_bucket.frontend.bucket
}

output "frontend_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.frontend.id
}


