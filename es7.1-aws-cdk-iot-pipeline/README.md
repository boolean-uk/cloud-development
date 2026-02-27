# IoT Temperature Sensor Data Pipeline with AWS CDK

A production-ready, event-driven IoT data ingestion pipeline built with AWS CDK, demonstrating serverless architecture patterns with S3, SQS, Lambda, DynamoDB, and DynamoDB Streams.

## 📚 Documentation Guide

This project includes several documentation files - **choose the one that fits your needs:**

| File | Use When | Time | Audience |
|------|----------|------|----------|
| **[README.md](./README.md)** | You want a quick overview of the project | 2 min | Everyone |
| **[QUICKSTART.md](./QUICKSTART.md)** | You want to deploy fast (minimal explanations) | 10 min | Experienced developers |
| **[challenge.md](./challenge.md)** | You want to learn step-by-step with full explanations | 2 hours | Students learning AWS CDK |
| **[VALIDATION.md](./VALIDATION.md)** | You want to verify your implementation is correct | 30 min | Students checking their work |
| **[TESTING.md](./TESTING.md)** | You want detailed testing procedures and commands | 45 min | Students testing their deployment |

### 🎯 Recommended Path for Students

1. **Start here** → Read this README for overview
2. **Learn** → Follow [challenge.md](./challenge.md) step-by-step (2 hours)
3. **Test** → Use [TESTING.md](./TESTING.md) to verify everything works
4. **Validate** → Check [VALIDATION.md](./VALIDATION.md) before submitting

### ⚡ Fast Path for Experienced Users

1. **Start here** → Read this README for overview
2. **Deploy** → Follow [QUICKSTART.md](./QUICKSTART.md) (10 minutes)
3. **Verify** → Use helper scripts to test functionality

---

## Quick Start

```bash
# Set your student name
export STUDENT_NAME="yourname"

# Install dependencies
cd infra && npm install
cd ../services && npm install

# Deploy infrastructure
cd ../infra && cdk deploy

# Upload test data
cd .. && ./scripts/upload-test-data.sh

# View results
./scripts/view-readings.sh
./scripts/query-aggregates.sh sensor-001
```

> **💡 Tip:** For detailed instructions, see [QUICKSTART.md](./QUICKSTART.md) or [challenge.md](./challenge.md)

## Architecture

```
Temperature Sensors → S3 → SQS → Lambda #1 → DynamoDB → Stream → Lambda #2 → Aggregates
                                    ↓
                                   DLQ (failures)
```

## What You'll Learn

- Define infrastructure as code with AWS CDK
- Build event-driven serverless pipelines
- Process DynamoDB Streams for real-time aggregations
- Implement error handling with Dead Letter Queues
- Deploy complete AWS architectures with one command

## Project Structure

```
es7.1-aws-cdk-iot-pipeline/
├── challenge.md              # Complete tutorial (2 hours)
├── infra/                    # CDK infrastructure code
│   ├── bin/                  # CDK app entry point
│   ├── lib/                  # Stack definitions
│   └── package.json
├── services/                 # Lambda function handlers
│   ├── process-sensor-data/  # Lambda #1: S3 → DynamoDB
│   └── aggregate-readings/   # Lambda #2: Stream → Aggregates
├── test-data/                # Sample sensor JSON files
└── scripts/                  # Helper scripts for testing
```

## Prerequisites

- AWS CLI v2 configured
- Node.js 22.x
- AWS CDK CLI: `npm install -g aws-cdk`
- CDK bootstrapped: `cdk bootstrap`

## Time Estimate

**2 hours** (guided tutorial)

## Difficulty

**Intermediate** - Requires basic understanding of AWS services and JavaScript/Node.js

## Documentation

See [challenge.md](./challenge.md) for the complete step-by-step tutorial.

## Cleanup

```bash
# Delete all S3 objects
aws s3 rm s3://$BUCKET_NAME/ --recursive

# Destroy the stack
cd infra && cdk destroy
```

