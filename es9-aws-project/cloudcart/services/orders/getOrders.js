import { DynamoDBClient, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE = process.env.ORDERS_TABLE;

export const handler = async (event) => {
  try {
    // Get userId from query parameters or headers (in production, use proper auth)
    const userId = event.queryStringParameters?.userId || 'anonymous';

    let result;
    if (userId === 'all') {
      // Admin query: get all orders
      result = await ddb.send(new ScanCommand({
        TableName: TABLE,
        Limit: 50
      }));
    } else {
      // User query: get orders for specific user
      result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: {
          ':uid': { S: userId }
        },
        ScanIndexForward: false, // Most recent first
        Limit: 20
      }));
    }

    const orders = (result.Items || []).map(unmarshall);

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orders, count: orders.length })
    };
  } catch (error) {
    console.error('Error getting orders:', error);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to retrieve orders' })
    };
  }
};
