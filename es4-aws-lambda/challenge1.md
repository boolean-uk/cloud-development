
# AWS Lambda Exercise: Hello Function in Node.js

## Objective
Create and test a simple AWS Lambda function using **Node.js** that takes a JSON input with a `name` field and returns a personalized greeting.

## Duration
~20–30 minutes

## Prerequisites
- AWS Account
- AWS Management Console access
- Basic familiarity with JavaScript

## Step-by-Step Instructions

### 1. Log in to AWS Console
- Navigate to: https://console.aws.amazon.com/lambda
- Click **Create function**
- Choose **Author from scratch**

### 2. Configure Your Lambda Function
- **Function name**: `HelloLambdaNode-<your-name>`
- **Runtime**: Node.js 22.x
- **Permissions**: Create a new role with basic Lambda permissions
- Click **Create function**

### 3. Add Lambda Code

Replace the default code with the following:

```javascript
export const handler  = async (event) => {
  const name = event.name || 'World';
  const response = {
    statusCode: 200,
    body: JSON.stringify(`Hello, ${name}!`)
  };
  return response;
};
```

Click **Deploy**.

### 4. Test the Function
- Click **Test**
- Create a new test event:
    - **Event name**: `TestGreeting`
    - **Event JSON**:

```json
{
  "name": "Alice"
}
```

- Click **Test**

#### Expected Output

```json
{
  "statusCode": 200,
  "body": "\"Hello, Alice!\""
}
```


## Summary
You created a Node.js Lambda function, tested it with custom input, and optionally set it up with an API Gateway for public access.
