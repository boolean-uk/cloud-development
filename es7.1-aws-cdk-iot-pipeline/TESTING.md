# Testing Guide

> **🧪 About This Guide**
>
> This provides **detailed testing procedures and commands** to verify your deployment works end-to-end.
>
> **When to use this:**
> - 🧪 After deploying your infrastructure
> - 🧪 When troubleshooting issues
> - 🧪 To learn proper testing practices
> - 🧪 To verify each component individually
>
> **Companion guides:**
> - ✅ [VALIDATION.md](./VALIDATION.md) - Quick checklist version
> - 📚 [challenge.md](./challenge.md) - Full tutorial with testing section
> - ⚡ [QUICKSTART.md](./QUICKSTART.md) - Fast deployment guide

This guide helps you test and verify your IoT pipeline implementation works correctly.

## Pre-Deployment Validation

### 1. Verify File Structure

```bash
cd es7.1-aws-cdk-iot-pipeline

# Check key files exist
ls -l challenge.md README.md QUICKSTART.md VALIDATION.md
ls -l infra/lib/iot-pipeline-stack.js
ls -l services/process-sensor-data/index.js
ls -l services/aggregate-readings/index.js
ls -l test-data/*.json
ls -l scripts/*.sh
```

### 2. Validate JSON Test Data

```bash
# All test files should be valid JSON
for file in test-data/*.json; do
  echo "Validating $file"
  jq . "$file" > /dev/null && echo "✓ Valid" || echo "✗ Invalid"
done

# Note: invalid-sensor.json should have a string temperature (this is intentional for testing)
jq '.temperature' test-data/invalid-sensor.json  # Shows: "invalid"
```

### 3. Check Script Permissions

```bash
# All scripts should be executable
ls -l scripts/*.sh | grep '^-rwxr'

# If not, make them executable
chmod +x scripts/*.sh
```

## Deployment Testing

### 1. Set Up Environment

```bash
# Set your student name
export STUDENT_NAME="yourname"  # Replace with your actual name

# Verify AWS access
aws sts get-caller-identity
aws configure get region  # Should return your default region
```

### 2. Deploy Infrastructure

```bash
cd infra

# Install dependencies
npm install

# Synthesize CloudFormation template
cdk synth

# Deploy (takes ~3-5 minutes)
cdk deploy

# The deployment will create:
# - 1 S3 Bucket
# - 2 SQS Queues (main + DLQ)
# - 2 Lambda Functions
# - 2 DynamoDB Tables
# - 4 IAM Roles
# - 2 Lambda Event Source Mappings
# - 1 S3 Event Notification
```

### 3. Verify Deployed Resources

```bash
# Save bucket name for later use
export BUCKET_NAME="${STUDENT_NAME}-sensor-data-$(aws sts get-caller-identity --query Account --output text)"

# Check S3 bucket exists
aws s3 ls s3://$BUCKET_NAME/

# Check SQS queues exist
aws sqs list-queues | grep $STUDENT_NAME

# Check Lambda functions exist
aws lambda list-functions | grep $STUDENT_NAME

# Check DynamoDB tables exist
aws dynamodb list-tables | grep $STUDENT_NAME

# Check event source mappings
aws lambda list-event-source-mappings --function-name ${STUDENT_NAME}-process-sensor-data
aws lambda list-event-source-mappings --function-name ${STUDENT_NAME}-aggregate-readings
```

## Functional Testing

### 4. Test Single File Upload

```bash
cd ..  # Back to project root

# Upload one test file
aws s3 cp test-data/sensor-001.json s3://$BUCKET_NAME/

# Wait 10 seconds for processing
sleep 10

# Check Lambda #1 logs (should show processing)
aws logs tail /aws/lambda/${STUDENT_NAME}-process-sensor-data --since 2m

# Verify data in DynamoDB
aws dynamodb scan \
  --table-name ${STUDENT_NAME}-sensor-readings \
  --max-items 1 \
  --output json | jq '.Items[0]'

# Expected: One item with sensorId=sensor-001, temperature=22.5

# Wait for aggregation (10 more seconds)
sleep 10

# Check Lambda #2 logs
aws logs tail /aws/lambda/${STUDENT_NAME}-aggregate-readings --since 2m

# Verify aggregate
aws dynamodb query \
  --table-name ${STUDENT_NAME}-hourly-aggregates \
  --key-condition-expression "sensorId = :sid" \
  --expression-attribute-values '{":sid":{"S":"sensor-001"}}' \
  --output json | jq '.Items[0]'

# Expected: count=1, avgTemp=22.5, minTemp=22.5, maxTemp=22.5
```

**Success Criteria:**
- ✅ Lambda #1 executed within 10 seconds
- ✅ Item in SensorReadings table
- ✅ Lambda #2 executed within 20 seconds
- ✅ Item in HourlyAggregates table
- ✅ Aggregate values are correct

### 5. Test Batch Upload

```bash
# Upload all valid files
./scripts/upload-test-data.sh

# Wait 30 seconds for processing
sleep 30

# Check total items in readings table
aws dynamodb scan \
  --table-name ${STUDENT_NAME}-sensor-readings \
  --select COUNT

# Expected: Count between 8-9 (all valid files)

# Check aggregates using helper scripts
./scripts/view-readings.sh
./scripts/query-aggregates.sh sensor-001
./scripts/query-aggregates.sh sensor-002

# Verify multiple aggregates exist
aws dynamodb scan \
  --table-name ${STUDENT_NAME}-hourly-aggregates \
  --select COUNT

# Expected: Multiple items (different sensors and hours)
```

