#!/bin/bash

# Script to check for failed messages in the Dead Letter Queue
# Usage: ./scripts/check-dlq.sh

set -e

STUDENT_NAME=${STUDENT_NAME:-student}
QUEUE_NAME="${STUDENT_NAME}-sensor-dlq"

echo "Checking Dead Letter Queue: $QUEUE_NAME"
echo ""

# Get queue URL
QUEUE_URL=$(aws sqs get-queue-url --queue-name "$QUEUE_NAME" --query 'QueueUrl' --output text 2>/dev/null || echo "")

if [ -z "$QUEUE_URL" ]; then
  echo "❌ Queue not found. Has the stack been deployed?"
  exit 1
fi

# Get approximate number of messages
MESSAGE_COUNT=$(aws sqs get-queue-attributes \
  --queue-url "$QUEUE_URL" \
  --attribute-names ApproximateNumberOfMessages \
  --query 'Attributes.ApproximateNumberOfMessages' \
  --output text)

echo "Messages in DLQ: $MESSAGE_COUNT"
echo ""

if [ "$MESSAGE_COUNT" -gt 0 ]; then
  echo "Receiving messages from DLQ..."
  aws sqs receive-message \
    --queue-url "$QUEUE_URL" \
    --max-number-of-messages 10 \
    --output json | jq -r '
      if .Messages then
        .Messages[] | "Message ID: \(.MessageId)\n\(.Body)\n---"
      else
        "No messages received (they may be in flight)"
      end
    '
else
  echo "✓ No failed messages in DLQ"
fi
