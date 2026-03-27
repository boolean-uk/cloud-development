import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE;

export const handler = async (event) => {
  console.log('Processing DynamoDB Stream events:', event.Records.length);

  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      const newOrder = unmarshall(record.dynamodb.NewImage);
      console.log('New order created:', newOrder);

      // Aggregate daily statistics
      const date = new Date(newOrder.timestamp).toISOString().split('T')[0];
      const aggregationKey = `daily-${date}`;

      try {
        // In a real implementation, this would use UpdateItem with atomic counters
        // For simplicity, we're just logging the aggregation
        console.log('Aggregating order for date:', date, 'Total:', newOrder.total);

        // Could also trigger downstream events:
        // - Send email confirmation
        // - Update inventory
        // - Notify warehouse system
        // - Update analytics dashboard
      } catch (error) {
        console.error('Error processing stream record:', error);
      }
    }
  }

  return { statusCode: 200 };
};
