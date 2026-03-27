import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE = process.env.PRODUCTS_TABLE;

export const handler = async (event) => {
  try {
    const id = event.pathParameters?.id;
    const body = JSON.parse(event.body || '{}');

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

    // Build update expression
    const updates = [];
    const attrNames = {};
    const attrValues = {};

    if (body.name !== undefined) {
      updates.push('#name = :name');
      attrNames['#name'] = 'name';
      attrValues[':name'] = { S: body.name };
    }

    if (body.price !== undefined) {
      if (typeof body.price !== 'number' || body.price <= 0) {
        return {
          statusCode: 400,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ error: 'Price must be a positive number' })
        };
      }
      updates.push('#price = :price');
      attrNames['#price'] = 'price';
      attrValues[':price'] = { N: String(body.price) };
    }

    if (body.category !== undefined) {
      updates.push('#category = :category');
      attrNames['#category'] = 'category';
      attrValues[':category'] = { S: body.category };
    }

    if (body.imageUrl !== undefined) {
      updates.push('#imageUrl = :imageUrl');
      attrNames['#imageUrl'] = 'imageUrl';
      attrValues[':imageUrl'] = { S: body.imageUrl };
    }

    if (body.description !== undefined) {
      updates.push('#description = :description');
      attrNames['#description'] = 'description';
      attrValues[':description'] = { S: body.description };
    }

    if (updates.length === 0) {
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'No fields to update' })
      };
    }

    await ddb.send(new UpdateItemCommand({
      TableName: TABLE,
      Key: { id: { S: id } },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeNames: attrNames,
      ExpressionAttributeValues: attrValues
    }));

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Product updated successfully',
        id,
        updates: body
      })
    };
  } catch (error) {
    console.error('Error updating product:', error);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to update product' })
    };
  }
};
