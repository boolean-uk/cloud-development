# Validation Checklist

> **✅ About This Checklist**
>
> Use this to **verify your implementation is complete and correct** before submitting or moving forward.
>
> **When to use this:**
> - ✅ After completing the challenge
> - ✅ Before submitting your work
> - ✅ To troubleshoot what's not working
> - ✅ To confirm you haven't missed any requirements
>
> **Companion guides:**
> - 🧪 [TESTING.md](./TESTING.md) - Step-by-step testing commands
> - 📚 [challenge.md](./challenge.md) - Full tutorial with explanations

Use this checklist to verify your IoT pipeline implementation is complete and working correctly.

## Infrastructure Deployment

- [ ] CDK stack deployed successfully (`cdk deploy`)
- [ ] CloudFormation stack shows CREATE_COMPLETE status
- [ ] All 7 stack outputs are displayed

## S3 Resources

- [ ] S3 bucket created: `${STUDENT_NAME}-sensor-data-${ACCOUNT_ID}`
- [ ] Bucket has event notification configured
- [ ] Can upload JSON files to bucket: `aws s3 cp test-data/sensor-001.json s3://$BUCKET_NAME/`

## SQS Resources

- [ ] Main queue created: `${STUDENT_NAME}-sensor-queue`
- [ ] Dead Letter Queue created: `${STUDENT_NAME}-sensor-dlq`
- [ ] DLQ configured with maxReceiveCount=3
- [ ] Queue visibility timeout is 60 seconds

## Lambda Functions

- [ ] Lambda #1 created: `${STUDENT_NAME}-process-sensor-data`
- [ ] Lambda #2 created: `${STUDENT_NAME}-aggregate-readings`
- [ ] Both Lambdas have Node.js 22.x runtime
- [ ] Both Lambdas have 512 MB memory
- [ ] Both Lambdas have 30-second timeout

## Event Source Mappings

- [ ] Lambda #1 has SQS event source mapping (batch size: 10)
- [ ] Lambda #2 has DynamoDB Stream event source mapping (batch size: 100)
- [ ] Both event source mappings show "Enabled" status
- [ ] Can verify with: `aws lambda list-event-source-mappings --function-name $FUNCTION_NAME`

## DynamoDB Tables

- [ ] SensorReadings table created with correct keys (sensorId, timestamp)
- [ ] DynamoDB Stream enabled on SensorReadings table (NEW_IMAGE)
- [ ] HourlyAggregates table created with correct keys (sensorId, hourTimestamp)
- [ ] Both tables use PAY_PER_REQUEST billing mode

## IAM Permissions

- [ ] Lambda #1 can read from S3 bucket
- [ ] Lambda #1 can write to SensorReadings table
- [ ] Lambda #1 can consume SQS messages
- [ ] Lambda #2 can read DynamoDB Stream
- [ ] Lambda #2 can read/write to HourlyAggregates table

## End-to-End Testing

### Single File Upload

- [ ] Upload `sensor-001.json` to S3
- [ ] Within 10 seconds, Lambda #1 logs show processing
- [ ] Item appears in SensorReadings table
- [ ] Within 15 seconds, Lambda #2 logs show aggregation
- [ ] Item appears in HourlyAggregates table

### Batch Upload

- [ ] Upload all test files: `./scripts/upload-test-data.sh`
- [ ] All 8 valid files processed successfully
- [ ] SensorReadings table has 8 items
- [ ] HourlyAggregates table has multiple aggregates
- [ ] Can query aggregates: `./scripts/query-aggregates.sh sensor-001`

### Aggregation Accuracy

For sensor-001 with 2 readings in hour 10:00 (22.5°C and 23.1°C):

- [ ] Count: 2
- [ ] Sum: 45.6
- [ ] Average: 22.8°C
- [ ] Min: 22.5°C
- [ ] Max: 23.1°C

### Error Handling

- [ ] Upload invalid file: `aws s3 cp test-data/invalid-sensor.json s3://$BUCKET_NAME/`
- [ ] Lambda #1 logs show validation error
- [ ] After 3 retry attempts (~90 seconds), message moves to DLQ
- [ ] DLQ contains 1 message: `./scripts/check-dlq.sh`
- [ ] Invalid data NOT written to SensorReadings table

## CloudWatch Logs

- [ ] Lambda #1 log group exists: `/aws/lambda/${STUDENT_NAME}-process-sensor-data`
- [ ] Lambda #2 log group exists: `/aws/lambda/${STUDENT_NAME}-aggregate-readings`
- [ ] Logs show successful invocations
- [ ] No unhandled errors in logs

## Helper Scripts

- [ ] `./scripts/upload-test-data.sh` works
- [ ] `./scripts/view-readings.sh` displays sensor readings
- [ ] `./scripts/query-aggregates.sh sensor-001` displays aggregates
- [ ] `./scripts/check-dlq.sh` displays DLQ messages

## Cleanup

- [ ] Can empty S3 bucket: `aws s3 rm s3://$BUCKET_NAME/ --recursive`
- [ ] Can destroy stack: `cdk destroy`
- [ ] CloudFormation stack shows DELETE_COMPLETE status
- [ ] All resources deleted

## Passing Criteria

To successfully complete this challenge:

- ✅ At least 90% of infrastructure validations passing
- ✅ All end-to-end testing validations passing
- ✅ No unhandled errors in Lambda logs
- ✅ Aggregation calculations are accurate
- ✅ Error handling works (DLQ receives failed messages)
- ✅ Cleanup completes successfully
