locals {
  config = yamldecode(file("config.yaml"))

  # Project
  project_name            = local.config.project_name
  domain_name             = local.config.domain_name
  apex_domain_name        = try(local.config.apex_domain_name, "")
  additional_domain_names = tolist(try(local.config.alternate_domain_names, []))
  hosted_zone_name        = local.config.hosted_zone_name
  certificate_domain_name = local.config.certificate_domain_name
  environment             = local.config.environment
  aws_region              = local.config.aws_region

  # Network
  vpc_cidr            = local.config.vpc_cidr
  public_subnet_cidrs = local.config.public_subnet_cidrs

  # Database
  db_name              = local.config.db_name
  db_instance_class    = local.config.db_instance_class
  db_allocated_storage = local.config.db_allocated_storage

  # Backend
  backend_container_port = local.config.backend_container_port
  backend_cpu            = local.config.backend_cpu
  backend_memory         = local.config.backend_memory
  backend_desired_count  = local.config.backend_desired_count
  docker_image_tag       = local.config.docker_image_tag
  github_app_name        = local.config.github_app_name
}
