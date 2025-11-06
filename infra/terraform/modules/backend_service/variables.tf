variable "name_prefix" {
  description = "Prefix used when naming backend service resources"
  type        = string
}

variable "docker_image_tag" {
  description = "Docker image tag to deploy"
  type        = string
}

variable "backend_container_port" {
  description = "Port exposed by the backend container"
  type        = number
}

variable "backend_cpu" {
  description = "CPU units to allocate to the backend task"
  type        = number
}

variable "backend_memory" {
  description = "Memory (MB) to allocate to the backend task"
  type        = number
}

variable "backend_desired_count" {
  description = "Desired number of running tasks"
  type        = number
}

variable "db_connection_string" {
  description = "Database connection string"
  type        = string
  sensitive   = true
}

variable "frontend_url" {
  description = "Public URL for the frontend application"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnets for the ECS service"
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "Security group ID for the ECS tasks"
  type        = string
}

variable "target_group_arn" {
  description = "Target group ARN for attaching the ECS service"
  type        = string
}

variable "aws_region" {
  description = "AWS region used for CloudWatch Logs"
  type        = string
}

variable "log_retention_in_days" {
  description = "Retention period for CloudWatch Logs"
  type        = number
  default     = 14
}

