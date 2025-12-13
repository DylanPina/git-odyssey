variable "name_prefix" {
  description = "Prefix used when naming database resources"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for the database subnet group"
  type        = list(string)
}

variable "db_security_group_id" {
  description = "Security group ID to associate with the database"
  type        = string
}

variable "db_instance_class" {
  description = "Instance class for the RDS instance"
  type        = string
}

variable "db_username" {
  description = "Master username for the database"
  type        = string
}

variable "db_password" {
  description = "Master password for the database"
  type        = string
}

variable "db_name" {
  description = "Database name to create"
  type        = string
}

variable "db_allocated_storage" {
  description = "Amount of storage (in GB) to allocate"
  type        = number
}

variable "engine_version" {
  description = "PostgreSQL engine version to use"
  type        = string
  default     = "16.8"
}

variable "skip_final_snapshot" {
  description = "Whether to skip the final snapshot when the instance is deleted"
  type        = bool
  default     = true
}

variable "apply_immediately" {
  description = "Whether modifications should be applied immediately"
  type        = bool
  default     = true
}

variable "backup_retention_period" {
  description = "Number of days to retain backups"
  type        = number
  default     = 7
}

variable "max_allocated_storage" {
  description = "Maximum storage (in GB) that RDS can auto-scale to"
  type        = number
  default     = 100
}

