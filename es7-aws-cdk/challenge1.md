# 📘 Serverless Notes App with AWS CDK

A hands-on AWS CDK project to build a simple Notes API using AWS Lambda, DynamoDB, and API Gateway.

---

## 🧩 Services Used

| AWS Service       | Purpose                                  |
|-------------------|------------------------------------------|
| **API Gateway**   | Public REST API                          |
| **Lambda**        | Serverless backend functions             |
| **DynamoDB**      | Persistent storage for notes             |
| **IAM Roles**     | Secure Lambda-to-DynamoDB permissions    |
| **CDK Toolkit**   | IaC deployment and management            |

---

## ✅ Prerequisites

- Node.js v22+
- AWS CLI configured with access key
- AWS CDK installed globally:
```bash
npm install -g aws-cdk
```
- Bootstrap your environment (only once):
```bash
cdk bootstrap
```

---

## 📦 Step-by-Step Instructions

### 🧱 Step 1: Initialize the Project

```bash
mkdir notes-app-cdk && cd notes-app-cdk
cdk init app --language=typescript
npm install @aws-cdk/aws-lambda @aws-cdk/aws-dynamodb @aws-cdk/aws-apigateway uuid
```

---

### 🗂️ Step 2: Create Folder Structure

```bash
mkdir lambda
touch lambda/createNote.js lambda/getNotes.js lambda/deleteNote.js
```

---

### 🧠 Step 3: Add Lambda Functions

#### lambda/createNote.js

```js
const { v4: uuidv4 } = require('uuid');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient();

exports.handler = async (event) => {
  const data = JSON.parse(event.body);

  const item = {
    id: { S: uuidv4() },
    content: { S: data.content },
    createdAt: { S: new Date().toISOString() },
  };

  const command = new PutItemCommand({
    TableName: process.env.TABLE_NAME,
    Item: item,
  });

  await client.send(command);

  return {
    statusCode: 201,
    body: JSON.stringify({ message: 'Note created', item }),
  };
};

```

#### lambda/getNotes.js

```js
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient();

exports.handler = async () => {
  const command = new ScanCommand({
    TableName: process.env.TABLE_NAME,
  });

  const result = await client.send(command);

  return {
    statusCode: 200,
    body: JSON.stringify(result.Items),
  };
};

```

#### lambda/deleteNote.js

```js
const { DynamoDBClient, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient();

exports.handler = async (event) => {
  const { id } = event.pathParameters;

  const command = new DeleteItemCommand({
    TableName: process.env.TABLE_NAME,
    Key: {
      id: { S: id },
    },
  });

  await client.send(command);

  return {
    statusCode: 204,
    body: '',
  };
};

```

---

### 🛠️ Step 4: Define CDK Stack

#### lib/notes-app-cdk-stack.ts

```ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class NotesAppCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'NotesTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const createNoteFn = new lambda.Function(this, 'CreateNoteFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'createNote.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantWriteData(createNoteFn);

    const getNotesFn = new lambda.Function(this, 'GetNotesFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'getNotes.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantReadData(getNotesFn);

    const deleteNoteFn = new lambda.Function(this, 'DeleteNoteFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'deleteNote.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantWriteData(deleteNoteFn);

    const api = new apigw.RestApi(this, 'NotesApi');

    const notes = api.root.addResource('notes');
    notes.addMethod('POST', new apigw.LambdaIntegration(createNoteFn));
    notes.addMethod('GET', new apigw.LambdaIntegration(getNotesFn));

    const singleNote = notes.addResource('{id}');
    singleNote.addMethod('DELETE', new apigw.LambdaIntegration(deleteNoteFn));
  }
}
```

---

### 📌 Step 5: Hook Entry File

#### bin/notes-app-cdk.ts

```ts
#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NotesAppStack } from '../lib/notes-app-stack';

const app = new cdk.App();
new NotesAppStack(app, 'NotesAppStack');
```

---

### 🚀 Step 6: Deploy the App

```bash
cdk bootstrap --no-staging
cdk deploy
```

Watch the stack outputs for the API Gateway URL.

---

### 🧪 Step 7: Test the API

```bash
# Create note
curl -X POST https://<api>.amazonaws.com/notes \
  -d '{ "content": "Hello CDK" }' \
  -H "Content-Type: application/json"

# Get notes
curl https://<api>.amazonaws.com/notes

# Delete note
curl -X DELETE https://<api>.amazonaws.com/notes/<id>
```

---

### 🧹 Step 8: Clean Up

```bash
cdk destroy
```

---

Happy building! 🎉
