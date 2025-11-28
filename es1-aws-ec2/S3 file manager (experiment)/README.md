# S3 File Manager – Node.js 20 on EC2 + S3 Static Website (eu-west-1)

This project lets you:

- Upload files to S3  
- List files in S3  
- Delete files from S3  
- Download files via pre-signed URLs  
- Interact through a simple web UI hosted as a **static website on S3**  

Backend: **Node.js 20** on **EC2 (Amazon Linux 2023)**  
Storage: **S3 (file bucket)**  
Frontend: **S3 static website (frontend bucket)**  
Region: **eu-west-1 (Ireland)**  

---

## Architecture

```text
User Browser
   │
   ├──► S3 Frontend Bucket (Static Website: HTML/JS/CSS)
   │         |
   │         └──► fetch() calls to:
   │
   └────────► EC2 Instance (Node.js 20 API)
                  │
                  └──► S3 Backend Bucket (stores files)
```

---

## 0. Prerequisites

- AWS account  
- Basic CLI & SSH knowledge  
- AWS CLI configured locally (optional but useful)  
- A key pair to SSH into EC2  

You’ll create:

- **1× EC2 instance** (Node.js API)  
- **1× S3 backend bucket** (file storage)  
- **1× S3 frontend bucket** (static website)  
- **1× IAM role** for EC2 with S3 access  

---

## 1. Create the S3 Backend Bucket (for Files)

1. Go to **S3** in AWS Console → **Create bucket**
2. Bucket name example (must be globally unique):

   ```text
   my-node-file-manager-backend
   ```

3. Region: **eu-west-1 (Ireland)**
4. Leave defaults → **Create bucket**

---

## 2. Create IAM Role for EC2 to Access S3

### 2.1 Create IAM Custom Policy

In **IAM → Policies → Create policy → JSON**, paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-node-file-manager-backend",
        "arn:aws:s3:::my-node-file-manager-backend/*"
      ]
    }
  ]
}
```

> 🔁 Replace `my-node-file-manager-backend` with your backend bucket name.

Name it:

```text
NodeFileManagerBackendPolicy
```

### 2.2 Create IAM Role for EC2

1. Go to **IAM → Roles → Create role**
2. **Trusted entity type**: AWS service  
3. **Use case**: EC2  
4. Attach the policy `NodeFileManagerBackendPolicy`
5. Name the role:

   ```text
   EC2-Node20-S3Role
   ```

6. Create role.

---

## 3. Launch the EC2 Instance (Amazon Linux 2023)

1. Go to **EC2 → Launch instance**
2. Name: `nodejs20-s3-manager`
3. **AMI**: **Amazon Linux 2023**
4. Instance type: `t2.micro` (free tier)
5. Key pair: create/select one
6. Network settings → create a new **security group**:

   | Type       | Port | Source      | Purpose                |
   |------------|------|------------|------------------------|
   | SSH        | 22   | Your IP     | SSH access             |
   | Custom TCP | 3000 | 0.0.0.0/0  | API access from browser |

7. Expand **Advanced details** → IAM instance profile → select:

   ```text
   EC2-Node20-S3Role
   ```

8. Launch the instance.

---

## 4. SSH into EC2

From your local machine:

```bash
ssh -i your-key.pem ec2-user@EC2_PUBLIC_IP
```

Replace `your-key.pem` and `EC2_PUBLIC_IP`.

---

## 5. Install Node.js 20 on Amazon Linux 2023

```bash
sudo dnf update -y
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
```

Verify:

```bash
node -v
npm -v
```

You should see Node 20.x.

---

## 6. Create the Node.js Project (Backend)

Inside EC2:

```bash
mkdir node-s3-app
cd node-s3-app
```

### 6.1 `package.json`

Create:

```bash
nano package.json
```

Paste:

```json
{
  "name": "node-s3-app",
  "version": "1.0.0",
  "main": "app.js",
  "type": "module",
  "engines": {
    "node": ">=20.0.0"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.609.0",
    "@aws-sdk/s3-request-presigner": "^3.609.0",
    "cors": "^2.8.5",
    "express": "^4.19.0",
    "multer": "^1.4.5"
  }
}
```

Install:

```bash
npm install
```

Create upload directory:

```bash
mkdir uploads
```

---

## 7. Backend Node.js App (`app.js`)

Create:

```bash
nano app.js
```

Paste:

```js
import express from "express";
import multer from "multer";
import cors from "cors";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";

const app = express();
app.use(express.json());

// Allow CORS from anywhere for demo purposes.
// For production, restrict origin to your frontend website URL.
app.use(cors({ origin: "*" }));

const upload = multer({ dest: "uploads/" });

// TODO: change this to your real backend bucket name
const BUCKET = "my-node-file-manager-backend";

// S3 client uses the EC2 instance role
const s3 = new S3Client({ region: "eu-west-1" });

// Upload file
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: file.originalname,
        Body: fs.createReadStream(file.path)
      })
    );

    fs.unlinkSync(file.path);
    res.json({ message: "File uploaded", file: file.originalname });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

// List files
app.get("/files", async (req, res) => {
  try {
    const data = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET })
    );
    const files = (data.Contents || []).map(obj => obj.Key);
    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Listing failed" });
  }
});

// Download file (presigned URL)
app.get("/download/:filename", async (req, res) => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: req.params.filename
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 300 });
    res.json({ downloadUrl: url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Download failed" });
  }
});

