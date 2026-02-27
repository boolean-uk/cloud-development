# Challenge: IoT Temperature Sensor Data Pipeline with AWS CDK

> **📖 About This Challenge**
>
> This is a **comprehensive, step-by-step tutorial** (2 hours) with detailed explanations of every concept.
>
> **When to use this guide:**
> - 📚 You're learning AWS CDK and serverless architecture
> - 📚 You want to understand WHY, not just HOW
> - 📚 You have 2 hours for a guided learning experience
>
> **Already experienced? Try these instead:**
> - ⚡ [QUICKSTART.md](./QUICKSTART.md) - Deploy in 10 minutes (minimal explanations)
> - ✅ [VALIDATION.md](./VALIDATION.md) - Checklist to verify your work
> - 🧪 [TESTING.md](./TESTING.md) - Detailed testing procedures

## Overview

In this challenge, you'll build a production-ready, event-driven IoT data ingestion pipeline using AWS CDK (Cloud Development Kit). You'll learn how to define infrastructure as code using TypeScript/JavaScript and deploy a complete serverless architecture that processes temperature sensor data in real-time.

**What you'll build:**
- An S3 bucket that receives sensor data uploads
- An SQS queue that receives S3 event notifications
- A Lambda function that validates and stores sensor readings in DynamoDB
- A DynamoDB Stream that captures new readings
- A second Lambda function that aggregates readings per sensor per hour
- A Dead Letter Queue (DLQ) for failed message handling

**Real-world use case:**
IoT temperature sensors in warehouses continuously upload readings to S3. Your pipeline automatically processes these readings, stores them for analysis, and generates hourly aggregates showing average, minimum, and maximum temperatures. This architecture pattern is commonly used in:
- Industrial IoT monitoring
- Smart building systems
- Supply chain temperature tracking
- Environmental monitoring networks

**Time estimate:** 2 hours

**Difficulty:** Intermediate

---

## Learning Objectives

By completing this challenge, you will:

1. **Infrastructure as Code**: Define complete AWS infrastructure using CDK constructs
2. **Event-Driven Architecture**: Connect multiple AWS services using event notifications
3. **Serverless Processing**: Build scalable data pipelines without managing servers
4. **DynamoDB Streams**: Implement change data capture for real-time aggregations
5. **Error Handling**: Use Dead Letter Queues to handle processing failures
6. **Lambda Event Sources**: Configure SQS and DynamoDB Stream event source mappings
7. **IAM Permissions**: Grant least-privilege access between AWS services
8. **Testing**: Validate end-to-end data flow in a real AWS environment

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    IoT Sensor Data Pipeline                          │
└─────────────────────────────────────────────────────────────────────┘

  Temperature Sensors
  (JSON files)
       │
       ▼
  ┌─────────────┐
  │ S3 Bucket   │  raw-sensor-data
  │             │  (Object Created Event)
  └──────┬──────┘
         │
         │ S3 Event Notification
         ▼
  ┌─────────────┐          ┌─────────────┐
  │ SQS Queue   │────────▶ │ DLQ         │
  │             │  (after  │             │  Failed messages
  └──────┬──────┘  3 tries)└─────────────┘
         │
         │ Event Source Mapping
         │ (Poll, batch=10)
         ▼
  ┌─────────────┐
  │ Lambda #1   │  ProcessSensorData
  │             │  - Download from S3
  │             │  - Validate JSON
  │             │  - Write to DynamoDB
  └──────┬──────┘
         │
         │ BatchWriteItem
         ▼
  ┌─────────────┐
  │ DynamoDB    │  SensorReadings
  │ Table       │  PK: sensorId, SK: timestamp
  │             │  (Stream: NEW_IMAGE)
  └──────┬──────┘
         │
         │ DynamoDB Stream
         │ (Change Data Capture)
         ▼
  ┌─────────────┐
  │ Lambda #2   │  AggregateReadings
  │             │  - Calculate avg, min, max
  │             │  - Update hourly stats
  └──────┬──────┘
         │
         │ PutItem
         ▼
  ┌─────────────┐
  │ DynamoDB    │  HourlyAggregates
  │ Table       │  PK: sensorId, SK: hourTimestamp
  └─────────────┘
```

**Data Flow:**

1. Sensor uploads JSON file to S3 (simulated via AWS CLI)
2. S3 triggers event notification to SQS queue
3. Lambda #1 polls SQS, processes messages in batches of 10
4. Lambda #1 downloads file from S3, validates data, writes to DynamoDB
5. Failed messages retry up to 3 times, then move to DLQ
6. DynamoDB Stream captures INSERT events from SensorReadings table
7. Lambda #2 processes stream records, calculates hourly aggregates
8. Lambda #2 updates HourlyAggregates table with running statistics

---

## Prerequisites

Before starting this challenge, ensure you have:

### Required Tools

- **AWS CLI** (v2): `aws --version`
- **Node.js 22.x**: `node --version`
- **npm**: `npm --version`
- **AWS CDK CLI**: `npm install -g aws-cdk`
- **jq** (for JSON parsing): `brew install jq` (macOS) or `apt-get install jq` (Linux)

### AWS Account Setup

1. **AWS Account** with appropriate permissions:
   - S3: Create buckets, configure event notifications
   - SQS: Create queues, send/receive messages
   - Lambda: Create functions, configure event sources
   - DynamoDB: Create tables, enable streams, read/write data
   - IAM: Create roles and policies for Lambda functions
   - CloudFormation: Deploy stacks

2. **AWS CLI Configured**:
   ```bash
   aws configure
   # Enter your AWS Access Key ID, Secret Access Key, and default region

   # Verify configuration
   aws sts get-caller-identity
   ```

3. **CDK Bootstrap** (one-time setup per AWS account/region):
   ```bash
   cdk bootstrap aws://ACCOUNT-ID/REGION

   # Example:
   # cdk bootstrap aws://123456789012/us-east-1
   ```

   This creates the necessary infrastructure for CDK deployments (S3 bucket for assets, IAM roles, etc.)

### Environment Variables

Set your student name to ensure unique resource names:

```bash
export STUDENT_NAME="yourname"  # Use your actual name, lowercase, no spaces
echo $STUDENT_NAME
```

Add this to your `~/.bashrc` or `~/.zshrc` to persist across sessions:
```bash
echo 'export STUDENT_NAME="yourname"' >> ~/.zshrc
source ~/.zshrc
```

### Verify Prerequisites

Run this verification script:

```bash
echo "Checking prerequisites..."
echo "AWS CLI: $(aws --version)"
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"
echo "CDK: $(cdk --version)"
echo "jq: $(jq --version)"
echo "AWS Account: $(aws sts get-caller-identity --query Account --output text)"
echo "AWS Region: $(aws configure get region)"
echo "Student Name: $STUDENT_NAME"
```

---

## Part 1: Project Setup (15 minutes)

### Step 1.1: Create Project Directory

```bash
cd ~/Projects  # Or your preferred projects directory

