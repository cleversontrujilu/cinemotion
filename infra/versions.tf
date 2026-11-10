terraform {
  required_version = ">= 1.10"

  # State no S3 (bucket criado por infra/bootstrap), com lock nativo por arquivo .tflock.
  # Ele guarda os segredos lidos do SSM e os JWT_SECRET gerados: o bucket é privado,
  # criptografado e versionado, e só a máquina do dono e o role do GitHub Actions o leem.
  backend "s3" {
    bucket       = "cinemotion-tfstate"
    key          = "infra/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }

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
