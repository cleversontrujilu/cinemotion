variable "name" {
  description = "Nome da função, da HTTP API e dos log groups."
  type        = string
}

variable "handler" {
  description = "Handler dentro do artefato (customer.handler ou admin.handler)."
  type        = string
}

variable "package_path" {
  description = "Caminho do zip com o bundle das Lambdas."
  type        = string
}

variable "package_hash" {
  description = "Hash base64 (SHA-256) do zip, para redeploy quando o código muda."
  type        = string
}

variable "environment" {
  description = "Variáveis de ambiente da função (DATABASE_URL, JWT_SECRET...)."
  type        = map(string)
  sensitive   = true
}

variable "reserved_concurrency" {
  description = "Teto de instâncias simultâneas, que também é o teto de conexões no Postgres. -1 = sem reserva."
  type        = number
}

variable "memory_size" {
  type    = number
  default = 512
}

variable "timeout" {
  description = "Timeout da função em segundos (a HTTP API corta em 30 s)."
  type        = number
  default     = 10
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "throttle_rate_limit" {
  description = "Requisições por segundo na rota $default."
  type        = number
}

variable "throttle_burst_limit" {
  type = number
}
