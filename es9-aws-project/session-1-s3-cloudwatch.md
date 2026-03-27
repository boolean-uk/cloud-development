# Session 1: S3 Product Images & CloudWatch Basics (2 hours)

## Learning Objectives
- S3 bucket creation and configuration
- Pre-signed URLs for secure uploads
- CORS configuration for web applications
- CloudWatch Logs and Log Insights queries

## What You'll Build
1. S3 bucket for product images with CORS
2. Lambda function to generate pre-signed upload URLs
3. API endpoint `POST /products/:id/upload-url`
4. Updated seed data with image URLs

## Implementation Steps

### Step 1: Review the S3 Bucket Configuration (10 min)

Open `infra/lib/cloudcart-stack.js` and locate the S3 bucket:

```javascript
const imagesBucket = new s3.Bucket(this, 'ProductImagesBucket', {
  removalPolicy: RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
  versioned: true,
  cors: [{
    allowedOrigins: ['*'],
    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
    allowedHeaders: ['*'],
    exposedHeaders: ['ETag']
  }],
  publicReadAccess: true
});
```

**Discussion Points:**
- Why do we need CORS configuration?
- What is versioning and why enable it?
- When to use public vs. private buckets?

### Step 2: Examine the Pre-signed URL Lambda (15 min)

Review `services/products/generateUploadUrl.js`:

```javascript
const command = new PutObjectCommand({
  Bucket: BUCKET,
  Key: key,
  ContentType: 'image/jpeg'
});

const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
```

**Key Concepts:**
- Pre-signed URLs provide temporary access to S3 objects
- No AWS credentials needed on the client side
- Time-limited (5 minutes in this example)
- Specific to one operation (PUT in this case)

### Step 3: Deploy and Test (30 min)

```bash
# Deploy the stack
cd infra
npm install
npm run deploy

# Note the outputs:
# - HttpApiUrl
# - ImagesBucket

# Set environment variable
export API=$(aws cloudformation describe-stacks --stack-name CloudCartStack \
  --query 'Stacks[0].Outputs[?OutputKey==`HttpApiUrl`].OutputValue' --output text)

# Seed products with image URLs
export PRODUCTS_TABLE=$(aws cloudformation describe-stacks --stack-name CloudCartStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ProductsTable`].OutputValue' --output text)

cd ..
node scripts/seed-products.js $PRODUCTS_TABLE

# Test the upload URL endpoint
curl -X POST $API/products/1/upload-url

# You'll get a response like:
# {
#   "uploadUrl": "https://bucket.s3.amazonaws.com/...",
#   "imageUrl": "https://bucket.s3.amazonaws.com/products/1/123456.jpg",
#   "key": "products/1/123456.jpg",
#   "expiresIn": 300
# }
```

### Step 4: Upload an Image (20 min)

```bash
# Get the presigned URL
RESPONSE=$(curl -s -X POST $API/products/1/upload-url)
UPLOAD_URL=$(echo $RESPONSE | jq -r '.uploadUrl')
IMAGE_URL=$(echo $RESPONSE | jq -r '.imageUrl')

# Create or download a test image
curl -o test-image.jpg "https://placehold.co/400x400.jpg"

# Upload using the presigned URL
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: image/jpeg" \
  --upload-file test-image.jpg

# Verify the image is accessible
curl -I $IMAGE_URL
```

### Step 5: CloudWatch Logs Exploration (30 min)

#### View Logs in AWS Console
1. Open AWS Console → CloudWatch → Logs
2. Find log group: `/aws/lambda/CloudCartStack-GenerateUploadUrlFn*`
3. View recent log streams

#### Use CloudWatch Logs Insights

Navigate to CloudWatch → Logs Insights and run these queries:

**Query 1: Find all upload URL generations**
```sql
fields @timestamp, @message
| filter @message like /upload/
| sort @timestamp desc
| limit 20
```

**Query 2: Track upload URL requests by product**
```sql
fields @timestamp, productId
| parse @message /productId: (?<productId>\d+)/
| stats count() by productId
```

**Query 3: Find errors**
```sql
fields @timestamp, @message
| filter @message like /Error/
| sort @timestamp desc
```

## Verification Checklist

- [ ] S3 bucket created with CORS configuration
- [ ] Lambda function deployed for generating pre-signed URLs
- [ ] API endpoint `/products/:id/upload-url` works
- [ ] Successfully uploaded an image using pre-signed URL
- [ ] Image is publicly accessible
- [ ] Explored CloudWatch Logs and ran Log Insights queries
- [ ] Understand the security benefits of pre-signed URLs

## Discussion Questions

1. **Security:** Why is using pre-signed URLs more secure than storing AWS credentials in your frontend?

2. **Cost:** What are the cost implications of making the bucket publicly readable?

3. **Scalability:** How does this pattern scale compared to uploading through API Gateway/Lambda?

4. **Alternatives:** When would you use CloudFront with S3 instead of direct S3 URLs?

## Next Steps

In Session 2, we'll add:
- Custom CloudWatch metrics
- CloudWatch Dashboard
- CloudWatch Alarms
- SNS notifications

## Troubleshooting

**Issue:** Upload fails with 403 Forbidden
- Check bucket permissions
- Verify CORS configuration
- Ensure pre-signed URL hasn't expired

**Issue:** Can't access uploaded image
- Verify bucket has public read access
- Check bucket policy
- Verify image was uploaded to correct key

**Issue:** Lambda timeout
- Check Lambda has correct IAM permissions
- Verify environment variables are set
- Check CloudWatch Logs for errors
