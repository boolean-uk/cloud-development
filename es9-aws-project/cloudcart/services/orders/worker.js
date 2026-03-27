import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const cloudwatch = new CloudWatchClient({});
const ddb = new DynamoDBClient({});
const ORDERS_TABLE = process.env.ORDERS_TABLE;

export const handler = async (event) => {
  let successCount = 0;
  let errorCount = 0;
  const startTime = Date.now();

  for (const rec of (event.Records || [])) {
    try {
      const msg = JSON.parse(rec.body);
      console.log('Order received:', msg);

      // Persist order to DynamoDB
      const orderId = msg.id || `order-${Date.now()}`;
      const userId = msg.userId || 'anonymous';
      const timestamp = new Date().toISOString();

      await ddb.send(new PutItemCommand({
        TableName: ORDERS_TABLE,
        Item: {
          userId: { S: userId },
          orderId: { S: orderId },
          timestamp: { S: timestamp },
          items: { S: JSON.stringify(msg.items || []) },
          total: { N: String(msg.total || 0) },
          status: { S: 'processing' }
        }
      }));

      console.log('Order persisted:', orderId);

      // Simulate additional processing
      await new Promise(resolve => setTimeout(resolve, 100));

      successCount++;
    } catch (error) {
      console.error('Error processing order:', error);
      errorCount++;
    }
  }

  const processingTime = Date.now() - startTime;

  // Emit custom metrics
  await cloudwatch.send(new PutMetricDataCommand({
    Namespace: 'CloudCart',
    MetricData: [
      {
        MetricName: 'OrdersProcessed',
        Value: successCount,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'OrderProcessingErrors',
        Value: errorCount,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'OrderProcessingTime',
        Value: processingTime,
        Unit: 'Milliseconds',
        Timestamp: new Date()
      }
    ]
  }));

  return {};
};
