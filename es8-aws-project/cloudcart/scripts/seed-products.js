#!/usr/bin/env node
import {DynamoDBClient, PutItemCommand} from '@aws-sdk/client-dynamodb';

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-1';
const table = process.env.PRODUCTS_TABLE || process.argv[2];
if (!table) {
  console.error(
      'Usage: PRODUCTS_TABLE=<your-table-name> node seed-products.js');
  process.exit(1);
}
const ddb = new DynamoDBClient({region});

const items = [
  {id: '1', name: 'Wireless Headphones', price: 99.99, category: 'electronics'},
  {id: '2', name: 'Coffee Beans', price: 14.99, category: 'grocery'},
  {id: '3', name: 'Gaming Mouse', price: 49.99, category: 'electronics'}
];

for (const it of items) {
  await ddb.send(new PutItemCommand({
    TableName: table,
    Item: {
      id: {S: it.id},
      name: {S: it.name},
      price: {N: String(it.price)},
      category: {S: it.category}
    }
  }));
  console.log('Seeded', it.id, it.name);
}
console.log('Done. Table:', table);
