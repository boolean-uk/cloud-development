import { DynamoDBClient, DeleteItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE = process.env.PRODUCTS_TABLE;

export const handler = async (event) => {
  try {
    const id = event.pathParameters?.id;

    if (!id) {
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Missing product ID' })
      };
    }

    // Check if product exists
    const existing = await ddb.send(new GetItemCommand({
      TableName: TABLE,
      Key: { id: { S: id } }
    }));

    if (!existing.Item) {
      return {
        statusCode: 404,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Product not found' })
      };
    }

    await ddb.send(new DeleteItemCommand({
      TableName: TABLE,
      Key: { id: { S: id } }
    }));

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Product deleted successfully',
        id
      })
    };
  } catch (error) {
    console.error('Error deleting product:', error);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to delete product' })
    };
  }
};
