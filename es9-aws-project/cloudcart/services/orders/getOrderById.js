import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE = process.env.ORDERS_TABLE;

export const handler = async (event) => {
  try {
    const orderId = event.pathParameters?.id;
    // In production, extract userId from authenticated context
    const userId = event.queryStringParameters?.userId || 'anonymous';

    if (!orderId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing order ID' })
      };
    }

    const result = await ddb.send(new GetItemCommand({
      TableName: TABLE,
      Key: {
        userId: { S: userId },
        orderId: { S: orderId }
      }
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Order not found' })
      };
    }

    const order = unmarshall(result.Item);

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(order)
    };
  } catch (error) {
    console.error('Error getting order:', error);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to retrieve order' })
    };
  }
};
