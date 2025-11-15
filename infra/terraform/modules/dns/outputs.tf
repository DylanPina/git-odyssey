output "domain_record_fqdn" {
  description = "FQDN of the subdomain Route53 record"
  value       = var.domain_name != "" ? aws_route53_record.domain[0].fqdn : ""
}

output "apex_record_fqdn" {
  description = "FQDN of the apex Route53 record"
  value       = var.apex_domain_name != "" ? aws_route53_record.apex[0].fqdn : ""
}

