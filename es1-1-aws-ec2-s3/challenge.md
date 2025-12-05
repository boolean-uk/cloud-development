# MiniChat on AWS: EC2 + EBS + S3 (with File Sharing)

This README contains EVERYTHING needed to build a complete MiniChat system using:

- **EC2** (chat server: WebSockets + Flask)
- **EBS** (persistent chat history)
- **S3** (frontend hosting + file storage)
- **IAM** (permissions for EC2 to access S3)

All steps include a small explanations about the *why* of each action.

---

# **0. Architecture Diagram**

```
Browser (users)
    |  \
    |   \ WebSocket (chat) + HTTP POST (file upload)
    v    \
S3 Static Website ----> EC2 Instance (Flask backend)
                         |
                         | read/write
                         v
                      EBS Volume (/chatdata/history.txt)

                         |
                         | upload + presigned URLs
                         v
                 S3 Uploads Bucket (private files)
```

### **Explanation**
This system shows how AWS compute, block storage, and object storage work together:

- The **frontend** is hosted in S3 as a static website.
- The browser connects to the **EC2 backend** via WebSockets.
- EC2 logs chat messages in a file on **EBS**, so chat persists across restarts.
- File uploads are sent from the browser → EC2 → S3 uploads bucket.
- EC2 generates **presigned URLs** so files can be accessed without exposing the bucket.

---

# **1. Prerequisites**

- AWS account
- Basic SSH knowledge
- Ability to navigate the AWS Console

---

# **2. Create S3 Bucket for the Frontend (Static Website)**

1. Go to **S3 → Create bucket**
2. Name it:
   ```
   minichat-frontend-<group>
   ```
3. Region: `eu-west-1`
4. Leave “Block all public access” **ON**
5. Click **Create**

### **Enable Static Website Hosting**

1. Bucket → **Properties**
2. Scroll to **Static website hosting**
3. Click **Edit**
4. Enable hosting
5. Set index document: `index.html`

### **Explanation**
S3 static website hosting lets us host the chat UI *without* a web server. Browsers can load HTML, CSS, JS directly from S3.

---

# **3. Create S3 Bucket for File Uploads**

1. Create another bucket:
   ```
   minichat-uploads-<group>
   ```
2. Keep **Block public access ON**.

### **Explanation**
This bucket must stay private because users upload files.  
We use **presigned URLs** to provide secure temporary access.

---

# **4. Launch the EC2 Instance**

1. Go to **EC2 → Launch instance**
2. AMI: **Amazon Linux 2023**
3. Instance type: **t2.micro**
4. Add inbound rules:
    - SSH (22)
    - Custom TCP port **8000**
5. Launch

### **Explanation**
The Flask WebSocket chat server will listen on port 8000.  
We must allow this port so browsers can connect.

---

# **5. Create and Attach an EBS Volume**

### **Create**

1. Go to **EC2 → Elastic Block Storage → Volumes → Create volume**
2. Size: **2–5 GB**
3. Type: **gp3**
4. Availability Zone: same as your EC2 instance
5. Create

### **Attach**

1. Select volume → **Actions → Attach volume**
2. Attach to EC2 using `/dev/xvdbf`

### **Format + Mount**

SSH into EC2:

```bash
lsblk
sudo mkfs -t ext4 /dev/xvdbf
sudo mkdir /chatdata
echo "/dev/xvdbf /chatdata ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab
sudo mount -a
df -h
sudo chown ec2-user:ec2-user /chatdata
```

### **Explanation**
We store chat history on this EBS disk so messages persist across server restarts.  
Mounting via `/etc/fstab` ensures the volume auto-mounts every boot.

---

# **6. Create IAM Role So EC2 Can Access S3**

1. Go to **IAM → Roles → Create role**
2. Trusted entity: **EC2**
3. Policy: **AmazonS3FullAccess** (OK for classroom lab)
4. Create role `MiniChatEC2Role`
5. Attach to EC2:
    - EC2 → Instance actions → Security → Modify IAM role

### **Explanation**
This avoids hard-coded credentials in the code. EC2 gets *temporary IAM credentials* automatically.

---

# **7. Install Software on EC2**

SSH into EC2:

```bash
sudo yum update -y
sudo yum install -y python3
python3 -m ensurepip --upgrade
pip3 install flask flask-sockets gevent gevent-websocket boto3 flask-cors
```

### **Explanation**
We install Python, Flask, WebSocket libraries, and boto3 (AWS SDK).  
`flask-sockets` + `gevent` allow us to handle real-time chat.

---

# **8. Create the Chat Server (server.py)**

Create the file:

```bash
nano server.py
```

Paste this:

