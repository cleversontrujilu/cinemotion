# Duas APIs (cliente e admin) a partir de um único artefato, cada uma com sua Lambda,
# sua HTTP API, seu role no Postgres e seu segredo JWT; e dois sites estáticos, cada um
# encaminhando /api/* para a sua API.
#
# Antes do apply: `npm run build:lambda -w api` e `npm run build:web` (ver infra/README.md).

locals {
  apis = toset(["customer", "admin"])
}

# Criadas fora do repositório (aws ssm put-parameter --type SecureString), com o role
# de cada API: postgres://cinemotion_customer:<senha>@<rds>:5432/<banco>?sslmode=verify-full
data "aws_ssm_parameter" "database_url" {
  for_each        = local.apis
  name            = "${var.ssm_prefix}/${each.key}/database-url"
  with_decryption = true
}

# Um segredo por API: um token de cliente não vale na API do admin.
resource "random_password" "jwt_secret" {
  for_each = local.apis
  length   = 64
  special  = false
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.root}/../api/dist/lambda"
  output_path = "${path.root}/.build/lambda.zip"
}

module "api" {
  source   = "./modules/api_lambda"
  for_each = local.apis

  name                 = "${var.project}-${each.key}"
  handler              = "${each.key}.handler"
  package_path         = data.archive_file.lambda.output_path
  package_hash         = data.archive_file.lambda.output_base64sha256
  reserved_concurrency = var.reserved_concurrency[each.key]
  throttle_rate_limit  = var.throttle[each.key].rate
  throttle_burst_limit = var.throttle[each.key].burst
  log_retention_days   = var.log_retention_days

  environment = {
    DATABASE_URL    = data.aws_ssm_parameter.database_url[each.key].value
    JWT_SECRET      = random_password.jwt_secret[each.key].result
    JWT_TTL_SECONDS = tostring(var.jwt_ttl_seconds)
    DB_POOL_MAX     = "1"
    APP_TIMEZONE    = var.timezone
  }
}

module "site" {
  source   = "./modules/static_site"
  for_each = local.apis

  name        = "${var.project}-${each.key}-web"
  source_dir  = "${path.root}/../web/${each.key}/.output/public"
  api_domain  = module.api[each.key].api_domain
  price_class = var.price_class
}
