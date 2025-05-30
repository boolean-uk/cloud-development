const AWS = require('aws-sdk');
const sharp = require('sharp');

const s3 = new AWS.S3();
const sns = new AWS.SNS();
const SNS_TOPIC_ARN = 'arn:aws:sns:eu-west-1:637423341661:ImageUploadTopic-cip.fifo';

exports.handler = async (event) => {
  const bucket = event.Records[0].s3.bucket.name;
  const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
  const thumbnailKey = `thumbnail-${key}`;

  const image = await s3.getObject({ Bucket: bucket, Key: key }).promise();
  const thumbnail = await sharp(image.Body).resize(100).toBuffer();

  await s3.putObject({
    Bucket: 'thumbnails-bucket-demo',
    Key: thumbnailKey,
    Body: thumbnail,
    ContentType: 'image/jpeg',
    ACL: 'public-read'
  }).promise();

  await sns.publish({
    TopicArn: SNS_TOPIC_ARN,
    Message: JSON.stringify({ thumbnailKey })
  }).promise();

  return { status: 'Thumbnail created and SNS notified.' };
};
