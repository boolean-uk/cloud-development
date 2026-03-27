# Session 5: ECS/Fargate Admin Dashboard (2 hours)

## Learning Objectives
- Docker containerization
- Amazon ECS (Elastic Container Service)
- AWS Fargate serverless containers
- Application Load Balancer
- Container orchestration
- Minimal VPC configuration

## What You'll Build
1. Express.js admin dashboard web application
2. Dockerfile for containerization
3. Minimal VPC with public subnets
4. ECS Cluster with Fargate service
5. Application Load Balancer for public access
6. ECR (Elastic Container Registry) for images

## Architecture Overview

```
Internet → Application Load Balancer → ECS Fargate Service → DynamoDB
                                              ↓
                                         CloudWatch Logs
```

---

## Implementation Steps

### Step 1: Understanding Containers (15 min)

**What is a Container?**

A container packages your application with all its dependencies into a single, portable unit that runs consistently across different environments.

**Container vs. Lambda:**

| Feature | Lambda | Container (ECS/Fargate) |
|---------|--------|------------------------|
| **Execution Model** | Event-driven | Long-running |
| **Timeout** | 15 minutes max | Unlimited |
| **State** | Stateless | Can be stateful |
| **Cold Start** | Yes | Minimal |
| **Best For** | APIs, event processing | Web servers, workers |
| **Cost** | Per request | Per hour running |

**When to Use Containers:**
- Long-running processes
- WebSocket connections
- Complex multi-page applications
- Background workers
- Legacy application migration

**Why We're Building a Dashboard:**
Shows a different AWS compute pattern than Lambda.

---

### Step 2: Review Admin Dashboard Code (20 min)

#### Express.js Server (`admin-dashboard/server.js`)

```javascript
import express from 'express';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const app = express();
const port = process.env.PORT || 3000;

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE;
const ORDERS_TABLE = process.env.ORDERS_TABLE;
const API_URL = process.env.API_URL;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Template engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Health check (important for ALB!)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Home page
app.get('/', (req, res) => {
  res.render('index', {
    title: 'CloudCart Admin Dashboard',
    apiUrl: API_URL
  });
});

// Products page
app.get('/products', async (req, res) => {
  const result = await ddb.send(new ScanCommand({
    TableName: PRODUCTS_TABLE,
    Limit: 100
  }));

  const products = (result.Items || []).map(unmarshall);

  res.render('products', {
    title: 'Products',
    products,
    apiUrl: API_URL
  });
});

// Orders page
app.get('/orders', async (req, res) => {
  const result = await ddb.send(new ScanCommand({
    TableName: ORDERS_TABLE,
    Limit: 50
  }));

  const orders = (result.Items || []).map(unmarshall).sort((a, b) => {
    return new Date(b.timestamp) - new Date(a.timestamp);
  });

  res.render('orders', { title: 'Orders', orders });
});

app.listen(port, () => {
  console.log(`Admin Dashboard running on port ${port}`);
});
```

**Key Components:**

**1. Environment Variables:**
- `PORT`: Where server listens (3000)
- `PRODUCTS_TABLE`: DynamoDB table name
- `ORDERS_TABLE`: DynamoDB table name
- `API_URL`: API Gateway endpoint
- `AWS_REGION`: AWS region

**2. Health Check Endpoint:**
```javascript
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});
```
**Critical:** ALB uses this to determine if container is healthy.

**3. EJS Templates:**
- Server-side rendering
- Dynamic HTML generation
- Simpler than React/Vue for this use case

---

### Step 3: Review Dockerfile (20 min)

Examine `admin-dashboard/Dockerfile`:

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Run application
CMD ["node", "server.js"]
```

**Dockerfile Breakdown:**

**FROM node:22-alpine**
- Base image: Node.js 22 on Alpine Linux
- Alpine: Minimal Linux distro (~5 MB vs ~200 MB)
- **Why Alpine?** Smaller images = faster deployments, lower costs

**WORKDIR /app**
- Sets working directory inside container
- All subsequent commands run in /app

**COPY package*.json ./**
- Copy package files first (before code)
- **Why?** Docker caching - dependencies change less often than code

**RUN npm ci --only=production**
- `npm ci`: Clean install (faster than `npm install`)
- `--only=production`: Skip devDependencies
- Installs to node_modules/

**COPY . .**
- Copy all application code
- Runs after npm ci (takes advantage of layer caching)

**EXPOSE 3000**
- Documents which port container listens on
- **Note:** Doesn't actually publish the port (done by ECS)

**HEALTHCHECK**
- Docker-level health monitoring
- Calls /health endpoint every 30 seconds
- Marks container unhealthy after 3 failures

**CMD ["node", "server.js"]**
- Command to run when container starts
- Array form (exec form) is preferred over shell form

---

### Step 4: Build and Test Locally (25 min)

#### Prerequisites
```bash
# Install Docker Desktop
# macOS: https://www.docker.com/products/docker-desktop
# Verify installation
docker --version
```

#### Build Image
```bash
cd admin-dashboard

