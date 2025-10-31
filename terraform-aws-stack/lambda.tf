data "archive_file" "orchestrator_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda-orchestrator"
  output_path = "${path.module}/.build/orchestrator.zip"
}

resource "aws_lambda_function" "orchestrator" {
  function_name = "${local.name}-orchestrator"
  role          = aws_iam_role.lambda_role.arn
  runtime       = "nodejs18.x"
  handler       = "handler.createAndConfirm"
  filename      = data.archive_file.orchestrator_zip.output_path
  source_code_hash = data.archive_file.orchestrator_zip.output_base64sha256
  timeout       = 15

  environment {
    variables = {
      PORT               = "3003"
      CUSTOMERS_API_BASE = "http://${aws_lb.app.dns_name}/customers"
      ORDERS_API_BASE    = "http://${aws_lb.app.dns_name}/orders"
      SERVICE_TOKEN      = var.service_token
      JWT_TOKEN_FOR_APIS = var.jwt_token_for_apis
    }
  }
}

resource "aws_apigatewayv2_api" "http" {
  name          = "${local.name}-httpapi"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.orchestrator.arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "route" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "POST /orchestrator/create-and-confirm-order"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "allow_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.orchestrator.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
