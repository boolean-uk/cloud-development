import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.AGGREGATES_TABLE;

/**
 * Lambda handler that aggregates sensor readings per hour
 * Triggered by DynamoDB Stream events from the SensorReadings table
 *
 * @param {Object} event - DynamoDB Stream event
 * @returns {Object} Processing results
 */
export const handler = async (event) => {
  console.log('Received DynamoDB Stream event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    // Only process INSERT events (new sensor readings)
    if (record.eventName !== 'INSERT') {
      console.log(`Skipping ${record.eventName} event`);
      continue;
    }

    try {
      // Step 1: Extract sensor reading from DynamoDB Stream record
      // The NewImage contains the new item that was inserted
      const reading = unmarshall(record.dynamodb.NewImage);
      const { sensorId, timestamp, temperature, location } = reading;

      console.log(`Processing reading: ${sensorId} at ${timestamp} = ${temperature}°`);

      // Step 2: Extract hour from timestamp
      // Convert "2026-02-27T10:15:30Z" to "2026-02-27T10:00:00Z"
      const hourTimestamp = timestamp.substring(0, 13) + ':00:00Z';

      // Step 3: Fetch existing aggregate or create new
      // Check if we already have an aggregate for this sensor and hour
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
        // Calculate new running statistics
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
        // Calculate average from sum and count
        aggregate.avgTemp = aggregate.sumTemp / aggregate.count;

        console.log(`Updated aggregate: count=${aggregate.count}, avg=${aggregate.avgTemp.toFixed(2)}`);
      } else {
        // Step 4b: Create new aggregate
        // This is the first reading for this sensor and hour
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

      // Add metadata
      aggregate.lastUpdatedAt = new Date().toISOString();

      // Step 5: Save aggregate to DynamoDB
      // Write the updated aggregate back to DynamoDB
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: aggregate
      }));

      console.log(`Successfully updated aggregate for ${sensorId} at ${hourTimestamp}`);

    } catch (err) {
      console.error('Failed to process stream record:', err);
      // Note: DynamoDB Streams will retry failed records automatically
      throw err;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Aggregation complete' })
  };
};