```python
from flask import Flask, request, jsonify
from flask_sockets import Sockets
from flask_cors import CORS
import gevent
import os
import uuid
import boto3

app = Flask(__name__)
CORS(app)
sockets = Sockets(app)

s3 = boto3.client("s3")
UPLOAD_BUCKET = "minichat-uploads-YOURGROUP"

HISTORY_FILE = "/chatdata/history.txt"
clients = []

def save_message(msg):
    os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
    with open(HISTORY_FILE, "a") as f:
        f.write(msg + "\\n")

def load_history():
    if not os.path.exists(HISTORY_FILE):
        return []
    with open(HISTORY_FILE, "r") as f:
        return f.readlines()

def broadcast(msg):
    dead = []
    for ws in clients:
        try:
            ws.send(msg)
        except:
            dead.append(ws)
    for ws in dead:
        clients.remove(ws)

@sockets.route("/chat")
def chat_socket(ws):
    clients.append(ws)
    for line in load_history():
        ws.send(line.strip())

    try:
        while not ws.closed:
            msg = ws.receive()
            if msg is None:
                break
            save_message(msg)
            broadcast(msg)
    finally:
        clients.remove(ws)

@app.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file"}), 400

    file = request.files["file"]
    filename = file.filename
    ext = filename.split(".")[-1]
    key = f"{uuid.uuid4()}.{ext}"

    s3.upload_fileobj(file, UPLOAD_BUCKET, key)

    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": UPLOAD_BUCKET, "Key": key},
        ExpiresIn=3600 * 24,
    )

    msg = f"[FILE] {filename} → {url}"
    save_message(msg)
    broadcast(msg)

    return jsonify({"url": url})

@app.route("/")
def index():
    return "MiniChat backend running"

if __name__ == "__main__":
    from gevent import pywsgi
    from geventwebsocket.handler import WebSocketHandler
    server = pywsgi.WSGIServer(("", 8000), app, handler_class=WebSocketHandler)
    server.serve_forever()
```

Change `UPLOAD_BUCKET`.

### **Explanation**
This Python server handles:

- WebSocket chat
- File uploads
- Saving message history to EBS
- Uploading files to S3 and generating presigned URLs

---

# **9. Run the Server**

```bash
python3 server.py
```

### **Explanation**
This runs a real-time WebSocket server plus HTTP endpoints on port 8000.

---

# **10. Create the Frontend (index.html)**

Create file locally:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>MiniChat</title>
</head>
<body>
  <h1>MiniChat</h1>

  <div id="messages" style="height:250px; overflow-y:scroll; border:1px solid gray;"></div>

  <input id="msg" placeholder="Message...">
  <button onclick="sendMessage()">Send</button>

  <br><br>
  <input type="file" id="fileInput">
  <button onclick="uploadFile()">Upload File</button>

  <script>
    const EC2 = "YOUR-EC2-IP";
    const ws = new WebSocket("ws://" + EC2 + ":8000/chat");

    ws.onmessage = event => {
      const box = document.getElementById("messages");
      const m = event.data;
      if (m.startsWith("[FILE]")) {
        const [_, rest] = m.split("[FILE] ");
        const [name, url] = rest.split(" → ");
        box.innerHTML += `<div><b>File:</b> <a href="${url}">${name}</a></div>`;
      } else {
        box.innerHTML += `<div>${m}</div>`;
      }
      box.scrollTop = box.scrollHeight;
    };

    function sendMessage() {
      ws.send(document.getElementById("msg").value);
      document.getElementById("msg").value = "";
    }

    function uploadFile() {
      const file = document.getElementById("fileInput").files[0];
      const data = new FormData();
      data.append("file", file);
      fetch("http://" + EC2 + ":8000/upload", { method:"POST", body:data });
    }
  </script>
</body>
</html>
```

Replace `YOUR-EC2-IP`.

### **Explanation**
This page connects via WebSocket and displays messages.  
It uses `fetch()` to upload files to EC2.

---

# **11. Upload Frontend to S3**

1. Open frontend bucket
2. Upload `index.html`
3. Uncheck: `Block all public access`

### **Explanation**
Uploading the file makes it available at the static site endpoint.

---

# **12. Test Everything**

1. Open the S3 static website endpoint in browser
2. Open in multiple tabs
3. Send messages
4. Upload a file
5. Restart backend (`Ctrl+C` + `python3 server.py`)
6. Refresh the page

You should see persistent history and working file downloads.

### **Explanation**
This validates that:

- EBS persistence works
- WebSocket chat works
- S3 uploads via EC2 IAM role work

---

# **13. Optional Enhancements**

Students can add:

- Usernames
- Chat colors
- File size limits
- CloudFront distribution
- Terraform deployment

---

# **14. Cleanup**

Delete:

- EC2 instance
- EBS volume
- S3 buckets
- IAM role

### **Explanation**
Important to avoid costs.

---

