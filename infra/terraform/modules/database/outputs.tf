output "db_instance_endpoint" {
  description = "Endpoint of the PostgreSQL instance"
  value       = aws_db_instance.this.endpoint
}

output "db_instance_address" {
  description = "Address of the PostgreSQL instance"
  value       = aws_db_instance.this.address
}

output "db_instance_identifier" {
  description = "Identifier of the PostgreSQL instance"
  value       = aws_db_instance.this.id
}

output "db_instance_arn" {
  description = "ARN of the PostgreSQL instance"
  value       = aws_db_instance.this.arn
}

output "db_name" {
  description = "Database name configured for the instance"
  value       = aws_db_instance.this.db_name
}

output "connection_string" {
  description = "PostgreSQL connection string including credentials"
  value       = "postgresql+psycopg2://${var.db_username}:${urlencode(var.db_password)}@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${var.db_name}"
  sensitive   = true
}

