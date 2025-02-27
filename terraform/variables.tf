variable "region" {
  description = "The AWS region"
  type        = string
  default     = "eu-west-1"
}

variable "principals_readonly_access_all" {
  description = "The list of principals that have readonly access to the ECR repositories"
  type        = list(string)
  default     = []
}

variable "principals_push_access_all" {
  description = "The list of principals that have push access to the ECR repositories"
  type        = list(string)
  default     = []
}

variable "ecr_repository_names" {
  description = "The list of ECR repository names"
  type        = list(string)
  default     = []
}

variable "account_ids" {
  description = "The list of account IDs"
  type        = list(string)
  default     = []

}

variable "github_repositories" {
  description = "The list of GitHub repositories"
  type        = list(string)
  default     = []
}

variable "max_session_duration" {
  description = "The maximum session duration"
  type        = number
  default     = 3600
}

variable "tags" {
  description = "The tags for the IAM role"
  type        = map(string)
  default     = {}
}

variable "match_field" {
  description = "The match field"
  type        = string
  default     = "sub"
}
