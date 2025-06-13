
# 🚀 AWS ECS Fargate with API Gateway (Node.js Microservices)

## 📌 Overview

This project guides you through deploying two Node.js microservices (Service A and Service B) to AWS ECS with Fargate, integrated securely behind AWS API Gateway (HTTP API).

## ⚙️ Prerequisites

- AWS account with necessary permissions.
- Docker installed locally.
- Node.js and npm installed.
- AWS CLI configured (optional for convenience).

## ✅ Step-by-Step Instructions

### 🔸 Step 1: Create Two Node.js Microservices Locally

Create directories:

```
project-root/
├── service-a/
│   ├── index.js
│   ├── package.json
│   └── Dockerfile
└── service-b/
    ├── index.js
    ├── package.json
    └── Dockerfile
```

**Service A (`index.js`):**
```javascript
const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => res.json({ service: "A", message: "Hello from Service A" }));
app.listen(port, () => console.log(`Service A running on port ${port}`));
```

**Service B (`index.js`):**
```javascript
const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => res.json({ service: "B", message: "Hello from Service B" }));
app.listen(port, () => console.log(`Service B running on port ${port}`));
```

Both services' `package.json`:

```json
{
  "dependencies": {
    "express": "^4.18.2"
  },
  "name": "service-a",
  "version": "1.0.0",
  "main": "index.js",
  "devDependencies": {},
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "description": ""
}
```

### 🔸 Step 2: Dockerize & Test Locally

Dockerfile (for both services):

```Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
```

Build and test:

```bash
docker build -t service-a ./service-a
docker run -p 3000:3000 service-a
```

Repeat for service-b (use different local ports).

### 🔸 Step 3: Push Docker Images to AWS ECR

- Go to AWS ECR Console, create repositories (`service-a`, `service-b`).

Push images:

```bash
aws ecr get-login-password --region YOUR_REGION | docker login --username AWS --password-stdin AWS_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com

docker tag service-a AWS_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/service-a:latest
docker push AWS_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/service-a:latest

docker tag service-b AWS_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/service-b:latest
docker push AWS_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/service-b:latest
```

### 🔸 Step 4: Create ECS Fargate Cluster

- AWS Console → ECS → Clusters → Create cluster → "Networking only" → Name: `ecs-api-cluster`.

### 🔸 Step 5: ECS Task Definitions & Services

- ECS Console → Task Definitions → Create (Fargate):
    - CPU: `0.25 vCPU`, Memory: `0.5 GB`.
    - Container image from ECR.
    - Port mappings: `3000`.
    - Logging: Auto-configure CloudWatch Logs.

- Deploy services for each task definition in ECS cluster (`ecs-service-a`, `ecs-service-b`):
    - Public IP enabled.

### 🔸 Step 6: AWS API Gateway Configuration

- AWS Console → API Gateway → Create HTTP API:
    - Integrate each ALB URL as HTTP integrations.
    - Routes:
        - `/service-a` → Service A ALB
        - `/service-b` → Service B ALB

### 🔸 Step 7: Secure API Gateway (Optional, Recommended)

- API Gateway Console → Enable API key authorization.
- Create and use API keys.

Test endpoints:

```bash
curl -H "x-api-key: YOUR_API_KEY" https://your-api-url/service-a
curl -H "x-api-key: YOUR_API_KEY" https://your-api-url/service-b
```

## 🚦 Validation Checklist

- Both services accessible via API Gateway.
- ECS tasks running and CloudWatch logs active.
- API Gateway security verified.

## 🎯 Outcome

You have successfully deployed containerized Node.js services using AWS ECS Fargate, secured behind AWS API Gateway.

