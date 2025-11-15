data "aws_availability_zones" "available" {}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.8.1"

  name = var.name_prefix
  cidr = var.vpc_cidr

  azs            = slice(data.aws_availability_zones.available.names, 0, length(var.public_subnet_cidrs))
  public_subnets = var.public_subnet_cidrs

  enable_dns_hostnames = true
  enable_dns_support   = true
}