**Success Criteria:**
- ✅ All valid files processed (8 files)
- ✅ Multiple aggregates created
- ✅ No errors in Lambda logs
- ✅ Helper scripts work correctly

### 6. Test Error Handling

```bash
# Upload invalid file
aws s3 cp test-data/invalid-sensor.json s3://$BUCKET_NAME/

# Check Lambda logs immediately
aws logs tail /aws/lambda/${STUDENT_NAME}-process-sensor-data --since 1m --follow

# You should see validation error: "Invalid sensor data format"

# Wait for retries (90 seconds total)
sleep 90

# Check DLQ
./scripts/check-dlq.sh

# Expected: 1 message in DLQ

# Verify invalid data NOT in readings table
aws dynamodb query \
  --table-name ${STUDENT_NAME}-sensor-readings \
  --key-condition-expression "sensorId = :sid" \
  --expression-attribute-values '{":sid":{"S":"sensor-999"}}' \
  --select COUNT

# Expected: Count=0 (invalid data rejected)
```

**Success Criteria:**
- ✅ Lambda #1 rejects invalid data
- ✅ Error logged in CloudWatch
- ✅ Message retried 3 times
- ✅ Message moved to DLQ
- ✅ Invalid data NOT in DynamoDB

### 7. Verify Aggregation Accuracy

```bash
# Query aggregates for sensor-001 (should have 2 readings in hour 10)
aws dynamodb query \
  --table-name ${STUDENT_NAME}-hourly-aggregates \
  --key-condition-expression "sensorId = :sid AND hourTimestamp = :hour" \
  --expression-attribute-values '{
    ":sid":{"S":"sensor-001"},
    ":hour":{"S":"2026-02-27T10:00:00Z"}
  }' \
  --output json | jq '.Items[0]'

# Expected values:
# count: 2
# sumTemp: 45.6 (22.5 + 23.1)
# avgTemp: 22.8
# minTemp: 22.5
# maxTemp: 23.1

# Manually verify calculation
echo "scale=2; 45.6 / 2" | bc  # Should be 22.80
```

**Success Criteria:**
- ✅ Count is correct
- ✅ Sum is accurate
- ✅ Average = sum / count
- ✅ Min and max are correct

## Performance Testing (Optional)

### 8. Test Concurrent Uploads

```bash
# Upload multiple files simultaneously
for file in test-data/sensor-00{1..5}.json; do
  aws s3 cp "$file" s3://$BUCKET_NAME/$(date +%s)-$(basename $file) &
done
wait

# Wait for processing
sleep 20

# Check CloudWatch metrics in AWS Console:
# - Lambda → Functions → process-sensor-data → Monitoring
# - Look for: Invocations, Errors, Duration
```

**Success Criteria:**
- ✅ All files processed successfully
- ✅ No throttling errors
- ✅ Lambda scaled automatically
- ✅ Error count is 0

## Cleanup

### 9. Tear Down Infrastructure

```bash
# Empty S3 bucket first
aws s3 rm s3://$BUCKET_NAME/ --recursive

# List objects to confirm empty
aws s3 ls s3://$BUCKET_NAME/

# Destroy CDK stack
cd infra
cdk destroy

# Confirm with 'y' when prompted

# Verify deletion
aws cloudformation describe-stacks --stack-name IotPipelineStack
# Should return: "Stack with id IotPipelineStack does not exist"
```

**Success Criteria:**
- ✅ S3 bucket emptied
- ✅ CDK stack destroyed
- ✅ All resources removed
- ✅ No lingering charges

## Common Issues

### Issue 1: Event Source Mapping Not Active

**Symptom:** Files uploaded but Lambda not invoked

**Fix:** Wait 1-2 minutes after deployment for event source mappings to activate

### Issue 2: DynamoDB Stream Not Enabled

**Symptom:** No aggregates being created

**Fix:** Verify `stream: dynamodb.StreamViewType.NEW_IMAGE` is in your CDK stack

### Issue 3: IAM Permission Errors

**Symptom:** Lambda errors with "Access Denied"

**Fix:** Check that grant methods (`grantRead`, `grantWrite`, etc.) are called in CDK

### Issue 4: Invalid JSON in Test Data

**Symptom:** All messages going to DLQ

**Fix:** Validate test data files with `jq . test-data/*.json`

### Issue 5: Bucket Name Conflicts

**Symptom:** CDK deploy fails with "bucket already exists"

**Fix:** Change `STUDENT_NAME` or delete the conflicting bucket

## Quick Test Commands

```bash
# View Lambda logs
aws logs tail /aws/lambda/${STUDENT_NAME}-process-sensor-data --follow
aws logs tail /aws/lambda/${STUDENT_NAME}-aggregate-readings --follow

# View data
./scripts/view-readings.sh
./scripts/query-aggregates.sh sensor-001
./scripts/check-dlq.sh

# Check resource status
aws dynamodb describe-table --table-name ${STUDENT_NAME}-sensor-readings --query 'Table.StreamSpecification'
aws lambda list-event-source-mappings --function-name ${STUDENT_NAME}-process-sensor-data
```

---

**Need Help?** Refer to the [Troubleshooting section](./challenge.md#troubleshooting) in challenge.md
