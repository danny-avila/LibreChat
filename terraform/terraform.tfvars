ecr_repository_names = [
  "genai/api",
  "genai/frontend",
]
principals_readonly_access_all = [
  "arn:aws:iam::746669190533:root", # sandbox-snorri-hjorvar
  "arn:aws:iam::515966504419:root", # APRO-datalake-sandbox
  "arn:aws:iam::183631334210:root", # APRO-datalake
  "arn:aws:iam::741448944625:root", # BYKO-Dev_GenAI
]

# TODO: We need to add a github role here for our pipelines.
principals_push_access_all = []

