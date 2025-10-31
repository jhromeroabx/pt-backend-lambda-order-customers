output "alb_dns_name" {
  value = aws_lb.app.dns_name
}

output "http_api_endpoint" {
  value = aws_apigatewayv2_api.http.api_endpoint
}
