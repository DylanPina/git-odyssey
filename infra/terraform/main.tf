locals {
  name_prefix        = "${local.project_name}-${local.environment}"
  cloudfront_aliases = local.domain_name == "" ? [] : [local.domain_name]
}

module "network" {
  source = "./modules/network"

  name_prefix          = local.name_prefix
  vpc_cidr             = local.vpc_cidr
  public_subnet_cidrs  = local.public_subnet_cidrs
  private_subnet_cidrs = local.private_subnet_cidrs
}

module "security" {
  source = "./modules/security"

  name_prefix            = local.name_prefix
  vpc_id                 = module.network.vpc_id
  backend_container_port = local.backend_container_port
}

module "load_balancer" {
  source = "./modules/load_balancer"

  name_prefix           = local.name_prefix
  alb_security_group_id = module.security.alb_security_group_id
  public_subnet_ids     = module.network.public_subnet_ids
  vpc_id                = module.network.vpc_id
  target_group_port     = local.backend_container_port
}

module "database" {
  source = "./modules/database"

  name_prefix          = local.name_prefix
  private_subnet_ids   = module.network.private_subnet_ids
  db_security_group_id = module.security.rds_security_group_id
  db_instance_class    = local.db_instance_class
  db_username          = var.db_username
  db_password          = var.db_password
  db_name              = local.db_name
  db_allocated_storage = local.db_allocated_storage
}

module "frontend" {
  source = "./modules/frontend"

  name_prefix         = local.name_prefix
  aliases             = local.cloudfront_aliases
  acm_certificate_arn = local.acm_certificate_arn
}


module "backend_service" {
  source = "./modules/backend_service"

  name_prefix            = local.name_prefix
  docker_image_tag       = local.docker_image_tag
  backend_container_port = local.backend_container_port
  backend_cpu            = local.backend_cpu
  backend_memory         = local.backend_memory
  backend_desired_count  = local.backend_desired_count
  db_connection_string   = module.database.connection_string
  frontend_url           = module.frontend.domain_name
  private_subnet_ids     = module.network.private_subnet_ids
  ecs_security_group_id  = module.security.ecs_tasks_security_group_id
  target_group_arn       = module.load_balancer.target_group_arn
  aws_region             = local.aws_region
}


