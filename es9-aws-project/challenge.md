# CloudCart - Complete AWS Learning Project

## 🎯 Overview

CloudCart is a comprehensive serverless e-commerce backend designed for learning AWS services hands-on. Over 10 hours (5 sessions × 2 hours), you'll build a production-ready application covering **10+ AWS services**.

### What You'll Build

- **Serverless API** with Lambda, API Gateway, and DynamoDB
- **S3 Image Storage** with pre-signed URLs
- **CloudWatch Monitoring** with custom metrics, dashboards, and alarms
- **Order Processing** with SQS queues and DynamoDB Streams
- **IAM Security** with Lambda authorizers and role-based access
- **ECS/Fargate** admin dashboard with Application Load Balancer

### AWS Services Covered

✅ Lambda | ✅ API Gateway | ✅ DynamoDB | ✅ S3 | ✅ SQS
✅ CloudWatch | ✅ SNS | ✅ IAM | ✅ ECS/Fargate | ✅ VPC
✅ Application Load Balancer | ✅ ECR | ✅ CDK (Infrastructure as Code)

---

## 📚 Learning Path

### **Session 1: S3 & CloudWatch Basics** (2 hours)
[📖 Full Guide](./session-1-s3-cloudwatch.md)

**Topics:**
- S3 bucket creation and CORS
- Pre-signed URLs for secure uploads
- CloudWatch Logs and Log Insights

**Deliverables:**
- Product image upload workflow
- CloudWatch log queries

---

### **Session 2: Monitoring & Alarms** (2 hours)
[📖 Full Guide](./session-2-metrics-alarms.md)

**Topics:**
- Custom CloudWatch metrics
- CloudWatch Dashboard
- CloudWatch Alarms
- SNS email notifications

**Deliverables:**
- 6-widget CloudWatch Dashboard
- 3 configured alarms
- Email alert system

---

### **Session 3: DynamoDB & Streams** (2 hours)
[📖 Full Guide](./session-3-dynamodb-streams.md)

**Topics:**
- DynamoDB table design (composite keys)
- DynamoDB Streams
- Event-driven architecture
- Lambda stream processors

**Deliverables:**
- Orders table with streams
- Stream processor for analytics
- Order query API endpoints

---

### **Session 4: Security & IAM** (2 hours)
[📖 Full Guide](./session-4-iam-auth.md)

**Topics:**
- Lambda authorizers
- IAM roles and policies
- API security
- Role-based access control (RBAC)

**Deliverables:**
- Custom Lambda authorizer
- Admin API endpoints
- Two user roles (customer/admin)

---

### **Session 5: Containers & ECS** (2 hours)
[📖 Full Guide](./session-5-ecs-fargate.md)

**Topics:**
- Docker containers
- ECS/Fargate
- Application Load Balancer
- VPC basics

**Deliverables:**
- Containerized admin dashboard
- ECS cluster with Fargate service
- Public-facing web application

---

## 🚀 Quick Start

### 📖 **NEW: [Complete Step-by-Step Deployment Guide](./step-by-step-deployment.md)**

For first-time users, we recommend following our detailed deployment guide with explanations of what each step does and why.

### Prerequisites

```bash
# Required tools
node --version    # v22.x or higher
aws --version     # AWS CLI v2

# Configure AWS credentials
aws configure

# Note: CDK will be installed locally, no global installation needed
```

### Initial Setup

```bash
# Clone and navigate
cd cloudcart

# Install dependencies (includes CDK)
cd infra
npm install

# Bootstrap CDK (first time only)
npx cdk bootstrap

# Deploy the stack
npm run deploy
```

### Verify Deployment

```bash
# Get API URL
export API=$(aws cloudformation describe-stacks \
  --stack-name CloudCartStack \
  --query 'Stacks[0].Outputs[?OutputKey==`HttpApiUrl`].OutputValue' \
  --output text)

# Test API
curl $API/products

# Seed products
export PRODUCTS_TABLE=$(aws cloudformation describe-stacks \
  --stack-name CloudCartStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ProductsTable`].OutputValue' \
  --output text)