# Build Docker image
docker build -t cloudcart-admin-dashboard .

# View built image
docker images | grep cloudcart
```

**Build Output:**
```
[+] Building 12.3s (10/10) FINISHED
 => [1/5] FROM docker.io/library/node:22-alpine
 => [2/5] WORKDIR /app
 => [3/5] COPY package*.json ./
 => [4/5] RUN npm ci --only=production
 => [5/5] COPY . .
 => exporting to image
```

**Understanding Layers:**
- Each instruction creates a layer
- Layers are cached (speeds up rebuilds)
- Only changed layers are rebuilt

#### Test Locally
```bash
# Get environment variables
export PRODUCTS_TABLE=<your-products-table>
export ORDERS_TABLE=<your-orders-table>
export API_URL=<your-api-url>

# Run container
docker run -p 3000:3000 \
  -e PRODUCTS_TABLE=$PRODUCTS_TABLE \
  -e ORDERS_TABLE=$ORDERS_TABLE \
  -e API_URL=$API_URL \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
  cloudcart-admin-dashboard
```

**Explanation:**
- `-p 3000:3000`: Maps host port 3000 to container port 3000
- `-e`: Sets environment variables
- AWS credentials needed for DynamoDB access

**Test It:**
```bash
# In another terminal
curl http://localhost:3000/health

# Open in browser
open http://localhost:3000
```

**You should see:**
- Home page with stats
- Products list
- Orders list
- Metrics page

**Stop container:**
```bash
# Find container ID
docker ps

# Stop it
docker stop <container-id>
```

---

### Step 5: Understanding ECS Concepts (15 min)

**ECS Hierarchy:**
```
Cluster
  └── Service
        └── Task
              └── Container
```

**Cluster:**
- Logical grouping of services
- Regional resource
- Can run on EC2 or Fargate

**Service:**
- Maintains desired number of tasks
- Integrates with load balancer
- Auto-restarts failed tasks
- Handles deployments (rolling updates)

**Task:**
- Running instance of Task Definition
- One or more containers
- Ephemeral (can be stopped/restarted)

**Task Definition:**
- Blueprint for your application
- Specifies:
  - Docker image
  - CPU/Memory requirements
  - Environment variables
  - Port mappings
  - IAM role

**Fargate vs. EC2:**

| Feature | Fargate | EC2 |
|---------|---------|-----|
| **Server Management** | Serverless | You manage |
| **Pricing** | Per vCPU/GB | Per instance |
| **Scaling** | Instant | Takes minutes |
| **Control** | Less | More |
| **Best For** | Most use cases | Special requirements |

---

### Step 6: Review ECS Infrastructure (20 min)

In `infra/lib/cloudcart-stack.js`:

#### VPC Configuration
```javascript
const vpc = new ec2.Vpc(this, 'CloudCartVpc', {
  maxAzs: 2,
  natGateways: 0,  // No NAT Gateway (cost savings)
  subnetConfiguration: [
    {
      cidrMask: 24,
      name: 'Public',
      subnetType: ec2.SubnetType.PUBLIC
    }
  ]
});
```

**Why No NAT Gateway?**
- **Cost:** NAT Gateway costs ~$32/month
- **Our Setup:** Containers in public subnets with public IPs
- **Trade-off:** Containers have public IPs (acceptable for learning)
- **Production:** Use NAT Gateway with private subnets

**VPC Components:**
- **2 Availability Zones:** High availability
- **Public Subnets:** One per AZ
- **Internet Gateway:** Automatic with public subnets

#### ECS Cluster
```javascript
const cluster = new ecs.Cluster(this, 'AdminCluster', {
  vpc,
  clusterName: 'cloudcart-admin-cluster'
});
```

**Just a logical grouping** - no resources charged.

#### Task Definition
```javascript
const taskDefinition = new ecs.FargateTaskDefinition(this, 'AdminTaskDef', {
  memoryLimitMiB: 512,  // 0.5 GB RAM
  cpu: 256               // 0.25 vCPU
});

