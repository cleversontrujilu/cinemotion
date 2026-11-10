terraform {
  required_version = ">= 1.10"

  # State local (terraform.tfstate, ignorado pelo git). Ele guarda os segredos lidos do
  # SSM e os JWT_SECRET gerados: não versionar nem compartilhar.

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "opentofu"
    }
  }
}
