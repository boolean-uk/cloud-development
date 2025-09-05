
# CloudCart MVP — Hints & Phases

These hints match the simplified MVP: **API Gateway + Lambda + DynamoDB + SQS** (no Express, no ECS, no Aurora).

---

## Phase 1: Bootstrap CDK and API Service (0.5h)

### Objective
Set up the base infrastructure and application layout.

### Tasks
- Initialize an AWS CDK app in **JavaScript**.
- Create an **HTTP API Gateway** in CDK.
- Scaffold folder structure for Lambda handlers under `services/`.
- Add a trivial Lambda + `/hello` route to verify deploy.

### Commands
```bash
mkdir cloudcart && cd cloudcart
mkdir infra && cd infra
cdk init app --language=javascript
```

### CDK Structure (infra/)
```
cloudcart/
├── infra/              # AWS CDK (JavaScript)
│   ├── bin/            # CDK app entry
│   └── lib/            # Stack definitions
├── services/           # Lambda handlers
│   ├── products/
│   ├── cart/
│   └── orders/
└── scripts/            # Seeder scripts
```

### Sample CDK Code (infra/lib/cloudcart-stack.js)
```js
import { Stack } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwInt from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as node from 'aws-cdk-lib/aws-lambda-nodejs';

export class CloudCartStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const helloFn = new node.NodejsFunction(this, 'HelloFn', {
      entry: '../services/hello.js',
      runtime: lambda.Runtime.NODEJS_22_X
    });

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi');
    httpApi.addRoutes({
      path: '/hello',
      methods: [apigwv2.HttpMethod.GET],
      integration: new apigwInt.HttpLambdaIntegration('HelloIntegration', helloFn),
    });
  }
}
```

---

## Phase 2: Product Catalog API – DynamoDB (1h)

### Objective
Implement the product catalog with category filtering.

### Tasks
- Create DynamoDB table `Products` with `id` as the partition key.
- Add a Global Secondary Index (GSI) on `category`.
- Create 3 Lambdas:
    - `GET /products` → list all
    - `GET /products/{id}` → fetch by ID
    - `GET /categories/{name}` → query by category (via GSI)

### CDK Code
```js
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

const products = new dynamodb.Table(this, 'ProductsTable', {
  partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
});

products.addGlobalSecondaryIndex({
  indexName: 'gsi_category',
  partitionKey: { name: 'category', type: dynamodb.AttributeType.STRING }
});
```

### Lambda Example (services/products/listByCategory.js)
```js
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE = process.env.PRODUCTS_TABLE;
const GSI = 'gsi_category';

export const handler = async (event) => {
  const name = event?.pathParameters?.name;
  if (!name) return { statusCode: 400, body: 'Missing category name' };
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: GSI,
    KeyConditionExpression: '#c = :v',
    ExpressionAttributeNames: { '#c': 'category' },
    ExpressionAttributeValues: { ':v': { S: name } }
  }));
  const items = (res.Items || []).map(unmarshall);
  return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(items) };
};
```

---

## Phase 3: Cart Service (0.5h)

### Objective
Allow users to manage a cart. For MVP, cart state is **in-memory** (per Lambda container).

### Tasks
- One Lambda handles `/cart` with:
    - `GET` → view cart
    - `POST` → add item (`{ id, qty }`)
    - `DELETE` → remove item (`{ id }`)

### Lambda Example (services/cart/handler.js)
```js
const carts = {}; // ephemeral, per warm container

export const handler = async (event) => {
  const user = event.requestContext?.http?.sourceIp || 'anon';
  carts[user] ||= [];

  const method = event.requestContext?.http?.method || 'GET';
  if (method === 'GET') return json(200, { items: carts[user] });

  const body = JSON.parse(event.body || '{}');
  if (method === 'POST') {
    if (!body.id || !body.qty) return text(400, 'id & qty required');
    const idx = carts[user].findIndex(i => i.id === body.id);
    if (idx >= 0) carts[user][idx].qty += body.qty;
    else carts[user].push({ id: body.id, qty: body.qty });
    return json(200, { items: carts[user] });
  }
  if (method === 'DELETE') {
    if (!body.id) return text(400, 'id required');
    const idx = carts[user].findIndex(i => i.id === body.id);
    if (idx >= 0) carts[user].splice(idx, 1);
    return json(200, { items: carts[user] });
  }
  return text(405, 'Method not allowed');
};

const json = (code, obj) => ({ statusCode: code, headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) });
const text = (code, msg) => ({ statusCode: code, body: msg });
```

---

## Phase 4: Checkout + SQS (1h)

### Objective
Process orders asynchronously with SQS + Lambda.

### Tasks
- Create SQS queue in CDK (+ optional DLQ).
- `POST /checkout` Lambda → sends message to SQS.
- **Worker** Lambda → consumes messages and logs/handles orders.

### CDK Code
```js
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Duration } from 'aws-cdk-lib';

const dlq = new sqs.Queue(this, 'CheckoutDLQ');
const checkoutQueue = new sqs.Queue(this, 'CheckoutQueue', {
  visibilityTimeout: Duration.seconds(60),
  deadLetterQueue: { queue: dlq, maxReceiveCount: 3 }
});
```

### Checkout Lambda (services/orders/checkout.js)
```js
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
const sqs = new SQSClient({});
const QUEUE_URL = process.env.CHECKOUT_QUEUE_URL;

export const handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const id = body.id || String(Date.now());
  await sqs.send(new SendMessageCommand({ QueueUrl: QUEUE_URL, MessageBody: JSON.stringify({ ...body, id }) }));
  return { statusCode: 202, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ queued: true, id }) };
};
```

### Worker Lambda (services/orders/worker.js)
```js
export const handler = async (event) => {
  for (const rec of (event.Records || [])) {
    const msg = JSON.parse(rec.body);
    console.log('Order received:', msg);
  }
  return {};
};
```

---

## Phase 5 (Optional): File Uploads – S3 (0.5h)

### Objective
Support product image uploads using signed URLs (optional for MVP).

### Tasks
- Create an S3 bucket via CDK.
- Add Lambda to generate `PutObject` signed URLs.
- (Wire as `/uploads/sign` route if you have time.)

---

## Phase 6+ (Extensions)

- **Notifications (SNS)** — order confirmations via email/SMS.
- **Auth (JWT + Lambda Authorizer)** — protect `/checkout` and future `/orders` routes.
- **Aurora PostgreSQL + RDS Proxy** — relational data (users, persistent carts, orders).
- **Frontend Hosting** — React via S3 + CloudFront + Route 53.
- **Monitoring & CI/CD** — CloudWatch alarms + GitHub Actions/CDK Pipelines.
