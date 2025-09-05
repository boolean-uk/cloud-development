import {DynamoDBClient, ScanCommand} from '@aws-sdk/client-dynamodb';
import {unmarshall} from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE = process.env.PRODUCTS_TABLE;

export const handler = async () => {
  const out = await ddb.send(new ScanCommand({TableName: TABLE, Limit: 100}));
  const items = (out.Items || []).map(unmarshall);
  return {
    statusCode: 200,
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(items)
  };
};
