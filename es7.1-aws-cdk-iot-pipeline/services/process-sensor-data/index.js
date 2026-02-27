import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.READINGS_TABLE;

/**
 * Lambda handler that processes sensor data files from S3
 * Triggered by SQS messages containing S3 event notifications
 *
 * @param {Object} event - SQS event containing S3 notifications
 * @returns {Object} Processing results with success/failure counts
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
      // The SQS record body contains the S3 event notification JSON
      const s3Event = JSON.parse(record.body);
      const s3Record = s3Event.Records[0];
      const bucket = s3Record.s3.bucket.name;
      const key = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, ' '));

      console.log(`Processing file: s3://${bucket}/${key}`);

      // Step 2: Download file from S3
      // Use GetObjectCommand to retrieve the sensor data file
      const response = await s3.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key
      }));

      // Convert the stream to a string
      const body = await response.Body.transformToString();
      console.log(`File content: ${body}`);

      // Step 3: Parse JSON and validate
      // Ensure the sensor data has required fields
      const data = JSON.parse(body);

      if (!data.sensorId || !data.timestamp || typeof data.temperature !== 'number') {
        throw new Error(`Invalid sensor data format: ${JSON.stringify(data)}`);
      }

      // Additional validation
      if (data.temperature < -50 || data.temperature > 100) {
        console.warn(`Temperature ${data.temperature} outside expected range for ${data.sensorId}`);
      }

      // Step 4: Write to DynamoDB
      // Store the validated sensor reading
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

      console.log(`Successfully processed reading for ${data.sensorId} at ${data.timestamp}`);
      results.success++;

    } catch (err) {
      console.error('Processing failed for record:', record.messageId, err);
      results.failed++;

      // Report this item as failed so it can be retried or sent to DLQ
      results.batchItemFailures.push({
        itemIdentifier: record.messageId
      });
    }
  }

  console.log('Batch processing complete:', results);

  // Return batch item failures for partial batch failure handling
  // SQS will only delete successfully processed messages
  return {
    batchItemFailures: results.batchItemFailures
  };
};