// Grant permissions
products.grantReadData(taskDefinition.taskRole);
orders.grantReadData(taskDefinition.taskRole);

// Container definition
const container = taskDefinition.addContainer('AdminDashboard', {
  image: ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:22-alpine'),
  logging: ecs.LogDrivers.awsLogs({
    streamPrefix: 'admin-dashboard',
    logRetention: logs.RetentionDays.ONE_WEEK
  }),
  environment: {
    PORT: '3000',
    PRODUCTS_TABLE: products.tableName,
    ORDERS_TABLE: orders.tableName,
    API_URL: httpApi.apiEndpoint,
    AWS_REGION: this.region
  }
});

container.addPortMappings({
  containerPort: 3000,
  protocol: ecs.Protocol.TCP
});
```

**CPU/Memory Combinations:**
Fargate supports specific combinations:
- 256 CPU → 512 MB, 1 GB, 2 GB RAM
- 512 CPU → 1-4 GB RAM
- 1024 CPU → 2-8 GB RAM

**Task Roles:**
- **Task Role:** Permissions for application (DynamoDB access)
- **Execution Role:** Permissions for ECS (pull image, write logs)

#### Application Load Balancer
```javascript
const alb = new elbv2.ApplicationLoadBalancer(this, 'AdminALB', {
  vpc,
  internetFacing: true,
  loadBalancerName: 'cloudcart-admin-alb'
});

const listener = alb.addListener('HttpListener', {
  port: 80,
  open: true
});
```

**ALB Benefits:**
- **Health Checks:** Routes traffic only to healthy containers
- **High Availability:** Distributes across AZs
- **SSL/TLS:** Can add HTTPS (with ACM certificate)
- **Path Routing:** Can route to different services

#### Fargate Service
```javascript
const service = new ecs.FargateService(this, 'AdminService', {
  cluster,
  taskDefinition,
  desiredCount: 1,
  assignPublicIp: true,  // Required without NAT Gateway
  serviceName: 'admin-dashboard-service'
});

const targetGroup = listener.addTargets('AdminTarget', {
  port: 3000,
  protocol: elbv2.ApplicationProtocol.HTTP,
  targets: [service],
  healthCheck: {
    path: '/health',
    interval: Duration.seconds(60),
    timeout: Duration.seconds(5),
    healthyThresholdCount: 2,
    unhealthyThresholdCount: 3
  }
});
```

**Health Check Parameters:**
- **path:** Endpoint to check
- **interval:** How often to check
- **timeout:** How long to wait for response
- **healthyThresholdCount:** Successes before healthy
- **unhealthyThresholdCount:** Failures before unhealthy

---

### Step 7: Push Image to ECR (20 min)

#### Get ECR Repository URI
```bash
export ECR_REPO=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ECRRepositoryUri`].OutputValue' --output text)

echo $ECR_REPO
# Output: 123456789.dkr.ecr.us-east-1.amazonaws.com/cloudcart-admin-dashboard
```

#### Login to ECR
```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_REPO
```

**Expected:** `Login Succeeded`

#### Tag and Push
```bash
# Tag with ECR repository URI
docker tag cloudcart-admin-dashboard:latest $ECR_REPO:latest

# Push to ECR
docker push $ECR_REPO:latest
```

**Push Output:**
```
The push refers to repository [123456789.dkr.ecr.us-east-1.amazonaws.com/cloudcart-admin-dashboard]
abc123: Pushed
def456: Pushed
latest: digest: sha256:abc... size: 1234
```

#### Verify Image in ECR
```bash
aws ecr describe-images --repository-name cloudcart-admin-dashboard
```

---

### Step 8: Update ECS to Use Your Image (15 min)

Currently, the CDK stack uses a placeholder image. Update it:

**Option 1: Update CDK Code**

Edit `infra/lib/cloudcart-stack.js`:

Find:
```javascript
image: ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:22-alpine'),
```

Replace with:
```javascript
image: ecs.ContainerImage.fromEcrRepository(
  ecr.Repository.fromRepositoryName(this, 'AdminRepo', 'cloudcart-admin-dashboard'),
  'latest'
),
```

Also update the command - remove the placeholder:
```javascript
// Remove this:
command: [
  'sh', '-c',
  'echo "Container started" && while true; do sleep 30; done'
],
```

Then redeploy:
```bash
cd infra
npm run deploy
```

**Option 2: Force New Deployment**

Without changing CDK:
```bash
aws ecs update-service \
  --cluster cloudcart-admin-cluster \
  --service admin-dashboard-service \
  --force-new-deployment
```

