# Terraform Stack – B2B Prueba (AWS)

## Componentes
- VPC pública (subnets públicas)
- ALB con routing por path (/customers*, /orders*)
- ECS Fargate Services:
  - customers-api (puerto 3001)
  - orders-api (puerto 3002)
- Secrets Manager (SERVICE_TOKEN, JWT_SECRET, JWT_TOKEN_FOR_APIS, MYSQL_URL)
- Lambda Orchestrator + API Gateway HTTP API

## Requisitos
- Terraform >= 1.6
- AWS credenciales configuradas (profile/env)
- Imágenes publicadas en ECR: `customers_image` y `orders_image`

## Uso
```bash
cd terraform-aws-stack
terraform init
terraform apply -auto-approve   -var="customers_image=<YOUR_AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/customers-api:latest"   -var="orders_image=<YOUR_AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/orders-api:latest"   -var="mysql_url=<AIVEN_MYSQL_URL>"
```

> El Lambda se empaqueta desde `../lambda-orchestrator` con `archive_file`. Asegúrate de que esa carpeta exista junto a esta carpeta de Terraform.

## Salidas
- `alb_dns_name` → usa `http://<alb_dns_name>/customers` y `http://<alb_dns_name>/orders`
- `http_api_endpoint` → invocar `POST /orchestrator/create-and-confirm-order`

## Notas
- Para simplificar, ECS Services están en **subnets públicas** con **Public IP** habilitado.
- Health checks: `/health` en ambos servicios.
- Orders API obtiene `CUSTOMERS_API_BASE` apuntando al ALB.
- Lambda usa los endpoints del ALB.