// Delete file
app.delete("/delete/:filename", async (req, res) => {
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: req.params.filename
      })
    );
    res.json({ message: "File deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete failed" });
  }
});

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
```

Run:

```bash
node app.js
```

Test from your local machine:

```bash
curl http://EC2_PUBLIC_IP:3000/files
```

---

## 8. Create Frontend S3 Static Website

Create a second bucket (for frontend):

```text
my-node-file-manager-frontend
```

Region: **eu-west-1**

### 8.1 Enable Static Website Hosting

1. Open the frontend bucket → **Properties**  
2. Static website hosting → Enable  
3. Index document: `index.html` → Save  

### 8.2 Allow Public Read Access

- Permissions → Block public access → turn **off** “Block all public access”  
- Confirm.

### 8.3 Bucket Policy

In **Permissions → Bucket policy**, add:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-node-file-manager-frontend/*"
    }
  ]
}
```

Replace `my-node-file-manager-frontend` with your bucket name.

---

## 9. Frontend Files

Locally, create a folder:

```text
website/
  index.html
  styles.css
  script.js
```

### 9.1 `index.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>S3 File Manager</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>

<h1>S3 File Manager</h1>

<section>
  <h2>Upload a File</h2>
  <input type="file" id="fileInput">
  <button onclick="uploadFile()">Upload</button>
</section>

<section>
  <h2>Files on S3</h2>
  <button onclick="loadFiles()">Refresh List</button>
  <ul id="fileList"></ul>
</section>

<script src="script.js"></script>

</body>
</html>
```

### 9.2 `styles.css`

```css
body {
  font-family: Arial, sans-serif;
  margin: 40px;
  background: #f0f0f0;
}

h1 {
  color: #222;
}

section {
  background: white;
  padding: 20px;
  margin-bottom: 30px;
  border-radius: 10px;
}

button {
  padding: 8px 16px;
  cursor: pointer;
}

li {
  margin-bottom: 10px;
}
```

### 9.3 `script.js`

Replace `EC2_PUBLIC_IP` with your EC2 instance public IP:

```javascript
const API_URL = "http://EC2_PUBLIC_IP:3000";

async function uploadFile() {
  const fileInput = document.getElementById("fileInput");
  if (!fileInput.files.length) {
    alert("Please choose a file.");
    return;
  }

  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/upload`, {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    alert("Upload failed");
    return;
  }

  alert("File uploaded!");
  loadFiles();
}

async function loadFiles() {
  const res = await fetch(`${API_URL}/files`);
  const data = await res.json();

  const list = document.getElementById("fileList");
  list.innerHTML = "";

  data.files.forEach(filename => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${filename}
      <button onclick="downloadFile('${filename}')">Download</button>
      <button onclick="deleteFile('${filename}')">Delete</button>
    `;
    list.appendChild(li);
  });
}

async function downloadFile(filename) {
  const res = await fetch(`${API_URL}/download/${filename}`);
  const data = await res.json();
  window.open(data.downloadUrl, "_blank");
}

async function deleteFile(filename) {
  const res = await fetch(`${API_URL}/delete/${filename}`, {
    method: "DELETE"
  });

  if (!res.ok) {
    alert("Delete failed");
    return;
  }

  alert("File deleted!");
  loadFiles();
}

// Load list on page load
loadFiles();
```

---

## 10. Upload Frontend to S3

If you have AWS CLI configured locally:

```bash
aws s3 cp website/ s3://my-node-file-manager-frontend/ --recursive
```

Or upload via S3 console → **Upload**.

---

## 11. Access the App

- Backend: `http://EC2_PUBLIC_IP:3000/files` (for API tests)  
- Frontend:  
  - Go to frontend bucket → **Properties → Static website hosting**  
  - Copy the **Bucket website endpoint**, for example:

    ```text
    http://my-node-file-manager-frontend.s3-website-eu-west-1.amazonaws.com
    ```

  - Open that URL in your browser.

You should be able to:

- Upload files  
- See them listed  
- Download via a new tab  
- Delete them  

---

## 12. Troubleshooting

### 12.1 Frontend loads but actions fail

- Check browser dev tools console:
  - CORS error? Make sure `app.use(cors({ origin: "*" }))` is present.
  - `Failed to fetch`? Check:
    - `node app.js` still running on EC2?
    - Security group allows inbound 3000 from `0.0.0.0/0`?
    - `API_URL` in `script.js` has correct `EC2_PUBLIC_IP`?

### 12.2 403 Forbidden on website URL

- Frontend bucket must:
  - Have public access unblocked  
  - Have correct bucket policy with `s3:GetObject` for `/*`  

### 12.3 Upload fails with 500 from backend

- Check backend logs (EC2 terminal running `node app.js`)  
- Confirm:
  - IAM role is attached to EC2  
  - Policy includes your backend bucket ARN  
  - Bucket name in `app.js` is correct  

### 12.4 Files never appear in S3

- Look in backend S3 bucket directly.  
- If no objects appear, upload is failing → see 12.3.

### 12.5 Download link shows AccessDenied

- Ensure:
  - File exists in backend bucket with that exact key  
  - System time is reasonably correct (for presigned URLs)  

---

## 13. Cleanup (Avoid Charges)

When done:

### 13.1 Terminate EC2

- EC2 → Instances → Select → **Instance state → Terminate**

### 13.2 Delete S3 Buckets

Backend:

```bash
aws s3 rm s3://my-node-file-manager-backend --recursive
aws s3 rb s3://my-node-file-manager-backend
```

Frontend:

```bash
aws s3 rm s3://my-node-file-manager-frontend --recursive
aws s3 rb s3://my-node-file-manager-frontend
```

### 13.3 Remove IAM Role & Policy

- IAM → Roles → delete `EC2-Node20-S3Role`  
- IAM → Policies → delete `NodeFileManagerBackendPolicy` (if unused)  

---

You now have a full end-to-end S3 File Manager:

- **Node.js 20** backend on EC2  
- **S3** backend bucket for files  
- **S3** frontend static website calling your API  

