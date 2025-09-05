import {SendMessageCommand, SQSClient} from '@aws-sdk/client-sqs';

const sqs = new SQSClient({});
const QUEUE_URL = process.env.CHECKOUT_QUEUE_URL;

export const handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const id = body.id || String(Date.now());
  await sqs.send(new SendMessageCommand(
      {QueueUrl: QUEUE_URL, MessageBody: JSON.stringify({...body, id})}));
  return {
    statusCode: 202,
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({queued: true, id})
  };
};
