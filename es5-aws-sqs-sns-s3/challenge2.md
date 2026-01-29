# 🧩 SNS → SQS → Lambda Batch Concatenation → S3

This is a **simple, student-friendly AWS challenge** that builds an event-driven workflow using:

- 📣 **SNS** — publish chunk events  
- 📬 **SQS** — buffer + batch delivery  
- ⚡ **Lambda** — assemble chunks when a FINAL message arrives  
- 🪣 **S3** — store the assembled result  


> ⚠️ **Important (by design):**  
> This challenge assumes that **all chunk messages + the FINAL message for a job arrive in the same Lambda batch invocation**.  
> You will configure **SQS → Lambda batching** to maximize that.

---

## 🎯 What you will build

**Producer (your laptop) → SNS → SQS → Lambda → S3**

A local publisher script sends:

- `jobId=... seq=1 text="Hello "`
- `jobId=... seq=2 text="from "`
- `jobId=... seq=3 text="Lambda!"`
- `jobId=... final=true`

Lambda will:

1. 🧠 Group messages by `jobId`
2. 🚦 Only assemble when it sees `final=true`
3. 🔢 Sort by `seq` and concatenate
4. 🪣 Write to S3:

```
s3://<OUTPUT_BUCKET>/assembled/<jobId>.txt
```

---

### 1️⃣ Choose a unique suffix with your name
Examples:
- `alex-01`
- `maria-02`
- `team3-lee`

Use **lowercase letters, numbers, hyphens only**.

### 2️⃣ Add the suffix to ALL resources
Examples:

- 📣 SNS Topic: `chunk-topic-<suffix>`
- 📬 SQS Queue: `chunk-queue-<suffix>`
- ⚡ Lambda: `chunk-assembler-<suffix>`
- 🪣 S3 Bucket: `chunk-assembled-<suffix>-<random>` (**must be globally unique**)

### 3️⃣ Use ONE AWS Region
Pick one region (e.g. `eu-west-1`) and use it everywhere.

---

## ✅ Prerequisites

- AWS account access (and permission to create SNS/SQS/Lambda/S3)
- Node.js **24** installed locally
- (Optional) AWS CLI configured

---

## 📁 Repository structure

```
sns-sqs-lambda-concat/
├─ README.md
├─ lambda/
│  ├─ index.mjs
│  └─ package.json
└─ publisher/
   ├─ publisher.mjs
   └─ package.json
```

---

# 🚧 Step-by-step build

## 🪣 Step 1 — Create the S3 output bucket

Create a **private** S3 bucket (unique name):

```
chunk-assembled-<suffix>-<random4digits>
```

Example:
```
chunk-assembled-alex-01-4821
```

✅ Checkpoint:
- Bucket exists in the correct region

---

## 📣 Step 2 — Create the SNS topic

Create an SNS topic:

```
chunk-topic-<suffix>
```

✅ Checkpoint:
- Topic exists
- Copy the **Topic ARN** (you will need it for testing)

---

## 📬 Step 3 — Create the SQS queue (+ optional DLQ)

Create an SQS **Standard** queue:

```
chunk-queue-<suffix>
```

(Optional but recommended)
- Create DLQ: `chunk-queue-dlq-<suffix>`
- Redrive policy: maxReceiveCount = 3

✅ Checkpoint:
- Queue exists
- Copy the **Queue ARN** (useful for debugging)

---

## 🔗 Step 4 — Subscribe SQS to SNS (and set permissions)

### 4.1 Create the subscription
In SNS topic `chunk-topic-<suffix>`:
- Create subscription
  - Protocol: **Amazon SQS**
  - Endpoint: select your **SQS queue ARN**

### 4.2 Allow SNS to send messages to SQS (should be already in place)
Edit the SQS queue policy to allow your SNS topic to `SendMessage`.

