variable "name_prefix" {
  description = "Prefix used when naming frontend resources"
  type        = string
}

variable "aliases" {
  description = "Optional CloudFront aliases"
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "Optional ACM certificate ARN for the CloudFront distribution"
  type        = string
  default     = ""
}

variable "force_destroy" {
  description = "Whether to allow Terraform to destroy the S3 bucket even if it contains objects"
  type        = bool
  default     = false
}

variable "index_document" {
  description = "Index document served by the S3 website"
  type        = string
  default     = "index.html"
}

variable "error_document" {
  description = "Error document served by the S3 website"
  type        = string
  default     = "index.html"
}

variable "is_ipv6_enabled" {
  description = "Whether IPv6 is enabled for the CloudFront distribution"
  type        = bool
  default     = true
}

variable "price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"
}

