# Prueba Técnica – Backend Distribuido con Node.js, Serverless y Docker
## Descripción General
Este proyecto implementa una **arquitectura distribuida basada en microservicios** que simula el proceso de creación y confirmación de órdenes de compra en un entorno empresarial.  

Incluye tres componentes principales:

| Servicio | Descripción | Puerto |
|-----------|--------------|--------|
| **customers-api** | Gestiona clientes internos (endpoint `/internal/:id`) | 3001 |
| **orders-api** | Gestiona órdenes, items e idempotencia | 3002 |
| **lambda-orchestrator** | Orquesta el flujo completo: validar cliente → crear orden → confirmar → consolidar → compensar si falla | 3003 |

El objetivo fue **demostrar orquestación entre servicios independientes con resiliencia, idempotencia y manejo de errores distribuidos** (técnicas que se usan en AWS Step Functions o EventBridge orquestado).

---

## Arquitectura General

```
                      ┌────────────────────────────┐
                      │      Lambda Orchestrator   │
                      │  (Serverless + Axios + Retry) 
                      │                            │
                      ├──────────────┬─────────────┤
                      ▼              ▼
            /internal/:id      /orders /confirm /cancel
          ┌───────────────┐    ┌──────────────────────┐
          │ customers-api │    │     orders-api       │
          │  (Express.js) │    │  (Express.js + MySQL)│
          └───────────────┘    └──────────────────────┘
```

El **Lambda Orchestrator** se ejecuta localmente con `serverless-offline`, simulando un despliegue AWS Lambda real.  
Los microservicios `customers-api` y `orders-api` se ejecutan dentro de contenedores Docker independientes.

---

## Tecnologías

| Componente | Stack / Tool |
|-------------|---------------|
| Lenguaje | Node.js 18 |
| Framework Lambda | Serverless Framework v3 |
| APIs | Express.js |
| BBDD | MySQL 8 |
| Orquestación | Serverless Offline |
| Logging | JSON structured logs |
| Idempotencia | Tabla `idempotency_keys` con `X-Idempotency-Key` |
| Resiliencia | Axios + retry + exponential backoff |
| Contenedores | Docker Compose |

---

## Flujo Orquestado

1. **Validar cliente** → `customers-api/internal/:id`
2. **Crear orden** → `orders-api/orders`
3. **Confirmar orden** → `orders-api/orders/:id/confirm`
4. **Consolidar** → `orders-api/orders/:id`
5. **Compensación** → si falla confirmación, cancela la orden (`/cancel`).

---

## Ejemplo de ejecución exitosa

### Request
```bash
curl --location 'http://localhost:3003/orchestrator/create-and-confirm-order' --header 'Content-Type: application/json' --data '{
  "customer_id": 1,
  "items": [{"product_id": 2, "qty": 3}],
  "idempotency_key": "abc-124",
  "correlation_id": "req-001"
}'
```

### Response (201)
```json
{
  "success": true,
  "correlationId": "req-001",
  "data": {
    "customer": {
      "id": 1,
      "name": "ACME",
      "email": "ops@acme.com",
      "phone": "+51987654321"
    },
    "order": {
      "id": 8,
      "customer_id": 1,
      "status": "CONFIRMED",
      "total_cents": 8970,
      "items": [
        {
          "product_id": 2,
          "qty": 3,
          "unit_price_cents": 2990
        }
      ]
    }
  }
}
```

---

## Ejecución local

### 1️ Preparar entorno
```bash
git clone <repo>
cd prueba-tecnica-backend
```

### 2️ Configurar variables `.env`

**customers-api/.env**
```
PORT=3001
SERVICE_TOKEN=internal-service-token
```

**orders-api/.env**
```
PORT=3002
SERVICE_TOKEN=internal-service-token
CUSTOMERS_API_BASE=http://172.17.0.1:3001
MYSQL_URL=mysql://was:ws@mysql-loasi123-jhosepromero14-dc28.e.aivencloud.com:16012/sb?ssl-mode=REQUIRED
```

**lambda-orchestrator/.env**
```
PORT=3003
CUSTOMERS_API_BASE=http://localhost:3001
ORDERS_API_BASE=http://localhost:3002
SERVICE_TOKEN=internal-service-token
JWT_TOKEN_FOR_APIS=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock
```

### 3️ Levantar contenedores
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

### 4️ Ejecutar Lambda localmente
```bash
cd lambda-orchestrator
npx serverless offline
```

---

## Estructura del proyecto

