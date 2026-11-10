variable "name" {
  description = "Prefixo do bucket e nome da distribuição."
  type        = string
}

variable "source_dir" {
  description = "Saída do `nuxt generate` (web/<site>/.output/public)."
  type        = string

  validation {
    condition     = fileexists("${var.source_dir}/index.html")
    error_message = "Site não gerado: rode `npm run build:web` antes do `tofu apply`."
  }
}

variable "api_domain" {
  description = "Domínio do API Gateway que atende /api/* neste site."
  type        = string
}

variable "price_class" {
  description = "PriceClass_100 = América do Norte e Europa (mais barato). PriceClass_All inclui a América do Sul."
  type        = string
  default     = "PriceClass_100"
}