mkdir -p es7.1-aws-cdk-iot-pipeline/{infra/{bin,lib},services/{process-sensor-data,aggregate-readings},test-data,scripts}

cd es7.1-aws-cdk-iot-pipeline
```

### Step 1.2: Initialize CDK Project

```bash
cd infra

# Initialize a new CDK app
cdk init app --language javascript

# This creates:
# - bin/iot-pipeline.js (app entry point)
# - lib/iot-pipeline-stack.js (stack definition)
# - package.json (dependencies)
# - cdk.json (CDK configuration)
```

**Understanding the CDK structure:**

- **`bin/`**: Contains the CDK app entry point that instantiates stacks
- **`lib/`**: Contains stack definitions (your infrastructure code)
- **`cdk.json`**: Tells CDK how to run your app
- **`cdk.out/`**: Generated CloudFormation templates (created during synthesis)

### Step 1.3: Install Dependencies

Replace the generated `package.json` with:

```json
{
  "name": "iot-pipeline-cdk",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "cdk": "cdk"
  },
  "dependencies": {
    "aws-cdk-lib": "^2.150.0",
    "constructs": "^10.3.0"
  },
  "devDependencies": {
    "aws-cdk": "^2.150.0"
  }
}
```

Install dependencies:

```bash
npm install
```

### Step 1.4: Configure Lambda Function Dependencies

```bash
cd ../services

# Create shared package.json for Lambda functions
cat > package.json <<'EOF'
{
  "name": "iot-pipeline-lambdas",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.650.0",
    "@aws-sdk/client-dynamodb": "^3.650.0",
    "@aws-sdk/lib-dynamodb": "^3.650.0",
    "@aws-sdk/util-dynamodb": "^3.650.0"
  }
}
EOF

npm install
```

**Why these dependencies?**

- `@aws-sdk/client-s3`: Download sensor data files from S3
- `@aws-sdk/client-dynamodb`: Low-level DynamoDB client
- `@aws-sdk/lib-dynamodb`: Document client for easier DynamoDB operations
- `@aws-sdk/util-dynamodb`: Utilities for marshalling/unmarshalling DynamoDB data

### Step 1.5: Verify Setup

```bash
cd ../infra

# Synthesize CloudFormation template (without deploying)
cdk synth

# You should see CloudFormation YAML output
```

If synthesis succeeds, your CDK project is properly configured!

---

## Part 2: Define Infrastructure with CDK (45 minutes)

Now you'll define the complete infrastructure stack. Open `infra/lib/iot-pipeline-stack.js` and replace its contents with the following code.

### Step 2.1: Stack Foundation

```javascript
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class IotPipelineStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const { studentName } = props;

    // Your infrastructure code goes here
  }
}
```

**Understanding the imports:**

- `aws-cdk-lib`: Core CDK functionality
- `aws-s3`: S3 bucket constructs
- `aws-sqs`: SQS queue constructs
- `aws-s3-notifications`: S3 event notification targets
- `aws-dynamodb`: DynamoDB table constructs
- `aws-lambda`: Lambda function constructs
- `aws-lambda-event-sources`: Event source mappings for Lambda

### Step 2.2: Create S3 Bucket

Add this inside the constructor:

```javascript
// ========================================
// S3 Bucket for Raw Sensor Data
// ========================================
const sensorBucket = new s3.Bucket(this, 'SensorDataBucket', {
  bucketName: `${studentName}-sensor-data-${this.account}`,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
  encryption: s3.BucketEncryption.S3_MANAGED
});
```

**Key properties explained:**

- `bucketName`: Globally unique name (includes AWS account ID)
- `removalPolicy.DESTROY`: Delete bucket when stack is destroyed
- `autoDeleteObjects`: Automatically empty bucket before deletion
- `encryption`: Server-side encryption for data at rest

### Step 2.3: Create SQS Queues

```javascript
// ========================================
// SQS Queues (Dead Letter Queue + Main Queue)
// ========================================
const dlq = new sqs.Queue(this, 'SensorDataDLQ', {
  queueName: `${studentName}-sensor-dlq`,
  retentionPeriod: cdk.Duration.days(14)
});

const sensorQueue = new sqs.Queue(this, 'SensorDataQueue', {
  queueName: `${studentName}-sensor-queue`,
  visibilityTimeout: cdk.Duration.seconds(60),
  deadLetterQueue: {
    queue: dlq,
    maxReceiveCount: 3
  }
});
```

**Queue configuration explained:**

- **DLQ**: Receives messages that fail after 3 processing attempts
- **visibilityTimeout**: How long messages are hidden after being received (should be >= Lambda timeout)
- **maxReceiveCount**: Number of times a message can be received before moving to DLQ

### Step 2.4: Configure S3 Event Notification

```javascript
// ========================================
// S3 Event Notification → SQS
// ========================================
sensorBucket.addEventNotification(
  s3.EventType.OBJECT_CREATED,
  new s3n.SqsDestination(sensorQueue),
  { suffix: '.json' }
);
```

**How it works:**

- When a `.json` file is uploaded to S3, an event is sent to the SQS queue
- The event contains metadata about the object (bucket, key, size, etc.)
- Lambda will process these events to download and validate the sensor data

### Step 2.5: Create DynamoDB Tables

```javascript
// ========================================
// DynamoDB Tables
// ========================================

