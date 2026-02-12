# Event-Driven File Processing Pipeline on AWS

Build a production-grade, serverless file processing system using S3, SQS, Lambda, and ECS Fargate.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Step-by-Step Guide](#step-by-step-guide)
  - [Part 1: Infrastructure Setup](#part-1-infrastructure-setup)
  - [Part 2: Application Code](#part-2-application-code)
  - [Part 3: Deployment](#part-3-deployment)
  - [Part 4: Testing](#part-4-testing)
- [Cleanup](#cleanup)
- [Troubleshooting](#troubleshooting)

---

## Overview

### What This Lab Teaches

This hands-on lab demonstrates how to build a scalable, event-driven architecture on AWS. You'll learn:

- ✅ Event-driven architecture with S3 and SQS
- ✅ Serverless computing with Lambda
- ✅ Container orchestration with ECS Fargate
- ✅ IAM roles and least-privilege security
- ✅ Message queuing and dead-letter queues
- ✅ Idempotent processing patterns
- ✅ Docker containerization for AWS

### What the Pipeline Does

The system processes text files uploaded to S3 and generates statistical reports:

1. **Upload**: Drop a `.txt` file into S3 bucket (`incoming/` folder)
2. **Ingest**: Lambda validates and queues the job
3. **Process**: Fargate worker computes word count statistics
4. **Store**: Worker uploads JSON report to processed bucket
5. **Notify**: Lambda logs completion metrics

**Input Example:** `sample.txt` with text content
**Output Example:** `sample.txt.report.json` with `{bytes, lines, words}`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS ACCOUNT                             │
│                                                                 │
│  ┌──────────┐  S3 Event   ┌──────────────┐                      │
│  │    S3    │────────────▶│ IngestLambda │                      │
│  │ (dropzone│             └──────┬───────┘                      │
│  │  bucket) │                    │                              │
│  └──────────┘                    │ Send Job                     │
│                                  ▼                              │
│                            ┌──────────┐                         │
│                            │   SQS    │                         │
│                            │jobs-queue│                         │
│                            └────┬─────┘                         │
│                                 │ Receive                       │
│                                 ▼                               │
│  ┌──────────┐            ┌─────────────┐                        │
│  │    S3    │◀───────────│ECS Fargate  │                        │
│  │(processed│  Put       │   Worker    │                        │
│  │  bucket) │  Report    │ (Container) │                        │
│  └──────────┘            └──────┬──────┘                        │
│                                 │ Send Result                   │
│                                 ▼                               │
│                           ┌──────────────┐                      │
│                           │     SQS      │                      │
│                           │results-queue │                      │
│                           └──────┬───────┘                      │
│                                  │ Trigger                      │
│                                  ▼                              │
│                           ┌──────────────┐                      │
│                           │ResultLambda  │                      │
│                           │  (Logging)   │                      │
│                           └──────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Purpose | Technology |
|-----------|---------|------------|
| **Dropzone Bucket** | Receives uploaded files | S3 |
| **IngestLambda** | Validates files and creates jobs | Lambda (Node.js 22) |
| **Jobs Queue** | Buffers work for processing | SQS (with DLQ) |
| **Worker** | Processes files (word count) | ECS Fargate (Node.js 22) |
| **Processed Bucket** | Stores output reports | S3 |
| **Results Queue** | Notifies of completed jobs | SQS |
| **ResultLambda** | Logs completion metrics | Lambda (Node.js 22) |

---

## Prerequisites

### Required Tools

- **AWS Account** with admin permissions (or permissions for S3, SQS, Lambda, ECR, ECS, IAM, CloudWatch)
- **AWS CLI v2** - [Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html)
- **Node.js 22+** - [Download](https://nodejs.org/)
- **Docker** - [Get Docker](https://docs.docker.com/get-docker/)
- **jq** - JSON processor ([Installation](https://stedolan.github.io/jq/download/))

### Configure AWS CLI

```bash
aws configure
# Enter your AWS Access Key ID, Secret Key, and default region
```

### Verify Setup

```bash
aws sts get-caller-identity   # Should show your account
node --version                # Should be v22+
docker --version              # Should show Docker version
jq --version                  # Should show jq version
```

### Region

This lab uses **eu-west-1** (Ireland). To use a different region, update the `AWS_REGION` variable in Step 0.

### ⚠️ Important since Boolean has a shared AWS Account

- **Each student MUST use a unique `STUDENT_NAME`** in Step 0
- Good examples: `alice`, `bob`, `charlie`, `john-smith`, etc.
- Use lowercase letters and hyphens only (no spaces or special characters)
- This prevents resource naming conflicts (IAM roles, SQS queues, Lambda functions, etc.)

---

## Quick Start

**Estimated Time:** 45-60 minutes

Follow the [Step-by-Step Guide](#step-by-step-guide) below. The lab is organized into four parts:

1. **Infrastructure Setup** (20 min) - Create AWS resources
2. **Application Code** (10 min) - Write Lambda and Worker code
3. **Deployment** (15 min) - Deploy and wire components
4. **Testing** (10 min) - Validate the pipeline

---

## Step-by-Step Guide

## Part 1: Infrastructure Setup

This section creates the AWS infrastructure: S3 buckets, SQS queues, and IAM roles.

### Step 0: Set Environment Variables

Export variables that will be used throughout the lab.

```bash
# Set your AWS region
export AWS_REGION="eu-west-1"

# Get your AWS account ID
export ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

# Create a unique identifier for this student/session (to avoid conflicts)
# Use your name or username (lowercase, no spaces)
export STUDENT_NAME="john"  # CHANGE THIS to your unique name!

# Examples: "alice", "bob", "charlie", "john-smith", etc.
# Tip: You can use $(whoami) to get your system username automatically
# export STUDENT_NAME="$(whoami)"

# Create globally-unique resource names
export DROPZONE_BUCKET="dropzone-${ACCOUNT_ID}-${STUDENT_NAME}"
export PROCESSED_BUCKET="processed-${ACCOUNT_ID}-${STUDENT_NAME}"

# Define queue names with unique suffix
export JOBS_QUEUE_NAME="jobs-queue-${STUDENT_NAME}"
export RESULTS_QUEUE_NAME="results-queue-${STUDENT_NAME}"
export JOBS_DLQ_NAME="jobs-dlq-${STUDENT_NAME}"

# Define ECS resources with unique suffix
export ECS_CLUSTER="s3-sqs-lab-cluster-${STUDENT_NAME}"
export ECS_SERVICE="processor-service-${STUDENT_NAME}"
export ECR_REPO="s3-sqs-lab-worker-${STUDENT_NAME}"

# Define IAM role names with unique suffix
export LAMBDA_ROLE_NAME="s3-sqs-lab-lambda-role-${STUDENT_NAME}"
export TASK_ROLE_NAME="s3-sqs-lab-task-role-${STUDENT_NAME}"
export TASK_EXEC_ROLE_NAME="s3-sqs-lab-task-exec-role-${STUDENT_NAME}"

# Define Lambda function names with unique suffix
export INGEST_LAMBDA_NAME="s3-sqs-lab-ingest-${STUDENT_NAME}"
export RESULT_LAMBDA_NAME="s3-sqs-lab-result-${STUDENT_NAME}"

# Define security group name with unique suffix
export SG_NAME="s3-sqs-lab-sg-${STUDENT_NAME}"

# Verify variables
echo "========================================"
echo "Student Name: $STUDENT_NAME"
echo "========================================"
echo "Region: $AWS_REGION"
echo "Account: $ACCOUNT_ID"
echo "Dropzone Bucket: $DROPZONE_BUCKET"
echo "Jobs Queue: $JOBS_QUEUE_NAME"
echo "ECS Cluster: $ECS_CLUSTER"
echo "Lambda Role: $LAMBDA_ROLE_NAME"
echo "========================================"
echo "⚠️  IMPORTANT: Each student must use a different STUDENT_NAME!"
echo "========================================"
```

---

### Step 1: Create S3 Buckets

Create two S3 buckets: one for incoming files, one for processed outputs.

```bash
# Create dropzone bucket (where files are uploaded)
aws s3api create-bucket \
  --bucket "$DROPZONE_BUCKET" \
  --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"

# Create processed bucket (where reports are stored)
aws s3api create-bucket \
  --bucket "$PROCESSED_BUCKET" \
  --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"

# Block public access (security best practice)
aws s3api put-public-access-block \
  --bucket "$DROPZONE_BUCKET" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-public-access-block \
  --bucket "$PROCESSED_BUCKET" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo "✅ S3 buckets created"
```

**What this does:**
- Creates two private S3 buckets with public access blocked
- The dropzone bucket will receive uploaded files
- The processed bucket will store the generated reports

---

### Step 2: Create SQS Queues

Create three queues: jobs queue, results queue, and a dead-letter queue for failed jobs.

```bash
# Create Dead Letter Queue (DLQ) for failed jobs
DLQ_URL="$(aws sqs create-queue \
  --queue-name "$JOBS_DLQ_NAME" \
  --query QueueUrl --output text)"

DLQ_ARN="$(aws sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names QueueArn \
  --query Attributes.QueueArn --output text)"

export DLQ_URL

# Create jobs queue with redrive policy (sends failed messages to DLQ)
# Use JSON format for attributes (easier than escaping)
cat > /tmp/queue-attributes.json <<EOF
{
  "ReceiveMessageWaitTimeSeconds": "20",
  "VisibilityTimeout": "60",
  "RedrivePolicy": "{\"deadLetterTargetArn\":\"$DLQ_ARN\",\"maxReceiveCount\":\"4\"}"
}
EOF

JOBS_QUEUE_URL="$(aws sqs create-queue \
  --queue-name "$JOBS_QUEUE_NAME" \
  --attributes file:///tmp/queue-attributes.json \
  --query QueueUrl --output text)"

JOBS_QUEUE_ARN="$(aws sqs get-queue-attributes \
  --queue-url "$JOBS_QUEUE_URL" \
  --attribute-names QueueArn \
  --query Attributes.QueueArn --output text)"

# Create results queue
RESULTS_QUEUE_URL="$(aws sqs create-queue \
  --queue-name "$RESULTS_QUEUE_NAME" \
  --attributes ReceiveMessageWaitTimeSeconds=20,VisibilityTimeout=60 \
  --query QueueUrl --output text)"

RESULTS_QUEUE_ARN="$(aws sqs get-queue-attributes \
  --queue-url "$RESULTS_QUEUE_URL" \
  --attribute-names QueueArn \
  --query Attributes.QueueArn --output text)"

# Export for later use
export JOBS_QUEUE_URL RESULTS_QUEUE_URL JOBS_QUEUE_ARN RESULTS_QUEUE_ARN

echo "✅ SQS queues created"
echo "Jobs Queue: $JOBS_QUEUE_URL"
echo "Results Queue: $RESULTS_QUEUE_URL"
echo "DLQ: $DLQ_URL"
```

**What this does:**
- **jobs-queue**: Holds file processing jobs (with 20s long polling for efficiency)
- **results-queue**: Holds completion notifications
- **jobs-dlq**: Receives messages that fail 4+ times (for debugging)

**Key Settings:**
- `VisibilityTimeout=60`: Worker has 60 seconds to process before message reappears
- `maxReceiveCount=4`: After 4 failures, message goes to DLQ
- `ReceiveMessageWaitTimeSeconds=20`: Long polling reduces costs

---

### Step 3: Create IAM Roles

Create three IAM roles with least-privilege permissions.

#### 3.1: Lambda Execution Role

This role allows Lambda functions to log to CloudWatch, read from S3, and interact with SQS.

```bash
# Create trust policy (allows Lambda service to assume this role)
cat > lambda-trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

# Create the role
aws iam create-role \
  --role-name "$LAMBDA_ROLE_NAME" \
  --assume-role-policy-document file://lambda-trust.json

# Attach AWS managed policies for Lambda logging and SQS access
aws iam attach-role-policy \
  --role-name "$LAMBDA_ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam attach-role-policy \
  --role-name "$LAMBDA_ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole

# Create inline policy for S3 and SQS permissions
cat > lambda-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SendJobsToQueue",
      "Effect": "Allow",
      "Action": ["sqs:SendMessage"],
      "Resource": "$JOBS_QUEUE_ARN"
    },
    {
      "Sid": "ConsumeResultsFromQueue",
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "$RESULTS_QUEUE_ARN"
    },
    {
      "Sid": "ReadDropzoneMetadata",
      "Effect": "Allow",
      "Action": ["s3:HeadObject"],
      "Resource": "arn:aws:s3:::$DROPZONE_BUCKET/*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name "$LAMBDA_ROLE_NAME" \
  --policy-name s3-sqs-lab-lambda-inline \
  --policy-document file://lambda-policy.json

# Get role ARN
LAMBDA_ROLE_ARN="$(aws iam get-role \
  --role-name "$LAMBDA_ROLE_NAME" \
  --query Role.Arn --output text)"

export LAMBDA_ROLE_ARN

# Wait for IAM role to propagate
echo "Waiting for IAM role to propagate..."
sleep 10

echo "✅ Lambda role created: $LAMBDA_ROLE_ARN"
```

**What this does:**
- Allows Lambda to write logs to CloudWatch
- Allows IngestLambda to send messages to jobs queue
- Allows ResultLambda to receive messages from results queue
- Allows Lambda to check if files exist in S3 (HeadObject)

---

#### 3.2: ECS Task Roles

Create two roles for ECS: one for the application (task role), one for infrastructure (execution role).

```bash
# Create trust policy for ECS tasks
cat > ecs-task-trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "ecs-tasks.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

# Create task role (permissions for the application code)
aws iam create-role \
  --role-name "$TASK_ROLE_NAME" \
  --assume-role-policy-document file://ecs-task-trust.json

# Create inline policy for worker permissions
cat > task-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ConsumeJobsFromQueue",
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:ChangeMessageVisibility",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "$JOBS_QUEUE_ARN"
    },
    {
      "Sid": "SendResultsToQueue",
      "Effect": "Allow",
      "Action": ["sqs:SendMessage"],
      "Resource": "$RESULTS_QUEUE_ARN"
    },
    {
      "Sid": "ReadFromDropzone",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:HeadObject"],
      "Resource": "arn:aws:s3:::$DROPZONE_BUCKET/*"
    },
    {
      "Sid": "WriteToProcessedBucket",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:HeadObject"],
      "Resource": "arn:aws:s3:::$PROCESSED_BUCKET/*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name "$TASK_ROLE_NAME" \
  --policy-name s3-sqs-lab-task-inline \
  --policy-document file://task-policy.json

TASK_ROLE_ARN="$(aws iam get-role \
  --role-name "$TASK_ROLE_NAME" \
  --query Role.Arn --output text)"

export TASK_ROLE_ARN

# Create task execution role (permissions for ECS to pull images and write logs)
aws iam create-role \
  --role-name "$TASK_EXEC_ROLE_NAME" \
  --assume-role-policy-document file://ecs-task-trust.json

aws iam attach-role-policy \
  --role-name "$TASK_EXEC_ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

TASK_EXEC_ROLE_ARN="$(aws iam get-role \
  --role-name "$TASK_EXEC_ROLE_NAME" \
  --query Role.Arn --output text)"

export TASK_EXEC_ROLE_ARN

# Wait for IAM roles to propagate
echo "Waiting for IAM roles to propagate..."
sleep 10

echo "✅ ECS roles created"
echo "Task Role: $TASK_ROLE_ARN"
echo "Execution Role: $TASK_EXEC_ROLE_ARN"
```

**What this does:**
- **Task Role**: Gives the worker container permissions to:
  - Consume messages from jobs queue
  - Send messages to results queue
  - Download files from dropzone bucket
  - Upload reports to processed bucket
- **Execution Role**: Gives ECS permissions to:
  - Pull Docker image from ECR
  - Write logs to CloudWatch

---

**🎉 Part 1 Complete!** Infrastructure is ready. Next: write the application code.

---

## Part 2: Application Code

Now we'll write the Lambda functions and Fargate worker.

### Step 4: Project Setup

Create the project structure:

```bash
# Create project directory
mkdir -p s3-sqs-fargate-lab
cd s3-sqs-fargate-lab

# Create subdirectories
mkdir -p lambdas/ingest
mkdir -p lambdas/result
mkdir -p worker

echo "✅ Project structure created"
```

---

### Step 5: IngestLambda Code

This Lambda validates uploaded files and creates processing jobs.

#### Create `lambdas/ingest/package.json`

```bash
cat > lambdas/ingest/package.json <<'EOF'
{
  "name": "ingest-lambda",
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.600.0",
    "@aws-sdk/client-sqs": "^3.600.0"
  }
}
EOF
```

#### Create `lambdas/ingest/index.mjs`

```bash
cat > lambdas/ingest/index.mjs <<'EOF'
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const s3 = new S3Client({});
const sqs = new SQSClient({});

const JOBS_QUEUE_URL = process.env.JOBS_QUEUE_URL;
const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET;
const ALLOWED_SUFFIX = process.env.ALLOWED_SUFFIX ?? ".txt";
const MAX_BYTES = Number(process.env.MAX_BYTES ?? "10485760"); // 10MB

export const handler = async (event) => {
  if (!JOBS_QUEUE_URL || !OUTPUT_BUCKET) {
    throw new Error("Missing env: JOBS_QUEUE_URL or OUTPUT_BUCKET");
  }

  const records = event.Records ?? [];
  const results = [];

  for (const r of records) {
    const bucket = r.s3?.bucket?.name;
    const key = decodeURIComponent((r.s3?.object?.key ?? "").replace(/\+/g, " "));
    const eTag = (r.s3?.object?.eTag ?? "").replace(/"/g, "");
    const size = Number(r.s3?.object?.size ?? 0);

    if (!bucket || !key) continue;

    // Only process files in incoming/ folder
    if (!key.startsWith("incoming/")) {
      results.push({ bucket, key, skipped: "not_in_incoming_prefix" });
      continue;
    }

    // Only process .txt files
    if (!key.toLowerCase().endsWith(ALLOWED_SUFFIX)) {
      results.push({ bucket, key, skipped: "unsupported_type" });
      continue;
    }

    // Reject files over 10MB
    if (size > MAX_BYTES) {
      results.push({ bucket, key, skipped: "too_large" });
      continue;
    }

    // Verify file exists and get metadata
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));

    // Create unique job ID
    const traceId = cryptoRandomId();
    const jobId = `${bucket}:${key}:${eTag || head.ETag || traceId}`;

    // Define output location
    const outputKey = `processed/${key.replace(/^incoming\//, "")}.report.json`;

    // Create job message
    const job = {
      jobId,
      bucket,
      key,
      outputBucket: OUTPUT_BUCKET,
      outputKey,
      submittedAt: new Date().toISOString(),
      traceId
    };

    // Send job to queue
    const msg = await sqs.send(new SendMessageCommand({
      QueueUrl: JOBS_QUEUE_URL,
      MessageBody: JSON.stringify(job),
      MessageAttributes: {
        traceId: { DataType: "String", StringValue: traceId }
      }
    }));

    console.log(JSON.stringify({
      action: "ENQUEUED",
      jobId,
      messageId: msg.MessageId,
      bucket,
      key
    }));

    results.push({ bucket, key, jobId, messageId: msg.MessageId });
  }

  return { ok: true, resultsCount: results.length, results };
};

function cryptoRandomId() {
  // Generate a simple random ID without dependencies
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
EOF

echo "✅ IngestLambda code created"
```

**What this does:**
- Listens for S3 upload events
- Validates file type, size, and location
- Creates a job message with input/output locations
- Sends job to SQS jobs queue
- Logs enqueued jobs for observability

---

### Step 6: ResultLambda Code

This Lambda logs completion metrics (simple observer pattern).

#### Create `lambdas/result/package.json`

```bash
cat > lambdas/result/package.json <<'EOF'
{
  "name": "result-lambda",
  "type": "module"
}
EOF
```

#### Create `lambdas/result/index.mjs`

```bash
cat > lambdas/result/index.mjs <<'EOF'
export const handler = async (event) => {
  for (const r of (event.Records ?? [])) {
    const body = safeJson(r.body);

    console.log(JSON.stringify({
      action: "RESULT",
      jobId: body?.jobId,
      status: body?.status,
      input: { bucket: body?.bucket, key: body?.key },
      output: { bucket: body?.outputBucket, key: body?.outputKey },
      durationMs: body?.durationMs,
      traceId: body?.traceId
    }));
  }

  return { ok: true };
};

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
EOF

echo "✅ ResultLambda code created"
```

**What this does:**
- Receives completion messages from results queue
- Logs structured metrics to CloudWatch
- Can be extended to send notifications, update databases, etc.

---

### Step 7: Fargate Worker Code

This is the core processing logic that runs in a Docker container.

#### Create `worker/package.json`

```bash
cat > worker/package.json <<'EOF'
{
  "name": "s3-sqs-worker",
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.600.0",
    "@aws-sdk/client-sqs": "^3.600.0"
  }
}
EOF
```

#### Create `worker/index.mjs`

```bash
cat > worker/index.mjs <<'EOF'
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } from "@aws-sdk/client-sqs";

const s3 = new S3Client({});
const sqs = new SQSClient({});

const JOBS_QUEUE_URL = process.env.JOBS_QUEUE_URL;
const RESULTS_QUEUE_URL = process.env.RESULTS_QUEUE_URL;

let shuttingDown = false;

// Graceful shutdown handling
process.on("SIGTERM", () => {
  shuttingDown = true;
  console.log("SIGTERM received: finishing current message then exiting...");
});

process.on("SIGINT", () => {
  shuttingDown = true;
  console.log("SIGINT received: finishing current message then exiting...");
});

if (!JOBS_QUEUE_URL || !RESULTS_QUEUE_URL) {
  console.error("Missing env: JOBS_QUEUE_URL or RESULTS_QUEUE_URL");
  process.exit(1);
}

console.log("Worker starting", { JOBS_QUEUE_URL, RESULTS_QUEUE_URL });

// Main processing loop
while (!shuttingDown) {
  // Poll for messages (long polling with 20 second wait)
  const resp = await sqs.send(new ReceiveMessageCommand({
    QueueUrl: JOBS_QUEUE_URL,
    WaitTimeSeconds: 20,
    MaxNumberOfMessages: 1,
    MessageAttributeNames: ["All"]
  }));

  const msg = resp.Messages?.[0];
  if (!msg) continue; // No messages available

  const start = Date.now();
  let job;

  // Parse job message
  try {
    job = JSON.parse(msg.Body ?? "{}");
  } catch (parseErr) {
    console.error("Failed to parse job message (poison message):", parseErr);
    // Delete poison message to prevent infinite retries
    await del(msg);
    continue;
  }

  try {
    const { jobId, bucket, key, outputBucket, outputKey, traceId } = job;

    // Validate required fields
    if (!jobId || !bucket || !key || !outputBucket || !outputKey) {
      console.error("Invalid job message (missing required fields):", job);
      // Delete malformed message to prevent infinite retries
      await del(msg);
      continue;
    }

    // Idempotency check: skip if output already exists
    const already = await exists(outputBucket, outputKey);
    if (already) {
      console.log(JSON.stringify({
        action: "SKIP_DUPLICATE",
        jobId,
        outputBucket,
        outputKey,
        traceId
      }));
      await del(msg);
      continue;
    }

    // Download input file from S3
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const text = await streamToString(obj.Body);

    // Process: compute word count statistics
    const report = buildReport(text);

    // Create output payload
    const payload = JSON.stringify({
      jobId,
      bucket,
      key,
      outputBucket,
      outputKey,
      traceId,
      status: "PROCESSED",
      processedAt: new Date().toISOString(),
      report
    });

    // Upload report to processed bucket
    await s3.send(new PutObjectCommand({
      Bucket: outputBucket,
      Key: outputKey,
      Body: payload,
      ContentType: "application/json"
    }));

    const durationMs = Date.now() - start;

    // Send completion message to results queue
    await sqs.send(new SendMessageCommand({
      QueueUrl: RESULTS_QUEUE_URL,
      MessageBody: JSON.stringify({
        jobId, bucket, key, outputBucket, outputKey, traceId,
        status: "PROCESSED",
        durationMs
      }),
      MessageAttributes: {
        traceId: { DataType: "String", StringValue: String(traceId ?? "") }
      }
    }));

    console.log(JSON.stringify({
      action: "PROCESSED",
      jobId,
      durationMs,
      traceId
    }));

    // Delete job message from queue (marks as complete)
    await del(msg);

  } catch (err) {
    console.error("Job processing failed:", err, {
      jobId: job?.jobId,
      bucket: job?.bucket,
      key: job?.key
    });
    // Do NOT delete the message -> it will be retried, then sent to DLQ after maxReceiveCount
  }
}

console.log("Worker exiting cleanly.");

// Helper: Delete message from queue
async function del(msg) {
  if (!msg.ReceiptHandle) return;
  await sqs.send(new DeleteMessageCommand({
    QueueUrl: JOBS_QUEUE_URL,
    ReceiptHandle: msg.ReceiptHandle
  }));
}

// Helper: Check if S3 object exists
async function exists(bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    return false;
  }
}

// Helper: Convert stream to string
async function streamToString(body) {
  if (!body) return "";
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// Helper: Compute statistics
function buildReport(text) {
  const bytes = Buffer.byteLength(text, "utf8");
  const lines = text.length ? text.split(/\r?\n/).length : 0;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { bytes, lines, words };
}
EOF

echo "✅ Worker code created"
```

**What this does:**
- Polls SQS for jobs (long polling for efficiency)
- Downloads file from S3
- Computes word count statistics (bytes, lines, words)
- Uploads JSON report to processed bucket
- Sends completion notification
- Handles errors gracefully (retries transient errors, deletes poison messages)
- Implements idempotency (skips if output exists)

---

### Step 8: Worker Dockerfile

Create a Docker container for the worker.

```bash
cat > worker/Dockerfile <<'EOF'
FROM public.ecr.aws/docker/library/node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy application code
COPY index.mjs ./index.mjs

# Run the worker
CMD ["node", "index.mjs"]
EOF

echo "✅ Dockerfile created"
```

**What this does:**
- Uses Node.js 22 on lightweight Alpine Linux base image
- Installs production dependencies only (smaller image)
- Runs the worker Node.js application

---

**🎉 Part 2 Complete!** All code is written. Next: deploy everything.

---

## Part 3: Deployment

Deploy Lambda functions, push Docker image, and configure ECS.

### Step 9: Deploy Lambda Functions

#### 9.1: Package and Deploy IngestLambda

```bash
# Install dependencies and create deployment package
cd lambdas/ingest
npm install
zip -r ingest.zip index.mjs node_modules package.json
cd ../..

# Create Lambda function
aws lambda create-function \
  --function-name "$INGEST_LAMBDA_NAME" \
  --runtime nodejs22.x \
  --handler index.handler \
  --role "$LAMBDA_ROLE_ARN" \
  --zip-file fileb://lambdas/ingest/ingest.zip \
  --environment "Variables={
    JOBS_QUEUE_URL=$JOBS_QUEUE_URL,
    OUTPUT_BUCKET=$PROCESSED_BUCKET,
    ALLOWED_SUFFIX=.txt,
    MAX_BYTES=10485760
  }"

echo "✅ IngestLambda deployed"
```

#### 9.2: Package and Deploy ResultLambda

```bash
# Create deployment package
cd lambdas/result
npm install
zip -r result.zip index.mjs package.json
cd ../..

# Create Lambda function
aws lambda create-function \
  --function-name "$RESULT_LAMBDA_NAME" \
  --runtime nodejs22.x \
  --handler index.handler \
  --role "$LAMBDA_ROLE_ARN" \
  --zip-file fileb://lambdas/result/result.zip

echo "✅ ResultLambda deployed"
```

---

### Step 10: Connect S3 to IngestLambda

Configure S3 to trigger IngestLambda when files are uploaded.

```bash
# Get Lambda ARN
INGEST_ARN="$(aws lambda get-function \
  --function-name "$INGEST_LAMBDA_NAME" \
  --query Configuration.FunctionArn --output text)"

# Grant S3 permission to invoke Lambda
aws lambda add-permission \
  --function-name "$INGEST_LAMBDA_NAME" \
  --statement-id s3invoke \
  --action "lambda:InvokeFunction" \
  --principal s3.amazonaws.com \
  --source-arn "arn:aws:s3:::$DROPZONE_BUCKET"

# Create S3 event notification configuration
cat > s3-notify.json <<EOF
{
  "LambdaFunctionConfigurations": [{
    "LambdaFunctionArn": "$INGEST_ARN",
    "Events": ["s3:ObjectCreated:*"],
    "Filter": {
      "Key": {
        "FilterRules": [
          {"Name": "prefix", "Value": "incoming/"}
        ]
      }
    }
  }]
}
EOF

# Apply notification configuration
aws s3api put-bucket-notification-configuration \
  --bucket "$DROPZONE_BUCKET" \
  --notification-configuration file://s3-notify.json

echo "✅ S3 → IngestLambda wired"
```

**What this does:**
- S3 will now automatically invoke IngestLambda when any file is created in `incoming/` folder

---

### Step 11: Connect Results Queue to ResultLambda

Configure ResultLambda to consume from results queue.

```bash
# Create event source mapping (Lambda polls SQS)
aws lambda create-event-source-mapping \
  --function-name "$RESULT_LAMBDA_NAME" \
  --event-source-arn "$RESULTS_QUEUE_ARN" \
  --batch-size 10 \
  --maximum-batching-window-in-seconds 5

echo "✅ Results Queue → ResultLambda wired"
```

**What this does:**
- Lambda service polls results queue and invokes ResultLambda with batches of up to 10 messages

---

### Step 12: Build and Push Worker Image

Build Docker image and push to Amazon ECR.

```bash
# Create ECR repository
aws ecr create-repository \
  --repository-name "$ECR_REPO" \
  --region "$AWS_REGION"

ECR_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO"
export ECR_URI

echo "ECR Repository created: $ECR_URI"

# Login to ECR
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin \
  "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# Build, tag, and push Docker image
cd worker
npm install  # Create package-lock.json if missing
docker build -t "$ECR_REPO" .
docker tag "$ECR_REPO" "$ECR_URI"
docker push "$ECR_URI"
cd ..

echo "✅ Worker image pushed to ECR"
echo "Image URI: $ECR_URI:latest"
```

**What this does:**
- Creates a private ECR repository
- Builds Docker image for the worker
- Pushes image to ECR (so ECS can pull it)

---

### Step 13: Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name "$ECS_CLUSTER" >/dev/null

echo "✅ ECS cluster created: $ECS_CLUSTER"
```

---

### Step 14: Configure Networking

ECS Fargate requires VPC networking. We'll use the default VPC.

```bash
# Get default VPC
DEFAULT_VPC_ID="$(aws ec2 describe-vpcs \
  --region "$AWS_REGION" \
  --filters Name=isDefault,Values=true \
  --query "Vpcs[0].VpcId" --output text)"

if [ -z "$DEFAULT_VPC_ID" ] || [ "$DEFAULT_VPC_ID" == "None" ]; then
  echo "❌ No default VPC found in region $AWS_REGION"
  echo "You may need to create a VPC or use a different region"
  exit 1
fi

echo "Default VPC: $DEFAULT_VPC_ID"

# Get subnets in default VPC
SUBNET_IDS="$(aws ec2 describe-subnets \
  --region "$AWS_REGION" \
  --filters Name=vpc-id,Values="$DEFAULT_VPC_ID" \
  --query "Subnets[].SubnetId" --output text)"

if [ -z "$SUBNET_IDS" ]; then
  echo "❌ No subnets found in VPC $DEFAULT_VPC_ID"
  exit 1
fi

echo "Subnets: $SUBNET_IDS"

# Create security group (worker only makes outbound calls)
SG_ID="$(aws ec2 create-security-group \
  --region "$AWS_REGION" \
  --group-name "$SG_NAME" \
  --description "Security group for S3-SQS lab worker" \
  --vpc-id "$DEFAULT_VPC_ID" \
  --query GroupId --output text)"

export SG_ID

echo "✅ Networking configured"
echo "Security Group: $SG_ID"
```

**What this does:**
- Uses your default VPC (has internet access via Internet Gateway)
- Creates a security group (no inbound rules needed, worker only makes outbound API calls)

---

### Step 15: Create ECS Task Definition

Define the task (container configuration).

```bash
# Create CloudWatch log group
aws logs create-log-group \
  --log-group-name "/ecs/s3-sqs-lab-worker" 2>/dev/null || true

# Create task definition
cat > taskdef.json <<EOF
{
  "family": "s3-sqs-lab-worker",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "$TASK_EXEC_ROLE_ARN",
  "taskRoleArn": "$TASK_ROLE_ARN",
  "containerDefinitions": [{
    "name": "worker",
    "image": "$ECR_URI:latest",
    "essential": true,
    "environment": [
      {"name": "JOBS_QUEUE_URL", "value": "$JOBS_QUEUE_URL"},
      {"name": "RESULTS_QUEUE_URL", "value": "$RESULTS_QUEUE_URL"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/s3-sqs-lab-worker",
        "awslogs-region": "$AWS_REGION",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }]
}
EOF

# Register task definition
TASK_DEF_ARN="$(aws ecs register-task-definition \
  --cli-input-json file://taskdef.json \
  --query taskDefinition.taskDefinitionArn --output text)"

echo "✅ Task definition registered: $TASK_DEF_ARN"
```

**What this does:**
- Defines container specs: 0.25 vCPU, 512 MB RAM
- Sets environment variables for queue URLs
- Configures CloudWatch logging

---

### Step 16: Create ECS Service

Launch the worker as a long-running service.

```bash
# Convert subnet IDs to JSON array for AWS CLI
SUBNET_JSON="$(printf '%s\n' $SUBNET_IDS | jq -R . | jq -s .)"

# Create ECS service
aws ecs create-service \
  --cluster "$ECS_CLUSTER" \
  --service-name "$ECS_SERVICE" \
  --task-definition "$TASK_DEF_ARN" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={
    subnets=$SUBNET_JSON,
    securityGroups=[$SG_ID],
    assignPublicIp=ENABLED
  }" \
  >/dev/null

echo "✅ ECS service created: $ECS_SERVICE"
echo ""
echo "🚀 Worker is now running and polling for jobs!"
```

**What this does:**
- Runs 1 worker container continuously
- Container polls jobs queue for work
- ECS automatically restarts if container crashes

---

**🎉 Part 3 Complete!** Everything is deployed. Next: test the pipeline.

---

## Part 4: Testing

Verify the pipeline works end-to-end.

### Step 17: Test the Pipeline

Upload a test file and watch it flow through the system.

```bash
# Create test file
printf "hello world\nthis is a test\nline three\n" > sample.txt

# Upload to dropzone (triggers the pipeline)
aws s3 cp sample.txt "s3://$DROPZONE_BUCKET/incoming/sample.txt"

echo "✅ Test file uploaded"
echo ""
echo "What should happen:"
echo "  1. IngestLambda logs 'ENQUEUED'"
echo "  2. ECS worker logs 'PROCESSED'"
echo "  3. Report appears in processed bucket"
echo "  4. ResultLambda logs 'RESULT'"
echo ""
echo "Wait 10-20 seconds, then check results..."
sleep 20
```

---

### Step 18: Verify Results

Check that the report was generated:

```bash
# Download and view the report
aws s3 cp "s3://$PROCESSED_BUCKET/processed/sample.txt.report.json" - | jq .

# Expected output:
# {
#   "jobId": "...",
#   "bucket": "...",
#   "key": "incoming/sample.txt",
#   "outputBucket": "...",
#   "outputKey": "processed/sample.txt.report.json",
#   "traceId": "...",
#   "status": "PROCESSED",
#   "processedAt": "2024-01-15T10:30:00.000Z",
#   "report": {
#     "bytes": 38,
#     "lines": 3,
#     "words": 7
#   }
# }
```

---

### Step 19: Check Logs

View logs in CloudWatch:

```bash
echo "View logs:"
echo "  IngestLambda:  /aws/lambda/s3-sqs-lab-ingest"
echo "  Worker:        /ecs/s3-sqs-lab-worker"
echo "  ResultLambda:  /aws/lambda/s3-sqs-lab-result"
echo ""
echo "Or use AWS CLI:"
echo "  aws logs tail /ecs/s3-sqs-lab-worker --follow"
```

You can also view logs in the AWS Console:
1. Go to **CloudWatch** → **Log groups**
2. Find the log groups listed above
3. Look for:
   - IngestLambda: `{"action": "ENQUEUED", ...}`
   - Worker: `{"action": "PROCESSED", ...}`
   - ResultLambda: `{"action": "RESULT", ...}`

---

### Step 20: Additional Tests

#### Test 1: Duplicate Upload (Idempotency)

```bash
# Upload same file again
aws s3 cp sample.txt "s3://$DROPZONE_BUCKET/incoming/sample.txt"

# Check worker logs - should see:
# {"action": "SKIP_DUPLICATE", ...}
```

#### Test 2: Invalid File Type

```bash
# Upload non-.txt file
echo "bad data" > test.bin
aws s3 cp test.bin "s3://$DROPZONE_BUCKET/incoming/test.bin"

# IngestLambda should skip it (check logs)
# No job will be created
```

#### Test 3: Check Dead Letter Queue

```bash
# Check if any messages ended up in DLQ (should be empty)
aws sqs receive-message --queue-url "$DLQ_URL"

# If empty, you'll see no output (this is good!)
```

---

**🎉 Testing Complete!** Your pipeline is working. Remember to clean up when done.

---

## Cleanup

Remove all resources to avoid ongoing charges.

```bash
# Remove S3 event notification
aws s3api put-bucket-notification-configuration \
  --bucket "$DROPZONE_BUCKET" \
  --notification-configuration '{}'

# Delete Lambda event source mapping
EVENT_SOURCE_UUID="$(aws lambda list-event-source-mappings \
  --function-name "$RESULT_LAMBDA_NAME" \
  --query "EventSourceMappings[0].UUID" --output text)"

if [ "$EVENT_SOURCE_UUID" != "None" ] && [ -n "$EVENT_SOURCE_UUID" ]; then
  aws lambda delete-event-source-mapping --uuid "$EVENT_SOURCE_UUID"
fi

# Stop and delete ECS service
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --desired-count 0 >/dev/null

aws ecs delete-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --force >/dev/null

# Wait for service deletion
echo "Waiting for ECS service to stop..."
aws ecs wait services-inactive \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE"

# Delete ECS cluster
aws ecs delete-cluster --cluster "$ECS_CLUSTER" >/dev/null

# Delete Lambda functions
aws lambda delete-function --function-name "$INGEST_LAMBDA_NAME"
aws lambda delete-function --function-name "$RESULT_LAMBDA_NAME"

# Delete CloudWatch log groups
aws logs delete-log-group --log-group-name "/aws/lambda/s3-sqs-lab-ingest" 2>/dev/null || true
aws logs delete-log-group --log-group-name "/aws/lambda/s3-sqs-lab-result" 2>/dev/null || true
aws logs delete-log-group --log-group-name "/ecs/s3-sqs-lab-worker" 2>/dev/null || true

# Delete ECR repository (and all images)
aws ecr delete-repository --repository-name "$ECR_REPO" --force

# Delete SQS queues
aws sqs delete-queue --queue-url "$JOBS_QUEUE_URL"
aws sqs delete-queue --queue-url "$RESULTS_QUEUE_URL"
aws sqs delete-queue --queue-url "$DLQ_URL"

# Empty and delete S3 buckets
aws s3 rm "s3://$DROPZONE_BUCKET" --recursive
aws s3 rm "s3://$PROCESSED_BUCKET" --recursive
aws s3api delete-bucket --bucket "$DROPZONE_BUCKET"
aws s3api delete-bucket --bucket "$PROCESSED_BUCKET"

# Delete IAM roles
aws iam detach-role-policy \
  --role-name "$LAMBDA_ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam detach-role-policy \
  --role-name "$LAMBDA_ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole

aws iam delete-role-policy \
  --role-name "$LAMBDA_ROLE_NAME" \
  --policy-name s3-sqs-lab-lambda-inline

aws iam delete-role --role-name "$LAMBDA_ROLE_NAME"

aws iam delete-role-policy \
  --role-name "$TASK_ROLE_NAME" \
  --policy-name s3-sqs-lab-task-inline

aws iam delete-role --role-name "$TASK_ROLE_NAME"

aws iam detach-role-policy \
  --role-name "$TASK_EXEC_ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

aws iam delete-role --role-name "$TASK_EXEC_ROLE_NAME"

# Delete security group
aws ec2 delete-security-group --group-id "$SG_ID"

echo "✅ Cleanup complete!"
```

---

## Troubleshooting

### Resource Name Conflicts

**Symptoms:** Errors like "Role already exists", "Queue already exists", or "Function already exists"

**Cause:** Another student is using the same `STUDENT_NAME` in the same AWS account

**Solution:**
1. Choose a different unique `STUDENT_NAME` in Step 0
2. Re-run all commands from Step 0 onwards with your new name
3. If you already created resources, run the cleanup script first

**Prevention:**
- Coordinate with classmates to ensure unique names
- Use your actual first name or username (e.g., "alice", "bob-jones")
- Check existing resources before starting:
  ```bash
  # Check for existing Lambda functions
  aws lambda list-functions --query 'Functions[?contains(FunctionName, `s3-sqs-lab`)].FunctionName'

  # Check for existing IAM roles
  aws iam list-roles --query 'Roles[?contains(RoleName, `s3-sqs-lab`)].RoleName'
  ```

---

### SQS Queue Creation Error

**Symptoms:** Error creating jobs queue: "Expected: '=', received: '"' or parsing errors with RedrivePolicy

**Cause:** Complex JSON in command-line attributes is difficult to escape correctly in bash

**Solution:** Use JSON file approach as shown in Step 2. This avoids shell escaping issues:

```bash
# CORRECT - Use JSON file (recommended)
cat > /tmp/queue-attributes.json <<EOF
{
  "ReceiveMessageWaitTimeSeconds": "20",
  "VisibilityTimeout": "60",
  "RedrivePolicy": "{\"deadLetterTargetArn\":\"$DLQ_ARN\",\"maxReceiveCount\":\"4\"}"
}
EOF

aws sqs create-queue \
  --queue-name "$JOBS_QUEUE_NAME" \
  --attributes file:///tmp/queue-attributes.json \
  --query QueueUrl --output text
```

**Why this works:**
- AWS CLI reads the JSON directly from the file
- No shell escaping issues with nested quotes
- Variables like `$DLQ_ARN` are still expanded in the heredoc

---

### Worker Not Processing Jobs

**Symptoms:** Files uploaded but no reports generated

**Checks:**
1. Verify worker is running:
   ```bash
   aws ecs list-tasks --cluster "$ECS_CLUSTER"
   ```

2. Check worker logs:
   ```bash
   aws logs tail /ecs/s3-sqs-lab-worker --follow
   ```

3. Verify IAM permissions (task role should have S3/SQS access)

4. Check if worker can pull image from ECR (execution role needs ECR permissions)

---

### Lambda Not Triggered

**Symptoms:** Upload file but IngestLambda not invoked

**Checks:**
1. Verify S3 event notification is configured:
   ```bash
   aws s3api get-bucket-notification-configuration --bucket "$DROPZONE_BUCKET"
   ```

2. Verify Lambda has S3 invoke permission:
   ```bash
   aws lambda get-policy --function-name "$INGEST_LAMBDA_NAME"
   ```

3. Check file is in `incoming/` folder (notification filter)

---

### Messages Stuck in Queue

**Symptoms:** Messages in queue but not processed

**Checks:**
1. Check visibility timeout (should be 60 seconds)
2. Check worker logs for errors
3. Verify worker has queue permissions
4. Check if messages went to DLQ:
   ```bash
   aws sqs receive-message --queue-url "$DLQ_URL"
   ```

---

### IAM Role Propagation Issues

**Symptoms:** "Role does not exist" errors during Lambda/ECS creation

**Solution:** Wait 10-15 seconds after creating IAM roles before using them

---

### Docker Push Failed - Repository Not Found

**Symptoms:** `docker push` fails with "The repository with name '...' does not exist"

**Cause:** The ECR repository wasn't created successfully (command may have failed silently)

**Solution:**
1. Check if repository exists:
   ```bash
   aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION"
   ```

2. If not found, create it manually:
   ```bash
   aws ecr create-repository --repository-name "$ECR_REPO" --region "$AWS_REGION"
   ```

3. Then retry the docker push

---

### ECR Image Pull Failures

**Symptoms:** ECS task fails with "CannotPullContainerError"

**Checks:**
1. Verify image exists in ECR:
   ```bash
   aws ecr describe-images --repository-name "$ECR_REPO" --region "$AWS_REGION"
   ```

2. Verify task execution role has `AmazonECSTaskExecutionRolePolicy`

3. Verify subnets have internet access (or use VPC endpoints for ECR)

---

## Summary

Congratulations! You've built a production-grade, event-driven file processing pipeline on AWS.

### What You Built

- ✅ **Serverless ingestion** with Lambda
- ✅ **Decoupled architecture** with SQS
- ✅ **Scalable processing** with ECS Fargate
- ✅ **Error handling** with DLQ and retries
- ✅ **Idempotent processing** to prevent duplicates
- ✅ **Observability** with structured CloudWatch logs

### Architecture Highlights

- **Event-driven**: S3 triggers Lambda automatically
- **Decoupled**: Components communicate via SQS
- **Scalable**: Add more ECS tasks to process faster
- **Resilient**: Failed jobs retry, then go to DLQ
- **Secure**: Least-privilege IAM roles

### Next Steps

Extend this pipeline:
- Add SNS notifications on completion
- Store metadata in DynamoDB
- Add image/video processing
- Implement auto-scaling for ECS service
- Add API Gateway for manual job submission
- Use Step Functions for complex workflows

---

## Additional Resources

- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [Amazon SQS Documentation](https://docs.aws.amazon.com/sqs/)
- [Amazon ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/)
- [Docker Documentation](https://docs.docker.com/)

---

**Built with ❤️ for learning AWS**
