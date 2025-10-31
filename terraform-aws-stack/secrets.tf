resource "aws_secretsmanager_secret" "service_token" { name = "${local.name}/service_token" }
resource "aws_secretsmanager_secret_version" "service_token_v" {
  secret_id     = aws_secretsmanager_secret.service_token.id
  secret_string = var.service_token
}

resource "aws_secretsmanager_secret" "jwt_secret" { name = "${local.name}/jwt_secret" }
resource "aws_secretsmanager_secret_version" "jwt_secret_v" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = var.jwt_secret
}

resource "aws_secretsmanager_secret" "jwt_token_for_apis" { name = "${local.name}/jwt_token_for_apis" }
resource "aws_secretsmanager_secret_version" "jwt_token_for_apis_v" {
  secret_id     = aws_secretsmanager_secret.jwt_token_for_apis.id
  secret_string = var.jwt_token_for_apis
}

resource "aws_secretsmanager_secret" "mysql_url" { name = "${local.name}/mysql_url" }
resource "aws_secretsmanager_secret_version" "mysql_url_v" {
  secret_id     = aws_secretsmanager_secret.mysql_url.id
  secret_string = var.mysql_url
}
