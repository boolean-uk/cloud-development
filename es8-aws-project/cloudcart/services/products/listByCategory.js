import {DynamoDBClient, QueryCommand} from '@aws-sdk/client-dynamodb';
import {unmarshall} from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE = process.env.PRODUCTS_TABLE;
const GSI = 'gsi_category';

export const handler = async (event) => {
  const name = event?.pathParameters?.name;
  if (!name) {
    return {statusCode: 400, body: 'Missing category name'};
  }
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: GSI,
    KeyConditionExpression: '#c = :v',
    ExpressionAttributeNames: {'#c': 'category'},
    ExpressionAttributeValues: {':v': {S: name}},
    Limit: 100
  }));
  const items = (res.Items || []).map(unmarshall);
  return {
    statusCode: 200,
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(items)
  };
};