// Table 1: Raw Sensor Readings (with DynamoDB Stream)
const readingsTable = new dynamodb.Table(this, 'SensorReadings', {
  tableName: `${studentName}-sensor-readings`,
  partitionKey: { name: 'sensorId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  stream: dynamodb.StreamViewType.NEW_IMAGE,
  removalPolicy: cdk.RemovalPolicy.DESTROY
});

// Table 2: Hourly Aggregates
const aggregatesTable = new dynamodb.Table(this, 'HourlyAggregates', {
  tableName: `${studentName}-hourly-aggregates`,
  partitionKey: { name: 'sensorId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'hourTimestamp', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: cdk.RemovalPolicy.DESTROY
});
```

**Table design explained:**

**SensorReadings:**
- **Partition Key**: `sensorId` (groups data by sensor)
- **Sort Key**: `timestamp` (allows querying readings by time)
- **Stream**: `NEW_IMAGE` captures the full item when inserted
- **Access Pattern**: Query all readings for a sensor in a time range

**HourlyAggregates:**
- **Partition Key**: `sensorId` (groups aggregates by sensor)
- **Sort Key**: `hourTimestamp` (e.g., "2026-02-27T10:00:00Z")
- **Access Pattern**: Query aggregates for a sensor across multiple hours

### Step 2.6: Create Lambda Functions

```javascript
// ========================================
// Lambda Function #1: Process Sensor Data
// ========================================
const processSensorData = new lambda.Function(this, 'ProcessSensorDataFn', {
  functionName: `${studentName}-process-sensor-data`,
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset(path.join(__dirname, '../../services/process-sensor-data')),
  timeout: cdk.Duration.seconds(30),
  memorySize: 512,
  environment: {
    READINGS_TABLE: readingsTable.tableName,
    BUCKET_NAME: sensorBucket.bucketName
  }
});

// ========================================
// Lambda Function #2: Aggregate Readings
// ========================================
const aggregateReadings = new lambda.Function(this, 'AggregateReadingsFn', {
  functionName: `${studentName}-aggregate-readings`,
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset(path.join(__dirname, '../../services/aggregate-readings')),
  timeout: cdk.Duration.seconds(30),
  memorySize: 512,
  environment: {
    AGGREGATES_TABLE: aggregatesTable.tableName
  }
});
```

**Lambda configuration explained:**

- **runtime**: Node.js 22.x (latest LTS)
- **handler**: `index.handler` (exports `handler` function from `index.js`)
- **code**: Lambda will bundle the entire `services/process-sensor-data` directory
- **timeout**: Maximum execution time (30 seconds)
- **memorySize**: Allocated memory (512 MB) - also affects CPU allocation
- **environment**: Environment variables accessible via `process.env`

### Step 2.7: Grant IAM Permissions

```javascript
// Grant permissions to Lambda #1
sensorBucket.grantRead(processSensorData);
readingsTable.grantWriteData(processSensorData);
sensorQueue.grantConsumeMessages(processSensorData);

// Grant permissions to Lambda #2
readingsTable.grantStreamRead(aggregateReadings);
aggregatesTable.grantReadWriteData(aggregateReadings);
```

**Permissions granted:**

**Lambda #1:**
- Read objects from S3 bucket
- Write items to SensorReadings table
- Receive and delete messages from SQS queue

**Lambda #2:**
- Read from DynamoDB Stream
- Read and write items to HourlyAggregates table

### Step 2.8: Configure Event Source Mappings

```javascript
// Configure SQS → Lambda #1 event source mapping
processSensorData.addEventSource(
  new lambdaEventSources.SqsEventSource(sensorQueue, {
    batchSize: 10,
    reportBatchItemFailures: true
  })
);

// Configure DynamoDB Stream → Lambda #2 event source mapping
aggregateReadings.addEventSource(
  new lambdaEventSources.DynamoEventSource(readingsTable, {
    startingPosition: lambda.StartingPosition.LATEST,
    batchSize: 100,
    bisectBatchOnError: true,
    retryAttempts: 2
  })
);
```

**Event source configuration explained:**

**SQS Event Source:**
- `batchSize: 10`: Lambda receives up to 10 messages per invocation
- `reportBatchItemFailures`: Allows Lambda to report partial failures

**DynamoDB Stream Event Source:**
- `startingPosition: LATEST`: Only process new items (not historical data)
- `batchSize: 100`: Process up to 100 stream records per invocation
- `bisectBatchOnError`: If batch fails, split it in half and retry
- `retryAttempts: 2`: Retry failed batches up to 2 times

### Step 2.9: Add Stack Outputs

```javascript
// ========================================
// Stack Outputs
// ========================================
new cdk.CfnOutput(this, 'BucketName', {
  value: sensorBucket.bucketName,
  description: 'S3 bucket for sensor data uploads'
});

new cdk.CfnOutput(this, 'QueueUrl', {
  value: sensorQueue.queueUrl,
  description: 'SQS queue URL'
});

new cdk.CfnOutput(this, 'DLQUrl', {
  value: dlq.queueUrl,
  description: 'Dead letter queue URL'
});

new cdk.CfnOutput(this, 'ReadingsTableName', {
  value: readingsTable.tableName,
  description: 'DynamoDB table for raw sensor readings'
});

new cdk.CfnOutput(this, 'AggregatesTableName', {
  value: aggregatesTable.tableName,
  description: 'DynamoDB table for hourly aggregates'
});

new cdk.CfnOutput(this, 'ProcessSensorDataFunctionName', {
  value: processSensorData.functionName,
  description: 'Lambda function that processes sensor data'
});

new cdk.CfnOutput(this, 'AggregateReadingsFunctionName', {
  value: aggregateReadings.functionName,
  description: 'Lambda function that aggregates readings'
});
```

**Why outputs are useful:**

- Display resource names after deployment
- Can be referenced by scripts and other stacks
- Available in AWS Console CloudFormation outputs

### Step 2.10: Update CDK App Entry Point

Edit `infra/bin/iot-pipeline.js`:

```javascript
#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { IotPipelineStack } from '../lib/iot-pipeline-stack.js';

const app = new cdk.App();

const studentName = process.env.STUDENT_NAME || 'student';

new IotPipelineStack(app, 'IotPipelineStack', {
  studentName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  }
});
```

**App configuration explained:**

- Reads `STUDENT_NAME` from environment (falls back to "student")
- Uses current AWS account and region from AWS CLI configuration
- Creates a single stack instance

---

## Part 3: Implement Lambda Functions (40 minutes)

Now you'll implement the business logic for both Lambda functions.

### Step 3.1: Lambda #1 - Process Sensor Data

Create `services/process-sensor-data/index.js`:

```javascript
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.READINGS_TABLE;

/**
 * Lambda handler that processes sensor data files from S3
 * Triggered by SQS messages containing S3 event notifications
 */
export const handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  const results = {
    success: 0,
    failed: 0,
    batchItemFailures: []
  };

  for (const record of event.Records) {
    try {
      // Step 1: Parse SQS message to get S3 event
      const s3Event = JSON.parse(record.body);
      const s3Record = s3Event.Records[0];
      const bucket = s3Record.s3.bucket.name;
      const key = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, ' '));

      console.log(`Processing file: s3://${bucket}/${key}`);

      // Step 2: Download file from S3
      const response = await s3.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key
      }));

      const body = await response.Body.transformToString();
      console.log(`File content: ${body}`);

      // Step 3: Parse JSON and validate
      const data = JSON.parse(body);

      if (!data.sensorId || !data.timestamp || typeof data.temperature !== 'number') {
        throw new Error(`Invalid sensor data format: ${JSON.stringify(data)}`);
      }

      // Additional validation
      if (data.temperature < -50 || data.temperature > 100) {
        console.warn(`Temperature ${data.temperature} outside expected range`);
      }

      // Step 4: Write to DynamoDB
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          sensorId: data.sensorId,
          timestamp: data.timestamp,
          temperature: data.temperature,
          location: data.location || 'unknown',
          unit: data.unit || 'celsius',
          s3Key: key,
          processedAt: new Date().toISOString()
        }
      }));

      console.log(`Successfully processed reading for ${data.sensorId}`);
      results.success++;

    } catch (err) {
      console.error('Processing failed:', err);
      results.failed++;

      // Report this item as failed for retry or DLQ
      results.batchItemFailures.push({
        itemIdentifier: record.messageId
      });
    }
  }

  console.log('Batch processing complete:', results);

  // Return batch item failures for partial batch failure handling
  return {
    batchItemFailures: results.batchItemFailures
  };
};
```

Create `services/process-sensor-data/package.json`:

```json
{
  "name": "process-sensor-data",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.650.0",
    "@aws-sdk/client-dynamodb": "^3.650.0",
    "@aws-sdk/lib-dynamodb": "^3.650.0"
  }
}
```

**Function logic explained:**

1. **Parse SQS message**: Extract S3 bucket and key from event notification
2. **Download file**: Use S3 GetObject to retrieve sensor data
3. **Validate data**: Ensure required fields exist and temperature is a number
4. **Write to DynamoDB**: Store validated reading with metadata
5. **Handle failures**: Report failed items for retry or DLQ routing

**Key patterns:**

- **Batch item failures**: Only failed messages are retried (not the entire batch)
- **Defensive validation**: Check data format before writing to DynamoDB
- **Logging**: Comprehensive logs for debugging in CloudWatch

### Step 3.2: Lambda #2 - Aggregate Readings

Create `services/aggregate-readings/index.js`:

```javascript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.AGGREGATES_TABLE;

