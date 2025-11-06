output "repository_url" {
  description = "ECR repository URL for the backend service"
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_repository_url" {
  description = "Alias of the ECR repository URL for convenience"
  value       = aws_ecr_repository.backend.repository_url
}

output "cluster_id" {
  description = "ECS cluster ID"
  value       = aws_ecs_cluster.this.id
}

output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.this.name
}

output "service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.backend.name
}

output "task_definition_arn" {
  description = "ARN of the ECS task definition"
  value       = aws_ecs_task_definition.backend.arn
}