Policy template (replace values):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Allow-SNS-SendMessage",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "SQS:SendMessage",
      "Resource": "<QUEUE_ARN>",
      "Condition": {
        "ArnEquals": {
          "aws:SourceArn": "<TOPIC_ARN>"
        }
      }
    }
  ]
}
```

✅ Checkpoint (SNS → SQS test):
1. Go to SNS → Topic → **Publish message**
2. Message body (simple JSON):
   ```json
   {"jobId":"debug-1","seq":1,"text":"hi"}
   ```
3. Go to SQS queue → check **Messages available** increases (may take a few seconds)

If it does NOT increase:
- Subscription missing/wrong queue
- Queue policy missing/wrong Topic ARN

---

## ⚡ Step 5 — Create the Lambda function (Node.js 22)

Create a Lambda function:
- Name: `chunk-assembler-<suffix>`
- Runtime: **Node.js 24.x**
- Trigger: **SQS queue** `chunk-queue-<suffix>`

### 5.1 Configure SQS trigger batching (CRITICAL)
To improve the chance chunks + FINAL arrive together:
- **Batch size:** `10` (or higher than chunks + FINAL)
- **Maximum batching window:** `5 seconds` (recommended)

✅ Checkpoint:
- Lambda shows the SQS trigger as **Enabled**

### 5.2 Add environment variable
In Lambda → Configuration → Environment variables:
- `OUTPUT_BUCKET = <your-s3-bucket-name>`

✅ Checkpoint:
- Environment variable is saved

### 5.3 Grant S3 write permission
Lambda execution role must allow:
- `s3:PutObject` on `arn:aws:s3:::<bucket>/assembled/*`

Minimal policy (replace bucket name):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowWriteAssembledResults",
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": ["arn:aws:s3:::YOUR_BUCKET_NAME/assembled/*"]
    }
  ]
}
```

✅ Checkpoint:
- Policy attached to the Lambda role (or equivalent permission exists)

---

## 🧠 Step 6 — Add and deploy the Lambda code

### 6.1 Lambda dependencies
Create `lambda/package.json`:
```json
{
  "name": "chunk-assembler",
  "type": "module",
  "version": "1.0.0",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.0.0"
  }
}
```

Create `lambda/index.mjs`:
```js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});
const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET;

function parseSnsWrappedSqs(record) {
  // SNS -> SQS delivers an SNS envelope as the SQS message body
  const envelope = JSON.parse(record.body);
  return JSON.parse(envelope.Message);
}

export const handler = async (event) => {
  if (!OUTPUT_BUCKET) throw new Error("Missing OUTPUT_BUCKET env var");

  // jobId -> { chunks: Map<seq, text>, hasFinal: boolean }
  const jobs = new Map();

  for (const record of event.Records ?? []) {
    const msg = parseSnsWrappedSqs(record);
    const { jobId } = msg;

    if (!jobId) {
      console.log("Skipping message without jobId:", msg);
      continue;
    }

    if (!jobs.has(jobId)) jobs.set(jobId, { chunks: new Map(), hasFinal: false });
    const job = jobs.get(jobId);

    if (msg.final === true) {
      job.hasFinal = true;
      continue;
    }

    if (typeof msg.seq === "number" && typeof msg.text === "string") {
      // de-dupe by seq
      job.chunks.set(msg.seq, msg.text);
    } else {
      console.log("Invalid chunk message:", msg);
    }
  }

  for (const [jobId, job] of jobs.entries()) {
    if (!job.hasFinal) {
      console.log(`Job ${jobId}: no FINAL message; skipping`);
      continue;
    }

    const seqs = [...job.chunks.keys()].sort((a, b) => a - b);
    if (seqs.length === 0) {
      console.log(`Job ${jobId}: FINAL without chunks; skipping`);
      continue;
    }

    // Ensure contiguous starting at 1
    for (let i = 0; i < seqs.length; i++) {
      if (seqs[i] !== i + 1) {
        console.log(`Job ${jobId}: missing seq ${i + 1}, skipping`);
        // Keep simple: skip writing
        continue;
      }
    }

    let assembled = "";
    for (const seq of seqs) assembled += job.chunks.get(seq);

    const key = `assembled/${jobId}.txt`;
    await s3.send(new PutObjectCommand({
      Bucket: OUTPUT_BUCKET,
      Key: key,
      Body: assembled,
      ContentType: "text/plain; charset=utf-8"
    }));

    console.log(`✅ Wrote s3://${OUTPUT_BUCKET}/${key}`);
  }

  return { ok: true, jobsSeen: jobs.size };
};
```

### 6.2 Deploy Lambda code (console zip method)
From the `lambda/` folder:

```bash
cd lambda
npm install
zip -r lambda.zip .
```

Upload `lambda.zip` in AWS Lambda console:
- Lambda → Code → Upload from → `.zip file`

✅ Checkpoint:
- Lambda deploy succeeds (no console errors)

---

# 🧪 Testing (end-to-end + per-component)

## 🔎 Test A — Verify SNS → SQS works (without Lambda)
1. Go to SNS topic → **Publish message**
2. Message body:
   ```json
   {"jobId":"debug-a","seq":1,"text":"hello"}
   ```
3. Go to SQS queue → check **Messages available** increases

✅ Expected:
- SQS shows 1+ messages available

If not:
- Re-check subscription + queue policy

---

## 🔎 Test B — Verify Lambda is consuming from SQS
1. Put a few test messages into SNS (repeat Test A 3–5 times quickly)
2. Go to SQS queue
3. Watch:
   - Messages available increases briefly
   - Then decreases as Lambda consumes

✅ Expected:
- Messages available goes back down to 0 (or near 0)

If messages stay high:
- Lambda trigger disabled
- Event source mapping missing
- Lambda has no permission to poll SQS (rare if trigger created via console)

---

## ✅ Test C — Full end-to-end (Publisher → SNS → SQS → Lambda → S3)

### 1) Create publisher files
Create `publisher/package.json`:
```json
{
  "name": "chunk-publisher",
  "type": "module",
  "version": "1.0.0",
  "dependencies": {
    "@aws-sdk/client-sns": "^3.0.0"
  }
}
```

Create `publisher/publisher.mjs`:
```js
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import crypto from "node:crypto";

const sns = new SNSClient({});
const TOPIC_ARN = process.env.TOPIC_ARN;
if (!TOPIC_ARN) throw new Error("Set TOPIC_ARN env var");

const jobId = crypto.randomUUID();

// Keep it short so it’s very likely to fit in one batch
const text = "SNS → SQS → Lambda (FINAL) → S3 works!";
const chunkSize = 12;

const chunks = [];
for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));

console.log("Job:", jobId, "chunks:", chunks.length);

// Publish chunks
for (let i = 0; i < chunks.length; i++) {
  await sns.send(new PublishCommand({
    TopicArn: TOPIC_ARN,
    Message: JSON.stringify({ jobId, seq: i + 1, text: chunks[i] })
  }));
}

// Publish FINAL
await sns.send(new PublishCommand({
  TopicArn: TOPIC_ARN,
  Message: JSON.stringify({ jobId, final: true })
}));

console.log("✅ Published FINAL. Expect S3 key:", `assembled/${jobId}.txt`);
```

### 2) Run publisher locally
```bash
cd publisher
npm install
export TOPIC_ARN="YOUR_SNS_TOPIC_ARN"
node publisher.mjs
```

✅ Expected (in terminal):
- Prints a `jobId`
- Prints expected S3 key `assembled/<jobId>.txt`

### 3) Check Lambda logs
Go to:
- Lambda → Monitor → View CloudWatch logs

✅ Expected log lines include:
- `Job <id>: no FINAL message; skipping` (should be rare)
- `✅ Wrote s3://.../assembled/<jobId>.txt`

### 4) Check S3 output
In your S3 bucket:
- Find `assembled/<jobId>.txt`
- Open it and confirm content matches the original `text` in the publisher

✅ End-to-end success = file exists + content matches

---

## 🛠 If FINAL often “doesn’t arrive” in the same batch
Increase batching:
- Lambda trigger **Batch size**: 25
- Lambda trigger **Maximum batching window**: 5 seconds
Reduce chunks:
- Increase `chunkSize` in `publisher.mjs` so there are fewer chunks

---

## ✅ Success criteria
- ⚡ Lambda executes successfully
- 🚦 FINAL message triggers assembly
- 🪣 S3 object exists: `assembled/<jobId>.txt`
- 📄 File contents match the original string

---

## 🧹 Step 8 — Cleanup (REQUIRED)

Delete all resources you created (use your suffix). Recommended order:

1. ⚡ **Lambda**
   - Delete function `chunk-assembler-<suffix>`

2. 📬 **SQS**
   - Delete `chunk-queue-<suffix>`
   - Delete DLQ if created

3. 📣 **SNS**
   - Delete `chunk-topic-<suffix>`

4. 🪣 **S3**
   - Empty the bucket
   - Delete bucket `chunk-assembled-<suffix>-<random>`

5. 🔐 **IAM**
   - Remove/detach any custom inline policies added for this lab

✅ Final check:
- No resources with your suffix remain
- No unexpected charges

---

Happy building! 🚀