/**
 * Lambda handler that aggregates sensor readings per hour
 * Triggered by DynamoDB Stream events
 */
export const handler = async (event) => {
  console.log('Received DynamoDB Stream event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    // Only process INSERT events
    if (record.eventName !== 'INSERT') {
      console.log(`Skipping ${record.eventName} event`);
      continue;
    }

    try {
      // Step 1: Extract sensor reading from stream record
      const reading = unmarshall(record.dynamodb.NewImage);
      const { sensorId, timestamp, temperature, location } = reading;

      console.log(`Processing: ${sensorId} at ${timestamp} = ${temperature}°`);

      // Step 2: Extract hour from timestamp
      // Convert "2026-02-27T10:15:30Z" to "2026-02-27T10:00:00Z"
      const hourTimestamp = timestamp.substring(0, 13) + ':00:00Z';

      // Step 3: Fetch existing aggregate or create new
      const existing = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: {
          sensorId,
          hourTimestamp
        }
      }));

      let aggregate;

      if (existing.Item) {
        // Step 4a: Update existing aggregate stats
        const prev = existing.Item;
        aggregate = {
          sensorId,
          hourTimestamp,
          count: prev.count + 1,
          sumTemp: prev.sumTemp + temperature,
          minTemp: Math.min(prev.minTemp, temperature),
          maxTemp: Math.max(prev.maxTemp, temperature),
          location: location || prev.location
        };
        aggregate.avgTemp = aggregate.sumTemp / aggregate.count;

        console.log(`Updated: count=${aggregate.count}, avg=${aggregate.avgTemp.toFixed(2)}`);
      } else {
        // Step 4b: Create new aggregate
        aggregate = {
          sensorId,
          hourTimestamp,
          count: 1,
          sumTemp: temperature,
          avgTemp: temperature,
          minTemp: temperature,
          maxTemp: temperature,
          location: location || 'unknown',
          firstSeenAt: new Date().toISOString()
        };

        console.log(`Created new aggregate for ${sensorId} at ${hourTimestamp}`);
      }

      aggregate.lastUpdatedAt = new Date().toISOString();

      // Step 5: Save aggregate to DynamoDB
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: aggregate
      }));

      console.log(`Successfully updated aggregate`);

    } catch (err) {
      console.error('Failed to process stream record:', err);
      throw err;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Aggregation complete' })
  };
};
```

Create `services/aggregate-readings/package.json`:

```json
{
  "name": "aggregate-readings",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.650.0",
    "@aws-sdk/lib-dynamodb": "^3.650.0",
    "@aws-sdk/util-dynamodb": "^3.650.0"
  }
}
```

**Function logic explained:**

1. **Unmarshall stream data**: Convert DynamoDB format to JavaScript objects
2. **Extract hour**: Truncate timestamp to hour boundary
3. **Read-Modify-Write**: Get existing aggregate, update statistics, write back
4. **Calculate statistics**: Count, sum, average, min, max
5. **Handle first reading**: Initialize aggregate if none exists for that hour

**Aggregation algorithm:**

- **Count**: Increment by 1
- **Sum**: Add new temperature to sum
- **Average**: Sum / Count
- **Min**: Math.min of existing min and new temperature
- **Max**: Math.max of existing max and new temperature

---

## Part 4: Deploy Infrastructure (10 minutes)

### Step 4.1: Synthesize CloudFormation Template

```bash
cd infra

# Generate CloudFormation template
cdk synth

# This outputs the CloudFormation template that will be deployed
# Review it to understand what AWS resources will be created
```

**What synthesis does:**

- Converts CDK code (TypeScript/JavaScript) to CloudFormation (YAML/JSON)
- Validates construct configurations
- Generates asset bundles for Lambda functions
- Outputs the template to `cdk.out/`

### Step 4.2: Preview Changes

```bash
# Show what will change (first deployment will show all new resources)
cdk diff
```

**Understanding the diff output:**

- `[+]` Green: New resources to be created
- `[-]` Red: Resources to be deleted
- `[~]` Yellow: Resources to be modified
- `[=]` Gray: No changes

### Step 4.3: Deploy Stack

```bash
# Deploy to AWS
cdk deploy

# You'll be prompted to approve IAM changes - type 'y' and press Enter
```

**What happens during deployment:**

1. Lambda function code is bundled and uploaded to CDK staging S3 bucket
2. CloudFormation stack is created/updated
3. Resources are provisioned in this order:
   - IAM roles
   - DynamoDB tables
   - S3 bucket
   - SQS queues
   - Lambda functions
   - Event source mappings
   - S3 event notifications
4. Stack outputs are displayed

**Expected output:**

```
✅  IotPipelineStack

Outputs:
IotPipelineStack.BucketName = yourname-sensor-data-123456789012
IotPipelineStack.ReadingsTableName = yourname-sensor-readings
IotPipelineStack.AggregatesTableName = yourname-hourly-aggregates
...

