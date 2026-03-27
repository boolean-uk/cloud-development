# Session 2: CloudWatch Monitoring & Alarms (2 hours)

## Learning Objectives
- Custom CloudWatch metrics
- CloudWatch Dashboards
- CloudWatch Alarms
- SNS notifications
- Monitoring best practices

## What You'll Build
1. Custom metrics in Lambda functions (order count, cart operations, latency)
2. CloudWatch Dashboard with 6 widgets
3. CloudWatch Alarms for errors and queue depth
4. SNS topic for alarm notifications

## Architecture Overview

```
Lambda Functions → CloudWatch PutMetricData
                ↓
         CloudWatch Metrics
                ↓
    ┌───────────┴───────────┐
    ↓                       ↓
Dashboard            Alarms → SNS → Email
```

## Implementation Steps

### Step 1: Review Custom Metrics in Lambda (25 min)

#### Checkout Function (`services/orders/checkout.js`)

The checkout function emits three custom metrics:

```javascript
await cloudwatch.send(new PutMetricDataCommand({
  Namespace: 'CloudCart',
  MetricData: [
    {
      MetricName: 'OrderPlaced',
      Value: 1,
      Unit: 'Count',
      Timestamp: new Date()
    },
    {
      MetricName: 'OrderTotal',
      Value: total,
      Unit: 'None',
      Timestamp: new Date()
    },
    {
      MetricName: 'CheckoutLatency',
      Value: Date.now() - startTime,
      Unit: 'Milliseconds',
      Timestamp: new Date()
    }
  ]
}));
```

**Key Concepts:**
- **Namespace:** Groups related metrics (CloudCart)
- **MetricName:** Identifies the specific metric
- **Value:** The data point value
- **Unit:** Helps with visualization (Count, Milliseconds, None, etc.)
- **Timestamp:** When the metric was recorded

#### Worker Function (`services/orders/worker.js`)

Tracks order processing:
- `OrdersProcessed` - Count of successful orders
- `OrderProcessingErrors` - Count of failed orders
- `OrderProcessingTime` - Time taken to process batch

#### Cart Function (`services/cart/handler.js`)

Tracks user interactions:
- `CartItemAdded` - When items are added
- `CartItemRemoved` - When items are removed

#### Products Function (`services/products/getProducts.js`)

Tracks catalog views:
- `ProductListViewed` - Number of times product list is accessed

### Step 2: Review the CloudWatch Dashboard (15 min)

The dashboard is defined in `infra/lib/cloudcart-stack.js`:

```javascript
const dashboard = new cloudwatch.Dashboard(this, 'CloudCartDashboard', {
  dashboardName: 'CloudCart-Metrics'
});

dashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'API Gateway Requests',
    left: [httpApi.metricCount(), httpApi.metric4xx(), httpApi.metric5xx()],
    width: 12
  }),
  // ... more widgets
);
```

**Widget Types:**
1. **API Gateway Requests** - Total requests, 4xx, 5xx errors
2. **Lambda Errors** - Error counts across functions
3. **Lambda Duration** - Execution time
4. **SQS Queue Depth** - Messages waiting to be processed
5. **Lambda Invocations** - Function call counts
6. **DLQ Messages** - Failed messages in dead letter queue

### Step 3: Review CloudWatch Alarms (20 min)

#### API Error Alarm
```javascript
const apiErrorAlarm = new cloudwatch.Alarm(this, 'ApiErrorAlarm', {
  metric: httpApi.metric5xx({ statistic: 'sum', period: Duration.minutes(5) }),
  threshold: 10,
  evaluationPeriods: 1,
  alarmDescription: 'Alert when API 5xx errors exceed threshold'
});
apiErrorAlarm.addAlarmAction(new actions.SnsAction(alarmTopic));
```

**How it works:**
- Monitors 5xx errors over 5-minute periods
- Triggers if more than 10 errors occur
- Sends notification to SNS topic

#### Queue Depth Alarm
- Triggers when checkout queue has >100 messages
- Indicates processing backlog
- May need to scale worker function

#### Worker Error Alarm
- Triggers when worker function has >5 errors
- Indicates processing failures
- Investigate DLQ messages

### Step 4: Test Custom Metrics (30 min)

```bash
# Generate test orders to create metrics
for i in {1..20}; do
  curl -X POST $API/checkout \
    -H 'Content-Type: application/json' \
    -d "{\"userId\":\"user-${i}\",\"items\":[{\"id\":\"1\",\"qty\":2}],\"total\":199.99}"
  sleep 1
done

# Add items to cart
for i in {1..10}; do
  curl -X POST $API/cart \
    -H 'Content-Type: application/json' \
    -d '{"id":"'$i'","qty":'$((RANDOM % 5 + 1))'}'
  sleep 1
done

# View products to generate metrics
for i in {1..15}; do
  curl $API/products
  sleep 1
done
```

Wait 2-3 minutes for metrics to appear in CloudWatch.

### Step 5: View Dashboard (15 min)

```bash
# Get dashboard URL from stack outputs
aws cloudformation describe-stacks --stack-name CloudCartStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
  --output text
```

Open the URL in your browser to see:
- Real-time metrics
- Historical trends
- Multiple time ranges (1h, 3h, 1d, 1w)

