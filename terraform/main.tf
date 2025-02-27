provider "aws" {
  region = var.region
}

data "aws_availability_zones" "available" {}
data "aws_caller_identity" "current" {}

terraform {
  backend "s3" {
    region  = "eu-west-1"
    bucket  = "shared-apro-accelerator-terraform-state"
    key     = "genai/ecr_repositories/terraform.tfstate"
    encrypt = true
  }
}

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

data "aws_iam_policy_document" "librechat_config" {
  statement {
    sid    = "Statement1"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = local.principals
    }

    actions = [
      "s3:Get*",
      "s3:List*"
    ]

    resources = [
      "arn:aws:s3:::genai-shared-config/*",
      "arn:aws:s3:::genai-shared-config"
    ]
  }
}

module "config_bucket" {
  source  = "cloudposse/s3-bucket/aws"
  version = "4.2.0"
  name    = "config"

  s3_object_ownership     = "BucketOwnerEnforced"
  source_policy_documents = [data.aws_iam_policy_document.librechat_config.json]

  versioning_enabled = true
  context            = module.label.context
}
