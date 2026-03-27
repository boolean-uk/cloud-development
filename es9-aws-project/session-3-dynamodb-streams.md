# Session 3: DynamoDB Orders & Streams (2 hours)

## Learning Objectives
- DynamoDB table design with composite keys
- DynamoDB Streams for event-driven architecture
- Lambda event source mappings
- Processing stream events
- Building query APIs

## What You'll Build
1. Orders DynamoDB table with composite key (userId, orderId)
2. DynamoDB Streams enabled on Orders table
3. Stream processor Lambda for analytics
4. Orders API endpoints (list and get by ID)
5. End-to-end order flow from checkout to persistence

## Architecture Overview

```
API Gateway → Checkout Lambda → SQS Queue → Worker Lambda → DynamoDB Orders Table
                                                                      ↓
                                                              DynamoDB Stream
                                                                      ↓
                                                          Stream Processor Lambda
                                                                      ↓
                                                              Analytics/Logging
```

---

## Implementation Steps

### Step 1: Review Orders Table Design (15 min)

Open `infra/lib/cloudcart-stack.js` and locate the Orders table definition:

```javascript
const orders = new dynamodb.Table(this, 'OrdersTable', {
  partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  stream: dynamodb.StreamViewType.NEW_IMAGE,
  removalPolicy: RemovalPolicy.DESTROY
});
```

**Key Design Decisions:**

**1. Composite Key:**
- **Partition Key (userId):** Groups orders by user
- **Sort Key (orderId):** Unique identifier for each order
- **Why?** Enables efficient queries like "get all orders for user X"

**2. Billing Mode:**
- **PAY_PER_REQUEST:** Auto-scales, no capacity planning
- **Alternative:** PROVISIONED mode with fixed RCU/WCU

**3. Stream Configuration:**
- **NEW_IMAGE:** Captures full item after update
- **Alternatives:**
  - OLD_IMAGE: Before update
  - NEW_AND_OLD_IMAGES: Both
  - KEYS_ONLY: Just the keys

**Discussion Questions:**
1. Why composite key instead of single partition key?
2. When would you use KEYS_ONLY stream view?
3. How would you query "all orders in last 7 days"?

---

### Step 2: Examine Worker Lambda Persistence (20 min)

Review `services/orders/worker.js`:

```javascript
const msg = JSON.parse(rec.body);

// Persist order to DynamoDB
const orderId = msg.id || `order-${Date.now()}`;
const userId = msg.userId || 'anonymous';
const timestamp = new Date().toISOString();

await ddb.send(new PutItemCommand({
  TableName: ORDERS_TABLE,
  Item: {
    userId: { S: userId },
    orderId: { S: orderId },
    timestamp: { S: timestamp },
    items: { S: JSON.stringify(msg.items || []) },
    total: { N: String(msg.total || 0) },
    status: { S: 'processing' }
  }
}));
```

**What's Happening:**
1. **Parse Message:** Extract order data from SQS
2. **Generate Keys:** Create userId and orderId
3. **Format Item:** DynamoDB requires typed attributes (S=String, N=Number)
4. **Write:** PutItem adds or replaces the item

