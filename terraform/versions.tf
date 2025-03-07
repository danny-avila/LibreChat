terraform {
  backend "s3" {
    region  = "eu-west-1"
    bucket  = "shared-apro-accelerator-terraform-state"
    key     = "genai/ecr_repositories/terraform.tfstate"
    encrypt = true
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.90.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "4.0.6"
    }
  }
  required_version = ">= 1.11.0"
}

provider "aws" {}
