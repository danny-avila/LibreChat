output "s3_bucket_id" {
  value       = module.config_bucket.bucket_id
  description = "ID of the S3 bucket for ALB logs"
}

