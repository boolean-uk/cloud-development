
# 📘 Step-by-Step Explanation: AWS ELB + ASG Lab

---

## 🧾 Step 1: Create a Web Server AMI
**Purpose:**  
Prepare a base image with a pre-installed web server so that any new instance launched by the Auto Scaling Group is ready to serve traffic immediately.

**Details:**
- Install Apache or a similar web server.
- The page says “Hello from [hostname]” to identify which instance is responding.
- Creating an AMI from this setup ensures consistency across all ASG instances.

---

## 🧾 Step 2: Create a Launch Template
**Purpose:**  
Define how new instances in your Auto Scaling Group are launched.

**Why it's important:**
- Ensures all instances have consistent settings (AMI, instance type, networking).
- Automates instance provisioning with pre-defined configuration.

---

## 🧾 Step 3: Create Target Group
**Purpose:**  
The target group receives traffic from the ALB and tracks instance health.

**Details:**
- ELB uses it to determine which instances are healthy and should receive traffic.
- You configure it with health check paths (e.g., `/`).

---

## 🧾 Step 4: Create an Application Load Balancer (ALB)
**Purpose:**  
The ALB distributes incoming traffic across healthy EC2 instances.

**Key Concepts:**
- Provides high availability and load distribution.
- Internet-facing, listens on port 80, forwards to the target group.

---

## 🧾 Step 5: Create Auto Scaling Group
**Purpose:**  
The ASG manages the number of EC2 instances based on demand or health.

**Why it's powerful:**
- Maintains availability: replaces failed instances automatically.
- Maintains cost-efficiency: scales based on traffic/load.
- Works with ELB to route traffic only to healthy instances.

---

## 🧾 Step 6: Simulate Load
**Purpose:**  
Test Auto Scaling by generating traffic/load.

**Tools:**
- Apache Benchmark (`ab`) or a `curl` loop to simulate real-world usage.

**Expected Results:**
- ASG should scale up if load increases.
- ALB should route traffic to new instances as they come online.
- ASG scales down when load drops.

---

## ✅ Validation Checklist
- ALB returns different instance hostnames
- ASG scales up and down appropriately
- ELB routes only to healthy instances

---

## ✅ Summary
You built a scalable and resilient web application using:
- EC2
- Auto Scaling
- Load Balancing
- Health Monitoring
