locals {
  name_prefix = "${local.project_name}-${local.environment}"
  cloudfront_aliases = distinct(compact(concat(
    local.domain_name == "" ? [] : [local.domain_name],
    local.apex_domain_name == "" ? [] : [local.apex_domain_name],
    local.additional_domain_names
  )))
  certificate_sans = [for alias in local.cloudfront_aliases : alias if alias != local.certificate_domain_name]
}

resource "aws_acm_certificate" "primary" {
  domain_name               = local.certificate_domain_name
  validation_method         = "DNS"
  subject_alternative_names = local.certificate_sans

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "certificate_validation" {
  for_each = {
    for dvo in aws_acm_certificate.primary.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = data.aws_route53_zone.primary.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "primary" {
  certificate_arn         = aws_acm_certificate.primary.arn
  validation_record_fqdns = [for record in aws_route53_record.certificate_validation : record.fqdn]
}

data "aws_route53_zone" "primary" {
  name         = "${local.hosted_zone_name}."
  private_zone = false
}

module "network" {
  source = "./modules/network"

  name_prefix         = local.name_prefix
  vpc_cidr            = local.vpc_cidr
  public_subnet_cidrs = local.public_subnet_cidrs
}

module "security" {
  source = "./modules/security"

  name_prefix            = local.name_prefix
  vpc_id                 = module.network.vpc_id
  backend_container_port = local.backend_container_port
}

module "load_balancer" {
  source = "./modules/load_balancer"

  name_prefix              = local.name_prefix
  alb_security_group_id    = module.security.alb_security_group_id
  public_subnet_ids        = module.network.public_subnet_ids
  vpc_id                   = module.network.vpc_id
  target_group_port        = local.backend_container_port
  listener_certificate_arn = aws_acm_certificate_validation.primary.certificate_arn
}

module "database" {
  source = "./modules/database"

  name_prefix          = local.name_prefix
  subnet_ids           = module.network.public_subnet_ids
  db_security_group_id = module.security.rds_security_group_id
  db_instance_class    = local.db_instance_class
  db_username          = var.db_username
  db_password          = var.db_password
  db_name              = local.db_name
  db_allocated_storage = local.db_allocated_storage
}

module "frontend" {
  source = "./modules/frontend"

  name_prefix            = local.name_prefix
  aliases                = local.cloudfront_aliases
  acm_certificate_arn    = aws_acm_certificate_validation.primary.certificate_arn
  api_origin_domain_name = module.load_balancer.alb_dns_name
}


module "backend_service" {
  source = "./modules/backend_service"

  name_prefix              = local.name_prefix
  docker_image_tag         = local.docker_image_tag
  backend_container_port   = local.backend_container_port
  backend_cpu              = local.backend_cpu
  backend_memory           = local.backend_memory
  backend_desired_count    = local.backend_desired_count
  db_connection_string     = module.database.connection_string
  frontend_url             = local.domain_name != "" ? "https://${local.domain_name}" : "https://${module.frontend.domain_name}"
  public_subnet_ids        = module.network.public_subnet_ids
  ecs_security_group_id    = module.security.ecs_tasks_security_group_id
  target_group_arn         = module.load_balancer.target_group_arn
  aws_region               = local.aws_region
  github_app_name          = local.github_app_name
  enable_public_api_access = true
}

module "dns" {
  source = "./modules/dns"

  zone_id            = data.aws_route53_zone.primary.zone_id
  domain_name        = local.domain_name
  apex_domain_name   = local.apex_domain_name
  target_domain_name = module.frontend.domain_name
  target_zone_id     = module.frontend.distribution_hosted_zone_id
}