**Important Details:**
- `items` is stored as JSON string (DynamoDB doesn't have array type)
- `total` must be a string when writing numbers
- `timestamp` is ISO 8601 format for sorting
- `status` enables order lifecycle tracking

**Try It:**
```bash
# Place an order
curl -X POST $API/checkout \
  -H 'Content-Type: application/json' \
  -d '{"userId":"user-123","items":[{"id":"1","qty":2}],"total":199.99}'

# Wait 10 seconds for processing
sleep 10

# Check DynamoDB directly
aws dynamodb scan --table-name $ORDERS_TABLE
```

---

### Step 3: Understanding DynamoDB Streams (25 min)

**What are DynamoDB Streams?**

Streams capture item-level changes in a table in near real-time. Think of it as a "changelog" that triggers actions when data changes.

**Stream Record Structure:**
```json
{
  "eventID": "1",
  "eventName": "INSERT",
  "eventSource": "aws:dynamodb",
  "dynamodb": {
    "Keys": {
      "userId": { "S": "user-123" },
      "orderId": { "S": "order-1234567890" }
    },
    "NewImage": {
      "userId": { "S": "user-123" },
      "orderId": { "S": "order-1234567890" },
      "timestamp": { "S": "2026-03-08T15:30:00.000Z" },
      "items": { "S": "[{\"id\":\"1\",\"qty\":2}]" },
      "total": { "N": "199.99" },
      "status": { "S": "processing" }
    }
  }
}
```

**Event Types:**
- **INSERT:** New item created
- **MODIFY:** Existing item updated
- **REMOVE:** Item deleted

**Review Stream Processor:**

Look at `services/orders/streamProcessor.js`:

```javascript
export const handler = async (event) => {
  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      const newOrder = unmarshall(record.dynamodb.NewImage);

      // Aggregate daily statistics
      const date = new Date(newOrder.timestamp).toISOString().split('T')[0];
      console.log('Aggregating order for date:', date, 'Total:', newOrder.total);

      // Could trigger:
      // - Send email confirmation
      // - Update inventory
      // - Notify warehouse
      // - Update analytics dashboard
    }
  }
};
```

**What You Could Add:**
1. **Email Notifications:** Use SES to send order confirmations
2. **Inventory Updates:** Decrement stock counts
3. **Analytics:** Aggregate sales by day/product
4. **Webhooks:** Notify external systems

**Discussion:**
- Why use streams instead of direct processing in worker?
- What's the benefit of decoupling?

---

### Step 4: Review Stream Lambda Configuration (15 min)

In `infra/lib/cloudcart-stack.js`:

```javascript
const streamProcessor = new node.NodejsFunction(this, 'StreamProcessorFn', {
  entry: L('orders/streamProcessor.js'),
  ...defaultFnProps,
  timeout: Duration.seconds(30)
});

streamProcessor.addEventSource(new lambdaEventSources.DynamoEventSource(orders, {
  startingPosition: lambda.StartingPosition.LATEST,
  batchSize: 10,
  retryAttempts: 2
}));
```

**Key Parameters:**

**startingPosition:**
- **LATEST:** Process only new records (after Lambda deployed)
- **TRIM_HORIZON:** Process all existing records
- **AT_TIMESTAMP:** Start from specific time

**batchSize:**
- Number of records sent to Lambda per invocation
- Range: 1-10,000
- **Trade-off:** Higher = more efficient, but larger processing time

**retryAttempts:**
- How many times to retry failed batches
- After retries exhausted, records go to DLQ (if configured)

**Important:** Lambda processes batches in order per partition key.

---

### Step 5: Build Orders Query API (30 min)

#### Get All Orders (services/orders/getOrders.js)

```javascript
export const handler = async (event) => {
  const userId = event.queryStringParameters?.userId || 'anonymous';

  if (userId === 'all') {
    // Admin query: Scan entire table
    result = await ddb.send(new ScanCommand({
      TableName: TABLE,
      Limit: 50
    }));
  } else {
    // User query: Query by partition key
    result = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: {
        ':uid': { S: userId }
      },
      ScanIndexForward: false, // Descending order (newest first)
      Limit: 20
    }));
  }

  const orders = (result.Items || []).map(unmarshall);
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orders, count: orders.length })
  };
};
```

**Key Concepts:**

**Scan vs. Query:**
- **Scan:** Reads entire table (expensive, slow)
- **Query:** Uses partition key (fast, efficient)
- **Rule:** Always prefer Query when possible

**KeyConditionExpression:**
- Must include partition key
- Can optionally filter on sort key
- Examples:
  ```javascript
  // Exact match
  'userId = :uid'

  // With sort key range
  'userId = :uid AND orderId BETWEEN :start AND :end'

  // Sort key begins with
  'userId = :uid AND begins_with(orderId, :prefix)'
  ```

**ScanIndexForward:**
- `true`: Ascending order
- `false`: Descending order (newest first)

#### Get Single Order (services/orders/getOrderById.js)

```javascript
export const handler = async (event) => {
  const orderId = event.pathParameters?.id;
  const userId = event.queryStringParameters?.userId || 'anonymous';

  const result = await ddb.send(new GetItemCommand({
    TableName: TABLE,
    Key: {
      userId: { S: userId },
      orderId: { S: orderId }
    }
  }));

  if (!result.Item) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Order not found' })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify(unmarshall(result.Item))
  };
};
```

**GetItem Requirements:**
- Must provide full primary key (partition + sort key)
- Most efficient read operation (single-item lookup)
- Returns empty if item doesn't exist (not an error)

---

### Step 6: Test End-to-End Order Flow (30 min)

#### Place Orders
```bash
# Set API URL
export API=<your-api-url>

# Place multiple test orders
for i in {1..5}; do
  curl -X POST $API/checkout \
    -H 'Content-Type: application/json' \
    -d "{\"userId\":\"user-${i}\",\"items\":[{\"id\":\"1\",\"qty\":2}],\"total\":$((100 + i * 10))}"
  echo ""
  sleep 1
done
```

#### Verify Orders in DynamoDB
```bash
# Get table name
export ORDERS_TABLE=$(aws cloudformation describe-stacks --stack-name CloudCartMvpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`OrdersTableName`].OutputValue' --output text)

# Scan table
aws dynamodb scan --table-name $ORDERS_TABLE

# Count items
aws dynamodb scan --table-name $ORDERS_TABLE --select COUNT
```

#### Query Orders via API
```bash
# List all orders (admin)
curl "$API/orders?userId=all" | jq

# List orders for specific user
curl "$API/orders?userId=user-1" | jq

# Get specific order (you'll need an orderId from previous response)
ORDER_ID="order-1234567890"
curl "$API/orders/$ORDER_ID?userId=user-1" | jq
```

#### Check Stream Processor Logs
```bash
# View stream processor logs
aws logs tail /aws/lambda/CloudCartMvpStack-StreamProcessorFn --follow

# Filter for specific date
aws logs filter-log-events \
  --log-group-name /aws/lambda/CloudCartMvpStack-StreamProcessorFn \
  --filter-pattern "Aggregating"
```

---

### Step 7: Explore DynamoDB Expressions (20 min)

#### Query with Sort Key Condition

Add this to a test file or Lambda:

```javascript
// Get orders from specific date range
const result = await ddb.send(new QueryCommand({
  TableName: ORDERS_TABLE,
  KeyConditionExpression: 'userId = :uid AND orderId BETWEEN :start AND :end',
  ExpressionAttributeValues: {
    ':uid': { S: 'user-1' },
    ':start': { S: 'order-1709900000000' },
    ':end': { S: 'order-1709999999999' }
  }
}));
```

#### Filter Expression (Post-Query)

```javascript
// Get orders over $100 (applied AFTER query)
const result = await ddb.send(new QueryCommand({
  TableName: ORDERS_TABLE,
  KeyConditionExpression: 'userId = :uid',
  FilterExpression: 'total > :minTotal',
  ExpressionAttributeValues: {
    ':uid': { S: 'user-1' },
    ':minTotal': { N: '100' }
  }
}));
```

**Important:** FilterExpression still consumes read capacity for all items before filtering!

#### Projection Expression (Select Specific Attributes)

```javascript
// Only get orderId and total
const result = await ddb.send(new QueryCommand({
  TableName: ORDERS_TABLE,
  KeyConditionExpression: 'userId = :uid',
  ProjectionExpression: 'orderId, total',
  ExpressionAttributeValues: {
    ':uid': { S: 'user-1' }
  }
}));
```

**Benefit:** Reduces data transfer, but doesn't reduce read capacity units.

---

## Verification Checklist

After completing this session, verify:

- [ ] Orders table exists with correct schema
- [ ] Can place orders via checkout endpoint
- [ ] Orders appear in DynamoDB after ~10 seconds
- [ ] Worker Lambda logs show order processing
- [ ] Stream processor Lambda is invoked on new orders
- [ ] Can query all orders via API
- [ ] Can query orders by userId
- [ ] Can get specific order by orderId
- [ ] Stream processor logs show aggregation messages

---

## Advanced Exercises

### Exercise 1: Add Order Status Updates

Modify the worker to update order status over time:

```javascript
// In worker.js after initial PutItem
await new Promise(resolve => setTimeout(resolve, 5000));

// Update status to 'completed'
await ddb.send(new UpdateItemCommand({
  TableName: ORDERS_TABLE,
  Key: {
    userId: { S: userId },
    orderId: { S: orderId }
  },
  UpdateExpression: 'SET #status = :status',
  ExpressionAttributeNames: { '#status': 'status' },
  ExpressionAttributeValues: { ':status': { S: 'completed' } }
}));
```

**Result:** Stream processor receives MODIFY event.

---

### Exercise 2: Aggregate Daily Sales

Enhance stream processor to calculate daily totals:

```javascript
const aggregations = new Map();

for (const record of event.Records) {
  if (record.eventName === 'INSERT') {
    const order = unmarshall(record.dynamodb.NewImage);
    const date = order.timestamp.split('T')[0];

    if (!aggregations.has(date)) {
      aggregations.set(date, { count: 0, total: 0 });
    }

    const agg = aggregations.get(date);
    agg.count += 1;
    agg.total += parseFloat(order.total);
  }
}

// Write aggregations to another DynamoDB table or CloudWatch metric
for (const [date, stats] of aggregations) {
  console.log(`${date}: ${stats.count} orders, $${stats.total.toFixed(2)} total`);
}
```

---

### Exercise 3: Implement Order Cancellation

Add a new Lambda function for canceling orders:

```javascript
export const handler = async (event) => {
  const orderId = event.pathParameters?.id;
  const userId = event.queryStringParameters?.userId;

  await ddb.send(new UpdateItemCommand({
    TableName: ORDERS_TABLE,
    Key: {
      userId: { S: userId },
      orderId: { S: orderId }
    },
    UpdateExpression: 'SET #status = :status, canceledAt = :time',
    ConditionExpression: '#status = :processing',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': { S: 'canceled' },
      ':processing': { S: 'processing' },
      ':time': { S: new Date().toISOString() }
    }
  }));

  return { statusCode: 200, body: JSON.stringify({ message: 'Order canceled' }) };
};
```

**ConditionExpression:** Only allows canceling if status is 'processing'.

---

## Discussion Questions

1. **Composite Keys:**
   - Why use userId as partition key instead of orderId?
   - What access patterns does this enable?
   - How would you find "all orders in last 24 hours"?

2. **Streams vs. Direct Processing:**
   - When should you use streams?
   - What are the benefits of event-driven architecture?
   - How do streams enable microservices?

3. **Query Patterns:**
   - When to use Scan vs. Query?
   - How do GSIs help with additional access patterns?
   - What's the cost difference?

4. **Consistency:**
   - DynamoDB is eventually consistent by default
   - When do you need strongly consistent reads?
   - How does this affect your application design?

---

## Troubleshooting

### Orders not appearing in DynamoDB

**Check:**
```bash
# Verify worker Lambda is processing
aws logs tail /aws/lambda/CloudCartMvpStack-WorkerFn --follow

# Check SQS queue for messages
aws sqs get-queue-attributes \
  --queue-url $QUEUE_URL \
  --attribute-names ApproximateNumberOfMessages
```

**Common causes:**
- Worker Lambda error (check logs)
- Queue not triggering Lambda (check event source mapping)
- Wrong table name in environment variable

---

### Stream processor not triggering

**Check:**
```bash
# Verify stream is enabled
aws dynamodb describe-table --table-name $ORDERS_TABLE \
  --query 'Table.StreamSpecification'

# Check Lambda event source mapping
aws lambda list-event-source-mappings \
  --function-name CloudCartMvpStack-StreamProcessorFn
```

**Common causes:**
- Stream not enabled on table
- Event source mapping not active
- Lambda has errors (check logs)

---

### Query returns empty results

**Check:**
```bash
# Verify items exist
aws dynamodb scan --table-name $ORDERS_TABLE --select COUNT

# Check query syntax
aws dynamodb query \
  --table-name $ORDERS_TABLE \
  --key-condition-expression "userId = :uid" \
  --expression-attribute-values '{":uid":{"S":"user-1"}}'
```

**Common causes:**
- Wrong userId value
- Items not yet written
- Query using wrong key

---

## Cost Implications

### DynamoDB Streams
- **Free:** Included with DynamoDB
- **Reads:** Streams consume read capacity when Lambda polls
- **Lambda:** Only pay for processing time

### PAY_PER_REQUEST Pricing
- **Reads:** $0.25 per million requests
- **Writes:** $1.25 per million requests
- **Storage:** $0.25 per GB/month

**This Session Costs:** ~$0 (well within free tier)

---

## Next Steps

In Session 4, we'll add:
- Lambda authorizers for API security
- IAM roles and policies
- Admin API endpoints with authentication
- Role-based access control (RBAC)

Continue to [Session 4: IAM & Security](./session-4-iam-auth.md)

---

## Additional Resources

- [DynamoDB Developer Guide](https://docs.aws.amazon.com/dynamodb/)
- [DynamoDB Streams Documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)
- [Best Practices for DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [DynamoDB Query vs Scan](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-query-scan.html)