Wait 2-5 minutes for new task to start.

---

### Step 9: Access Admin Dashboard (10 min)

#### Get ALB URL
```bash
export ADMIN_URL=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AdminDashboardUrl`].OutputValue' --output text)

echo $ADMIN_URL
```

#### Test Health Check
```bash
curl $ADMIN_URL/health
```

**Expected:**
```json
{"status":"healthy"}
```

#### Open in Browser
```bash
open $ADMIN_URL
```

**You should see:**
- **Home Page:** Dashboard with product and order counts
- **Products:** List of all products from DynamoDB
- **Orders:** List of all orders sorted by timestamp
- **Metrics:** Link to CloudWatch dashboard

---

### Step 10: Monitor ECS Service (10 min)

#### Check Service Status
```bash
aws ecs describe-services \
  --cluster cloudcart-admin-cluster \
  --services admin-dashboard-service \
  --query 'services[0].[serviceName,status,runningCount,desiredCount]'
```

**Expected:**
```
[
  "admin-dashboard-service",
  "ACTIVE",
  1,
  1
]
```

#### View Tasks
```bash
aws ecs list-tasks --cluster cloudcart-admin-cluster
```

#### Check Task Health
```bash
TASK_ARN=$(aws ecs list-tasks --cluster cloudcart-admin-cluster \
  --query 'taskArns[0]' --output text)

aws ecs describe-tasks \
  --cluster cloudcart-admin-cluster \
  --tasks $TASK_ARN \
  --query 'tasks[0].[lastStatus,healthStatus,containers[0].healthStatus]'
```

**Expected:**
```
[
  "RUNNING",
  "HEALTHY",
  "HEALTHY"
]
```

#### View Container Logs
```bash
aws logs tail /ecs/admin-dashboard --follow
```

**You'll see:**
```
Admin Dashboard running on port 3000
Environment:
  PRODUCTS_TABLE: CloudCartMvpStack-ProductsTableName-XYZ
  ORDERS_TABLE: CloudCartMvpStack-OrdersTable-ABC
  API_URL: https://...
```

#### Check ALB Target Health
```bash
# Get target group ARN
TG_ARN=$(aws elbv2 describe-target-groups \
  --query 'TargetGroups[?contains(TargetGroupName, `cloudcart`)].TargetGroupArn' \
  --output text)

# Check health
aws elbv2 describe-target-health --target-group-arn $TG_ARN
```

**Expected:**
```json
{
  "TargetHealthDescriptions": [
    {
      "Target": {...},
      "HealthCheckPort": "3000",
      "TargetHealth": {
        "State": "healthy"
      }
    }
  ]
}
```

---

## Verification Checklist

- [ ] Docker image built successfully
- [ ] Image tested locally
- [ ] Image pushed to ECR
- [ ] ECS service running
- [ ] Task in RUNNING state
- [ ] Container logs show "running on port 3000"
- [ ] Health check returns 200 OK
- [ ] ALB target shows healthy
- [ ] Can access dashboard via ALB URL
- [ ] Dashboard displays products
- [ ] Dashboard displays orders

---

## Advanced Topics

### Scaling the Service

#### Manual Scaling
```bash
aws ecs update-service \
  --cluster cloudcart-admin-cluster \
  --service admin-dashboard-service \
  --desired-count 3
```

**Result:** 3 containers running, load balanced by ALB.

#### Auto Scaling with CDK
```javascript
const scaling = service.autoScaleTaskCount({
  minCapacity: 1,
  maxCapacity: 10
});

scaling.scaleOnCpuUtilization('CpuScaling', {
  targetUtilizationPercent: 70,
  scaleInCooldown: Duration.seconds(60),
  scaleOutCooldown: Duration.seconds(60)
});
```

**Triggers:**
- **Scale Out:** CPU > 70% for 60 seconds
- **Scale In:** CPU < 70% for 60 seconds
- **Limits:** 1-10 tasks

---

### Adding HTTPS

#### Create ACM Certificate
```bash
# Request certificate
aws acm request-certificate \
  --domain-name admin.yourdomain.com \
  --validation-method DNS
```

#### Update ALB Listener
```javascript
const httpsListener = alb.addListener('HttpsListener', {
  port: 443,
  certificates: [certificate],
  open: true
});

httpsListener.addTargets('AdminTarget', {
  port: 3000,
  targets: [service]
});
```

---

### CI/CD Pipeline

```javascript
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';

const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
  pipelineName: 'cloudcart-admin-pipeline'
});

