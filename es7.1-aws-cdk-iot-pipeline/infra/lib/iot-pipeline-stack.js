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
  /**
   * @param {Construct} scope
   * @param {string} id
   * @param {cdk.StackProps & {studentName: string}} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const { studentName } = props;

    // ========================================
    // S3 Bucket for Raw Sensor Data
    // ========================================
    const sensorBucket = new s3.Bucket(this, 'SensorDataBucket', {
      bucketName: `${studentName}-sensor-data-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED
    });

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

    // ========================================
    // S3 Event Notification → SQS
    // ========================================
    sensorBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(sensorQueue),
      { suffix: '.json' }
    );

    // ========================================
    // DynamoDB Tables
    // ========================================

    // Table 1: Raw Sensor Readings (with DynamoDB Stream)
    const readingsTable = new dynamodb.Table(this, 'SensorReadings', {
      tableName: `${studentName}-sensor-readings`,
      partitionKey: { name: 'sensorId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      stream: dynamodb.StreamViewType.NEW_IMAGE, // Enable streams for change data capture
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

    // Grant permissions to Lambda #1
    sensorBucket.grantRead(processSensorData);
    readingsTable.grantWriteData(processSensorData);
    sensorQueue.grantConsumeMessages(processSensorData);

    // Configure SQS → Lambda #1 event source mapping
    processSensorData.addEventSource(
      new lambdaEventSources.SqsEventSource(sensorQueue, {
        batchSize: 10,
        reportBatchItemFailures: true
      })
    );

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

    // Grant permissions to Lambda #2
    readingsTable.grantStreamRead(aggregateReadings);
    aggregatesTable.grantReadWriteData(aggregateReadings);

    // Configure DynamoDB Stream → Lambda #2 event source mapping
    aggregateReadings.addEventSource(
      new lambdaEventSources.DynamoEventSource(readingsTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 100,
        bisectBatchOnError: true,
        retryAttempts: 2
      })
    );

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
  }
}
