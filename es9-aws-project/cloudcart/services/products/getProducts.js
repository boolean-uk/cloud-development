import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const ddb = new DynamoDBClient({});
const cloudwatch = new CloudWatchClient({});
const TABLE = process.env.PRODUCTS_TABLE;

export const handler = async () => {
  const out = await ddb.send(new ScanCommand({TableName: TABLE, Limit: 100}));
  const items = (out.Items || []).map(unmarshall);

  // Emit custom metric for product views
  await cloudwatch.send(new PutMetricDataCommand({
    Namespace: 'CloudCart',
    MetricData: [{
      MetricName: 'ProductListViewed',
      Value: 1,
      Unit: 'Count',
      Timestamp: new Date()
    }]
  }));

  return {
    statusCode: 200,
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(items)
  };
};
