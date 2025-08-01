## Phase 1: Bootstrap CDK and API Service (0.5h)

### Objective
Set up the base infrastructure and application layout for the project.

### Tasks
- Initialize an AWS CDK app in TypeScript.
- Scaffold an Express.js application using the Express generator.
- Set up TypeScript and nodemon for local development.
- Add a Dockerfile to support ECS deployment later.

### Commands
```bash
mkdir cloudcart && cd cloudcart
mkdir infra
cd infra
cdk init app --language=typescript
cd ..
npx express-generator --no-view services/api
cd services/api && npm install && npm install typescript ts-node-dev --save-dev
```

### Dockerfile Example (services/api/Dockerfile)
```dockerfile
FROM node:22
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### CDK Structure (infra/)
```
infra/
  ├── bin/infra.ts
  └── lib/infra-stack.ts
```

### Sample CDK Code (infra/lib/<your-stack-name>.ts)
```ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'CloudCartVPC', {
      maxAzs: 2
    });
  }
}
```

---

## Phase 2: Product Catalog API – DynamoDB (1h)

### Objective
Build the product catalog backend, allowing users to list and filter products.

### Tasks
- Create a DynamoDB table named `Products` with `productId` as the partition key.
- Add a Global Secondary Index (GSI) on `category` to support product filtering.
- Implement API routes in Express for CRUD operations on products.

### CDK Code (infra/lib/<your-stack-name>.ts)
```ts
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

const productTable = new dynamodb.Table(this, 'ProductTable', {
  partitionKey: { name: 'productId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
});

productTable.addGlobalSecondaryIndex({
  indexName: 'CategoryIndex',
  partitionKey: { name: 'category', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL
});
```

### Node.js Route (services/api/routes/products.js)
```js
const AWS = require('aws-sdk');
const router = require('express').Router();
const uuid = require('uuid').v4;
const ddb = new AWS.DynamoDB.DocumentClient();

router.post('/', async (req, res) => {
  const { name, category, price } = req.body;
  await ddb.put({ TableName: 'ProductTable', Item: { productId: uuid(), name, category, price } }).promise();
  res.status(201).send('Product added');
});

router.get('/category/:name', async (req, res) => {
  const category = req.params.name;
  const result = await ddb.query({
    TableName: 'ProductTable',
    IndexName: 'CategoryIndex',
    KeyConditionExpression: 'category = :cat',
    ExpressionAttributeValues: {
      ':cat': category
    }
  }).promise();
  res.json(result.Items);
});
```

---

## Phase 3: User Management – Aurora (1h)

### Objective
Create and manage relational data for users, carts, and orders using Amazon Aurora Serverless PostgreSQL.

### Tasks
- Define Aurora Serverless cluster in CDK
- Set up initial SQL schema for `users`, `orders`, and `carts` tables
- Integrate Sequelize/TypeORM for interacting with Aurora
- Use Secrets Manager for credential management

### CDK Code
```ts
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

const dbSecret = new secretsmanager.Secret(this, 'DBSecret');

const cluster = new rds.ServerlessCluster(this, 'AuroraCluster', {
  engine: rds.DatabaseClusterEngine.AURORA_POSTGRESQL,
  vpc,
  credentials: rds.Credentials.fromSecret(dbSecret),
  defaultDatabaseName: 'CloudCartDB',
});
```

### Node.js Connection Example
```ts
const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST,
  dialect: 'postgres'
});
```

---

## Phase 4: File Uploads – S3 (0.5h)

### Objective
Allow uploading product images to Amazon S3 securely using signed URLs.

### Tasks
- Create an S3 bucket using CDK
- Configure IAM policies to allow signed URL usage
- Implement signed URL generation endpoint

### CDK Code
```ts
import * as s3 from 'aws-cdk-lib/aws-s3';

