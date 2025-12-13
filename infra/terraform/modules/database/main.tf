resource "aws_db_subnet_group" "this" {
  name        = "${var.name_prefix}-db-subnets"
  description = "Subnets for the ${var.name_prefix} database"
  subnet_ids  = var.subnet_ids

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "this" {
  identifier                 = "${var.name_prefix}-db"
  engine                     = "postgres"
  engine_version             = var.engine_version
  instance_class             = var.db_instance_class
  username                   = var.db_username
  password                   = var.db_password
  db_name                    = var.db_name
  allocated_storage          = var.db_allocated_storage
  storage_encrypted          = true
  skip_final_snapshot        = var.skip_final_snapshot
  apply_immediately          = var.apply_immediately
  deletion_protection        = false
  vpc_security_group_ids     = [var.db_security_group_id]
  db_subnet_group_name       = aws_db_subnet_group.this.name
  publicly_accessible        = true
  auto_minor_version_upgrade = true

  backup_retention_period = var.backup_retention_period
  max_allocated_storage   = var.max_allocated_storage
}

