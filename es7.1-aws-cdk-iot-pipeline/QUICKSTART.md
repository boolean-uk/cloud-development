# Quick Start Guide

Get the IoT pipeline running in 10 minutes!

> **📖 About This Guide**
>
> This is the **fast deployment path** with minimal explanations. If you want to learn step-by-step with full context, see [challenge.md](./challenge.md) instead.
>
> **When to use this guide:**
> - ✅ You're familiar with AWS CDK
> - ✅ You just want to deploy and test quickly
> - ✅ You'll read explanations later if needed
>
> **When to use challenge.md instead:**
> - 📚 You're learning AWS CDK
> - 📚 You want detailed explanations of each step
> - 📚 You prefer guided tutorials

## Prerequisites

```bash
# Verify you have the required tools
aws --version          # AWS CLI v2
node --version         # Node.js 22.x
cdk --version          # AWS CDK
```

## Step 1: Configure Environment

```bash
# Set your student name (REQUIRED)
export STUDENT_NAME="yourname"  # Replace with your actual name

# Verify AWS credentials
aws sts get-caller-identity
```

## Step 2: Install Dependencies

```bash
# Install CDK infrastructure dependencies
cd infra
npm install

# Install Lambda function dependencies
cd ../services
npm install

cd ..
```

## Step 3: Deploy Infrastructure

```bash
cd infra

# Preview what will be created
cdk synth

# Deploy to AWS (approve IAM changes when prompted)
cdk deploy

# Save the outputs (especially BucketName)
```

**Expected output:**
```
✅  IotPipelineStack

Outputs:
IotPipelineStack.BucketName = yourname-sensor-data-123456789012
IotPipelineStack.ReadingsTableName = yourname-sensor-readings
...

Deployment time: ~3-5 minutes
```

## Step 4: Upload Test Data

```bash
cd ..

# Get bucket name from CDK output
export BUCKET_NAME=$(cd infra && npx cdk --app "node bin/iot-pipeline.js" --output cdk.out context 2>&1 | grep -o 'yourname-sensor-data-[0-9]*' | head -1)

# Or manually set it
export BUCKET_NAME="yourname-sensor-data-123456789012"  # Replace with actual name

# Upload a single test file
aws s3 cp test-data/sensor-001.json s3://$BUCKET_NAME/

# Wait 10 seconds for processing
sleep 10
```

## Step 5: Verify Processing

```bash
# Check Lambda #1 logs
aws logs tail /aws/lambda/${STUDENT_NAME}-process-sensor-data --since 5m

# Verify data in DynamoDB
aws dynamodb scan \
  --table-name ${STUDENT_NAME}-sensor-readings \
  --max-items 5 \
  --output table
```

## Step 6: Check Aggregates

```bash
# Wait for aggregation (Lambda #2 processing)
sleep 10

# Query aggregates
./scripts/query-aggregates.sh sensor-001

# Expected output:
# Hour: 2026-02-27T10:00:00Z | Count: 1 | Avg: 22.5°C | Min: 22.5°C | Max: 22.5°C
```

## Step 7: Batch Upload (Optional)

```bash
# Upload all test files
./scripts/upload-test-data.sh

# Wait 30 seconds for all processing
sleep 30

# View all readings
./scripts/view-readings.sh

# View all aggregates
aws dynamodb scan --table-name ${STUDENT_NAME}-hourly-aggregates --output table
```

## Step 8: Test Error Handling

```bash
# Upload invalid data
aws s3 cp test-data/invalid-sensor.json s3://$BUCKET_NAME/

# Wait for retries and DLQ routing (90 seconds)
sleep 90

# Check DLQ for failed message
./scripts/check-dlq.sh
```

## Step 9: Cleanup

```bash
# Delete all S3 objects
aws s3 rm s3://$BUCKET_NAME/ --recursive

# Destroy the stack
cd infra
cdk destroy

# Confirm with 'y' when prompted
```

---

## Common Commands

### View Logs

```bash
# Lambda #1 (process sensor data)
aws logs tail /aws/lambda/${STUDENT_NAME}-process-sensor-data --follow

# Lambda #2 (aggregate readings)
aws logs tail /aws/lambda/${STUDENT_NAME}-aggregate-readings --follow
```

### Query Data

```bash
# View raw readings
./scripts/view-readings.sh

# Query aggregates for a sensor
./scripts/query-aggregates.sh sensor-001
./scripts/query-aggregates.sh sensor-002

# Check DLQ
./scripts/check-dlq.sh
```

### CDK Commands

```bash
cd infra

# Show differences (before deploying)
cdk diff

# Synthesize CloudFormation template
cdk synth

# List all stacks
cdk ls

# Destroy stack
cdk destroy
```

### Debug Commands

```bash
# Check queue status
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name ${STUDENT_NAME}-sensor-queue --query 'QueueUrl' --output text) \
  --attribute-names All

# Check event source mappings
aws lambda list-event-source-mappings \
  --function-name ${STUDENT_NAME}-process-sensor-data

# Check DynamoDB stream status
aws dynamodb describe-table \
  --table-name ${STUDENT_NAME}-sensor-readings \
  --query 'Table.StreamSpecification'
```

---

## Troubleshooting

### Problem: Lambda not invoked after S3 upload

**Solution:**
- Wait 1-2 minutes for event source mapping to activate
- Check SQS queue for messages: `aws sqs get-queue-attributes ...`
- Verify S3 event notification is configured

### Problem: No aggregates appearing

**Solution:**
- Verify DynamoDB Stream is enabled
- Check Lambda #2 logs for errors
- Ensure Lambda #2 has permissions to read stream

### Problem: All messages going to DLQ

**Solution:**
- Check Lambda #1 logs for error details
- Verify bucket name and permissions
- Test with valid JSON file first

### Problem: CDK deploy fails

**Solution:**
- Verify AWS credentials: `aws sts get-caller-identity`
- Bootstrap CDK: `cdk bootstrap`
- Check for IAM permissions
- Try with different STUDENT_NAME if bucket exists

---

## Next Steps

Once you've successfully deployed and tested the pipeline:

1. Read the full [challenge.md](./challenge.md) for detailed explanations
2. Try the [extensions](./challenge.md#extensions-and-advanced-challenges)
3. Review the [validation checklist](./VALIDATION.md)
4. Experiment with different sensor data patterns
5. Explore the AWS Console to see all resources

---

**Need help?** See the Troubleshooting section in [challenge.md](./challenge.md)
