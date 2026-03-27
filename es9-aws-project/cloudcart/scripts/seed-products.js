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
  {id: '1', name: 'Wireless Headphones', price: 99.99, category: 'electronics', imageUrl: 'https://placehold.co/400x400/4A90E2/white?text=Headphones'},
  {id: '2', name: 'Coffee Beans', price: 14.99, category: 'grocery', imageUrl: 'https://placehold.co/400x400/8B4513/white?text=Coffee'},
  {id: '3', name: 'Gaming Mouse', price: 49.99, category: 'electronics', imageUrl: 'https://placehold.co/400x400/FF6B6B/white?text=Mouse'}
];

for (const it of items) {
  const item = {
    id: {S: it.id},
    name: {S: it.name},
    price: {N: String(it.price)},
    category: {S: it.category}
  };
  if (it.imageUrl) {
    item.imageUrl = {S: it.imageUrl};
  }
  await ddb.send(new PutItemCommand({
    TableName: table,
    Item: item
  }));
  console.log('Seeded', it.id, it.name);
}
console.log('Done. Table:', table);
