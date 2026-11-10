output "function_name" {
  value = aws_lambda_function.this.function_name
}

output "api_endpoint" {
  description = "URL da HTTP API (https://<id>.execute-api.<região>.amazonaws.com)."
  value       = aws_apigatewayv2_api.this.api_endpoint
}

output "api_domain" {
  description = "Domínio da HTTP API, usado como origem no CloudFront."
  value       = replace(aws_apigatewayv2_api.this.api_endpoint, "https://", "")
}
