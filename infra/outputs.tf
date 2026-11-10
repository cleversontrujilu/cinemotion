output "site_urls" {
  description = "Endereço de cada site (a API responde no mesmo domínio, sob /api)."
  value       = { for k, s in module.site : k => s.url }
}

output "api_endpoints" {
  description = "URL direta de cada HTTP API, para depuração."
  value       = { for k, a in module.api : k => a.api_endpoint }
}

output "lambda_functions" {
  value = { for k, a in module.api : k => a.function_name }
}
