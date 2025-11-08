output "alb_dns_name" {
  description = "Public ALB DNS name for the backend API"
  value       = module.load_balancer.alb_dns_name
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name for the frontend"
  value       = module.frontend.domain_name
}

output "database_endpoint" {
  description = "Endpoint of the RDS PostgreSQL instance"
  value       = module.database.db_instance_endpoint
}

output "backend_repository_url" {
  description = "ECR repository URL for deploying the backend"
  value       = module.backend_service.repository_url
}

output "ecr_repository_url" {
  description = "URL of the ECR repository for the backend"
  value       = module.backend_service.ecr_repository_url
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.database.db_instance_address
}

output "rds_db_name" {
  description = "RDS database name"
  value       = module.database.db_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.backend_service.cluster_name
}

output "s3_website_bucket" {
  description = "S3 bucket name hosting the frontend"
  value       = module.frontend.bucket_name
}

output "frontend_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.frontend.distribution_id
}

output "db_connection_string" {
  description = "Database connection string"
  value       = module.database.connection_string
}