cd ../scripts
node seed-products.js $PRODUCTS_TABLE
```

---

## 🏗️ Architecture

### Current Architecture (After All Sessions)

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet                             │
└───────────────┬────────────────────────┬────────────────────┘
                │                        │
        ┌───────▼────────┐      ┌───────▼──────────┐
        │  API Gateway   │      │  Load Balancer   │
        │  (HTTP API)    │      │     (ALB)        │
        └───────┬────────┘      └───────┬──────────┘
                │                       │
        ┌───────▼────────┐      ┌───────▼──────────┐
        │                │      │   ECS Fargate    │
        │    Lambda      │      │ Admin Dashboard  │
        │   Functions    │      │                  │
        │                │      └───────┬──────────┘
        └───┬───┬───┬───┘              │
            │   │   │          ┌───────▼──────────┐
┌───────────▼───┼───┼──────────▼────────┐         │
│  DynamoDB     │   │         S3        │         │
│  (Products +  │   │      (Images)     │         │
│   Orders)     │   │                   │         │
└───────────────┘   │   ┌───────────────▼─────────▼─┐
                    │   │      CloudWatch            │
            ┌───────▼───▼────┐  (Logs + Metrics +   │
            │      SQS       │   Dashboard + Alarms) │
            │  (+ DLQ)       │                        │
            └────────────────┘  └────────────┬────────┘
                                            │
                                    ┌───────▼───────┐
                                    │      SNS      │
                                    │  (Alerts)     │
                                    └───────────────┘
```

---

## 📊 API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/products` | List all products |
| GET | `/products/:id` | Get product by ID |
| GET | `/categories/:name` | Products by category |
| POST | `/products/:id/upload-url` | Get presigned upload URL |
| GET | `/cart` | View cart |
| POST | `/cart` | Add to cart |
| DELETE | `/cart` | Remove from cart |
| POST | `/checkout` | Create order |
| GET | `/orders` | List orders |
| GET | `/orders/:id` | Get order by ID |

### Admin Endpoints (Requires API Key)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/admin/products` | Create product | Admin |
| PATCH | `/admin/products/:id` | Update product | Admin |
| DELETE | `/admin/products/:id` | Delete product | Admin |

### Authentication

```bash
# Admin requests
curl -X POST $API/admin/products \
  -H "x-api-key: admin-key-cloudcart-2024" \
  -H "Content-Type: application/json" \
  -d '{"id":"4","name":"Laptop","price":999.99,"category":"electronics"}'

# Customer requests (to admin endpoints will fail)
curl -X POST $API/admin/products \
  -H "x-api-key: customer-key-cloudcart-2024" \
  -H "Content-Type: application/json" \
  -d '{"id":"4","name":"Laptop","price":999.99,"category":"electronics"}'
```

---

## 🎓 Learning Outcomes

By completing this project, you will:

### **Serverless Architecture**
- Build APIs with API Gateway and Lambda
- Design event-driven systems
- Implement asynchronous processing with SQS
- Handle failures with dead letter queues

### **Data Management**
- Design DynamoDB tables with proper keys
- Implement GSIs for query flexibility
- Process data changes with DynamoDB Streams
- Store and retrieve files from S3

### **Monitoring & Operations**
- Create custom CloudWatch metrics
- Build operational dashboards
- Set up alarms and alerts
- Query logs with CloudWatch Insights

### **Security**
- Implement API authentication
- Design IAM policies with least privilege
- Secure S3 buckets and objects
- Use Lambda authorizers

### **Containers & Orchestration**
- Containerize Node.js applications
- Deploy to ECS/Fargate
- Configure Application Load Balancers
- Manage container images with ECR