Stack ARN:
arn:aws:cloudformation:us-east-1:123456789012:stack/IotPipelineStack/...
```

**Deployment time:** ~3-5 minutes

### Step 4.4: Verify Resources in AWS Console

1. **CloudFormation Console**:
   - Navigate to CloudFormation → Stacks
   - Find `IotPipelineStack`
   - Check Resources tab to see all created resources

2. **Lambda Console**:
   - Navigate to Lambda → Functions
   - Find `yourname-process-sensor-data` and `yourname-aggregate-readings`
   - Check Configuration → Triggers to see event source mappings

3. **DynamoDB Console**:
   - Navigate to DynamoDB → Tables
   - Find `yourname-sensor-readings`
   - Click Exports and streaming → DynamoDB stream details (should show ENABLED)

---

## Part 5: Test the Pipeline (20 minutes)

### Step 5.1: Create Test Data

Create sample sensor data files in `test-data/` directory (provided in the repository).

Example: `test-data/sensor-001.json`

```json
{
  "sensorId": "sensor-001",
  "timestamp": "2026-02-27T10:15:30Z",
  "temperature": 22.5,
  "location": "warehouse-a",
  "unit": "celsius"
}
```

### Step 5.2: Upload Test File to S3

```bash
cd ..  # Back to project root

# Upload a single test file
aws s3 cp test-data/sensor-001.json \
  s3://$(cd infra && npx cdk --app "node bin/iot-pipeline.js" --output cdk.out deploy --outputs-file outputs.json 2>/dev/null && cat outputs.json | jq -r '.IotPipelineStack.BucketName')/

# Simpler approach: use the bucket name from deployment output
BUCKET_NAME="yourname-sensor-data-123456789012"  # Replace with your actual bucket name
aws s3 cp test-data/sensor-001.json s3://$BUCKET_NAME/
```

**Expected output:**
```
upload: test-data/sensor-001.json to s3://yourname-sensor-data-123456789012/sensor-001.json
```

### Step 5.3: Monitor Lambda #1 Execution

```bash
# Tail Lambda logs in real-time
aws logs tail /aws/lambda/${STUDENT_NAME}-process-sensor-data --follow

# Wait for the Lambda to be invoked (should happen within ~10 seconds)
```

**What to look for in logs:**

```
START RequestId: 12345...
Received event: {...}
Processing file: s3://yourname-sensor-data-123456789012/sensor-001.json
File content: {"sensorId":"sensor-001",...}
Successfully processed reading for sensor-001
Batch processing complete: {"success":1,"failed":0}
END RequestId: 12345...
REPORT RequestId: 12345... Duration: 234.56 ms Billed Duration: 235 ms Memory Size: 512 MB Max Memory Used: 89 MB
```

### Step 5.4: Verify Data in DynamoDB SensorReadings Table

```bash
# Scan the readings table
aws dynamodb scan \
  --table-name ${STUDENT_NAME}-sensor-readings \
  --max-items 10

# Pretty-print the results
aws dynamodb scan \
  --table-name ${STUDENT_NAME}-sensor-readings \
  --max-items 10 \
  --output json | jq -r '
    .Items[] |
    "\(.sensorId.S) | \(.timestamp.S) | \(.temperature.N)°C | \(.location.S)"
  '
```

**Expected output:**
```
sensor-001 | 2026-02-27T10:15:30Z | 22.5°C | warehouse-a
```

### Step 5.5: Monitor Lambda #2 Execution

```bash
# Tail aggregation Lambda logs
aws logs tail /aws/lambda/${STUDENT_NAME}-aggregate-readings --follow

# Wait for DynamoDB Stream processing (should happen within ~5-10 seconds)
```

**What to look for in logs:**

```
START RequestId: 67890...
Received DynamoDB Stream event: {...}
Processing: sensor-001 at 2026-02-27T10:15:30Z = 22.5°
Created new aggregate for sensor-001 at 2026-02-27T10:00:00Z
Successfully updated aggregate
END RequestId: 67890...
```

### Step 5.6: Verify Aggregated Data

```bash
# Query aggregates for sensor-001
aws dynamodb query \
  --table-name ${STUDENT_NAME}-hourly-aggregates \
  --key-condition-expression "sensorId = :sid" \
  --expression-attribute-values '{":sid":{"S":"sensor-001"}}'

# Pretty-print the results
aws dynamodb query \
  --table-name ${STUDENT_NAME}-hourly-aggregates \
  --key-condition-expression "sensorId = :sid" \
  --expression-attribute-values '{":sid":{"S":"sensor-001"}}' \
  --output json | jq -r '
    .Items[] |
    "Hour: \(.hourTimestamp.S) | " +
    "Count: \(.count.N) | " +
    "Avg: \(.avgTemp.N)°C | " +
    "Min: \(.minTemp.N)°C | " +
    "Max: \(.maxTemp.N)°C"
  '
```

**Expected output:**
```
Hour: 2026-02-27T10:00:00Z | Count: 1 | Avg: 22.5°C | Min: 22.5°C | Max: 22.5°C
```

### Step 5.7: Upload Multiple Files

Use the provided script to batch upload:

```bash
chmod +x scripts/upload-test-data.sh
./scripts/upload-test-data.sh
```

Or manually:

```bash
for file in test-data/sensor-*.json; do
  echo "Uploading $file..."
  aws s3 cp "$file" s3://$BUCKET_NAME/
  sleep 2
done
```

**Wait 20-30 seconds for all processing to complete, then check aggregates:**

```bash
# View all aggregates
aws dynamodb scan \
  --table-name ${STUDENT_NAME}-hourly-aggregates \
  --output json | jq -r '
    .Items[] |
    "\(.sensorId.S) | \(.hourTimestamp.S) | Count: \(.count.N) | Avg: \(.avgTemp.N)°C"
  ' | sort
```

**Expected output (example):**
```
sensor-001 | 2026-02-27T10:00:00Z | Count: 2 | Avg: 22.8°C
sensor-001 | 2026-02-27T11:00:00Z | Count: 1 | Avg: 22.9°C
sensor-002 | 2026-02-27T10:00:00Z | Count: 1 | Avg: 19.8°C
sensor-002 | 2026-02-27T11:00:00Z | Count: 1 | Avg: 19.2°C
sensor-003 | 2026-02-27T10:00:00Z | Count: 1 | Avg: 25.3°C
...
```

### Step 5.8: Test Error Handling with Invalid Data

Upload an invalid sensor file:

```bash
# Upload the invalid test file
aws s3 cp test-data/invalid-sensor.json s3://$BUCKET_NAME/

# Wait 30 seconds (for 3 retry attempts)
sleep 30

# Check the Dead Letter Queue for failed messages
chmod +x scripts/check-dlq.sh
./scripts/check-dlq.sh
```

**Expected output:**
```
Messages in DLQ: 1
Receiving messages from DLQ...
Message ID: abc123...
{"Records":[{"s3":{"bucket":{"name":"yourname-sensor-data-123456789012"},"object":{"key":"invalid-sensor.json"}}}]}
---
```

**What happened:**

1. Lambda #1 tried to process the invalid file
2. Validation failed (temperature is not a number)
3. Message was returned to SQS with failure status
4. After 3 failed attempts, message was moved to DLQ
5. You can manually inspect and debug failed messages

### Step 5.9: View All Data with Helper Scripts

Use the provided helper scripts:

```bash
# View raw sensor readings
./scripts/view-readings.sh

