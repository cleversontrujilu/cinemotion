# Recursos que precisam existir antes do `infra/` principal: o bucket do state remoto.
# Aplicado uma vez, da máquina local, com state local (infra/bootstrap/terraform.tfstate,
# ignorado pelo git). Esse state não tem segredos; se for perdido, basta importar o bucket.

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "state_bucket" {
  description = "Nome do bucket do state (global na AWS)."
  type        = string
  default     = "cinemotion-tfstate"
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "cinemotion"
      ManagedBy = "opentofu"
    }
  }
}

# O state do infra/ guarda as DATABASE_URL e os JWT_SECRET: bucket privado, criptografado,
# versionado (para voltar a um state anterior) e acessível só por TLS.
resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Versões antigas do state se acumulam a cada apply; 90 dias bastam para voltar atrás.
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expira-versoes-antigas"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }

  depends_on = [aws_s3_bucket_versioning.state]
}

data "aws_iam_policy_document" "state" {
  statement {
    sid       = "SomenteTLS"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket     = aws_s3_bucket.state.id
  policy     = data.aws_iam_policy_document.state.json
  depends_on = [aws_s3_bucket_public_access_block.state]
}

output "state_bucket" {
  value = aws_s3_bucket.state.id
}
