#!/bin/bash

# Script to upload test sensor data to S3
# Usage: ./scripts/upload-test-data.sh

set -e

# Get bucket name from CDK outputs
BUCKET_NAME=$(cd infra && npx cdk --app "node bin/iot-pipeline.js" --output cdk.out deploy --outputs-file outputs.json --require-approval never 2>/dev/null && cat outputs.json | jq -r '.IotPipelineStack.BucketName' 2>/dev/null)

# Fallback: try to get from existing outputs
if [ -z "$BUCKET_NAME" ] || [ "$BUCKET_NAME" == "null" ]; then
  if [ -f "infra/outputs.json" ]; then
    BUCKET_NAME=$(cat infra/outputs.json | jq -r '.IotPipelineStack.BucketName')
  fi
fi

# Final fallback: try AWS CLI
if [ -z "$BUCKET_NAME" ] || [ "$BUCKET_NAME" == "null" ]; then
  STUDENT_NAME=${STUDENT_NAME:-student}
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  BUCKET_NAME="${STUDENT_NAME}-sensor-data-${ACCOUNT_ID}"
fi

echo "Using bucket: $BUCKET_NAME"
echo ""

# Upload each test file with a delay
for file in test-data/*.json; do
  filename=$(basename "$file")
  echo "Uploading $filename..."
  aws s3 cp "$file" "s3://$BUCKET_NAME/$filename"
  echo "✓ Uploaded $filename"
  sleep 1
done

echo ""
echo "All test data uploaded successfully!"
echo "Check CloudWatch Logs to see processing status:"
echo "  aws logs tail /aws/lambda/\${STUDENT_NAME}-process-sensor-data --follow"
