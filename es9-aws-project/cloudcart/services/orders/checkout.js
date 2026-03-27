import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const sqs = new SQSClient({});
const cloudwatch = new CloudWatchClient({});
const QUEUE_URL = process.env.CHECKOUT_QUEUE_URL;

export const handler = async (event) => {
  const startTime = Date.now();
  try {
    const body = JSON.parse(event.body || '{}');
    const id = body.id || String(Date.now());
    const total = body.total || 0;

    await sqs.send(new SendMessageCommand(
        {QueueUrl: QUEUE_URL, MessageBody: JSON.stringify({...body, id})}));

    // Emit custom metrics
    await cloudwatch.send(new PutMetricDataCommand({
      Namespace: 'CloudCart',
      MetricData: [
        {
          MetricName: 'OrderPlaced',
          Value: 1,
          Unit: 'Count',
          Timestamp: new Date()
        },
        {
          MetricName: 'OrderTotal',
          Value: total,
          Unit: 'None',
          Timestamp: new Date()
        },
        {
          MetricName: 'CheckoutLatency',
          Value: Date.now() - startTime,
          Unit: 'Milliseconds',
          Timestamp: new Date()
        }
      ]
    }));

    return {
      statusCode: 202,
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({queued: true, id})
    };
  } catch (error) {
    console.error('Checkout error:', error);
    await cloudwatch.send(new PutMetricDataCommand({
      Namespace: 'CloudCart',
      MetricData: [{
        MetricName: 'CheckoutError',
        Value: 1,
        Unit: 'Count',
        Timestamp: new Date()
      }]
    }));
    throw error;
  }
};
