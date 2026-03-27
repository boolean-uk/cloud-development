import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE = process.env.PRODUCTS_TABLE;

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { id, name, price, category, imageUrl, description } = body;

    // Validation
    if (!id || !name || !price || !category) {
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required fields: id, name, price, category' })
      };
    }

    if (typeof price !== 'number' || price <= 0) {
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Price must be a positive number' })
      };
    }

    const item = {
      id: { S: String(id) },
      name: { S: name },
      price: { N: String(price) },
      category: { S: category }
    };

    if (imageUrl) item.imageUrl = { S: imageUrl };
    if (description) item.description = { S: description };

    await ddb.send(new PutItemCommand({
      TableName: TABLE,
      Item: item
    }));

    return {
      statusCode: 201,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Product created successfully',
        product: { id, name, price, category, imageUrl, description }
      })
    };
  } catch (error) {
    console.error('Error creating product:', error);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to create product' })
    };
  }
};
