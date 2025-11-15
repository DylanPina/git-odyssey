resource "aws_route53_record" "domain" {
  count   = var.domain_name == "" ? 0 : 1
  zone_id = var.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.target_domain_name
    zone_id                = var.target_zone_id
    evaluate_target_health = var.evaluate_target_health
  }
}

resource "aws_route53_record" "apex" {
  count   = var.apex_domain_name == "" ? 0 : 1
  zone_id = var.zone_id
  name    = var.apex_domain_name
  type    = "A"

  alias {
    name                   = var.target_domain_name
    zone_id                = var.target_zone_id
    evaluate_target_health = var.evaluate_target_health
  }
}

