import {DynamoDBClient, GetItemCommand} from '@aws-sdk/client-dynamodb';
import {unmarshall} from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE = process.env.PRODUCTS_TABLE;

export const handler = async (event) => {
  const id = event?.pathParameters?.id;
  if (!id) {
    return {statusCode: 400, body: 'Missing id'};
  }
  const res = await ddb.send(
      new GetItemCommand({TableName: TABLE, Key: {id: {S: id}}}));
  if (!res.Item) {
    return {statusCode: 404, body: 'Not found'};
  }
  return {
    statusCode: 200,
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(unmarshall(res.Item))
  };
};