**Dashboard Navigation:**
- Use time range selector (top right)
- Hover over graphs for detailed values
- Click graph legend to show/hide series
- Auto-refresh every minute

### Step 6: SNS Email Subscription (15 min)

```bash
# Get SNS topic ARN
TOPIC_ARN=$(aws cloudformation describe-stacks --stack-name CloudCartStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AlarmTopicArn`].OutputValue' \
  --output text)

# Subscribe your email
aws sns subscribe \
  --topic-arn $TOPIC_ARN \
  --protocol email \
  --notification-endpoint your-email@example.com

# Check your email and confirm subscription
```

### Step 7: Trigger Test Alarm (10 min)

Generate errors to trigger the API Error Alarm:

```bash
# Send invalid requests to generate 4xx/5xx errors
for i in {1..15}; do
  curl -X POST $API/invalid-endpoint
  curl -X POST $API/checkout \
    -H 'Content-Type: application/json' \
    -d 'invalid json'
done
```

Wait 5-10 minutes for alarm to trigger and check your email.

### Step 8: View Metrics in CloudWatch Console (20 min)

#### Navigate to CloudWatch Metrics

1. AWS Console → CloudWatch → All Metrics
2. Select "CloudCart" namespace
3. Browse available metrics:
   - OrderPlaced
   - OrderTotal
   - CheckoutLatency
   - CartItemAdded
   - CartItemRemoved
   - ProductListViewed
   - OrdersProcessed
   - OrderProcessingErrors
   - OrderProcessingTime

#### Create Custom Graph

1. Select multiple metrics
2. Change statistic (Sum, Average, Max, etc.)
3. Adjust time range
4. Add to dashboard (optional)

#### View Alarm History

1. CloudWatch → Alarms
2. Select an alarm
3. View "History" tab
4. See state changes and why they occurred

## Verification Checklist

- [ ] Custom metrics appear in CloudWatch
- [ ] Dashboard displays all 6 widgets
- [ ] Can generate test traffic and see metrics update
- [ ] Alarms are configured correctly
- [ ] SNS topic created and email subscribed
- [ ] Successfully triggered a test alarm
- [ ] Received email notification

## Metrics Best Practices

### 1. Choose Appropriate Units
```javascript
// Good
{ MetricName: 'OrderCount', Value: 1, Unit: 'Count' }
{ MetricName: 'Latency', Value: 150, Unit: 'Milliseconds' }
{ MetricName: 'Price', Value: 99.99, Unit: 'None' }

// Bad
{ MetricName: 'Latency', Value: 0.15, Unit: 'Seconds' } // Use milliseconds
```

### 2. Use Dimensions for Filtering
```javascript
MetricData: [{
  MetricName: 'OrderPlaced',
  Value: 1,
  Unit: 'Count',
  Dimensions: [
    { Name: 'Environment', Value: 'production' },
    { Name: 'Region', Value: 'us-east-1' }
  ]
}]
```

### 3. Batch Metric Data
```javascript
// Efficient - single API call
await cloudwatch.send(new PutMetricDataCommand({
  Namespace: 'CloudCart',
  MetricData: [metric1, metric2, metric3]
}));

// Inefficient - multiple API calls
await cloudwatch.send(new PutMetricDataCommand({ MetricData: [metric1] }));
await cloudwatch.send(new PutMetricDataCommand({ MetricData: [metric2] }));
```

### 4. Set Appropriate Alarm Thresholds

```javascript
// Too sensitive - will have false alarms
threshold: 1

// Too lenient - won't catch real issues
threshold: 1000

// Just right - catches real issues
threshold: 10
```

## Cost Considerations

**Free Tier:**
- First 10 custom metrics: Free
- First 10 alarms: Free
- First 1 million API requests: Free
- 5 GB log ingestion: Free

**Beyond Free Tier:**
- Custom metrics: $0.30 per metric/month
- High-resolution metrics: $0.30 per metric/month
- Alarms: $0.10 per alarm/month
- Dashboard: $3 per dashboard/month
- Log storage: $0.50 per GB

**This session costs:** ~$0 (within free tier)

## Discussion Questions

1. **When to use custom metrics vs. built-in metrics?**
   - Built-in: Lambda invocations, errors, duration
   - Custom: Business metrics, user actions, domain-specific data

2. **How to choose alarm thresholds?**
   - Based on historical data
   - Consider normal traffic patterns
   - Account for spikes/seasonality

3. **Metric retention:**
   - High-resolution (1-second): 3 hours
   - 1-minute: 15 days
   - 5-minute: 63 days
   - 1-hour: 15 months

## Troubleshooting

**Issue:** Metrics not appearing
- Wait 2-3 minutes for propagation
- Check Lambda has CloudWatch:PutMetricData permission
- Verify metric namespace and name
- Check for errors in Lambda logs

**Issue:** Alarm not triggering
- Verify alarm threshold and evaluation period
- Check "Insufficient data" state
- Ensure metric is being emitted
- Review alarm history for details

**Issue:** No email notifications
- Confirm SNS subscription
- Check spam folder
- Verify alarm action is configured
- Test SNS topic directly

## Next Steps

In Session 3, we'll add:
- DynamoDB Orders table
- DynamoDB Streams
- Stream processor Lambda
- Order query endpoints
