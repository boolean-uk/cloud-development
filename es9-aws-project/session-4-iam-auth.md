# Session 4: Advanced IAM & Lambda Authorizer (2 hours)

## Learning Objectives
- Lambda authorizers for API Gateway
- IAM roles and policies with least privilege
- API authentication patterns
- Role-based access control (RBAC)
- Secure API design

## What You'll Build
1. Custom Lambda authorizer for API Gateway
2. Admin API endpoints (create, update, delete products)
3. Two user roles: Customer and Admin
4. API key-based authentication
5. Fine-grained IAM policies

## Architecture Overview

```
API Request → API Gateway → Lambda Authorizer → Validate API Key
                                ↓
                         Return IAM Policy
                                ↓
                         Allow/Deny Request
                                ↓
                    Admin Lambda Functions
```

---

## Implementation Steps

### Step 1: Understanding Lambda Authorizers (20 min)

**What is a Lambda Authorizer?**

A Lambda authorizer (formerly Custom Authorizer) is a Lambda function that controls access to your API. It runs before your API reaches the backend.

**Flow:**
1. Client makes request with auth token (API key, JWT, etc.)
2. API Gateway extracts token and invokes authorizer Lambda
3. Authorizer validates token and returns IAM policy
4. API Gateway caches the policy
5. Request proceeds if policy allows, blocked if denies

**Types of Authorizers:**
- **Token-based:** Uses bearer token (Authorization header)
- **Request-based:** Uses request parameters (headers, query strings)

**We're using Request-based with x-api-key header.**

---

### Step 2: Review Authorizer Lambda (25 min)

Examine `services/auth/authorizer.js`:

```javascript
const API_KEYS = {
  'admin-key-cloudcart-2024': {
    role: 'admin',
    userId: 'admin-user'
  },
  'customer-key-cloudcart-2024': {
    role: 'customer',
    userId: 'customer-user'
  }
};

export const handler = async (event) => {
  const apiKey = event.headers?.['x-api-key'] || event.headers?.['X-Api-Key'];

  if (!apiKey) {
    return generatePolicy(null, 'Deny', event.routeArn);
  }

  const user = API_KEYS[apiKey];

  if (!user) {
    return generatePolicy(null, 'Deny', event.routeArn);
  }

  // Check if admin role is required for this route
  const isAdminRoute = event.routeKey?.includes('/admin/');

  if (isAdminRoute && user.role !== 'admin') {
    return generatePolicy(user.userId, 'Deny', event.routeArn);
  }

  return generatePolicy(user.userId, 'Allow', event.routeArn, {
    role: user.role,
    userId: user.userId
  });
};

function generatePolicy(principalId, effect, resource, context = {}) {
  return {
    principalId: principalId || 'unknown',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: resource
      }]
    },
    context: context
  };
}
```

**Key Concepts:**

**1. API Key Storage:**
- **Current:** Hardcoded (for learning only!)
- **Production:** Store in AWS Secrets Manager or DynamoDB
- **Never commit keys to Git!**

**2. Authorization Logic:**
```javascript
// No API key → Deny
if (!apiKey) return deny;

// Invalid API key → Deny
if (!user) return deny;

// Admin route but not admin role → Deny
if (isAdminRoute && user.role !== 'admin') return deny;

// Otherwise → Allow
return allow;
```

**3. IAM Policy Document:**
```javascript
{
  Version: '2012-10-17',
  Statement: [{
    Action: 'execute-api:Invoke',
    Effect: 'Allow',  // or 'Deny'
    Resource: 'arn:aws:execute-api:...'
  }]
}
```

**4. Context:**
- Passed to backend Lambda functions
- Accessible via `event.requestContext.authorizer`
- Use for user info, permissions, etc.

**Discussion:**
- Why check for both lowercase and uppercase header names?
- What happens if authorizer throws an error?
- How long is the policy cached?

---

### Step 3: Review CDK Authorizer Configuration (20 min)

In `infra/lib/cloudcart-stack.js`:

