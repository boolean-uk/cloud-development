
# Deploy a Simple Flask Web App on AWS EC2

## Goal

Deploy a live **Python Flask** application accessible via a public IP address using an AWS EC2 instance.

You will learn:
- How to set up an EC2 instance
- How to install dependencies
- How to run a Flask app
- How to configure security groups for public access

## Prerequisites

- An AWS account
- SSH access to an EC2 instance
- Basic Linux command-line knowledge

---

## Steps

### 1. Launch an EC2 Instance

- Launch a new EC2 instance.
- Use an Amazon Linux 2 or Ubuntu 22.04 AMI.
- Choose `t2.micro` instance type (free tier eligible).
- Create a new security group with the following inbound rules:
    - Allow **SSH (port 22)** from your IP address.
    - Allow **HTTP/Custom TCP (port 5000)** from anywhere (`0.0.0.0/0`).

### 2. Connect to Your EC2 Instance

Use the following SSH command:

```bash
ssh -i your-key.pem ec2-user@your-ec2-public-ip
```

> Replace `your-key.pem` with your private key file name and `your-ec2-public-ip` with your instance's public IP address.

### 3. Install Python3, Pip, and Flask

For Amazon Linux 2:

```bash
sudo yum update -y
sudo yum install python3 -y
pip3 install flask
```

For Ubuntu:

```bash
sudo apt update
sudo apt install python3-pip -y
pip3 install flask
```

### 4. Create a Simple Flask Application

Create a file named `app.py`:

```python
from flask import Flask

app = Flask(__name__)

@app.route('/')
def hello_world():
    return 'Hello from Flask running on EC2!'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

### 5. Run the Flask Application

Run the Flask server:

```bash
python3 app.py
```

Expected output:

```
 * Running on http://0.0.0.0:5000/ (Press CTRL+C to quit)
```

### 6. Access the Web App

Open a browser and navigate to:

```
http://your-ec2-public-ip:5000/
```

You should see:

```
Hello from Flask running on EC2!
```

### 7. Optional: Keep the App Running After Closing SSH

Install `tmux`:

```bash
sudo yum install tmux -y  # Amazon Linux
# or
sudo apt install tmux -y  # Ubuntu
```

Start a new tmux session:

```bash
tmux
```

Run your Flask app inside tmux. To detach and leave it running:

1. Press `Ctrl+B`
2. Press `D`

To resume the session:

```bash
tmux attach
```

---

## Extra Steps (Optional)

- Try to build and run a Java or C# or Javascript application.

---

## Conclusion

You have successfully deployed a simple Flask web application on AWS EC2 using Python.

---
