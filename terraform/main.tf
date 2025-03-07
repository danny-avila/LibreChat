data "aws_caller_identity" "current" {}
data "aws_region" "current" {}


module "label" {
  source  = "cloudposse/label/null"
  version = "0.25.0"

  tenant    = "apro"
  namespace = "genai"
  stage     = "shared"
}

locals {
  principals_readonly_access_all = var.principals_readonly_access_all
  principals                     = var.principals_readonly_access_all
}

## TODO: Allow Organization Access: https://aws.amazon.com/blogs/containers/sharing-amazon-ecr-repositories-with-multiple-accounts-using-aws-organizations/
module "ecr" {
  source                     = "cloudposse/ecr/aws"
  version                    = "0.39.0"
  for_each                   = toset(var.ecr_repository_names)
  principals_readonly_access = local.principals_readonly_access_all
  principals_push_access     = var.principals_push_access_all
  image_names                = [each.value]
  image_tag_mutability       = "MUTABLE"
  context                    = module.label.context
}

data "aws_iam_policy_document" "cache_bucket" {
  statement {
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.genai.arn]
    }
    actions   = local.s3.cache.actions
    resources = local.s3.cache.resources
  }
}

data "aws_iam_policy_document" "librechat_config" {
  statement {
    sid    = "Statement1"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = local.principals
    }

    actions   = local.s3.config.actions
    resources = local.s3.config.resources
  }
}

module "config_bucket" {
  source  = "cloudposse/s3-bucket/aws"
  version = "4.10.0"
  name    = "config"

  s3_object_ownership     = "BucketOwnerEnforced"
  source_policy_documents = [data.aws_iam_policy_document.librechat_config.json]

  versioning_enabled = true
  context            = module.label.context
}


module "cache_bucket" {
  source  = "cloudposse/s3-bucket/aws"
  version = "4.10.0"
  name    = "github-cache"

  s3_object_ownership     = "BucketOwnerEnforced"
  source_policy_documents = [data.aws_iam_policy_document.cache_bucket.json]

  versioning_enabled = false
  context            = module.label.context
}