```javascript
// Lambda Authorizer
const authorizer = new node.NodejsFunction(this, 'AuthorizerFn', {
  entry: L('auth/authorizer.js'),
  ...defaultFnProps
});

const authorizerConfig = new apigwv2.CfnAuthorizer(this, 'ApiAuthorizer', {
  apiId: httpApi.apiId,
  authorizerType: 'REQUEST',
  authorizerUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${authorizer.functionArn}/invocations`,
  name: 'CloudCartAuthorizer',
  identitySource: ['$request.header.x-api-key'],
  authorizerPayloadFormatVersion: '2.0',
  enableSimpleResponses: false,
  authorizerResultTtlInSeconds: 300
});

authorizer.addPermission('AuthorizerInvokePermission', {
  principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
  sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${httpApi.apiId}/*`
});
```

**Configuration Details:**

**authorizerType:**
- **REQUEST:** Uses request parameters
- **TOKEN:** Uses Authorization header with Bearer token

**identitySource:**
- Headers, query params, or context variables to extract
- Used for caching key
- `['$request.header.x-api-key']` means cache by API key

**authorizerResultTtlInSeconds:**
- **300 seconds (5 minutes):** How long to cache the policy
- **0:** No caching (always invoke authorizer)
- **Max:** 3600 (1 hour)

**enableSimpleResponses:**
- **false:** Return full IAM policy (what we use)
- **true:** Return just boolean (simpler but less control)

**Permission:**
- API Gateway needs permission to invoke your Lambda
- Without this, you get "Authorizer failure" errors

---

### Step 4: Explore Admin API Endpoints (30 min)

#### Create Product (services/admin/createProduct.js)

```javascript
export const handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const { id, name, price, category, imageUrl, description } = body;

  // Validation
  if (!id || !name || !price || !category) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields' })
    };
  }

  if (typeof price !== 'number' || price <= 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Price must be positive number' })
    };
  }

  const item = {
    id: { S: String(id) },
    name: { S: name },
    price: { N: String(price) },
    category: { S: category }
  };

  if (imageUrl) item.imageUrl = { S: imageUrl };
  if (description) item.description = { S: description };

  await ddb.send(new PutItemCommand({
    TableName: TABLE,
    Item: item
  }));

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: 'Product created successfully',
      product: { id, name, price, category }
    })
  };
};
```

**Key Points:**
- **Input validation:** Check required fields and data types
- **201 Created:** Proper HTTP status for resource creation
- **Flexible schema:** Optional fields like imageUrl, description

#### Update Product (services/admin/updateProduct.js)

```javascript
export const handler = async (event) => {
  const id = event.pathParameters?.id;
  const body = JSON.parse(event.body || '{}');

  // Check if product exists first
  const existing = await ddb.send(new GetItemCommand({
    TableName: TABLE,
    Key: { id: { S: id } }
  }));

  if (!existing.Item) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
  }

  // Build update expression dynamically
  const updates = [];
  const attrNames = {};
  const attrValues = {};

  if (body.name !== undefined) {
    updates.push('#name = :name');
    attrNames['#name'] = 'name';
    attrValues[':name'] = { S: body.name };
  }

  if (body.price !== undefined) {
    updates.push('#price = :price');
    attrNames['#price'] = 'price';
    attrValues[':price'] = { N: String(body.price) };
  }

  // ... more fields

  await ddb.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { id: { S: id } },
    UpdateExpression: `SET ${updates.join(', ')}`,
    ExpressionAttributeNames: attrNames,
    ExpressionAttributeValues: attrValues
  }));

  return { statusCode: 200, body: JSON.stringify({ message: 'Updated' }) };
};
```

**Advanced Concepts:**
- **Partial updates:** Only update fields provided
- **Dynamic expressions:** Build UpdateExpression from input
- **ExpressionAttributeNames:** Required for reserved words like 'name'
- **Check existence:** Return 404 if product doesn't exist

#### Delete Product (services/admin/deleteProduct.js)

```javascript
export const handler = async (event) => {
  const id = event.pathParameters?.id;

  // Verify exists before deleting
  const existing = await ddb.send(new GetItemCommand({
    TableName: TABLE,
    Key: { id: { S: id } }
  }));

  if (!existing.Item) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
  }

  await ddb.send(new DeleteItemCommand({
    TableName: TABLE,
    Key: { id: { S: id } }
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Product deleted', id })
  };
};
```

**Best Practices:**
- **Check existence:** Don't silently succeed on missing items
- **200 OK:** For successful deletion (not 204 No Content with body)
- **Return confirmation:** Let client know what was deleted

---

### Step 5: IAM Permissions for Admin Functions (20 min)

In `infra/lib/cloudcart-stack.js`:

```javascript
const createProduct = new node.NodejsFunction(this, 'CreateProductFn', {
  entry: L('admin/createProduct.js'),
  environment: { PRODUCTS_TABLE: products.tableName },
  ...defaultFnProps
});
products.grantWriteData(createProduct);

const updateProduct = new node.NodejsFunction(this, 'UpdateProductFn', {
  entry: L('admin/updateProduct.js'),
  environment: { PRODUCTS_TABLE: products.tableName },
  ...defaultFnProps
});
products.grantReadWriteData(updateProduct);

const deleteProduct = new node.NodejsFunction(this, 'DeleteProductFn', {
  entry: L('admin/deleteProduct.js'),
  environment: { PRODUCTS_TABLE: products.tableName },
  ...defaultFnProps
});
products.grantReadWriteData(deleteProduct);
```

**Permission Grants:**

**grantWriteData:**
- `dynamodb:PutItem`
- `dynamodb:UpdateItem`
- `dynamodb:DeleteItem`
- `dynamodb:BatchWriteItem`

**grantReadWriteData:**
- All write permissions above
- Plus: `dynamodb:GetItem`, `dynamodb:Query`, `dynamodb:Scan`

**grantReadData:**
- Read-only permissions

**Why different grants?**
- **createProduct:** Only needs PutItem
- **updateProduct:** Needs GetItem (check existence) + UpdateItem
- **deleteProduct:** Needs GetItem (check existence) + DeleteItem

**Least Privilege Principle:**
Only grant the minimum permissions needed for the function to work.

---

### Step 6: Attach Authorizer to Routes (15 min)

```javascript
// Admin routes (protected by authorizer)
const adminRoute1 = httpApi.addRoutes({
  path: '/admin/products',
  methods: [apigwv2.HttpMethod.POST],
  integration: integ(createProduct)
});

const adminRoute2 = httpApi.addRoutes({
  path: '/admin/products/{id}',
  methods: [apigwv2.HttpMethod.PATCH],
  integration: integ(updateProduct)
});

const adminRoute3 = httpApi.addRoutes({
  path: '/admin/products/{id}',
  methods: [apigwv2.HttpMethod.DELETE],
  integration: integ(deleteProduct)
});

// Attach authorizer to all admin routes
for (const route of [...adminRoute1, ...adminRoute2, ...adminRoute3]) {
  const cfnRoute = route.node.defaultChild;
  cfnRoute.authorizerId = authorizerConfig.ref;
  cfnRoute.authorizationType = 'CUSTOM';
}
```

**What This Does:**
1. Creates three admin routes
2. Loops through all routes
3. Attaches the authorizer to each
4. Sets authorization type to CUSTOM

**Result:** All `/admin/*` routes now require valid API key.

---

### Step 7: Test Authentication (30 min)

#### Setup
```bash
export API=<your-api-url>
```

#### Test 1: No API Key (Should Fail)
```bash
curl -X POST $API/admin/products \
  -H 'Content-Type: application/json' \
  -d '{"id":"10","name":"Test","price":99.99,"category":"test"}'
```

**Expected Response:**
```json
{"message":"Unauthorized"}
```
**Status Code:** 401

---

#### Test 2: Invalid API Key (Should Fail)
```bash
curl -X POST $API/admin/products \
  -H 'x-api-key: invalid-key-123' \
  -H 'Content-Type: application/json' \
  -d '{"id":"10","name":"Test","price":99.99,"category":"test"}'
```

**Expected Response:**
```json
{"message":"Unauthorized"}
```
**Status Code:** 401

---

#### Test 3: Customer Key on Admin Endpoint (Should Fail)
```bash
curl -X POST $API/admin/products \
  -H 'x-api-key: customer-key-cloudcart-2024' \
  -H 'Content-Type: application/json' \
  -d '{"id":"10","name":"Test","price":99.99,"category":"test"}'
```

**Expected Response:**
```json
{"message":"Forbidden"}
```
**Status Code:** 403

**Why 403 not 401?**
- **401 Unauthorized:** Authentication failed (no/invalid credentials)
- **403 Forbidden:** Authenticated but not authorized (insufficient permissions)

---

#### Test 4: Admin Key (Should Succeed)
```bash
curl -X POST $API/admin/products \
  -H 'x-api-key: admin-key-cloudcart-2024' \
  -H 'Content-Type: application/json' \
  -d '{"id":"10","name":"Mechanical Keyboard","price":129.99,"category":"electronics","description":"RGB backlit"}'
```

**Expected Response:**
```json
{
  "message": "Product created successfully",
  "product": {
    "id": "10",
    "name": "Mechanical Keyboard",
    "price": 129.99,
    "category": "electronics"
  }
}
```
**Status Code:** 201

**Verify it was created:**
```bash
curl $API/products | jq '.[] | select(.id=="10")'
```

---

#### Test 5: Update Product
```bash
curl -X PATCH $API/admin/products/10 \
  -H 'x-api-key: admin-key-cloudcart-2024' \
  -H 'Content-Type: application/json' \
  -d '{"price":119.99,"description":"RGB backlit, Cherry MX switches"}'
```

**Expected:** 200 OK

---

#### Test 6: Delete Product
```bash
curl -X DELETE $API/admin/products/10 \
  -H 'x-api-key: admin-key-cloudcart-2024'
```

**Expected:** 200 OK with confirmation

**Verify deletion:**
```bash
curl $API/products/10
```
**Expected:** 404 Not Found

---

### Step 8: View Authorizer Logs (10 min)

```bash
# Tail authorizer logs
aws logs tail /aws/lambda/CloudCartMvpStack-AuthorizerFn --follow

# Make some test requests
curl -X POST $API/admin/products \
  -H 'x-api-key: invalid-key'

# You'll see log output like:
# "No API key provided"
# "Invalid API key"
# "Valid API key for user: admin-user, role: admin"
```

**What to look for:**
- Authorization decisions (Allow/Deny)
- User identification
- Role checks
- Any errors

---

### Step 9: Understanding Authorizer Caching (10 min)

**Cache Key:**
Based on `identitySource`: `$request.header.x-api-key`

**Cache Behavior:**
```bash
# First request with admin key → Invokes authorizer
curl -X POST $API/admin/products \
  -H 'x-api-key: admin-key-cloudcart-2024' \
  -d '{"id":"11","name":"Test1","price":10,"category":"test"}'

# Second request within 5 minutes → Uses cached policy
curl -X POST $API/admin/products \
  -H 'x-api-key: admin-key-cloudcart-2024' \
  -d '{"id":"12","name":"Test2","price":20,"category":"test"}'
```

**Check invocation count:**
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=CloudCartMvpStack-AuthorizerFn \
  --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

**Cache Implications:**
- **Pro:** Reduces latency and cost
- **Con:** Permissions changes delayed up to TTL
- **Use Case:** Good for API keys (rarely change)
- **Not Good For:** JWT with short expiry

---

## Verification Checklist

- [ ] Authorizer Lambda deployed and configured
- [ ] Can't access admin endpoints without API key
- [ ] Can't access admin endpoints with customer key
- [ ] Can access admin endpoints with admin key
- [ ] Can create products with admin key
- [ ] Can update products with admin key
- [ ] Can delete products with admin key
- [ ] Authorizer logs show authorization decisions
- [ ] Policy caching works (check CloudWatch metrics)

---

## Advanced Topics

### Implementing JWT Authentication

Replace API keys with JWTs for production:

```javascript
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;

export const handler = async (event) => {
  const token = event.headers?.authorization?.replace('Bearer ', '');

  if (!token) {
    return generatePolicy(null, 'Deny', event.routeArn);
  }

  try {
    const decoded = jwt.verify(token, SECRET);

    return generatePolicy(decoded.userId, 'Allow', event.routeArn, {
      role: decoded.role,
      userId: decoded.userId,
      email: decoded.email
    });
  } catch (error) {
    return generatePolicy(null, 'Deny', event.routeArn);
  }
};
```

**Benefits:**
- Stateless (no database lookup)
- Contains user claims
- Industry standard
- Supports expiration

---

### Using Amazon Cognito

For production authentication:

```javascript
// Replace custom authorizer with Cognito
const authorizer = new apigwv2.HttpAuthorizer(this, 'CognitoAuthorizer', {
  httpApi,
  type: apigwv2.HttpAuthorizerType.JWT,
  jwtAudience: [userPoolClient.userPoolClientId],
  jwtIssuer: `https://cognito-idp.${region}.amazonaws.com/${userPool.userPoolId}`,
  identitySource: ['$request.header.Authorization']
});
```

**Benefits:**
- Managed service (no custom code)
- User registration/login UI
- MFA support
- Social login (Google, Facebook)
- Password policies

---

### Fine-Grained Permissions

Add resource-level permissions:

```javascript
// Check if user can modify THIS specific product
const productId = event.pathParameters?.id;
const userId = event.requestContext.authorizer.userId;

// Query ownership table
const ownership = await ddb.send(new GetItemCommand({
  TableName: OWNERSHIP_TABLE,
  Key: {
    productId: { S: productId },
    userId: { S: userId }
  }
}));

if (!ownership.Item) {
  return {
    statusCode: 403,
    body: JSON.stringify({ error: 'You do not own this product' })
  };
}
```

---

## Security Best Practices

### 1. Never Commit Secrets
```bash
# .gitignore should include:
.env
.env.local
secrets.json
*-secrets.json
```

### 2. Use AWS Secrets Manager
```javascript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});
const response = await client.send(new GetSecretValueCommand({
  SecretId: 'cloudcart/api-keys'
}));

const apiKeys = JSON.parse(response.SecretString);
```

### 3. Rotate Keys Regularly
- API keys should expire
- Implement key rotation
- Notify users before expiration

### 4. Log Authorization Failures
```javascript
if (!user) {
  console.warn('Invalid API key attempt:', {
    key: apiKey.substring(0, 8) + '***',
    ip: event.requestContext.http.sourceIp,
    route: event.routeKey
  });
  return deny;
}
```

### 5. Rate Limiting
Add API Gateway throttling:
```javascript
const apiStage = new apigwv2.HttpStage(this, 'Stage', {
  httpApi,
  throttle: {
    rateLimit: 100,      // requests per second
    burstLimit: 200      // concurrent requests
  }
});
```

---

## Discussion Questions

1. **Authentication vs Authorization:**
   - What's the difference?
   - Why do we need both?

2. **Caching Trade-offs:**
   - When is caching beneficial?
   - When should you disable it?
   - How does TTL affect security?

3. **IAM Least Privilege:**
   - Why give different permissions to each Lambda?
   - What happens if you grant too many permissions?

4. **API Key Management:**
   - How would you implement key rotation?
   - Where should keys be stored?
   - How to handle compromised keys?

---

## Troubleshooting

### "Unauthorized" even with correct API key

**Check:**
```bash
# View authorizer logs
aws logs tail /aws/lambda/CloudCartMvpStack-AuthorizerFn --follow

# Test authorizer directly
aws lambda invoke \
  --function-name CloudCartMvpStack-AuthorizerFn \
  --payload '{"headers":{"x-api-key":"admin-key-cloudcart-2024"},"routeKey":"POST /admin/products"}' \
  response.json

cat response.json
```

**Common causes:**
- Header name mismatch (check case)
- API key typo
- Authorizer returning wrong policy format
- Cache serving old policy

---

### Admin endpoint returns 500

**Check:**
```bash
# Admin Lambda logs
aws logs tail /aws/lambda/CloudCartMvpStack-CreateProductFn --follow
```

**Common causes:**
- Missing PRODUCTS_TABLE environment variable
- IAM permissions not granted
- Invalid request body
- DynamoDB table doesn't exist

---

## Cost Implications

### Lambda Authorizer
- **Invocations:** First 1M free, then $0.20 per 1M
- **Duration:** 128 MB, typically < 100ms
- **With caching:** Much fewer invocations

### Example Calculation
- 100,000 API calls/day
- 5-minute cache
- ~20,000 authorizer invocations/day
- **Cost:** $0 (within free tier)

---

## Next Steps

In Session 5, we'll add:
- Docker containerization
- ECS/Fargate cluster
- Admin web dashboard
- Application Load Balancer
- Container orchestration

Continue to [Session 5: ECS & Containers](./session-5-ecs-fargate.md)

---

## Additional Resources

- [Lambda Authorizers Documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [API Gateway Security](https://docs.aws.amazon.com/apigateway/latest/developerguide/security.html)
- [JWT.io](https://jwt.io/) - JWT debugger
