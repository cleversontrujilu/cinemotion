variable "project" {
  description = "Prefixo dos recursos."
  type        = string
  default     = "cinemotion"
}

variable "region" {
  description = "Região da AWS. Deve ser a mesma do RDS, para não pagar tráfego entre regiões."
  type        = string
  default     = "us-east-1"
}

variable "ssm_prefix" {
  description = "Prefixo dos parâmetros SecureString com as DATABASE_URL (<prefixo>/customer/database-url e <prefixo>/admin/database-url)."
  type        = string
  default     = "/cinemotion"
}

variable "reserved_concurrency" {
  description = <<-EOT
    Teto de instâncias (= conexões no Postgres) por API; -1 = sem reserva. A conta atual
    tem limite de 10 execuções simultâneas, e a AWS exige manter 10 livres: não dá para
    reservar, e o próprio limite da conta segura as conexões (no máximo 10 nas duas APIs).
    Com a cota aumentada (Service Quotas, L-B99A9384), use { customer = 20, admin = 5 }.
  EOT
  type        = object({ customer = number, admin = number })
  default     = { customer = -1, admin = -1 }
}

variable "throttle" {
  description = "Throttling da rota $default de cada HTTP API (requisições/s e burst)."
  type = object({
    customer = object({ rate = number, burst = number })
    admin    = object({ rate = number, burst = number })
  })
  default = {
    customer = { rate = 50, burst = 100 }
    admin    = { rate = 10, burst = 20 }
  }
}

variable "jwt_ttl_seconds" {
  type    = number
  default = 3600
}

variable "timezone" {
  description = "Fuso único da rede (dia da Sessão e filtros por data)."
  type        = string
  default     = "America/Sao_Paulo"
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "price_class" {
  description = "Classe de preço das distribuições CloudFront."
  type        = string
  default     = "PriceClass_100"
}
