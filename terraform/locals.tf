locals {
  s3 = {
    config = {
      actions = [
        "s3:Get*",
        "s3:List*"
      ]
      resources = [
        module.config_bucket.bucket_arn,
        "${module.config_bucket.bucket_arn}/*"
      ]
    }
    cache = {
      actions = [
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:GetEncryptionConfiguration",
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListMultipartUploadParts",
        "s3:AbortMultipartUpload"
      ]
      resources = [
        module.cache_bucket.bucket_arn,
        "${module.cache_bucket.bucket_arn}/*"
      ]
    }
  }
}