# Query aggregates for a specific sensor
./scripts/query-aggregates.sh sensor-001
./scripts/query-aggregates.sh sensor-002
```

---

## Part 6: Understanding the Data Flow (10 minutes)

### End-to-End Flow Walkthrough

Let's trace what happens when you upload `sensor-001.json`:

**1. Upload to S3** (t=0s)
```bash
aws s3 cp test-data/sensor-001.json s3://bucket/
```
- File uploaded to S3
- S3 generates event: `{"eventName":"ObjectCreated:Put",...}`

**2. S3 Event Notification** (t=0.1s)
- S3 sends event to SQS queue
- SQS message body contains the S3 event JSON

**3. Lambda #1 Polling** (t=0-10s)
- Lambda service polls SQS queue every few seconds
- Retrieves batch of up to 10 messages
- Invokes `process-sensor-data` Lambda with batch

**4. Process Sensor Data** (t=10s)
```javascript
// Lambda #1 execution
for (const record of event.Records) {
  const s3Event = JSON.parse(record.body);  // Parse SQS message
  const key = s3Event.Records[0].s3.object.key;  // Extract S3 key

  const response = await s3.send(new GetObjectCommand({...}));  // Download file
  const data = JSON.parse(await response.Body.transformToString());  // Parse JSON

  // Validate
  if (!data.sensorId || !data.timestamp || typeof data.temperature !== 'number') {
    throw new Error('Invalid format');
  }

  // Write to DynamoDB
  await ddb.send(new PutCommand({
    TableName: 'sensor-readings',
    Item: { sensorId: 'sensor-001', timestamp: '2026-02-27T10:15:30Z', temperature: 22.5, ... }
  }));
}

return { batchItemFailures: [] };  // All items succeeded
```

**5. DynamoDB Write** (t=10.2s)
- Item written to `SensorReadings` table
- DynamoDB Stream captures the INSERT event
- Stream record contains `NewImage` (the full item)

**6. Lambda #2 Stream Polling** (t=10-15s)
- Lambda service polls DynamoDB Stream
- Retrieves batch of up to 100 stream records
- Invokes `aggregate-readings` Lambda with batch

**7. Aggregate Readings** (t=15s)
```javascript
// Lambda #2 execution
for (const record of event.Records) {
  const reading = unmarshall(record.dynamodb.NewImage);  // Parse stream record
  const { sensorId, timestamp, temperature } = reading;

  const hourTimestamp = timestamp.substring(0, 13) + ':00:00Z';  // Extract hour

  // Read existing aggregate
  const existing = await ddb.send(new GetCommand({
    TableName: 'hourly-aggregates',
    Key: { sensorId: 'sensor-001', hourTimestamp: '2026-02-27T10:00:00Z' }
  }));

  let aggregate;
  if (existing.Item) {
    // Update existing aggregate
    aggregate = {
      count: existing.Item.count + 1,  // Increment count
      sumTemp: existing.Item.sumTemp + 22.5,  // Add to sum
      avgTemp: (existing.Item.sumTemp + 22.5) / (existing.Item.count + 1),  // Recalculate avg
      minTemp: Math.min(existing.Item.minTemp, 22.5),
      maxTemp: Math.max(existing.Item.maxTemp, 22.5)
    };
  } else {
    // Create new aggregate
    aggregate = {
      count: 1,
      sumTemp: 22.5,
      avgTemp: 22.5,
      minTemp: 22.5,
      maxTemp: 22.5
    };
  }

  // Write aggregate back
  await ddb.send(new PutCommand({
    TableName: 'hourly-aggregates',
    Item: { sensorId: 'sensor-001', hourTimestamp: '2026-02-27T10:00:00Z', ...aggregate }
  }));
}
```

**8. Final State** (t=15.5s)
- `SensorReadings` table has 1 item
- `HourlyAggregates` table has 1 item
- Both Lambdas logged success in CloudWatch
- SQS message deleted from queue

### Error Flow Walkthrough

What happens with `invalid-sensor.json`?

**Attempt 1** (t=0s)
- Lambda #1 processes message
- Validation fails: `typeof data.temperature !== 'number'`
- Lambda throws error
- Returns `{ batchItemFailures: [{ itemIdentifier: messageId }] }`
- SQS does NOT delete the message

**Attempt 2** (t=30s, after visibility timeout)
- Message becomes visible in queue again
- Lambda #1 reprocesses, fails again
- ReceiveCount increments to 2

**Attempt 3** (t=60s)
- Final retry
- ReceiveCount increments to 3
- Still fails

**DLQ Move** (t=60.1s)
- ReceiveCount (3) >= maxReceiveCount (3)
- SQS automatically moves message to DLQ
- Message retained in DLQ for 14 days
- Developer can inspect, fix data, and manually reprocess

---

## Part 7: Cost Considerations

### Estimated Costs for This Challenge

**S3:**
- Storage: ~$0.023 per GB/month
- PUT requests: $0.005 per 1,000 requests
- GET requests: $0.0004 per 1,000 requests
- **Estimate**: <$0.01 for test data

**SQS:**
- Standard queue: First 1M requests free
- $0.40 per million requests after
- **Estimate**: Free tier

**Lambda:**
- First 1M requests free per month
- First 400,000 GB-seconds free per month
- $0.20 per 1M requests after
- $0.0000166667 per GB-second after
- **Estimate**: Free tier

**DynamoDB:**
- On-demand pricing: $1.25 per million write requests
- $0.25 per million read requests
- $0.25 per GB-month storage
- **Estimate**: <$0.10 for test data

**CloudWatch Logs:**
- Ingestion: $0.50 per GB
- Storage: $0.03 per GB/month
- **Estimate**: <$0.05 for logs

**Total for this challenge: < $0.50** (likely free if within AWS Free Tier)

### Cost Optimization Tips

1. **Use DynamoDB On-Demand billing** for unpredictable workloads
2. **Set CloudWatch Logs retention** to 7 days instead of "Never expire"
3. **Enable S3 Lifecycle policies** to transition old data to cheaper storage tiers
4. **Use SQS batch operations** (already configured with batchSize)
5. **Right-size Lambda memory** (512 MB is good for this workload)
6. **Clean up resources** after the challenge (see Part 8)

---

## Part 8: Cleanup (5 minutes)

### Step 8.1: Empty S3 Bucket

```bash
# List objects in bucket
aws s3 ls s3://$BUCKET_NAME/

# Delete all objects
aws s3 rm s3://$BUCKET_NAME/ --recursive
```

**Why this is necessary:**

- CDK sets `autoDeleteObjects: true`, but sometimes manual cleanup is safer
- Ensures no objects block bucket deletion

### Step 8.2: Destroy CDK Stack

```bash
cd infra