const bucket = new s3.Bucket(this, 'ProductMediaBucket', {
  versioned: true,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
```

### Node.js Route
```js
const s3 = new AWS.S3();
router.get('/upload-url', async (req, res) => {
  const { key } = req.query;
  const url = await s3.getSignedUrlPromise('putObject', {
    Bucket: process.env.BUCKET_NAME,
    Key: key,
    Expires: 60
  });
  res.json({ url });
});
```

---

## Phase 5: Cart Service (0.5h)

### Objective
Allow users to manage their shopping carts, with backend logic supported by Aurora or DynamoDB.

### Tasks
- Use Aurora to store cart data with user and product references
- Implement add, remove, and view routes for cart management

### Node.js Route Example
```js
router.post('/cart/add', async (req, res) => {
  const { userId, productId } = req.body;
  await sequelize.query(`INSERT INTO carts (user_id, product_id) VALUES ($1, $2)`, {
    bind: [userId, productId]
  });
  res.send('Added to cart');
});
```

---

## Phase 6: Order Placement + SQS (1h)

### Objective
Asynchronously process orders using SQS and Lambda, improving scalability and decoupling services.

### Tasks
- Create SQS queue in CDK
- Send order data to queue from Express
- Create Lambda function that consumes messages

### CDK Code
```ts
import * as sqs from 'aws-cdk-lib/aws-sqs';

const queue = new sqs.Queue(this, 'OrderQueue', {
  visibilityTimeout: cdk.Duration.seconds(300)
});
```

### Node.js Route
```js
const sqs = new AWS.SQS();
router.post('/checkout', async (req, res) => {
  const params = {
    MessageBody: JSON.stringify(req.body),
    QueueUrl: process.env.ORDER_QUEUE_URL
  };
  await sqs.sendMessage(params).promise();
  res.send('Order received');
});
```

---

## Phase 7: Notification System – SNS (0.5h)

### Objective
Send SMS or email notifications to users upon key events like order confirmations.

### Tasks
- Create SNS topic in CDK
- Subscribe emails/SMS
- Publish messages from Lambda

### CDK Code
```ts
import * as sns from 'aws-cdk-lib/aws-sns';

const topic = new sns.Topic(this, 'OrderTopic');
```

### Node.js Usage
```js
const sns = new AWS.SNS();
await sns.publish({
  TopicArn: process.env.TOPIC_ARN,
  Message: 'Your order has been received!'
}).promise();
```

---

## Phase 8: ECS App Service + ALB (1h)

### Objective
Deploy the API service on ECS using Docker, fronted by an Application Load Balancer.

### Tasks
- Dockerize Express app
- Push image to ECR
- Deploy to ECS Fargate via CDK
- Attach ALB and route traffic

### CDK Sample
```ts
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';

const cluster = new ecs.Cluster(this, 'Cluster', { vpc });
const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef');

const container = taskDef.addContainer('AppContainer', {
  image: ecs.ContainerImage.fromRegistry('your-repo/app-image'),
  memoryLimitMiB: 512
});

const service = new ecs.FargateService(this, 'Service', {
  cluster,
  taskDefinition: taskDef
});

const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
  vpc,
  internetFacing: true
});
```

---

## Phase 9: Global CDN Shopfront + Route 53 (1h)

### Objective
Host and serve the frontend React app globally using CloudFront and Route 53.

### Tasks
- Host frontend in S3
- Set up CloudFront distribution
- Point custom domain via Route 53

### CDK Code
```ts
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

const distribution = new cloudfront.CloudFrontWebDistribution(this, 'Dist', {
  originConfigs: [
    {
      s3OriginSource: { s3BucketSource: bucket },
      behaviors: [{ isDefaultBehavior: true }]
    }
  ]
});
```

---

## Phase 10: Auth Layer – API Gateway + Lambda Authorizer (1h)

### Objective
Add security to APIs using API Gateway with Lambda-based JWT validation.

### Tasks
- Implement Lambda authorizer for JWT
- Attach to API Gateway
- Apply to secure endpoints

### CDK Sample
```ts
import * as apigw from 'aws-cdk-lib/aws-apigateway';

const authorizerFn = new lambda.Function(this, 'AuthorizerFunction', { /* config */ });
const api = new apigw.RestApi(this, 'CloudCartAPI');

const authorizer = new apigw.TokenAuthorizer(this, 'APIAuthorizer', {
  handler: authorizerFn
});

api.root.addMethod('GET', new apigw.LambdaIntegration(apiHandler), {
  authorizer
});
```

---

## Phase 11: Secrets Management + Roles (0.5h)

### Objective
Securely manage secrets and control access via IAM.

### Tasks
- Store secrets in AWS Secrets Manager
- Grant ECS and Lambda access via CDK

### CDK Sample
```ts
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

const secret = new secretsmanager.Secret(this, 'AppSecret');
secret.grantRead(yourServiceRole);
```

---

## Phase 12: Monitoring, Alarms & CI/CD (1h)

### Objective
Add observability and automation for deployment.

### Tasks
- Create CloudWatch metrics and alarms
- Automate deploys with GitHub Actions

### CDK Example
```ts
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

new cloudwatch.Alarm(this, 'HighLatencyAlarm', {
  metric: alb.metricTargetResponseTime(),
  threshold: 1,
  evaluationPeriods: 3
});
```

### GitHub Actions Workflow
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install -g aws-cdk
      - run: npm ci
      - run: cdk deploy --require-approval never
```

---