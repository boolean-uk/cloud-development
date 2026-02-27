#!/bin/bash

# Script to query aggregated sensor data from DynamoDB
# Usage: ./scripts/query-aggregates.sh [sensorId]

set -e

STUDENT_NAME=${STUDENT_NAME:-student}
SENSOR_ID=${1:-sensor-001}
TABLE_NAME="${STUDENT_NAME}-hourly-aggregates"

echo "Querying aggregates for sensor: $SENSOR_ID"
echo "Table: $TABLE_NAME"
echo ""

aws dynamodb query \
  --table-name "$TABLE_NAME" \
  --key-condition-expression "sensorId = :sid" \
  --expression-attribute-values "{\":sid\":{\"S\":\"$SENSOR_ID\"}}" \
  --output json | jq -r '
    .Items[] |
    "Hour: \(.hourTimestamp.S) | " +
    "Count: \(.count.N) | " +
    "Avg: \(.avgTemp.N | tonumber | . * 100 | round / 100)°C | " +
    "Min: \(.minTemp.N | tonumber | . * 100 | round / 100)°C | " +
    "Max: \(.maxTemp.N | tonumber | . * 100 | round / 100)°C | " +
    "Location: \(.location.S)"
  '

echo ""
echo "To query a different sensor, run:"
echo "  ./scripts/query-aggregates.sh sensor-002"
