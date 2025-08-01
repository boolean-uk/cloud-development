# CloudCart: Scalable E-commerce Backend (Node.js + AWS)

CloudCart is a real-world, cloud-native e-commerce backend project built using Node.js and AWS services.
It demonstrates how to build a scalable, event-driven backend architecture leveraging key AWS services like EC2, ECS, S3, API Gateway, DynamoDB, Aurora, Lambda, and more.

## 🔧 Project Features

- Product catalog API with DynamoDB
- User & order management using Aurora PostgreSQL
- File uploads to S3 via signed URLs
- Order queuing with SQS and background processing
- Notifications via SNS
- Express app deployment on ECS with Application Load Balancer
- Auth via API Gateway + Lambda Authorizer
- Static frontend hosted on S3 with global delivery via CloudFront
- Secure secret management via Secrets Manager
- Infrastructure defined using AWS CDK (TypeScript)
- CI/CD deployment using GitHub Actions (optional)

## 📦 Prerequisites

- AWS CLI & credentials configured
- AWS CDK installed (`npm install -g aws-cdk`)
- Node.js >= 22.x
- Docker (for ECS packaging)
- PostgreSQL client (optional for Aurora testing)

## 📁 Project Phases

This project is implemented in 12 phases. Each phase builds part of the system using Node.js and AWS CDK.

## 🌐 Architecture Overview

```
[React/Static Shopfront] ← CloudFront ← S3
                       |
              Route53 + SSL (ACM)
                       |
          API Gateway + Lambda Authorizer
                       |
                ┌──────────────┐
                │   ExpressJS  │ (ECS App Service)
                └──────┬───────┘
      ┌────────────┐   │   ┌────────────┐
      │ Aurora SQL │◄──┘   │ DynamoDB   │
      └────────────┘       └────────────┘
         ▲                        ▲
         │                        │
 ┌──────────────┐        ┌──────────────┐
 │ SecretsMgr   │        │  S3 (Media)  │
 └──────────────┘        └──────────────┘
         │                        ▲
     ┌────────┐         ┌──────────────┐
     │ Lambda │◄────SQS─┤ SNS (Notify) │
     └────────┘         └──────────────┘
```

---

## 📁 Suggested Monorepo Structure

```
cloudcart/
├── infra/                     # AWS CDK (TypeScript)
│   ├── lib/                   # Stack definitions
│   └── bin/                   # Entry point
├── services/
│   ├── api/                   # Express.js API (Node + TypeScript)
│   └── worker/                # SQS Worker (Lambda)
├── scripts/                   # Seeder scripts, migrations
├── shared/                    # Common code, models
└── frontend/                  # (Optional) React frontend
```

---

## 🪜 Step-by-Step Implementation Plan (10–12 hours)

### 1. Bootstrap CDK and API Service (0.5h)

- Init CDK app: `cdk init app --language=typescript`
- Create VPC, Security Groups, Subnets (reuse in future stacks)
- Bootstrap Express API with TypeScript and Dockerfile

### 2. Product Catalog API – DynamoDB (1h)

- Table: `Products` with GSI (Global Secondary Index) on `category`
- REST API: `/products`, `/products/:id`, `/categories/:name`
- IAM roles for API to access DynamoDB

✅ AWS: **DynamoDB, IAM, CDK**

### 3. User Management – SQL via Aurora (1h)

- Deploy **Aurora Serverless v2** (PostgreSQL)
- Create `users`, `orders`, `carts` tables
- REST endpoints: `/users/register`, `/login`, `/orders`

✅ AWS: **Aurora, VPC, Secrets Manager, CDK**

### 4. File Uploads – Product Images via S3 (0.5h)

- Upload product images using signed URLs
- IAM: Allow only `PutObject` per session token
- Lifecycle rules for archiving or deleting stale media

✅ AWS: **S3, IAM, CDK**

### 5. Cart Service (0.5h)

- Use Aurora `carts` table or DynamoDB (choice)
- Endpoints: `/cart/add`, `/cart/remove`, `/cart/view`
- Associate cart by session token or user ID

✅ AWS: **Aurora/DynamoDB**

### 6. Order Placement + SQS Queue (1h)

- Place order: `/checkout` writes to SQS
- Background Lambda listens and:
    - Verifies stock
    - Writes to `orders` table
    - Publishes to SNS

✅ AWS: **SQS, Lambda, Aurora, SNS**

### 7. Notification System – Email/SMS via SNS (0.5h)

- Subscribe customer email/SMS to topic
- On order update or shipping event, publish to SNS
- Optional: Add multiple topics for different regions

✅ AWS: **SNS, IAM, CDK**

### 8. ECS App Service + Load Balancer (1h)

- Dockerize Node.js service
- Deploy to ECS Fargate with AutoScaling
- Attach Application Load Balancer (ALB)
- Configure listener rules for routing `/api/*`

✅ AWS: **ECS, ALB, CDK, ECR**

### 9. Global CDN Shopfront + Route 53 (1h)

- Host React frontend in S3 bucket
- Serve via CloudFront
- Map domain via Route 53, add TLS with ACM

✅ AWS: **S3, CloudFront, Route 53, ACM**

### 10. Auth Layer – API Gateway + Lambda Authorizer (1h)

- Secure `/orders`, `/checkout`, etc.
- Use Lambda-based JWT validator
- Attach to API Gateway routes
- Set up throttling, usage plans

✅ AWS: **API Gateway, Lambda, IAM**

### 11. Secrets Management + Roles (0.5h)

- Store DB credentials, API keys in **Secrets Manager**
- Grant ECS & Lambda secure, read-only access
- Audit using CloudTrail

✅ AWS: **Secrets Manager, IAM, CloudTrail**

### 12. Monitoring, Alarms & CI/CD (Optional, 1h)

- Add CloudWatch logging
- Set up alarms on:
    - High latency (ALB)
    - Queue backlog (SQS)
    - Order failure rate
- Add GitHub Actions for CDK deployments

✅ AWS: **CloudWatch, CDK Pipelines (optional)**

> For hints with code snippets and CDK examples, see the [hints](./hints.md)