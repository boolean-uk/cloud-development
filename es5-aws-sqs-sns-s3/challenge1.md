
# AWS Demo Project: Image Thumbnail Generation Pipeline

## Overview
This demo project demonstrates an event-driven AWS architecture using the following services:
- Amazon S3 (Simple Storage Service)
- AWS Lambda
- Amazon SNS (Simple Notification Service)
- Amazon SQS (Simple Queue Service)

## Project Workflow
1. **User uploads an image** to an Amazon S3 bucket.
2. An S3 upload event triggers the first AWS Lambda function.
3. The Lambda function generates a thumbnail and uploads it to a separate S3 bucket.
4. Lambda publishes a notification message to an SNS topic.
5. SNS forwards this message to an SQS queue.
6. A second Lambda function, triggered by SQS, updates a static HTML webpage to display all thumbnails stored in S3.
7. The static HTML page is hosted publicly via S3 static website hosting.

## Step-by-Step Setup (AWS Management Console)

### Step 1: Setup S3 Buckets
- Create two buckets:
    - `images-bucket-demo-<yourname>` (for original uploads).
    - `thumbnails-bucket-demo-<yourname>` (for thumbnails and static HTML hosting) (Block all public access -> unchecked).
- Make `thumbnails-bucket-demo-<yourname>` publicly readable:
    - Edit bucket policy:
  ```json
  {
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":"*",
      "Action":"s3:GetObject",
      "Resource":"arn:aws:s3:::thumbnails-bucket-demo-<yourname>/*"
    }]
  }
  ```
- Enable static website hosting on `thumbnails-bucket-demo-<yourname>` with index document as `index.html`.


### Step 2: Setup SNS and SQS
- Create an SNS topic named `ImageUploadTopic-<yourname>`.
- Create an SQS queue named `ImageQueue-<yourname>`.
- Subscribe the SQS queue to the SNS topic.
- Update SQS permissions to allow SNS to send messages. (should be already done by the subscription, verify it)

### Step 3: Lambda Function for Thumbnail Creation
- Create Lambda named `ThumbnailGenerator-<yourname>` (Runtime: Node.js 22.x).
- Attach S3 trigger from `images-bucket-demo-<yourname>` (PUT events).
- Deploy this code snippet after adding dependencies (`sharp`):
```javascript
const AWS = require('aws-sdk');
const sharp = require('sharp');
const s3 = new AWS.S3();
const sns = new AWS.SNS();
const SNS_TOPIC_ARN = '<your-sns-topic-arn-<yourname>>';

exports.handler = async (event) => {
  const bucket = event.Records[0].s3.bucket.name;
  const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
  const thumbnailKey = `thumbnail-${key}`;

  const image = await s3.getObject({ Bucket: bucket, Key: key }).promise();
  const thumbnail = await sharp(image.Body).resize(100).toBuffer();

  await s3.putObject({
    Bucket: 'thumbnails-bucket-demo-<yourname>',
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
}
```

### Step 4: Lambda Function for HTML Updates
- Create Lambda named `HTMLUpdater` triggered by SQS `ImageQueue`.
- Deploy this code:
```javascript
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const bucket = 'thumbnails-bucket-demo-<yourname>';

export const handler = async (event, context) => {
  let htmlContent = `<html><body><h1>Uploaded Thumbnails</h1>`;
  const objects = await s3.listObjectsV2({ Bucket: bucket }).promise();

  objects.Contents.forEach(obj => {
    if (obj.Key.startsWith('thumbnail-')) {
      const url = `https://${bucket}.s3.amazonaws.com/${obj.Key}`;
      htmlContent += `<img src="${url}" style="margin:10px;">`;
    }
  });

  htmlContent += `</body></html>`;

  await s3.putObject({
    Bucket: bucket,
    Key: 'index.html',
    Body: htmlContent,
    ContentType: 'text/html',
    ACL: 'public-read'
  }).promise();

  return { status: 'HTML updated successfully.' };
};
```

## Test the Setup
- Upload an image to `images-bucket-demo-<yourname>`.
- Check:
    - Thumbnail creation in `thumbnails-bucket-demo-<yourname>`.
    - SNS notification (visible in AWS SNS metrics).
    - HTML page update in S3 bucket.

## Access Your Webpage
Your public webpage will be available at:
```
http://thumbnails-bucket-demo-<yourname>.s3-website-YOUR-REGION.amazonaws.com/index.html
```
Replace `YOUR-REGION` with your AWS region (e.g., `us-east-1`).

---


## How to Deploy Lambda with the `sharp` Dependency

To deploy your Lambda function with the `sharp` image-processing dependency, follow these steps:

### Step 1: Set Up Local Environment
Make sure Node.js and npm are installed:
```bash
node -v
npm -v
```

### Step 2: Create Your Lambda Project Locally
```bash
mkdir ThumbnailGeneratorLambda
cd ThumbnailGeneratorLambda
```

### Step 3: Initialize and Install Dependencies
```bash
npm init -y
npm install --cpu=x64 --os=linux sharp aws-sdk
```

### Step 4: Create Your Lambda Function (`index.js`)
Place this code in `index.js`:
```javascript
const AWS = require('aws-sdk');
const sharp = require('sharp');
const s3 = new AWS.S3();
const sns = new AWS.SNS();
const SNS_TOPIC_ARN = '<your-sns-topic-arn-<yourname>>';

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
}
```

Replace `<your-sns-topic-arn>` with your SNS ARN.

### Step 5: Package Your Lambda Function
Create a deployment package (ZIP):
```bash
zip -r thumbnail_lambda_package.zip .
```

### Step 6: Deploy to AWS Lambda via AWS Console
- Open your AWS Lambda function.
- Under "Code", choose **Upload from** → **.zip file**.
- Select your `thumbnail_lambda_package.zip` and save.

Now your Lambda function includes the `sharp` dependency and is ready to handle S3-triggered events.