```
.
├── .gitignore
├── docker-compose.yml
├── README.md
├── customers-api
│   ├── .env
│   ├── Dockerfile
│   ├── openapi.yaml
│   ├── package-lock.json
│   ├── package.json
│   └── src
│       ├── controllers
│       │   └── customersController.js
│       ├── middlewares
│       │   └── auth.js
│       ├── routes
│       │   └── customers.js
│       ├── db.js
│       └── index.js
├── db
│   ├── schema.sql
│   └── seed.sql
├── lambda-orchestrator
│   ├── .env
│   ├── handler.js
│   ├── handler.js.bk
│   ├── package-lock.json
│   ├── package.json
│   ├── serverless.yml
│   ├── .serverless
│   │   └── meta.json
│   └── src
│       ├── http
│       │   └── client.js
│       ├── orchestrate.js
│       ├── steps
│       │   ├── cancelOrder.js
│       │   ├── confirmOrder.js
│       │   ├── createOrder.js
│       │   ├── getOrder.js
│       │   └── validateCustomer.js
│       └── utils
│           ├── errors.js
│           ├── log.js
│           ├── response.js
│           └── retry.js
├── orders-api
│   ├── .env
│   ├── Dockerfile
│   ├── openapi.yaml
│   ├── package-lock.json
│   ├── package.json
│   └── src
│       ├── controllers
│       │   ├── ordersController.js
│       │   └── productsController.js
│       ├── middlewares
│       │   └── auth.js
│       ├── routes
│       │   ├── orders.js
│       │   └── products.js
│       ├── db.js
│       └── index.js
```

## Principios aplicados

- Clean Code y SOLID.
- Orquestación resiliente tipo Saga.
- Idempotencia en flujos distribuidos.
- Retry & backoff exponencial.
- Logging estructurado JSON.
- Simulación local de AWS Lambda.


aws ecr create-repository --repository-name customers-api --region us-east-1
aws ecr create-repository --repository-name orders-api --region us-east-1

aws ecs create-cluster --cluster-name b2b-prueba-cluster --region us-east-1

aws ecs list-services --cluster b2b-prueba-cluster   --region us-east-1

# TASK DEFINITION
aws ecs register-task-definition `
  --family customers-api `
  --requires-compatibilities FARGATE `
  --cpu "256" `
  --memory "512" `
  --network-mode awsvpc `
  --execution-role-arn arn:aws:iam::148761658682:role/ecsTaskExecutionRole `
  --container-definitions file://json_aws/customer.json `
  --region us-east-1

  aws ecs register-task-definition `
  --family orders-api `
  --requires-compatibilities FARGATE `
  --cpu "256" `
  --memory "512" `
  --network-mode awsvpc `
  --execution-role-arn arn:aws:iam::148761658682:role/ecsTaskExecutionRole `
  --container-definitions file://json_aws/order.json `
  --region us-east-1

# SERIVICIOS ECS

aws ecs create-service `
  --cluster b2b-prueba-cluster `
  --service-name b2b-prueba-customers-svc `
  --task-definition customers-api `
  --desired-count 1 `
  --launch-type FARGATE `
  --network-configuration "awsvpcConfiguration={subnets=[subnet-08e1593277c9ffb0a,subnet-0d3c8edaf51c6b6df,subnet-0fb5fb96464e619b0,subnet-02c95c4ee20bee404,subnet-033f497527f331e2d,subnet-037b53e419477707e],assignPublicIp=ENABLED}" `
  --region us-east-1

aws ecs create-service `
  --cluster b2b-prueba-cluster `
  --service-name b2b-prueba-orders-svc `
  --task-definition orders-api `
  --desired-count 1 `
  --launch-type FARGATE `
  --network-configuration "awsvpcConfiguration={subnets=[subnet-08e1593277c9ffb0a,subnet-0d3c8edaf51c6b6df,subnet-0fb5fb96464e619b0,subnet-02c95c4ee20bee404,subnet-033f497527f331e2d,subnet-037b53e419477707e],assignPublicIp=ENABLED}" `
  --region us-east-1


# VER TABLA DE SUBNETING
aws ec2 describe-subnets `
  --region us-east-1 `
  --query 'Subnets[*].{SubnetId:SubnetId,Public:MapPublicIpOnLaunch,AZ:AvailabilityZone}' `
  --output table

# CONFIRMAR LOS SERVICIOS CREADOS
aws ecs list-services --cluster b2b-prueba-cluster --region us-east-1