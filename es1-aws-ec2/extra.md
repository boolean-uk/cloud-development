Adding Auto Scaling and Load Balancing
--------------------------------------

To make your Flask app more scalable and reliable:

### 1. Create an Amazon Machine Image (AMI)

-   After setting up your EC2 instance and Flask app, create an AMI from the instance.
-   EC2 Console → Actions → Image and templates → Create Image.

### 2. Create a Launch Template

-   Create a Launch Template using your AMI.
-   Configure instance type, key pair, and security groups.

### 3. Create an Auto Scaling Group

-   Create an Auto Scaling Group using the Launch Template.
-   Set minimum, desired, and maximum number of instances.
-   Attach the Auto Scaling Group to a Load Balancer.

### 4. Create an Elastic Load Balancer (ELB)

-   EC2 Console → Load Balancers → Create Load Balancer.
-   Choose Application Load Balancer.
-   Configure listeners for HTTP (port 5000 or the one on which your application is running).
-   Register your Auto Scaling Group instances.

### 5. Test Your Setup

-   Access your Load Balancer's DNS name.
-   Your traffic will be balanced across all running EC2 instances.