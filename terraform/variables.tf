variable "principal_account_ids" {
  description = "Map of principal account ids"
  type        = map(string)
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
