# CloudCart: Serverless E-commerce Backend (Node.js + AWS)

CloudCart is a minimal, cloud-native e-commerce backend built using Node.js and AWS services.  
It demonstrates how to build a **serverless, event-driven backend architecture** leveraging **AWS Lambda, API Gateway, DynamoDB, and SQS**.

---

## 🔧 Project Features

- **Product Catalog via DynamoDB**
  - `GET /products`
  - `GET /products/:id`
  - `GET /categories/:name` (via GSI)
- **Cart Service (in-memory demo)**
  - `GET /cart`
  - `POST /cart`
  - `DELETE /cart`
- **Order placement with SQS**
  - `POST /checkout` → enqueues order
  - **Worker Lambda** consumes queue & logs orders
- **Infrastructure defined with AWS CDK (JavaScript)**
- **Seeder script** for sample products

---

## 📦 Prerequisites

- AWS CLI & credentials configured
- AWS CDK installed (`npm install -g aws-cdk`)
- Node.js >= 22.x

---

## ⚡ Quick Start

```bash
# 1. Install dependencies
cd cloudcart/infra && npm i && cd ../services && npm i && cd ..

# 2. Deploy infra (API Gateway + DynamoDB + SQS + Lambdas)
cd infra
npm run deploy

# 3. Record outputs
# - HttpApiUrl
# - ProductsTable

# 4. Seed sample products
cd ../scripts
PRODUCTS_TABLE=<ProductsTableName from outputs> node seed-products.js

# 5. Test API
API=<HttpApiUrl from outputs>

curl $API/products
curl $API/products/1
curl $API/categories/electronics

# Cart operations
curl -X POST $API/cart -H 'content-type: application/json' -d '{"id":"1","qty":2}'
curl $API/cart
curl -X DELETE $API/cart -H 'content-type: application/json' -d '{"id":"1"}'

# Checkout
curl -X POST $API/checkout -H 'content-type: application/json' -d '{"items":[{"id":"1","qty":2}],"total":199.99}'
```

---

## 🌐 Architecture Overview

```
[React/Static Shopfront] (optional)
        │
   API Gateway (HTTP API)
        │
 ┌──────┴────────┐
 │   Lambdas     │
 └─┬─────┬───────┘
   │     │
   │     └─> DynamoDB (Products table + GSI: category)
   │
   └─> /cart (in-memory)
   │
   └─> /checkout → SQS Queue → Worker Lambda
```

---

## 📁 Monorepo Structure

```
cloudcart/
├── infra/              # AWS CDK (JavaScript)
│   ├── bin/            # CDK app entry
│   └── lib/            # Stack definitions
├── services/           # Lambda handlers
│   ├── products/       # Products API
│   ├── cart/           # Cart API
│   └── orders/         # Checkout + Worker
└── scripts/            # Seeder scripts
```

---

## 🪜 Step-by-Step Plan

1. **Infra**: deploy DynamoDB + SQS + API Gateway + Lambdas
2. **Products API**: implement `/products`, `/products/{id}`, `/categories/{name}`
3. **Cart API**: implement `/cart` with in-memory logic
4. **Checkout**: implement `/checkout` + worker Lambda for queue consumption
5. **(Optional)**: add uploads + frontend

---

## 🚀 Next Steps (Beyond the MVP)

Once you have the MVP running, you can evolve CloudCart into a **full production-ready system** by adding:

- **Aurora PostgreSQL + RDS Proxy**  
  For user management, persistent carts, and relational order data.

- **Authentication & Authorization**  
  Use API Gateway + Lambda Authorizer or Cognito JWTs to protect checkout and orders.

- **S3 Signed Uploads**  
  Add `/uploads/sign` for product image uploads, store in S3.

- **Notifications (SNS / SES / SMS)**  
  Worker Lambda can publish order updates to customers.

- **Monitoring & Alarms**  
  Add CloudWatch metrics and alarms for API latency, queue backlog, and error rates.

- **Frontend Hosting**  
  Deploy a React frontend to S3 + CloudFront + Route 53 for global delivery.

- **CI/CD**  
  Automate deployments using GitHub Actions + CDK Pipelines.

---

👉 This way you can start small in a few hours, and grow it step-by-step into a **scalable, real-world e-commerce backend**.


> For hints with code snippets and CDK examples, see the [hints](./hints.md)