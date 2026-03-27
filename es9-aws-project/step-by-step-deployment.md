# CloudCart Step-by-Step Deployment Guide
## Complete Tutorial with Detailed Explanations

This guide walks you through deploying CloudCart from scratch with detailed explanations of what each step does and why it's necessary.

---

## 📋 Table of Contents

1. [Prerequisites Check](#prerequisites-check)
2. [Project Setup](#project-setup)
3. [Understanding the Project Structure](#understanding-the-project-structure)
4. [CDK Bootstrap](#cdk-bootstrap)
5. [Deploy the Stack](#deploy-the-stack)
6. [Seed Initial Data](#seed-initial-data)
7. [Test the Deployment](#test-the-deployment)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites Check

### Step 1: Verify Node.js Installation

```bash
node --version
```

**What this does:** Checks if Node.js is installed and shows the version.

**Why:** CloudCart requires Node.js 22.x or higher to run Lambda functions and CDK.

**Expected output:**
```
v22.x.x or higher
```

**If not installed:**
- macOS: `brew install node@22`
- Linux: Visit [nodejs.org](https://nodejs.org)
- Windows: Download from [nodejs.org](https://nodejs.org)

---

### Step 2: Verify AWS CLI

```bash
aws --version
```

**What this does:** Checks if AWS CLI is installed.

**Why:** You need AWS CLI to interact with AWS services and configure credentials.

**Expected output:**
```
aws-cli/2.x.x Python/3.x.x ...
```

**If not installed:**
- macOS: `brew install awscli`
- Linux/Windows: Follow [AWS CLI installation guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

---

### Step 3: Configure AWS Credentials

```bash
aws configure
```

**What this does:** Sets up your AWS credentials for CLI access.

**Why:** CDK needs your credentials to create resources in your AWS account.

**You'll be prompted for:**
1. **AWS Access Key ID**: Your AWS access key (from IAM console)
2. **AWS Secret Access Key**: Your secret key (keep this secure!)
3. **Default region**: e.g., `us-east-1` (choose closest to you)
4. **Default output format**: `json` (recommended)

**To verify credentials:**
```bash
aws sts get-caller-identity
```

**Expected output:**
```json
{
    "UserId": "AIDAXXXXXXXXXX",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/your-username"
}
```

---

### Step 4: Install AWS CDK (Optional but Recommended)

```bash
npm install -g aws-cdk
```

**What this does:** Installs AWS CDK globally on your system.

**Why:** While you can use `npx cdk`, having it installed globally makes commands faster.

**Verify installation:**
```bash
cdk --version
```

**Expected output:**
```
2.x.x (build ...)
```

**Note:** If you don't install globally, use `npx cdk` instead of `cdk` in all commands below.

---

## Project Setup

### Step 5: Navigate to CloudCart Directory

```bash
cd /path/to/cloudcart
pwd
```

**What this does:** Changes to the CloudCart project directory and verifies location.

**Why:** All subsequent commands must be run from the correct directory.

**Expected output:**
```
/path/to/cloudcart
```

---

### Step 6: Install Infrastructure Dependencies

```bash
cd infra
npm install
```

**What this does:**
- Changes to the `infra` directory
- Installs all Node.js dependencies needed for CDK

**Why:** CDK requires `aws-cdk-lib`, `constructs`, and other packages to build your infrastructure.

**What's installed:**
- `aws-cdk-lib` - Core CDK library
- `constructs` - Base classes for CDK constructs
- `esbuild` - Bundles Lambda functions
- `source-map-support` - Helps debug Lambda functions

**Expected output:**
```
added 47 packages in 5s
```

**Note:** You may see security warnings - these are usually for dev dependencies and can be ignored for learning purposes.

---

### Step 7: Verify CDK Synthesis

```bash
npx cdk synth
```

**What this does:** Generates CloudFormation templates from your CDK code.

**Why:** This validates your CDK code syntax before attempting deployment.

**What happens:**
1. CDK reads `lib/cloudcart-stack.js`
2. Bundles all Lambda functions with esbuild
3. Generates CloudFormation JSON/YAML
4. Outputs template to `cdk.out/` directory

**Expected output:**
```
Bundling asset CloudCartMvpStack/GetProductsFn/Code/Stage...
✅  CloudCartMvpStack

Successfully synthesized to /path/to/cloudcart/infra/cdk.out
```

**If you see errors:** See [Troubleshooting](#troubleshooting) section.

---

## Understanding the Project Structure

### What Gets Created?

Before deploying, let's understand what resources will be created:

#### **1. DynamoDB Tables (2)**
- **ProductsTable**: Stores product catalog
  - Partition Key: `id` (string)
  - GSI: `gsi_category` for querying by category
- **OrdersTable**: Stores customer orders
  - Partition Key: `userId` (string)
  - Sort Key: `orderId` (string)
  - Streams enabled for real-time processing

#### **2. Lambda Functions (14)**
- **GetProductsFn**: List all products
- **GetProductByIdFn**: Get single product
- **GenerateUploadUrlFn**: Create S3 presigned URLs
- **ListByCategoryFn**: Filter products by category
- **CartFn**: Cart operations
- **CheckoutFn**: Place orders
- **WorkerFn**: Process orders from queue
- **StreamProcessorFn**: Process DynamoDB stream events
- **GetOrdersFn**: List orders
- **GetOrderByIdFn**: Get specific order
- **AuthorizerFn**: Custom API authentication
- **CreateProductFn**: Admin create products
- **UpdateProductFn**: Admin update products
- **DeleteProductFn**: Admin delete products

#### **3. API Gateway (1 HTTP API)**
- 13 routes mapped to Lambda functions
- CORS enabled for web access
- Custom authorizer for admin routes

#### **4. S3 Bucket (1)**
- Stores product images
- Public read access
- CORS configured for uploads
- Versioning enabled

#### **5. SQS Queues (2)**
- **CheckoutQueue**: Async order processing
- **CheckoutDLQ**: Failed message handling

#### **6. CloudWatch Resources**
- Dashboard with 6 widgets
- 3 Alarms (API errors, queue depth, worker errors)
- Custom metrics from Lambda functions
- Log groups for all Lambda functions

#### **7. SNS Topic (1)**
- Alarm notifications via email

#### **8. VPC & ECS Resources**
- VPC with 2 public subnets
- ECS Cluster for containers
- Fargate Service for admin dashboard
- Application Load Balancer
- ECR Repository for Docker images

#### **9. IAM Roles**
- One execution role per Lambda function
- ECS task execution role
- ECS task role with DynamoDB permissions

**Total:** 40+ AWS resources

---

## CDK Bootstrap

### Step 8: Bootstrap CDK (First Time Only)

```bash
cdk bootstrap
# or
npx cdk bootstrap
```

**What this does:** Prepares your AWS account for CDK deployments.

**Why:** CDK needs an S3 bucket to store assets (Lambda code, Docker images) and IAM roles to perform deployments.

**What gets created:**
- S3 bucket: `cdk-hnb659fds-assets-<account>-<region>`
- IAM roles: `cdk-hnb659fds-cfn-exec-role-<account>-<region>`
- CloudFormation stack: `CDKToolkit`

**Expected output:**
```
⏳ Bootstrapping environment aws://123456789012/us-east-1...
✅ Environment aws://123456789012/us-east-1 bootstrapped
```

**Important:** You only need to bootstrap once per account/region combination.

**Note:** If you've used CDK before in this account/region, you'll see:
```
✅ Environment aws://123456789012/us-east-1 is already bootstrapped
```

---

## Deploy the Stack

### Step 9: Deploy CloudCart Infrastructure

```bash
cdk deploy
# or
npx cdk deploy
```

**What this does:** Creates all AWS resources defined in your CDK stack.

**Why:** This is where the magic happens - your infrastructure becomes reality!

**Deployment process:**
1. **Synthesize**: CDK generates CloudFormation template
2. **Bundle**: Lambda functions are packaged with dependencies
3. **Upload**: Assets uploaded to CDK staging bucket
4. **Create Stack**: CloudFormation creates resources
5. **Configure**: Resources are linked and configured
6. **Output**: Stack outputs are displayed

**Expected timeline:**
- Synthesis: 30 seconds
- Upload: 1 minute
- Stack creation: 8-12 minutes

**You'll be asked to confirm:**
```
Do you wish to deploy these changes (y/n)? y
```

**Deployment stages you'll see:**

1. **Uploading assets** (1-2 minutes)
```
CloudCartMvpStack: building assets...
CloudCartMvpStack: deploying...
```

2. **Creating resources** (8-10 minutes)
```
CloudCartMvpStack | 0/42 | 3:45 PM | CREATE_IN_PROGRESS | AWS::CloudFormation::Stack | CloudCartMvpStack
CloudCartMvpStack | 1/42 | 3:45 PM | CREATE_IN_PROGRESS | AWS::S3::Bucket | ProductImagesBucket
...
```

3. **Stack complete** (final)
```
✅ CloudCartMvpStack

Outputs:
CloudCartMvpStack.HttpApiUrl = https://abc123.execute-api.us-east-1.amazonaws.com
CloudCartMvpStack.ProductsTable = CloudCartMvpStack-ProductsTableName-XYZ
CloudCartMvpStack.OrdersTableName = CloudCartMvpStack-OrdersTable-XYZ
...

Stack ARN:
arn:aws:cloudformation:us-east-1:123456789012:stack/CloudCartMvpStack/...
```

**IMPORTANT:** Copy and save all outputs - you'll need them!

---

### Step 10: Save Stack Outputs as Environment Variables

```bash
# Save API URL
export API=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`HttpApiUrl`].OutputValue' --output text)

# Save Products Table name
export PRODUCTS_TABLE=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ProductsTable`].OutputValue' --output text)

# Save Orders Table name
export ORDERS_TABLE=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`OrdersTableName`].OutputValue' --output text)

# Save Images Bucket name
export IMAGES_BUCKET=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ImagesBucket`].OutputValue' --output text)

# Verify
echo "API: $API"
echo "Products Table: $PRODUCTS_TABLE"
echo "Orders Table: $ORDERS_TABLE"
echo "Images Bucket: $IMAGES_BUCKET"
```

**What this does:** Extracts stack outputs and saves them as environment variables.

**Why:** Makes it easy to use these values in subsequent commands.

**Expected output:**
```
API: https://abc123.execute-api.us-east-1.amazonaws.com
Products Table: CloudCartMvpStack-ProductsTableName-ABC123
Orders Table: CloudCartMvpStack-OrdersTable-XYZ789
Images Bucket: cloudcartmvpstack-productimagebucket-abc123
```

---

## Seed Initial Data

### Step 11: Populate Products Table

```bash
cd ..
node scripts/seed-products.js $PRODUCTS_TABLE
```

**What this does:** Adds 3 sample products to DynamoDB.

**Why:** You need some data to test the API endpoints.

**What gets created:**
```javascript
[
  { id: '1', name: 'Wireless Headphones', price: 99.99, category: 'electronics', imageUrl: '...' },
  { id: '2', name: 'Coffee Beans', price: 14.99, category: 'grocery', imageUrl: '...' },
  { id: '3', name: 'Gaming Mouse', price: 49.99, category: 'electronics', imageUrl: '...' }
]
```

**Expected output:**
```
Seeded 1 Wireless Headphones
Seeded 2 Coffee Beans
Seeded 3 Gaming Mouse
Done. Table: CloudCartMvpStack-ProductsTableName-ABC123
```

---

## Test the Deployment

### Step 12: Test Products Endpoint

```bash
curl $API/products
```

**What this does:** Makes a GET request to list all products.

**Why:** Verifies your API Gateway and Lambda are working.

**Expected output:**
```json
[
  {
    "id": "1",
    "name": "Wireless Headphones",
    "price": 99.99,
    "category": "electronics",
    "imageUrl": "https://placehold.co/400x400/4A90E2/white?text=Headphones"
  },
  {
    "id": "2",
    "name": "Coffee Beans",
    "price": 14.99,
    "category": "grocery",
    "imageUrl": "https://placehold.co/400x400/8B4513/white?text=Coffee"
  },
  {
    "id": "3",
    "name": "Gaming Mouse",
    "price": 49.99,
    "category": "electronics",
    "imageUrl": "https://placehold.co/400x400/FF6B6B/white?text=Mouse"
  }
]
```

**If you see HTML instead:** Your API URL might be wrong. Check `$API` variable.

---

### Step 13: Test Single Product Endpoint

```bash
curl $API/products/1
```

**What this does:** Gets details for product with ID "1".

**Why:** Tests path parameters and DynamoDB GetItem operation.

**Expected output:**
```json
{
  "id": "1",
  "name": "Wireless Headphones",
  "price": 99.99,
  "category": "electronics",
  "imageUrl": "https://placehold.co/400x400/4A90E2/white?text=Headphones"
}
```

---

### Step 14: Test Cart Operations

```bash
# Add item to cart
curl -X POST $API/cart \
  -H 'Content-Type: application/json' \
  -d '{"id":"1","qty":2}'

# View cart
curl $API/cart

# Remove from cart
curl -X DELETE $API/cart \
  -H 'Content-Type: application/json' \
  -d '{"id":"1"}'
```

**What this does:** Tests POST, GET, and DELETE methods on the cart endpoint.

**Why:** Verifies Lambda can handle different HTTP methods and maintain state.

**Expected output (after adding):**
```json
{
  "items": [
    {
      "id": "1",
      "qty": 2
    }
  ]
}
```

**Note:** Cart is stored in Lambda memory, so it resets on cold starts.

---

### Step 15: Test Checkout Flow

```bash
curl -X POST $API/checkout \
  -H 'Content-Type: application/json' \
  -d '{"userId":"test-user","items":[{"id":"1","qty":2}],"total":199.99}'
```

**What this does:**
1. Sends order to checkout endpoint
2. Checkout Lambda sends message to SQS
3. Returns immediately (async processing)
4. Worker Lambda processes message in background
5. Order saved to DynamoDB

**Why:** Demonstrates async processing with SQS.

**Expected output:**
```json
{
  "queued": true,
  "id": "order-1234567890"
}
```

**What happens next:**
1. Message sits in SQS CheckoutQueue
2. Worker Lambda is triggered automatically
3. Worker processes order and saves to DynamoDB
4. CloudWatch metrics are emitted

---

### Step 16: Verify Order Was Processed

Wait 10 seconds for processing, then:

```bash
# List all orders
curl "$API/orders?userId=all"

# Or get specific order
curl "$API/orders/order-1234567890?userId=test-user"
```

**What this does:** Queries the Orders DynamoDB table.

**Why:** Verifies the complete flow: API → SQS → Lambda → DynamoDB.

**Expected output:**
```json
{
  "orders": [
    {
      "userId": "test-user",
      "orderId": "order-1234567890",
      "timestamp": "2026-03-08T15:30:00.000Z",
      "items": "[{\"id\":\"1\",\"qty\":2}]",
      "total": 199.99,
      "status": "processing"
    }
  ],
  "count": 1
}
```

---

### Step 17: Test S3 Presigned URLs

```bash
# Get presigned URL for product 1
curl -X POST $API/products/1/upload-url
```

**What this does:** Generates a temporary URL for uploading images to S3.

**Why:** Demonstrates secure S3 uploads without exposing AWS credentials.

**Expected output:**
```json
{
  "uploadUrl": "https://cloudcartmvpstack-productimagebucket-abc123.s3.amazonaws.com/products/1/1234567890.jpg?X-Amz-Algorithm=...",
  "imageUrl": "https://cloudcartmvpstack-productimagebucket-abc123.s3.amazonaws.com/products/1/1234567890.jpg",
  "key": "products/1/1234567890.jpg",
  "expiresIn": 300
}
```

**To test upload:**
```bash
# Save the presigned URL
UPLOAD_URL=$(curl -s -X POST $API/products/1/upload-url | jq -r '.uploadUrl')

# Create or download a test image
curl -o test.jpg "https://placehold.co/400x400.jpg"

# Upload using presigned URL
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: image/jpeg" \
  --upload-file test.jpg

# Verify image is accessible
IMAGE_URL=$(curl -s -X POST $API/products/1/upload-url | jq -r '.imageUrl')
curl -I $IMAGE_URL
```

**Expected output:** `HTTP/1.1 200 OK`

---

### Step 18: Run Automated Test Suite

```bash
./test-api.sh $API
```

**What this does:** Runs comprehensive tests of all endpoints.

**Why:** Automated verification saves time and catches issues.

**What gets tested:**
- ✓ All product endpoints
- ✓ Cart operations
- ✓ Checkout flow
- ✓ Orders API
- ✓ S3 presigned URLs
- ✓ Admin endpoints (with and without auth)

**Expected output:**
```
================================
CloudCart API Test Suite
================================
API URL: https://abc123.execute-api.us-east-1.amazonaws.com

Testing: List all products... ✓ PASS (HTTP 200)
Testing: Get product by ID (existing)... ✓ PASS (HTTP 200)
Testing: Get product by ID (non-existing)... ✓ PASS (HTTP 404)
...
================================
Test Summary
================================
Total tests: 20
Passed: 20
Failed: 0

✓ All tests passed!
```

---

### Step 19: View CloudWatch Dashboard

```bash
# Get dashboard URL
aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
  --output text
```

**What this does:** Gets the URL to your CloudWatch dashboard.

**Why:** Visual monitoring of your application's health.

**Dashboard shows:**
- API Gateway request counts
- Lambda error rates
- Lambda execution duration
- SQS queue depth
- Custom metrics (orders, cart operations)

**To view:** Copy the URL and open in your browser.

---

### Step 20: Subscribe to SNS Alerts

```bash
# Get SNS topic ARN
TOPIC_ARN=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AlarmTopicArn`].OutputValue' --output text)

# Subscribe your email
aws sns subscribe \
  --topic-arn $TOPIC_ARN \
  --protocol email \
  --notification-endpoint your-email@example.com
```

**What this does:** Subscribes your email to receive alarm notifications.

**Why:** You'll be notified when alarms trigger (API errors, queue backlog, etc.).

**Next step:** Check your email and click the confirmation link.

---

## Troubleshooting

### Issue: "cdk: command not found"

**Problem:** CDK is not installed globally.

**Solution 1 (Quick):** Use `npx cdk` instead of `cdk`:
```bash
npx cdk deploy
npx cdk synth
```

**Solution 2 (Permanent):** Install CDK globally:
```bash
npm install -g aws-cdk
```

---

### Issue: "Unable to resolve AWS account to use"

**Problem:** AWS credentials not configured.

**Solution:**
```bash
# Check if credentials exist
aws sts get-caller-identity

# If error, configure credentials
aws configure
```

**Verify:** Should show your account ID and user ARN.

---

### Issue: "Stack already exists"

**Problem:** You've deployed before and want to update.

**Solution:** Just run deploy again - CDK will update existing resources:
```bash
cdk deploy
```

**To start fresh:**
```bash
cdk destroy
# Wait for deletion to complete
cdk deploy
```

---

### Issue: "Insufficient permissions"

**Problem:** Your IAM user lacks required permissions.

**Solution:** Your IAM user needs these permissions:
- CloudFormation (full)
- Lambda (full)
- API Gateway (full)
- DynamoDB (full)
- S3 (full)
- IAM (create/update roles)
- SQS (full)
- SNS (full)
- CloudWatch (full)
- VPC (create/describe)
- ECS (full)
- ECR (full)

**Quick fix for learning:** Attach `AdministratorAccess` policy (not recommended for production).

---

### Issue: API returns empty array

**Problem:** Products table is empty.

**Solution:** Run the seed script:
```bash
node scripts/seed-products.js $PRODUCTS_TABLE
```

**Verify:**
```bash
aws dynamodb scan --table-name $PRODUCTS_TABLE
```

---

### Issue: "Cannot read property 'Items' of undefined"

**Problem:** DynamoDB table doesn't exist or name is wrong.

**Solution:** Check table name:
```bash
aws dynamodb list-tables

# Update environment variable
export PRODUCTS_TABLE=<correct-table-name>
```

---

### Issue: Orders endpoint returns empty

**Problem:** No orders have been placed yet.

**Solution:** Place a test order:
```bash
curl -X POST $API/checkout \
  -H 'Content-Type: application/json' \
  -d '{"userId":"test-user","items":[{"id":"1","qty":2}],"total":199.99}'

# Wait 10 seconds
sleep 10

# Check orders
curl "$API/orders?userId=all"
```

---

### Issue: "Rate exceeded" error

**Problem:** Too many requests in a short time.

**Solution:** Wait 1 minute and try again. AWS has rate limits on free tier.

---

### Issue: Admin endpoints return 401

**Problem:** Missing or invalid API key.

**Solution:** Use the correct API key header:
```bash
# Admin key
curl -X POST $API/admin/products \
  -H "x-api-key: admin-key-cloudcart-2024" \
  -H 'Content-Type: application/json' \
  -d '{"id":"4","name":"Test","price":99.99,"category":"test"}'
```

---

### Issue: Test script fails

**Problem:** Multiple potential causes.

**Solution:** Run tests one at a time to isolate:
```bash
# Test basic connectivity
curl $API/products

# Test with verbose output
curl -v $API/products

# Check API Gateway logs
aws logs tail /aws/apigateway/CloudCartMvpStack --follow
```

---

### Issue: High AWS costs

**Problem:** ECS service running 24/7.

**Solution:** Stop ECS service when not in use:
```bash
aws ecs update-service \
  --cluster cloudcart-admin-cluster \
  --service admin-dashboard-service \
  --desired-count 0
```

**Or destroy entire stack:**
```bash
cd infra
cdk destroy
```

---

### Issue: Deployment hangs

**Problem:** Stack creation taking too long.

**What's normal:** 8-12 minutes is typical.

**If longer than 15 minutes:**
1. Check AWS Console → CloudFormation
2. Look for failed resources
3. Common causes:
   - VPC creation (slow)
   - ECS service startup (slow)
   - Lambda bundling (slow)

**Solution:** Cancel and retry:
```bash
# In another terminal
aws cloudformation cancel-update-stack --stack-name CloudCartMvpStack

# Then
cdk deploy
```

---

### Issue: Lambda functions timeout

**Problem:** Function exceeds 15-second timeout.

**Solution:** Check CloudWatch Logs:
```bash
aws logs tail /aws/lambda/CloudCartMvpStack-WorkerFn --follow
```

**Common causes:**
- Cold start (first invocation)
- Network issues
- DynamoDB throttling

**Fix:** Increase timeout in CDK:
```javascript
timeout: Duration.seconds(30)
```

---

## 🎉 Success Checklist

After completing all steps, you should have:

- ✅ CloudFormation stack deployed successfully
- ✅ 14 Lambda functions running
- ✅ API Gateway responding to requests
- ✅ 3 products seeded in DynamoDB
- ✅ Cart operations working
- ✅ Checkout creating orders
- ✅ Orders visible in API
- ✅ S3 presigned URLs generating
- ✅ CloudWatch Dashboard accessible
- ✅ SNS email subscribed
- ✅ Test script passing all tests

---

## Next Steps

Now that deployment is complete, continue learning:

1. **[Session 1](./session-1-s3-cloudwatch.md)** - S3 & CloudWatch Logs
2. **[Session 2](./session-2-metrics-alarms.md)** - Metrics & Alarms
3. **[Session 3](#)** - DynamoDB Streams
4. **[Session 4](#)** - IAM & Security
5. **[Session 5](#)** - ECS & Containers

---

## Cleanup

When you're done learning and want to delete everything:

```bash
cd infra
cdk destroy
```

**What this deletes:**
- All Lambda functions
- DynamoDB tables and data
- S3 bucket and objects
- API Gateway
- SQS queues
- CloudWatch dashboards and alarms
- SNS topics
- VPC and subnets
- ECS cluster and services
- ALB
- ECR repository and images

**Confirm deletion:** Type `y` when prompted.

**Verify deletion:**
```bash
aws cloudformation describe-stacks --stack-name CloudCartMvpStack
```

**Expected:** `Stack with id CloudCartMvpStack does not exist`

---

## Additional Resources

- **AWS Documentation**: [https://docs.aws.amazon.com/](https://docs.aws.amazon.com/)
- **CDK Workshop**: [https://cdkworkshop.com/](https://cdkworkshop.com/)
- **Serverless Patterns**: [https://serverlessland.com/patterns](https://serverlessland.com/patterns)

---

**Congratulations! You've successfully deployed CloudCart!** 🎉

You now have a fully functional serverless e-commerce backend running on AWS, demonstrating Lambda, API Gateway, DynamoDB, S3, SQS, CloudWatch, and more!