// Source stage: GitHub
// Build stage: Build Docker image
// Deploy stage: Update ECS service
```

**Automates:**
- Build on git push
- Run tests
- Push to ECR
- Deploy to ECS

---

## Cost Management

### ECS/Fargate Pricing

**Per Task:**
- **CPU:** $0.04048 per vCPU/hour
- **Memory:** $0.004445 per GB/hour

**Our Configuration:**
- 0.25 vCPU = $0.01012/hour
- 0.5 GB RAM = $0.002222/hour
- **Total:** $0.012342/hour = **$8.89/month** (24/7)

**ALB Pricing:**
- **Fixed:** $0.0225/hour = $16.20/month
- **LCU:** $0.008/LCU-hour (minimal for low traffic)

**Total:** ~$25/month if running 24/7

### Cost Optimization

**Stop When Not In Use:**
```bash
aws ecs update-service \
  --cluster cloudcart-admin-cluster \
  --service admin-dashboard-service \
  --desired-count 0
```

**Start When Needed:**
```bash
aws ecs update-service \
  --cluster cloudcart-admin-cluster \
  --service admin-dashboard-service \
  --desired-count 1
```

**Savings:** ~$25/month → ~$0/month when stopped

---

## Troubleshooting

### Container Won't Start

**Check task logs:**
```bash
aws logs tail /ecs/admin-dashboard --follow
```

**Common issues:**
- Missing environment variables
- Wrong image URI
- Port mapping incorrect
- Application crash on startup

---

### ALB Returns 503 Service Unavailable

**Check target health:**
```bash
aws elbv2 describe-target-health --target-group-arn $TG_ARN
```

**Common causes:**
- No healthy targets
- Health check failing
- Container not listening on correct port
- Security group blocking traffic

---

### Health Check Failing

**Test directly:**
```bash
# Get task private IP
TASK_IP=$(aws ecs describe-tasks \
  --cluster cloudcart-admin-cluster \
  --tasks $TASK_ARN \
  --query 'tasks[0].containers[0].networkInterfaces[0].privateIpv4Address' \
  --output text)

# Test from within VPC (or use EC2 instance)
curl http://$TASK_IP:3000/health
```

**Common causes:**
- `/health` endpoint not implemented
- Application crashed
- Wrong port
- Timeout too short

---

## Discussion Questions

1. **Containers vs. Lambda:**
   - When would you choose each?
   - What are the cost implications?

2. **Public vs. Private Subnets:**
   - What are the security implications?
   - When is NAT Gateway worth the cost?

3. **Fargate vs. EC2 for ECS:**
   - When would you use EC2?
   - What control do you lose with Fargate?

4. **Scaling Strategies:**
   - How does auto-scaling work?
   - What metrics should trigger scaling?

---

## Next Steps

### Complete the Project

You now have a fully functional AWS serverless + container hybrid application!

**What You've Built:**
- Serverless API (Lambda + API Gateway)
- NoSQL Database (DynamoDB)
- Object Storage (S3)
- Message Queue (SQS)
- Monitoring (CloudWatch)
- Authentication (Lambda Authorizer)
- Containerized Web App (ECS/Fargate)
- Load Balancing (ALB)

### Extend the Project

**Ideas:**
1. Add user management with Cognito
2. Implement WebSocket for real-time updates
3. Add caching with ElastiCache
4. Set up CI/CD with CodePipeline
5. Add Aurora database for reporting
6. Implement GraphQL API with AppSync
7. Add image processing with Lambda

---

## Cleanup

To avoid charges, stop or delete resources:

**Stop ECS Service:**
```bash
aws ecs update-service \
  --cluster cloudcart-admin-cluster \
  --service admin-dashboard-service \
  --desired-count 0
```

**Delete Entire Stack:**
```bash
cd infra
npm run destroy
```

Confirm when prompted. This deletes ALL resources.

---

## Additional Resources

- [Amazon ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [AWS Fargate Documentation](https://docs.aws.amazon.com/fargate/)
- [Docker Documentation](https://docs.docker.com/)
- [ALB Documentation](https://docs.aws.amazon.com/elasticloadbalancing/)
- [ECR Documentation](https://docs.aws.amazon.com/ecr/)

---

## Congratulations! 🎉

You've completed all 5 sessions and built a comprehensive AWS cloud application demonstrating:

- ✅ Serverless computing
- ✅ Container orchestration
- ✅ Database design
- ✅ API security
- ✅ Monitoring & observability
- ✅ Infrastructure as code

**You're now ready to build production AWS applications!**
