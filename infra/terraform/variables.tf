variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "git-odyssey"
}

variable "environment" {
  description = "Deployment environment (e.g., dev, prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDRs"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "db_username" {
  description = "RDS master username"
  type        = string
  default     = "appuser"
}

variable "db_password" {
  description = "RDS master password (use TF_VAR_db_password)"
  type        = string
  sensitive   = true
}

variable "db_name" {
  description = "RDS database name"
  type        = string
  default     = "gitodyssey"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS storage (GB)"
  type        = number
  default     = 20
}

variable "backend_container_port" {
  description = "Container port exposed by the backend"
  type        = number
  default     = 8000
}

variable "backend_cpu" {
  description = "Fargate CPU units"
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "Fargate memory (MB)"
  type        = number
  default     = 1024
}

variable "backend_desired_count" {
  description = "Desired task count for the backend service"
  type        = number
  default     = 1
}

variable "docker_image_tag" {
  description = "Tag to deploy for the backend image in ECR"
  type        = string
  default     = "latest"
}

variable "database_url_value" {
  description = "DATABASE_URL to inject into the task (prefer SSM/Secrets in prod)"
  type        = string
  sensitive   = true
}

variable "allowed_cors_origins" {
  description = "Comma-separated list of allowed CORS origins for backend"
  type        = string
  default     = "http://localhost:5173"
}

variable "domain_name" {
  description = "Optional domain name for CloudFront (leave empty to skip)"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "Optional ACM certificate ARN for CloudFront (use us-east-1 cert)"
  type        = string
  default     = ""
}



