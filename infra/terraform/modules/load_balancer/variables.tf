variable "name_prefix" {
  description = "Prefix used when naming load balancer resources"
  type        = string
}

variable "alb_security_group_id" {
  description = "Security group ID attached to the ALB"
  type        = string
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs for the ALB"
  type        = list(string)
}

variable "vpc_id" {
  description = "VPC ID where the load balancer will operate"
  type        = string
}

variable "target_group_port" {
  description = "Port on which the target group forwards traffic"
  type        = number
}

variable "health_check_path" {
  description = "HTTP path used for target group health checks"
  type        = string
  default     = "/docs"
}

variable "health_check_matcher" {
  description = "HTTP codes that indicate a healthy response"
  type        = string
  default     = "200-399"
}

variable "health_check_healthy_threshold" {
  description = "Number of successive healthy checks before an unhealthy target is considered healthy"
  type        = number
  default     = 2
}

variable "health_check_unhealthy_threshold" {
  description = "Number of successive failed checks before a target is considered unhealthy"
  type        = number
  default     = 3
}

variable "health_check_interval" {
  description = "Approximate amount of time, in seconds, between health checks"
  type        = number
  default     = 30
}

variable "health_check_timeout" {
  description = "Approximate amount of time, in seconds, during which no response means a failed health check"
  type        = number
  default     = 5
}

