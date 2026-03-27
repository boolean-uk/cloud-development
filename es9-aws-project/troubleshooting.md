# CloudCart Troubleshooting Guide

Comprehensive troubleshooting guide for CloudCart deployment and operation issues.

---

## 📋 Table of Contents

1. [Deployment Issues](#deployment-issues)
2. [API Issues](#api-issues)
3. [Lambda Issues](#lambda-issues)
4. [DynamoDB Issues](#dynamodb-issues)
5. [S3 Issues](#s3-issues)
6. [CloudWatch Issues](#cloudwatch-issues)
7. [ECS/Fargate Issues](#ecsfargate-issues)
8. [Authentication Issues](#authentication-issues)
9. [Cost & Billing Issues](#cost--billing-issues)
10. [Cleanup Issues](#cleanup-issues)

---

## Deployment Issues

### 1. "cdk: command not found"

**Symptoms:**
```bash
npm run deploy
sh: cdk: command not found
```

**Cause:** CDK is not installed globally or not in PATH.

**Solution:**
The scripts now use `npx cdk` which uses the local installation. Update dependencies:
```bash
cd infra
rm -rf node_modules package-lock.json
npm install
npm run deploy
```

**Alternative:** Install CDK globally:
```bash
npm install -g aws-cdk
cdk --version
```

---

### 2. "Unable to resolve AWS account"

**Symptoms:**
```
Error: Need to perform AWS calls for account X, but no credentials found
```

**Cause:** AWS credentials not configured.

**Solution:**
```bash
# Configure credentials
aws configure

# Test credentials
aws sts get-caller-identity

# Should show:
# {
#   "UserId": "AIDAXXXXXXXXXX",
#   "Account": "123456789012",
#   "Arn": "arn:aws:iam::123456789012:user/yourname"
# }
```

**If using profiles:**
```bash
# Deploy with specific profile
export AWS_PROFILE=yourprofile
npm run deploy
```

---

### 3. "This stack uses assets, so the toolkit stack must be deployed"

**Symptoms:**
```
Error: This stack uses assets, so the toolkit stack must be deployed to the environment
```

**Cause:** CDK not bootstrapped in your account/region.

**Solution:**
```bash
npx cdk bootstrap
```

**If using specific region:**
```bash
npx cdk bootstrap aws://ACCOUNT-ID/REGION
```

**Verify bootstrap:**
```bash
aws cloudformation describe-stacks --stack-name CDKToolkit
```

---

### 4. "Stack already exists"

**Symptoms:**
```
CloudCartMvpStack already exists
```

**Cause:** You've deployed before.

**Solution 1 - Update existing:**
```bash
npm run deploy
```
CDK will update changed resources.

**Solution 2 - Start fresh:**
```bash
npm run destroy
# Wait for deletion (5-10 minutes)
npm run deploy
```

---

### 5. "Insufficient permissions"

**Symptoms:**
```
User: arn:aws:iam::123:user/X is not authorized to perform: cloudformation:CreateStack
```

**Cause:** IAM user lacks required permissions.

**Solution - Required permissions:**
- `CloudFormation` - Full access
- `Lambda` - Full access
- `API Gateway` - Full access
- `DynamoDB` - Full access
- `S3` - Full access
- `IAM` - CreateRole, AttachRolePolicy
- `SQS` - Full access
- `SNS` - Full access
- `CloudWatch` - Full access
- `VPC` - Create/Describe
- `ECS` - Full access
- `ECR` - Full access

**Quick fix for learning (not production):**
Attach `AdministratorAccess` policy to your IAM user.

---

### 6. Deployment hangs at "CREATE_IN_PROGRESS"

**Symptoms:**
Deployment stuck for 15+ minutes.

**Cause:** Resource creation timeout or issue.

**Solution:**
1. Check AWS Console → CloudFormation
2. Find CloudCartMvpStack
3. Look at Events tab for errors
4. Common hanging resources:
   - VPC creation
   - ECS service
   - Lambda bundling

**If truly stuck:**
```bash
# Cancel in another terminal
aws cloudformation cancel-update-stack --stack-name CloudCartMvpStack

# Clean up and retry
aws cloudformation delete-stack --stack-name CloudCartMvpStack
# Wait for deletion
npm run deploy
```

---

### 7. "There is already a Construct with name 'X'"

**Symptoms:**
```
Error: There is already a Construct with name 'OrdersTable' in CloudCartStack
```

**Cause:** Duplicate construct ID in CDK code.

**Solution:**
This should be fixed in the latest code. Update your repository:
```bash
git pull
cd infra
npm install
npm run deploy
```

---

### 8. "Cannot find module 'aws-cdk-lib'"

**Symptoms:**
```
Error: Cannot find module 'aws-cdk-lib'
```

**Cause:** Dependencies not installed.

**Solution:**
```bash
cd infra
npm install
```

**If persists:**
```bash
rm -rf node_modules package-lock.json
npm install
```

---

## API Issues

### 9. API returns empty array

**Symptoms:**
```bash
curl $API/products
[]
```

**Cause:** Products table is empty.

**Solution:**
```bash
# Check if PRODUCTS_TABLE is set
echo $PRODUCTS_TABLE

# If empty, set it
export PRODUCTS_TABLE=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ProductsTable`].OutputValue' --output text)

# Seed products
node scripts/seed-products.js $PRODUCTS_TABLE
```

**Verify:**
```bash
aws dynamodb scan --table-name $PRODUCTS_TABLE --select COUNT
```

---

### 10. API returns HTML instead of JSON

**Symptoms:**
```bash
curl $API/products
<html>...403 Forbidden...</html>
```

**Cause:** Wrong API URL or CORS issue.

**Solution:**
```bash
# Get correct API URL
export API=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`HttpApiUrl`].OutputValue' --output text)

echo $API
# Should be: https://XXXXXX.execute-api.REGION.amazonaws.com

# Test with full URL
curl $API/products
```

---

### 11. "Internal Server Error" (500)

**Symptoms:**
```bash
curl $API/products
{"message":"Internal Server Error"}
```

**Cause:** Lambda function error.

**Solution - Check logs:**
```bash
# List log groups
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/CloudCartMvpStack

# Tail specific function
aws logs tail /aws/lambda/CloudCartMvpStack-GetProductsFn --follow

# Or get recent errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/CloudCartMvpStack-GetProductsFn \
  --filter-pattern "ERROR"
```

**Common errors:**
- `Cannot read property 'Items' of undefined` → Wrong table name
- `AccessDeniedException` → IAM permissions missing
- `ResourceNotFoundException` → Table doesn't exist

---

### 12. "403 Forbidden"

**Symptoms:**
```bash
curl $API/admin/products
{"message":"Forbidden"}
```

**Cause:** Missing or invalid API key for admin endpoints.

**Solution:**
```bash
# Admin endpoints require API key
curl -X POST $API/admin/products \
  -H "x-api-key: admin-key-cloudcart-2024" \
  -H 'Content-Type: application/json' \
  -d '{"id":"4","name":"Test","price":99.99,"category":"test"}'
```

**Valid API keys:**
- Admin: `admin-key-cloudcart-2024`
- Customer: `customer-key-cloudcart-2024`

---

### 13. "Rate exceeded"

**Symptoms:**
```
TooManyRequestsException: Rate exceeded
```

**Cause:** AWS API rate limits.

**Solution:**
- Wait 1-2 minutes
- Reduce request frequency
- Use batch operations where possible

**If persistent:** You may have hit free tier limits. Check AWS billing dashboard.

---

## Lambda Issues

### 14. Lambda timeout

**Symptoms:**
```
Task timed out after 15.00 seconds
```

**Cause:** Function execution exceeds timeout.

**Solution - Check CloudWatch Logs:**
```bash
aws logs tail /aws/lambda/CloudCartMvpStack-WorkerFn --follow
```

**Common causes:**
- Cold start (first invocation)
- Network latency
- DynamoDB throttling
- Processing large datasets

**Fix:** Already configured with appropriate timeouts in CDK.

---

### 15. "Cannot read property 'Items' of undefined"

**Symptoms:**
Lambda error in CloudWatch:
```
TypeError: Cannot read property 'Items' of undefined
```

**Cause:** DynamoDB table doesn't exist or empty response.

**Solution:**
```bash
# Verify table exists
aws dynamodb describe-table --table-name $PRODUCTS_TABLE

# If not found
export PRODUCTS_TABLE=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ProductsTable`].OutputValue' --output text)
```

---

### 16. Lambda cold starts

**Symptoms:**
First request slow (2-5 seconds).

**Cause:** Normal Lambda behavior - initial invocation loads runtime.

**Solution:**
- Accept it as normal (no fix needed for learning)
- For production: Use provisioned concurrency
- Keep Lambda warm with scheduled pings

**Not an issue unless:**
- Every request is slow → Check CloudWatch metrics
- Duration > 10s → Check logs for errors

---

## DynamoDB Issues

### 17. "ResourceNotFoundException"

**Symptoms:**
```
ResourceNotFoundException: Requested resource not found: Table: XYZ
```

**Cause:** Table doesn't exist or wrong name.

**Solution:**
```bash
# List all tables
aws dynamodb list-tables

# Check stack outputs
aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs'

# Set correct table names
export PRODUCTS_TABLE=CloudCartMvpStack-ProductsTableName-XYZ
export ORDERS_TABLE=CloudCartMvpStack-OrdersTable-ABC
```

---

### 18. "ProvisionedThroughputExceededException"

**Symptoms:**
```
ProvisionedThroughputExceededException: Rate of requests exceeds the allowed throughput
```

**Cause:** Too many reads/writes per second.

**Solution:**
- Stack uses PAY_PER_REQUEST mode (no limits)
- This should not occur
- If it does: Wait and retry

---

### 19. Empty table after seeding

**Symptoms:**
```bash
node scripts/seed-products.js $PRODUCTS_TABLE
# Success message shown
curl $API/products
[]
```

**Cause:** Wrong table name used in seed script.

**Solution:**
```bash
# Verify table name
echo $PRODUCTS_TABLE

# Check items in table
aws dynamodb scan --table-name $PRODUCTS_TABLE --select COUNT

# Re-seed with correct name
export PRODUCTS_TABLE=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ProductsTable`].OutputValue' --output text)

node scripts/seed-products.js $PRODUCTS_TABLE
```

---

## S3 Issues

### 20. "Access Denied" uploading to S3

**Symptoms:**
```
<Error>
  <Code>AccessDenied</Code>
  <Message>Access Denied</Message>
</Error>
```

**Cause:** Presigned URL expired or invalid.

**Solution:**
```bash
# Generate fresh presigned URL (valid 5 minutes)
RESPONSE=$(curl -s -X POST $API/products/1/upload-url)
UPLOAD_URL=$(echo $RESPONSE | jq -r '.uploadUrl')

# Upload immediately
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: image/jpeg" \
  --upload-file image.jpg
```

**Presigned URLs expire after 5 minutes!**

---

### 21. "NoSuchBucket"

**Symptoms:**
```
NoSuchBucket: The specified bucket does not exist
```

**Cause:** Bucket not created or wrong name.

**Solution:**
```bash
# Get bucket name
export IMAGES_BUCKET=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ImagesBucket`].OutputValue' --output text)

# Verify bucket exists
aws s3 ls s3://$IMAGES_BUCKET
```

---

### 22. CORS error in browser

**Symptoms:**
Browser console shows:
```
CORS policy: No 'Access-Control-Allow-Origin' header
```

**Cause:** API Gateway or S3 CORS misconfigured.

**Solution - Check CORS:**
```bash
# Check S3 bucket CORS
aws s3api get-bucket-cors --bucket $IMAGES_BUCKET

# Check API Gateway (already configured in CDK)
```

---

## CloudWatch Issues

### 23. No metrics in dashboard

**Symptoms:**
CloudWatch Dashboard shows "No data".

**Cause:** No traffic or metrics not yet published.

**Solution:**
```bash
# Generate some traffic
for i in {1..10}; do
  curl -s $API/products > /dev/null
done

# Wait 2-3 minutes for metrics to appear
# Metrics are delayed 1-2 minutes in CloudWatch
```

**Check custom metrics:**
```bash
aws cloudwatch list-metrics --namespace CloudCart
```

---

### 24. Alarms stuck in "INSUFFICIENT_DATA"

**Symptoms:**
Alarm state shows INSUFFICIENT_DATA.

**Cause:** Not enough data points or no traffic.

**Solution:**
- Wait for traffic to generate metrics
- Generate test traffic
- Normal for new alarms (wait 5-10 minutes)

```bash
# Generate traffic to trigger metrics
./test-api.sh $API
```

---

### 25. Can't view logs

**Symptoms:**
```
ResourceNotFoundException: Log group does not exist
```

**Cause:** Function hasn't been invoked yet or wrong log group name.

**Solution:**
```bash
# List all CloudCart log groups
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/CloudCartMvpStack

# Invoke function to create logs
curl $API/products

# Then view logs
aws logs tail /aws/lambda/CloudCartMvpStack-GetProductsFn
```

---

## ECS/Fargate Issues

### 26. ECS task not starting

**Symptoms:**
Admin dashboard not accessible.

**Cause:** Task failing to start.

**Solution - Check task status:**
```bash
# List tasks
aws ecs list-tasks --cluster cloudcart-admin-cluster

# Describe task (use ARN from above)
aws ecs describe-tasks \
  --cluster cloudcart-admin-cluster \
  --tasks arn:aws:ecs:...

# Check logs
aws logs tail /ecs/admin-dashboard --follow
```

**Common issues:**
- Image not found in ECR
- Health check failing
- IAM permissions
- Port mapping incorrect

---

### 27. "Cannot pull container image"

**Symptoms:**
```
CannotPullContainerError: Error response from daemon
```

**Cause:** Image not pushed to ECR or wrong URI.

**Solution:**
The default deployment uses a placeholder image. To use the admin dashboard:

1. Build and push Docker image:
```bash
cd admin-dashboard

# Build image
docker build -t cloudcart-admin-dashboard .

# Get ECR URI
export ECR_REPO=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ECRRepositoryUri`].OutputValue' --output text)

# Login to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REPO

# Tag and push
docker tag cloudcart-admin-dashboard:latest $ECR_REPO:latest
docker push $ECR_REPO:latest
```

2. Update ECS service:
```bash
aws ecs update-service \
  --cluster cloudcart-admin-cluster \
  --service admin-dashboard-service \
  --force-new-deployment
```

---

### 28. ALB returns 503

**Symptoms:**
```bash
curl http://alb-url
HTTP/1.1 503 Service Unavailable
```

**Cause:** No healthy targets in ALB.

**Solution:**
```bash
# Check service health
aws ecs describe-services \
  --cluster cloudcart-admin-cluster \
  --services admin-dashboard-service

# Check target group health
aws elbv2 describe-target-health \
  --target-group-arn $(aws elbv2 describe-target-groups \
    --names cloudcart-admin-target \
    --query 'TargetGroups[0].TargetGroupArn' --output text)
```

**Fix:** Wait for service to become healthy (2-5 minutes).

---

## Authentication Issues

### 29. Admin endpoints return 401

**Symptoms:**
```
{"message":"Unauthorized"}
```

**Cause:** Missing API key.

**Solution:**
```bash
# Always include x-api-key header for admin endpoints
curl -X POST $API/admin/products \
  -H "x-api-key: admin-key-cloudcart-2024" \
  -H 'Content-Type: application/json' \
  -d '{"id":"4","name":"Test","price":99.99,"category":"test"}'
```

---

### 30. Customer key can't access admin endpoints

**Symptoms:**
Request with customer key returns 403.

**Cause:** This is correct! Customer key shouldn't access admin endpoints.

**Solution:**
Use admin key for admin endpoints:
```bash
# This should fail
curl -X POST $API/admin/products \
  -H "x-api-key: customer-key-cloudcart-2024" \
  ...

# This should succeed
curl -X POST $API/admin/products \
  -H "x-api-key: admin-key-cloudcart-2024" \
  ...
```

---

## Cost & Billing Issues

### 31. Unexpected AWS charges

**Symptoms:**
AWS bill higher than expected.

**Cause:** ECS Fargate running 24/7.

**Cost breakdown:**
- **ECS Fargate**: ~$30/month (1 task)
- **ALB**: ~$16/month
- **Everything else**: Free tier

**Solution - Stop ECS:**
```bash
aws ecs update-service \
  --cluster cloudcart-admin-cluster \
  --service admin-dashboard-service \
  --desired-count 0
```

**Or destroy entire stack:**
```bash
cd infra
npm run destroy
```

---

### 32. Free tier exceeded

**Symptoms:**
Charges for Lambda/DynamoDB/API Gateway.

**Cause:** Exceeded free tier limits.

**Free tier limits:**
- Lambda: 1M requests/month
- API Gateway: 1M requests/month
- DynamoDB: 25 RCU/WCU, 25GB storage

**Solution:**
- Monitor usage in AWS Billing console
- Set up billing alerts
- Destroy stack when not in use

```bash
# Set billing alarm
aws cloudwatch put-metric-alarm \
  --alarm-name "CloudCart-Billing-Alert" \
  --alarm-description "Alert when charges exceed $10" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --evaluation-periods 1 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold
```

---

## Cleanup Issues

### 33. "Stack cannot be deleted"

**Symptoms:**
```
Stack cannot be deleted while resources exist
```

**Cause:** Some resources can't be auto-deleted.

**Solution:**
```bash
# Empty S3 bucket first
aws s3 rm s3://$IMAGES_BUCKET --recursive

# Then destroy
npm run destroy
```

---

### 34. "ResourceInUse" during deletion

**Symptoms:**
```
Resource is in use by another resource
```

**Cause:** Dependencies between resources.

**Solution:**
Wait and retry. CloudFormation handles dependencies but may take time.

```bash
# Check deletion progress
aws cloudformation describe-stack-events \
  --stack-name CloudCartMvpStack \
  --max-items 20
```

**If stuck:** Manually delete blocking resources in AWS Console.

---

### 35. ECR images prevent deletion

**Symptoms:**
Stack deletion fails on ECR repository.

**Cause:** Images in repository.

**Solution:**
```bash
# Delete all images
aws ecr batch-delete-image \
  --repository-name cloudcart-admin-dashboard \
  --image-ids "$(aws ecr list-images \
    --repository-name cloudcart-admin-dashboard \
    --query 'imageIds[*]' --output json)"

# Then retry destroy
npm run destroy
```

---

## General Debugging Tips

### Enable Verbose Logging

```bash
# CDK verbose output
npx cdk deploy --verbose

# Curl verbose output
curl -v $API/products

# AWS CLI debug
aws dynamodb scan --table-name $PRODUCTS_TABLE --debug
```

### Check All Stack Resources

```bash
# List all resources in stack
aws cloudformation list-stack-resources --stack-name CloudCartMvpStack
```

### View Stack Events

```bash
# Recent stack events
aws cloudformation describe-stack-events \
  --stack-name CloudCartMvpStack \
  --max-items 20
```

### Test Individual Lambda Functions

```bash
# Invoke function directly
aws lambda invoke \
  --function-name CloudCartMvpStack-GetProductsFn-XYZ \
  --payload '{}' \
  response.json

cat response.json
```

### Check IAM Permissions

```bash
# Get function role
aws lambda get-function --function-name CloudCartMvpStack-GetProductsFn-XYZ \
  --query 'Configuration.Role'

# Describe role
aws iam get-role --role-name CloudCartMvpStack-GetProductsFnRole-XYZ
```

---

## Still Having Issues?

### 1. Check AWS Service Health

Visit [AWS Service Health Dashboard](https://health.aws.amazon.com/health/status)

### 2. Review CloudWatch Logs

```bash
# All Lambda logs
aws logs tail /aws/lambda/CloudCartMvpStack-GetProductsFn --follow

# API Gateway logs
aws logs tail /aws/apigateway/CloudCartMvpStack --follow
```

### 3. Verify All Environment Variables

```bash
echo "API: $API"
echo "PRODUCTS_TABLE: $PRODUCTS_TABLE"
echo "ORDERS_TABLE: $ORDERS_TABLE"
echo "IMAGES_BUCKET: $IMAGES_BUCKET"
```

### 4. Run Diagnostic Script

```bash
# Create diagnostic script
cat > diagnose.sh << 'EOF'
#!/bin/bash
echo "=== CloudCart Diagnostics ==="
echo ""
echo "1. AWS Credentials:"
aws sts get-caller-identity
echo ""
echo "2. Stack Status:"
aws cloudformation describe-stacks --stack-name CloudCartMvpStack --query 'Stacks[0].StackStatus'
echo ""
echo "3. API URL:"
curl -s $API/products | jq '.' || echo "API test failed"
echo ""
echo "4. Products Table Count:"
aws dynamodb scan --table-name $PRODUCTS_TABLE --select COUNT
echo ""
echo "5. Recent Lambda Errors:"
aws logs filter-log-events \
  --log-group-name /aws/lambda/CloudCartMvpStack-GetProductsFn \
  --filter-pattern "ERROR" \
  --max-items 5
EOF

chmod +x diagnose.sh
./diagnose.sh
```

---

## Emergency Reset

If all else fails, start completely fresh:

```bash
# 1. Destroy stack
cd infra
npm run destroy

# 2. Clear CDK context
rm -rf cdk.out cdk.context.json

# 3. Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# 4. Redeploy
npm run deploy

# 5. Reseed data
cd ..
export PRODUCTS_TABLE=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ProductsTable`].OutputValue' --output text)
node scripts/seed-products.js $PRODUCTS_TABLE

# 6. Test
export API=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`HttpApiUrl`].OutputValue' --output text)
curl $API/products
```

---

**Need more help?** Check:
- [AWS Documentation](https://docs.aws.amazon.com/)
- [CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Serverless Patterns](https://serverlessland.com/patterns)