# Delete all resources
cdk destroy

# Confirm with 'y' when prompted
```

**What gets deleted:**

- Lambda functions
- DynamoDB tables (and all data)
- S3 bucket
- SQS queues
- IAM roles
- CloudWatch log groups (after retention period)
- CloudFormation stack

**Resources that persist:**

- CloudWatch log groups (unless manually deleted)
- CDK bootstrap resources (shared across all CDK projects)

### Step 8.3: Verify Deletion

```bash
# Check CloudFormation console
aws cloudformation describe-stacks \
  --stack-name IotPipelineStack \
  --query 'Stacks[0].StackStatus'

# Should return: DELETE_COMPLETE or stack not found
```

### Step 8.4: Manual Cleanup (if needed)

If `cdk destroy` fails:

```bash
# Manually delete log groups
aws logs delete-log-group --log-group-name /aws/lambda/${STUDENT_NAME}-process-sensor-data
aws logs delete-log-group --log-group-name /aws/lambda/${STUDENT_NAME}-aggregate-readings

# Try cdk destroy again
cdk destroy
```

---

## Troubleshooting

### Common Issues and Solutions

#### 1. CDK Bootstrap Error

**Error:**
```
❌ IotPipelineStack failed: Error: This stack uses assets, so the toolkit stack must be deployed...
```

**Solution:**
```bash
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/us-east-1
```

#### 2. Lambda Function Not Invoked

**Symptoms:**
- Upload file to S3, but Lambda logs show no execution
- No items in DynamoDB

**Debugging steps:**

```bash
# 1. Check SQS queue for messages
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name ${STUDENT_NAME}-sensor-queue --query 'QueueUrl' --output text) \
  --attribute-names ApproximateNumberOfMessages

# 2. Check Lambda event source mapping
aws lambda list-event-source-mappings \
  --function-name ${STUDENT_NAME}-process-sensor-data

# 3. Manually invoke Lambda with test event
aws lambda invoke \
  --function-name ${STUDENT_NAME}-process-sensor-data \
  --payload '{"Records":[{"body":"{\"Records\":[{\"s3\":{\"bucket\":{\"name\":\"'$BUCKET_NAME'\"},\"object\":{\"key\":\"sensor-001.json\"}}}]}"}]}' \
  response.json

cat response.json
```

**Common causes:**
- Event source mapping not active (wait 1-2 minutes after deployment)
- Lambda execution role missing permissions
- S3 event notification filter not matching (must be `.json` file)

#### 3. DynamoDB Stream Not Triggering Lambda #2

**Symptoms:**
- Items in SensorReadings table, but no aggregates

**Debugging steps:**

```bash
# 1. Verify stream is enabled
aws dynamodb describe-table \
  --table-name ${STUDENT_NAME}-sensor-readings \
  --query 'Table.StreamSpecification'

# 2. Check Lambda #2 event source mapping
aws lambda list-event-source-mappings \
  --function-name ${STUDENT_NAME}-aggregate-readings

# 3. Check Lambda #2 logs for errors
aws logs tail /aws/lambda/${STUDENT_NAME}-aggregate-readings --since 10m
```

**Common causes:**
- Stream not enabled (check CDK code)
- Lambda #2 execution role missing `dynamodb:GetRecords` permission
- Event source mapping in "Disabled" state

#### 4. Messages Stuck in DLQ

**Symptoms:**
- All messages going to DLQ, even valid ones

**Debugging steps:**

```bash
# 1. Receive message from DLQ
aws sqs receive-message \
  --queue-url $(aws sqs get-queue-url --queue-name ${STUDENT_NAME}-sensor-dlq --query 'QueueUrl' --output text) \
  --max-number-of-messages 1

# 2. Check Lambda logs for error details
aws logs tail /aws/lambda/${STUDENT_NAME}-process-sensor-data --since 30m

# 3. Test with simplified Lambda logic
# Temporarily modify Lambda to just log the event without processing
```

**Common causes:**
- Lambda timing out (increase timeout in CDK)
- Lambda running out of memory (increase memorySize)
- Network issues reaching S3/DynamoDB
- Bug in Lambda code (check logs)

#### 5. CDK Deploy Fails with IAM Permission Error

**Error:**
```
❌ User: arn:aws:iam::123456789012:user/yourname is not authorized to perform: iam:CreateRole...
```

**Solution:**

You need admin-level permissions to deploy CDK stacks. Ask your AWS account administrator to grant you:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "*",
      "Resource": "*"
    }
  ]
}
```

Or use a more restricted policy that allows CloudFormation, IAM, S3, Lambda, DynamoDB, and SQS.

#### 6. S3 Bucket Name Already Exists

**Error:**
```
❌ IotPipelineStack failed: yourname-sensor-data-123456789012 already exists
```

**Solution:**

Change your `STUDENT_NAME` environment variable:

```bash
export STUDENT_NAME="yourname2"
cdk deploy
```

Or manually delete the conflicting bucket:

```bash
aws s3 rb s3://yourname-sensor-data-123456789012 --force
cdk deploy
```

---

## Extensions and Advanced Challenges

Once you've completed the basic challenge, try these extensions:

### Extension 1: Add SNS Notifications for Anomalies

**Goal**: Send an email alert when temperature exceeds 30°C

**Steps:**

1. Add SNS topic to CDK stack:
```javascript
const alertTopic = new sns.Topic(this, 'TemperatureAlerts', {
  displayName: 'Temperature Anomaly Alerts'
});

new sns.Subscription(this, 'EmailSubscription', {
  topic: alertTopic,
  protocol: sns.SubscriptionProtocol.EMAIL,
  endpoint: 'your-email@example.com'
});

alertTopic.grantPublish(processSensorData);
```

2. Modify Lambda #1 to publish to SNS:
```javascript
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const sns = new SNSClient({});
const TOPIC_ARN = process.env.ALERT_TOPIC_ARN;

// After validation
if (data.temperature > 30) {
  await sns.send(new PublishCommand({
    TopicArn: TOPIC_ARN,
    Subject: `Temperature Alert: ${data.sensorId}`,
    Message: `Temperature ${data.temperature}°C exceeds threshold at ${data.location}`
  }));
}
```

3. Deploy and test with high-temperature sensor data

### Extension 2: Add API Gateway for Querying Aggregates

**Goal**: Create a REST API to query sensor aggregates

**Steps:**

1. Add API Gateway and Lambda to CDK stack:
```javascript
const api = new apigateway.RestApi(this, 'SensorApi', {
  restApiName: `${studentName}-sensor-api`
});

const queryFunction = new lambda.Function(this, 'QueryAggregatesFn', {
  functionName: `${studentName}-query-aggregates`,
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('./services/query-aggregates'),
  environment: {
    AGGREGATES_TABLE: aggregatesTable.tableName
  }
});

aggregatesTable.grantReadData(queryFunction);

const sensors = api.root.addResource('sensors');
const sensor = sensors.addResource('{sensorId}');
sensor.addMethod('GET', new apigateway.LambdaIntegration(queryFunction));
```

