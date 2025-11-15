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
  description = "S3 bucket name storing the frontend build artifacts"
  value       = module.frontend.bucket_name
}

output "frontend_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.frontend.distribution_id
}

output "frontend_distribution_hosted_zone_id" {
  description = "Hosted zone ID for aliasing the CloudFront distribution"
  value       = module.frontend.distribution_hosted_zone_id
}

output "frontend_distribution_arn" {
  description = "ARN of the CloudFront distribution"
  value       = module.frontend.distribution_arn
}

output "frontend_domain" {
  description = "Canonical domain serving the frontend"
  value       = local.domain_name != "" ? local.domain_name : module.frontend.domain_name
}

output "frontend_domain_aliases" {
  description = "All hostnames mapped to the CloudFront distribution"
  value       = local.cloudfront_aliases
}

output "frontend_route53_record" {
  description = "Route53 record serving the frontend"
  value       = module.dns.domain_record_fqdn
}

output "frontend_apex_route53_record" {
  description = "Route53 apex record pointing at the frontend"
  value       = module.dns.apex_record_fqdn
}

output "db_connection_string" {
  description = "Database connection string"
  value       = module.database.connection_string
}
