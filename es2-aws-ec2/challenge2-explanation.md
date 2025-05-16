
# 📘 AWS Lab: Blue-Green Deployment with ASG and ELB

## 🎯 Objective
Implement a **blue-green deployment** using two Auto Scaling Groups (ASGs) and an Application Load Balancer (ALB). This exercise demonstrates how to deploy a new version of a web application with **zero downtime** using AWS-native services.

---

## 🧪 Scenario

You're managing a production web application hosted on EC2 instances in an ASG behind an ALB. A new version of the application needs to be deployed with zero downtime. You'll use a blue-green deployment strategy:

- **Blue ASG**: Current version (v1)
- **Green ASG**: New version (v2)
- The ALB will switch target groups to route traffic from blue to green.

---

## 🔧 Instructions

### 🔹 Step 1: Create Two AMIs
1. Launch two EC2 instances (Amazon Linux 2):
   - **Instance A (Blue)**:
     ```bash
     sudo yum install -y httpd
     echo "Hello from Blue Version" | sudo tee /var/www/html/index.html
     sudo systemctl start httpd
     sudo systemctl enable httpd
     ```
   - **Instance B (Green)**:
     ```bash
     sudo yum install -y httpd
     echo "Hello from Green Version" | sudo tee /var/www/html/index.html
     sudo systemctl start httpd
     sudo systemctl enable httpd
     ```

2. Create AMIs from both instances:
   - `AMI-Blue`
   - `AMI-Green`

---

### 🔹 Step 2: Create Two Launch Templates
- **Launch Template Blue** → uses `AMI-Blue`
- **Launch Template Green** → uses `AMI-Green`

---

### 🔹 Step 3: Create Two Auto Scaling Groups
- Create:
   - **ASG-Blue** using Launch Template Blue
   - **ASG-Green** using Launch Template Green
- Configuration:
   - Min/Desired/Max: 2 / 2 / 4
   - Health check: ALB + EC2
   - Attach each ASG to separate Target Groups

---

### 🔹 Step 4: Configure ALB and Target Groups
1. Create ALB with 2 target groups:
   - `TG-Blue`
   - `TG-Green`
2. ALB Listener Rule (initially):
   - Forward HTTP traffic to `TG-Blue`

---

### 🔹 Step 5: Simulate Production Traffic
Use curl or a web browser to verify traffic:

```bash
curl http://<ALB-DNS>
```

Output should say: `Hello from Blue Version`

---

### 🔹 Step 6: Perform Cutover to Green
1. In the ALB Listener settings:
   - Edit rule to forward to `TG-Green`
2. Refresh your test:

```bash
curl http://<ALB-DNS>
```

Output should now say: `Hello from Green Version`

---

### 🔹 Step 7: Cleanup
- Deregister or terminate `ASG-Blue`
- Optional: delete `TG-Blue`, `AMI-Blue`, and related resources

---

## ✅ Validation Checklist

- ✅ Initial ALB responses return "Hello from Blue Version"
- ✅ Post-cutover responses return "Hello from Green Version"
- ✅ No downtime experienced
- ✅ ELB only routes to healthy targets
- ✅ Clean separation of versions via Target Groups

---

## 🧠 Learning Outcomes

- ✅ Perform a Blue-Green deployment using ASG and ALB
- ✅ Use Target Group switching to control traffic flow
- ✅ Understand high-availability patterns on AWS
- ✅ Reinforce use of ALB Listener rules and health checks
