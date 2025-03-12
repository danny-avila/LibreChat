ecr_repository_names = [
  "genai/api",
  "genai/frontend",
]

## Key = bucket prefix in s3
## Value = AWS account principal
principal_account_ids = {
  "snorri"                = "746669190533",
  "apro-datalake-sandbox" = "515966504419",
  "apro"                  = "183631334210",
  "byko"                  = "741448944625"
}

# principals_readonly_access_all = {
#   "snorri"                = "arn:aws:iam::746669190533:root",
#   "apro-datalake-sandbox" = "arn:aws:iam::515966504419:root",
#   "apro"                  = "arn:aws:iam::183631334210:root",
#   "byko"                  = "arn:aws:iam::741448944625:root"
# }
# TODO: We need to add a github role here for our pipelines.
principals_push_access_all = []