### **Infrastructure as Code**
- Define infrastructure with AWS CDK
- Manage resources declaratively
- Version control infrastructure
- Automate deployments

---

## 💰 Cost Estimate

### Free Tier Coverage (First 12 Months)

- **Lambda:** 1M requests/month
- **API Gateway:** 1M requests/month
- **DynamoDB:** 25 GB storage, 25 RCU/WCU
- **S3:** 5 GB storage, 20k GET, 2k PUT
- **CloudWatch:** 10 metrics, 10 alarms, 5 GB logs
- **SNS:** 1,000 notifications

### Estimated Monthly Cost (After Free Tier)

| Service | Usage | Cost |
|---------|-------|------|
| Lambda | Low traffic | ~$0 |
| DynamoDB | <1 GB | ~$0 |
| S3 | <1 GB | ~$0 |
| ECS Fargate | 1 task running | ~$30/month |
| ALB | 1 load balancer | ~$16/month |
| Data transfer | Minimal | ~$1 |

**Total: ~$47/month** (if ECS runs 24/7)

### 💡 Cost Optimization Tips

1. **Stop ECS service when not in use:**
   ```bash
   aws ecs update-service \
     --cluster cloudcart-admin-cluster \
     --service admin-dashboard-service \
     --desired-count 0
   ```

2. **Delete stack after learning:**
   ```bash
   cd infra
   npm run destroy
   ```

3. **Use AWS Free Tier alert:**
   - Set billing alarm at $10
   - Monitor usage daily

---

## 🧪 Testing

### Unit Testing Lambda Functions

```bash
cd services
npm test
```

### Integration Testing

```bash
# Run all API tests
./test-api.sh $API

# Test specific flow
./test-checkout-flow.sh $API
```

### Load Testing

```bash
# Install artillery
npm install -g artillery

# Run load test
artillery run load-test.yml
```

---

## 🐛 Troubleshooting

### Common Issues

**CDK Deployment Fails**
```bash
# Clear CDK cache
rm -rf cdk.out
cdk synth
cdk deploy
```

**Lambda Timeout**
```bash
# Check logs
aws logs tail /aws/lambda/CloudCartStack-CheckoutFn --follow

# Increase timeout in CDK
timeout: Duration.seconds(30)
```

**S3 Upload 403 Error**
```bash
# Check bucket policy
aws s3api get-bucket-policy --bucket <bucket-name>

# Verify CORS
aws s3api get-bucket-cors --bucket <bucket-name>
```

**ECS Task Not Starting**
```bash
# Check task logs
aws ecs describe-tasks \
  --cluster cloudcart-admin-cluster \
  --tasks <task-id>

# Check service events
aws ecs describe-services \
  --cluster cloudcart-admin-cluster \
  --services admin-dashboard-service
```

---

## 📖 Additional Resources

### AWS Documentation
- [AWS Lambda Developer Guide](https://docs.aws.amazon.com/lambda/)
- [DynamoDB Developer Guide](https://docs.aws.amazon.com/dynamodb/)
- [Amazon ECS Developer Guide](https://docs.aws.amazon.com/ecs/)
- [AWS CDK Developer Guide](https://docs.aws.amazon.com/cdk/)

### Tutorials
- [Serverless Patterns Collection](https://serverlessland.com/patterns)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [CDK Workshop](https://cdkworkshop.com/)

---

## 🤝 Contributing

Improvements and suggestions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## 📝 License

MIT License - Feel free to use for learning and teaching.

---

## 🎉 Next Steps

Ready to start? Jump to [Session 1: S3 & CloudWatch](./session-1-s3-cloudwatch.md)!

**Or explore:**
- [Session 2: Metrics & Alarms](./session-2-metrics-alarms.md)
- [Session 3: DynamoDB & Streams](./session-3-dynamodb-streams.md)
- [Session 4: IAM & Security](./session-4-iam-auth.md)
- [Session 5: ECS & Containers](./session-5-ecs-fargate.md)
