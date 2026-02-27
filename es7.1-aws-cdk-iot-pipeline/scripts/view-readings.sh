#!/bin/bash

# Script to view raw sensor readings from DynamoDB
# Usage: ./scripts/view-readings.sh [limit]

set -e

STUDENT_NAME=${STUDENT_NAME:-student}
LIMIT=${1:-10}
TABLE_NAME="${STUDENT_NAME}-sensor-readings"

echo "Viewing sensor readings from: $TABLE_NAME"
echo "Limit: $LIMIT"
echo ""

aws dynamodb scan \
  --table-name "$TABLE_NAME" \
  --limit "$LIMIT" \
  --output json | jq -r '
    .Items[] |
    "\(.sensorId.S) | \(.timestamp.S) | \(.temperature.N)°C | \(.location.S)"
  ' | sort

echo ""
echo "Total items: $(aws dynamodb scan --table-name "$TABLE_NAME" --select COUNT --output json | jq -r '.Count')"
