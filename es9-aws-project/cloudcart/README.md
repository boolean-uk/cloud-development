
# CloudCart MVP (JavaScript) — Lambda + API Gateway + DynamoDB + SQS

A **minimal backend** using **API Gateway + Lambda**, **DynamoDB**, and **SQS** checkout + worker.

---

## 📦 Prerequisites

- AWS CLI & credentials configured
- AWS CDK installed (`npm install -g aws-cdk`)
- Node.js >= 22.x
- (Optional) esbuild installed locally — to avoid Docker bundling issues, make sure `infra/package.json` has:
  ```bash
  cd infra
  npm i -D esbuild
  ```

---

## 🚀 Deploy

From the repo root:

```bash
# install infra dependencies
cd infra && npm i

# deploy stack
npm run deploy
```

✅ **Note:**
- The DynamoDB table output is now called **`ProductsTableName`** (to avoid name collisions with the construct ID).
- The API Gateway URL is output as **`HttpApiUrl`**.

---

## 🌱 Seed Products

After deploy, install service dependencies and run the seeder:

```bash
cd ../services && npm i
cd ../scripts

# Use the ProductsTableName from stack outputs
PRODUCTS_TABLE=<ProductsTableName> node seed-products.js
```

---

## 🔍 Test API

```bash
API=<HttpApiUrl from outputs>

# List all products
curl $API/products

# Get a single product
curl $API/products/1

# Query by category (via GSI)
curl $API/categories/electronics

# Cart operations (in-memory)
curl -X POST $API/cart -H 'content-type: application/json' -d '{"id":"1","qty":2}'
curl $API/cart
curl -X DELETE $API/cart -H 'content-type: application/json' -d '{"id":"1"}'

# Checkout (sends to SQS, worker logs the order)
curl -X POST $API/checkout -H 'content-type: application/json' -d '{"items":[{"id":"1","qty":2}],"total":199.99}'
```

---

## ⚡ Notes

- The cart is **in-memory per Lambda container**. It resets on cold starts — good enough for demo, replace with DynamoDB for persistence.
- Outputs you’ll use:
    - `HttpApiUrl` → your API Gateway base URL
    - `ProductsTableName` → the DynamoDB table name for seeding
- The `logRetention` property has been removed to avoid CDK deprecation warnings. If you want custom log retention, define `LogGroup`s explicitly and pass them with the `logGroup` property.

---
