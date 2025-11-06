variable "name_prefix" {
  description = "Prefix used when naming security groups"
  type        = string
}

variable "vpc_id" {
  description = "The VPC identifier where the security groups will be created"
  type        = string
}

variable "backend_container_port" {
  description = "Container port exposed by the backend service"
  type        = number
}

