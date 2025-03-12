locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name
  ecr_repositories = [
    "arn:aws:ecr:eu-west-1:533267242259:repository/genai/api",
    "arn:aws:ecr:eu-west-1:533267242259:repository/genai/frontend",
  ]
  idp_host = "token.actions.githubusercontent.com"
  idp_url  = format("https://%s", local.idp_host)
}


data "aws_iam_openid_connect_provider" "github" {
  url = local.idp_url
}


# Configuration for shared genai role
resource "aws_iam_role" "genai" {
  tags                 = merge(module.label.tags, var.tags)
  name                 = "github-oidc-genai"
  description          = "genai github oidc role"
  max_session_duration = var.max_session_duration
  assume_role_policy   = data.aws_iam_policy_document.genai_assume.json
}

data "aws_iam_policy_document" "customer_deployer_access" {
  for_each = var.principal_account_ids
  statement {
    effect = "Allow"
    actions = [
      "sts:AssumeRole",
    ]
    resources = [
      format("arn:aws:iam::%s:role/ecs-deployment-role", each.value),
    ]
  }
}

data "aws_iam_policy_document" "genai_assume" {

  dynamic "statement" {
    for_each = [{ url : data.aws_iam_openid_connect_provider.github.url, arn : data.aws_iam_openid_connect_provider.github.arn }]

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
    sid       = "S3Write"
    effect    = "Allow"
    actions   = local.s3.config.actions
    resources = local.s3.config.resources
  }

  statement {
    sid       = "GithubCache"
    effect    = "Allow"
    actions   = local.s3.cache.actions
    resources = local.s3.cache.resources
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
resource "aws_iam_policy" "genai_ecr" {
  name        = "genai-ecr-policy"
  description = "Policy for GenAI ECR access"
  policy      = data.aws_iam_policy_document.genai_push_and_pull.json
  tags        = module.label.tags
}

resource "aws_iam_policy" "genai_s3" {
  name        = "genai-s3-policy"
  description = "Policy for GenAI S3 access"
  policy      = data.aws_iam_policy_document.genai_s3.json
  tags        = module.label.tags
}

resource "aws_iam_role_policy_attachment" "genai_ecr" {
  role       = aws_iam_role.genai.name
  policy_arn = aws_iam_policy.genai_ecr.arn
}

resource "aws_iam_role_policy_attachment" "genai_s3" {
  role       = aws_iam_role.genai.name
  policy_arn = aws_iam_policy.genai_s3.arn
}

resource "aws_iam_role_policy" "genai_customer_deployer" {
  for_each = data.aws_iam_policy_document.customer_deployer_access
  name     = format("genai-customer-deployer-%s", each.key)
  policy   = each.value.json
  role     = aws_iam_role.genai.name
}