2. Implement query Lambda function
3. Test with `curl` or Postman

### Extension 3: Add DynamoDB TTL for Auto-Cleanup

**Goal**: Automatically delete readings older than 30 days

**Steps:**

1. Add TTL attribute to readings table:
```javascript
const readingsTable = new dynamodb.Table(this, 'SensorReadings', {
  // ... existing config
  timeToLiveAttribute: 'expiresAt'
});
```

2. Modify Lambda #1 to set expiration:
```javascript
await ddb.send(new PutCommand({
  TableName: TABLE,
  Item: {
    // ... existing fields
    expiresAt: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)  // 30 days
  }
}));
```

### Extension 4: Add X-Ray Tracing

**Goal**: Visualize end-to-end request flow

**Steps:**

1. Enable tracing in CDK:
```javascript
const processSensorData = new lambda.Function(this, 'ProcessSensorDataFn', {
  // ... existing config
  tracing: lambda.Tracing.ACTIVE
});
```

2. View traces in AWS X-Ray console

### Extension 5: Implement Real-Time Dashboard with CloudWatch

**Goal**: Create a dashboard showing pipeline metrics

**Steps:**

1. Add CloudWatch dashboard to CDK:
```javascript
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

const dashboard = new cloudwatch.Dashboard(this, 'PipelineDashboard', {
  dashboardName: `${studentName}-iot-pipeline`
});

dashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'Lambda Invocations',
    left: [processSensorData.metricInvocations()]
  }),
  new cloudwatch.GraphWidget({
    title: 'DynamoDB Write Capacity',
    left: [readingsTable.metricConsumedWriteCapacityUnits()]
  })
);
```

---

## Learning Resources

### AWS Documentation

- **AWS CDK**: https://docs.aws.amazon.com/cdk/
- **Lambda**: https://docs.aws.amazon.com/lambda/
- **DynamoDB Streams**: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html
- **S3 Event Notifications**: https://docs.aws.amazon.com/AmazonS3/latest/userguide/NotificationHowTo.html
- **SQS**: https://docs.aws.amazon.com/sqs/

### CDK Construct Library

- **L2 Constructs**: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-construct-library.html
- **Patterns Library**: https://github.com/aws-samples/serverless-patterns

### Related Challenges in This Repository

- **es7-aws-cdk**: Introduction to CDK basics
- **es8-aws-project**: CloudCart full-stack application
- **es6-aws-ecs-fargate**: ECS Fargate data processing

---

## Validation Checklist

After completing this challenge, verify you can:

- [ ] Define AWS infrastructure as code using CDK
- [ ] Deploy a multi-service architecture with a single command
- [ ] Configure S3 event notifications to SQS
- [ ] Implement Lambda functions with SQS event sources
- [ ] Design DynamoDB tables with appropriate keys
- [ ] Enable and consume DynamoDB Streams
- [ ] Implement aggregation logic with read-modify-write pattern
- [ ] Handle errors with Dead Letter Queues
- [ ] Monitor Lambda execution with CloudWatch Logs
- [ ] Query DynamoDB data with AWS CLI
- [ ] Clean up resources to avoid charges

---

## Summary

**What you built:**

An event-driven IoT data pipeline that:
1. Accepts sensor data uploads to S3
2. Validates and stores readings in DynamoDB
3. Aggregates hourly statistics in real-time
4. Handles failures gracefully with retry and DLQ

**Key concepts learned:**

- **Infrastructure as Code**: CDK lets you define infrastructure in your favorite programming language
- **Event-Driven Architecture**: Services communicate via events, not direct calls
- **Serverless Processing**: Lambda scales automatically, no server management
- **Stream Processing**: DynamoDB Streams enable real-time change data capture
- **Error Handling**: DLQ ensures no data is lost, even on failures

**Production-ready patterns:**

- Least-privilege IAM permissions
- Batch processing for efficiency
- Partial batch failure handling
- Comprehensive logging
- Resource tagging for cost tracking

Congratulations on completing the IoT Temperature Sensor Data Pipeline challenge! You now have hands-on experience with CDK and serverless event-driven architectures.

---

## Appendix: Sample Data Formats

### S3 Event Notification (SQS Message Body)

```json
{
  "Records": [
    {
      "eventVersion": "2.1",
      "eventSource": "aws:s3",
      "awsRegion": "us-east-1",
      "eventTime": "2026-02-27T10:15:35.123Z",
      "eventName": "ObjectCreated:Put",
      "s3": {
        "bucket": {
          "name": "yourname-sensor-data-123456789012",
          "arn": "arn:aws:s3:::yourname-sensor-data-123456789012"
        },
        "object": {
          "key": "sensor-001.json",
          "size": 123
        }
      }
    }
  ]
}
```

### DynamoDB Stream Record

```json
{
  "eventID": "1",
  "eventName": "INSERT",
  "eventVersion": "1.1",
  "eventSource": "aws:dynamodb",
  "awsRegion": "us-east-1",
  "dynamodb": {
    "Keys": {
      "sensorId": { "S": "sensor-001" },
      "timestamp": { "S": "2026-02-27T10:15:30Z" }
    },
    "NewImage": {
      "sensorId": { "S": "sensor-001" },
      "timestamp": { "S": "2026-02-27T10:15:30Z" },
      "temperature": { "N": "22.5" },
      "location": { "S": "warehouse-a" },
      "unit": { "S": "celsius" }
    },
    "SequenceNumber": "111",
    "SizeBytes": 26,
    "StreamViewType": "NEW_IMAGE"
  }
}
```

### SensorReadings DynamoDB Item

```json
{
  "sensorId": "sensor-001",
  "timestamp": "2026-02-27T10:15:30Z",
  "temperature": 22.5,
  "location": "warehouse-a",
  "unit": "celsius",
  "s3Key": "sensor-001.json",
  "processedAt": "2026-02-27T10:15:36.789Z"
}
```

### HourlyAggregates DynamoDB Item

```json
{
  "sensorId": "sensor-001",
  "hourTimestamp": "2026-02-27T10:00:00Z",
  "count": 3,
  "sumTemp": 68.1,
  "avgTemp": 22.7,
  "minTemp": 22.1,
  "maxTemp": 23.5,
  "location": "warehouse-a",
  "firstSeenAt": "2026-02-27T10:15:36.789Z",
  "lastUpdatedAt": "2026-02-27T10:45:42.123Z"
}
```

---

**End of Challenge Document**

For questions or feedback, please open an issue in the repository.
