locals {
  ecr_repository_url = "533267242259.dkr.ecr.eu-west-1.amazonaws.com"
  ecr_repositories = [
    "arn:aws:ecr:eu-west-1:533267242259:repository/genai/api",
    "arn:aws:ecr:eu-west-1:533267242259:repository/genai/frontend",
  ]
  s3_buckets = [
    "arn:aws:s3:::genai-shared-config/*",
    "arn:aws:s3:::genai-shared-config"
  ]
  github_oidc_url = data.aws_iam_openid_connect_provider.github.url
  github_oidc_arn = data.aws_iam_openid_connect_provider.github.arn
}

data "tls_certificate" "github" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

# Configuration for shared genai role
resource "aws_iam_role" "genai" {
  name                 = "github-oidc-genai"
  description          = "genai github oidc role"
  max_session_duration = var.max_session_duration
  assume_role_policy   = join("", data.aws_iam_policy_document.genai_assume.*.json)
  tags                 = var.tags

  inline_policy {
    name   = "genai-ecr"
    policy = data.aws_iam_policy_document.genai_push_and_pull.json
  }

  inline_policy {
    name   = "genai-s3"
    policy = data.aws_iam_policy_document.genai_s3.json
  }
}

data "aws_iam_policy_document" "genai_assume" {

  dynamic "statement" {
    for_each = [{ url : local.github_oidc_url, arn : local.github_oidc_arn }]

    content {
      actions = ["sts:AssumeRoleWithWebIdentity"]
      effect  = "Allow"

      condition {
        test     = "StringLike"
        values   = ["repo:aproorg/*"]
        variable = "${statement.value.url}:${var.match_field}"
      }

      principals {
        identifiers = [statement.value.arn]
        type        = "Federated"
      }
    }
  }
}

data "aws_iam_policy_document" "genai_s3" {

  statement {
    sid    = "S3Write"
    effect = "Allow"

    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:ListBucket"
    ]

    resources = local.s3_buckets
  }
}

data "aws_iam_policy_document" "genai_push_and_pull" {

  statement {
    sid    = "ECRLogin"
    effect = "Allow"

    actions = [
      "ecr:GetAuthorizationToken",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "ElasticContainerRegistryOnlyPull"
    effect = "Allow"

    actions = [
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:BatchCheckLayerAvailability",
    ]

    resources = local.ecr_repositories
  }

  statement {
    sid    = "ElasticContainerRegistryPushAndPull"
    effect = "Allow"

    actions = [
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:BatchCheckLayerAvailability",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
    ]

    resources = local.ecr_repositories
  }
}
