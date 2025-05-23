
# 📘 AWS Lab: Auto Scaling Group with Elastic Load Balancer

## 📌 Objective
Deploy a simple web application using an Auto Scaling Group (ASG) with an Elastic Load Balancer (ELB). The architecture should support scalability, high availability, and automatic recovery.

---

## 🧪 Lab Instructions

### 🛠️ Prerequisites
- AWS account with sufficient IAM permissions
- AWS CLI or Console access
- Key pair (for SSH access)
- Basic knowledge of EC2, security groups, and Amazon Machine Images (AMI)

---

### 🧾 Step 1: Create a Web Server AMI
1. Launch a t2.micro EC2 instance (Amazon Linux 2)
2. Connect via SSH and run:

    ```bash
    sudo yum update -y
    sudo yum install -y httpd
    echo "Hello from $(hostname)" | sudo tee /var/www/html/index.html
    sudo systemctl start httpd
    sudo systemctl enable httpd
    ```

3. Create an AMI from this instance (name: `WebServerAMI`)

---

### 🧾 Step 2: Create a Launch Template
1. Navigate to **EC2 > Launch Templates**
2. Create a new template:
    - AMI: `WebServerAMI`
    - Instance type: `t2.micro`
    - Security group: allow inbound HTTP (port 80)
    - Key pair: your SSH key
    - Optional: use user data to repeat the setup steps

---

### 🧾 Step 3: Create Target Group
1. Go to **EC2 > Target Groups**
2. Create a new target group:
    - Type: `Instance`
    - Protocol: `HTTP`
    - Port: `80`
    - VPC: same as EC2 instances
    - Health check path: `/`

---

### 🧾 Step 4: Create an Application Load Balancer
1. Go to **EC2 > Load Balancers**
2. Create an **Application Load Balancer**:
    - Scheme: Internet-facing
    - Listeners: HTTP (port 80)
    - Availability Zones: at least 2
3. Register the target group created in Step 3

---

### 🧾 Step 5: Create Auto Scaling Group
1. Go to **EC2 > Auto Scaling Groups**
2. Create an ASG using:
    - Launch Template from Step 2
    - Attach to the ALB target group
    - Min capacity: 2
    - Desired capacity: 2
    - Max capacity: 4
3. Enable **Auto Scaling policies**:
    - Target tracking policy on average CPU utilization (e.g., 60%)

---

### 🧾 Step 6: Simulate Load
Use Apache Benchmark (on any instance or locally):

```bash
ab -n 10000 -c 100 http://<ALB-DNS-Name>/
```

Or use a loop:

```bash
while true; do curl http://<ALB-DNS-Name>/; done
```

Monitor Auto Scaling Group activity to see instances being added.

---

### ✅ Validation
- ✅ Accessing ALB returns responses from different instance hostnames
- ✅ Auto Scaling adds/removes EC2 instances as needed
- ✅ ELB routes traffic only to healthy instances
- ✅ Terminate an instance manually — ASG should replace it

---

## ✅ Solution Summary

### Architecture
```
Internet
   │
Elastic Load Balancer
   │
Auto Scaling Group (2–4 EC2 instances)
   ├─ EC2 Instance 1 (Apache + EBS)
   ├─ EC2 Instance 2
   └─ ...
```

### Configuration Snapshot

| Component | Setting |
|----------|---------|
| AMI | WebServerAMI |
| Instance Type | t3.micro |
| Target Group | HTTP:80, / health check |
| Load Balancer | ALB (HTTP, 2 AZs) |
| ASG Min/Max | 2 / 4 |
| Scaling Policy | CPU > 60% |
| Health Check | Path: `/`, protocol: HTTP |
