# Prueba Técnica – Senior Backend (Node.js + MySQL + Docker + Lambda)

Monorepo con dos APIs (**Customers** y **Orders**) y un **Lambda Orchestrator**. 
Todo corre en local con Docker Compose y el Lambda se ejecuta con Serverless Offline.

## Estructura
```
/customers-api
/orders-api
/lambda-orchestrator
/db
docker-compose.yml
```
## Requisitos
- Docker + Docker Compose
- Node.js 20+ (para desarrollo local fuera de Docker)
- Serverless Framework (para Lambda local o deploy)
  ```bash
  npm i -g serverless
  ```

## Levantar en local (APIs + MySQL)
```bash
docker-compose build
docker-compose up -d
# Verificar
curl http://localhost:3001/health
curl http://localhost:3002/health
```

## Variables de entorno
Copia `.env.example` a `.env` en cada servicio y ajusta valores.
- `JWT_SECRET` (para ambas APIs)
- `SERVICE_TOKEN` (Customers: token para endpoint /internal)
- `CUSTOMERS_API_BASE` (Orders: URL base para validar cliente)
- Credenciales MySQL (host, user, pass, db).

## Lambda local
```bash
cd lambda-orchestrator
npm install
npm run dev
# Endpoint local (por defecto)
# POST http://localhost:3003/orchestrator/create-and-confirm-order
```

## Flujo del orquestador
1. Valida cliente via Customers `/internal/customers/:id` con `Authorization: Bearer ${SERVICE_TOKEN}`
2. Crea orden en Orders `/orders`
3. Confirma orden en Orders `/orders/:id/confirm` con header `X-Idempotency-Key`
4. Devuelve JSON consolidado (cliente + orden confirmada + items)

## Ejemplo de request (orchestrator)
```json
{
  "customer_id": 1,
  "items": [{ "product_id": 2, "qty": 3 }],
  "idempotency_key": "abc-123",
  "correlation_id": "req-789"
}
```

## OpenAPI
Cada servicio expone `openapi.yaml` básico en su carpeta.

## Scripts útiles
- `npm run dev` (APIs con nodemon)
- `npm run start` (APIs modo producción)
- `npm run migrate` (no-op placeholder)
- `npm run seed` (no-op placeholder; seed se aplica al iniciar MySQL)
