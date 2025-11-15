variable "zone_id" {
  description = "ID of the hosted zone where DNS records will be created"
  type        = string
}

variable "domain_name" {
  description = "Optional subdomain record pointing to the frontend distribution"
  type        = string
  default     = ""
}

variable "apex_domain_name" {
  description = "Optional apex domain record pointing to the frontend distribution"
  type        = string
  default     = ""
}

variable "target_domain_name" {
  description = "CloudFront distribution domain name that Route53 aliases will target"
  type        = string
}

variable "target_zone_id" {
  description = "Hosted zone ID for the CloudFront distribution alias target"
  type        = string
}

variable "evaluate_target_health" {
  description = "Whether Route53 should evaluate the health of the alias target"
  type        = bool
  default     = false
}

