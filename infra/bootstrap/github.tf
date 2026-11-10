# Deploy pelo GitHub Actions sem chave de acesso guardada no GitHub: o workflow troca o
# token OIDC do GitHub por credenciais temporárias deste role. Só as tags (x.y.z, criadas
# pelo gfrf/gfhf do git flow) podem assumir o role. PRs e pushes de branch não acessam a AWS.

variable "github_repo" {
  description = <<-EOT
    Repositório autorizado a fazer deploy, como aparece no `sub` do token OIDC do GitHub:
    dono e repositório com os ids numéricos (<dono>@<id>/<repo>@<id>). Os ids são
    imutáveis: um repositório recriado com o mesmo nome não herda o acesso.
  EOT
  type        = string
  default     = "cleversontrujilu@26672570/cinemotion@1451991967"
}

data "aws_caller_identity" "current" {}

locals {
  account = data.aws_caller_identity.current.account_id
  region  = var.region
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "deploy_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:ref:refs/tags/*"]
    }
  }

  # Administradores da conta (SSO) podem assumir o role para testar as permissões dele
  # da própria máquina. Não amplia nada: eles já podem tudo.
  statement {
    actions = ["sts:AssumeRole", "sts:TagSession", "sts:SetSourceIdentity"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${local.account}:root"]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:PrincipalArn"
      values   = ["arn:aws:iam::${local.account}:role/aws-reserved/sso.amazonaws.com/*AWSReservedSSO_AdministratorAccess_*"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "cinemotion-github-deploy"
  description          = "Deploy do Cinemotion pelo GitHub Actions (tags x.y.z)"
  assume_role_policy   = data.aws_iam_policy_document.deploy_trust.json
  max_session_duration = 3600
}

# O que o `tofu apply` do infra/ e as migrations precisam, restrito aos recursos do
# projeto onde o serviço permite filtrar por nome. API Gateway e CloudFront usam ids
# aleatórios, então ficam liberados na conta.
data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "State"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
  }
  statement {
    sid       = "StateObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/infra/*"]
  }

  statement {
    sid     = "SiteBuckets"
    actions = ["s3:*"]
    resources = [
      "arn:aws:s3:::cinemotion-customer-web-*",
      "arn:aws:s3:::cinemotion-admin-web-*",
    ]
  }

  statement {
    sid       = "Parameters"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:aws:ssm:${local.region}:${local.account}:parameter/cinemotion/*"]
  }

  statement {
    sid       = "Lambda"
    actions   = ["lambda:*"]
    resources = ["arn:aws:lambda:${local.region}:${local.account}:function:cinemotion-*"]
  }

  statement {
    sid = "LambdaRoles"
    actions = [
      "iam:GetRole", "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole", "iam:UpdateAssumeRolePolicy",
      "iam:TagRole", "iam:UntagRole", "iam:ListRoleTags",
      "iam:GetRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole",
    ]
    resources = ["arn:aws:iam::${local.account}:role/cinemotion-*-lambda"]
  }
  statement {
    sid       = "PassLambdaRoles"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${local.account}:role/cinemotion-*-lambda"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  statement {
    sid     = "LogGroups"
    actions = ["logs:*"]
    resources = [
      "arn:aws:logs:${local.region}:${local.account}:log-group:/aws/lambda/cinemotion-*",
      "arn:aws:logs:${local.region}:${local.account}:log-group:/aws/apigateway/cinemotion-*",
    ]
  }
  statement {
    sid = "LogsAccount"
    actions = [
      "logs:DescribeLogGroups",
      # Access log da HTTP API: o API Gateway cria a entrega em nome de quem configura.
      "logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery", "logs:DeleteLogDelivery",
      "logs:ListLogDeliveries", "logs:PutResourcePolicy", "logs:DescribeResourcePolicies",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "HttpApis"
    actions   = ["apigateway:*"]
    resources = ["arn:aws:apigateway:${local.region}::/apis", "arn:aws:apigateway:${local.region}::/apis/*", "arn:aws:apigateway:${local.region}::/tags/*"]
  }

  statement {
    sid       = "CloudFront"
    actions   = ["cloudfront:*"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}
