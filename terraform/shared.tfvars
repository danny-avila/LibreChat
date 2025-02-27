ecr_repository_names = [
  "genai/api",
  "genai/frontend",
]
principals_readonly_access_all = [
  # sandbox-snorri-hjorvar
  "arn:aws:iam::746669190533:root",
  "arn:aws:iam::515966504419:root",
]

organizations = [
  "arn:aws:organizations::464622532012:organization/o-0b1b4b4b4b4b4b4b4",
]


github_repositories = ["repo:aproorg/*"]


# TODO: We need to add a github role here for our pipelines.
principals_push_access_all = []
region                     = "eu-west-1"
