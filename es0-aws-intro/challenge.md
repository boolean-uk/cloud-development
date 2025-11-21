# 🚀 AWS Beginner Challenge

**Goal:** Become familiar with the AWS console by completing a series of hands-on missions.

**Region to use:** `eu-west-1` (Ireland)

## 📘 Challenge 1 --- Explore the AWS Console

### 🎯 Objective

Get comfortable with the AWS UI and locate core services.

### Tasks

1.  Log in to the AWS Console: https://console.aws.amazon.com

    Account ID: `637423341661`
    
    IAM username: `your email`

    First time password: `BooleanUKxExperis1!`

2.  Set region to:

        eu-west-1 (Ireland)

3.  Search for:

    -   EC2
    -   S3

4.  Add them to Favorites.

5.  Browse:

    -   EC2 Dashboard
    -   S3 Buckets

------------------------------------------------------------------------

## ⚙️ Challenge 2 --- Launch an EC2 Instance

### Objective

Deploy an EC2 instance with Amazon Linux 2 in `eu-west-1`.

### Steps

    Name: "aws-challenge-ec2"
    AMI: Amazon Linux 2
    Instance type: t3.micro
    Key pair: Create new key pair (.pem)
    Region: eu-west-1
    Network: Default VPC
    Subnet: Any eu-west-1 subnet
    Auto-assign IP: Enabled
    Security group:
      - SSH (22) from your IP
      - HTTP (80) from anywhere

Connect via:

    ssh -i your-key.pem ec2-user@PUBLIC_IP

------------------------------------------------------------------------

## 🌐 Challenge 3 --- Deploy a Simple HTTP Server

### Option A --- Python Server

``` bash
echo "<h1>Hello from your EC2 instance!</h1>" > index.html
sudo python3 -m http.server 80
```

### Option B --- NGINX

``` bash
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
sudo bash -c 'echo "<h1>Hello from NGINX on EC2</h1>" > /usr/share/nginx/html/index.html'
```

Test:

    http://PUBLIC_IP

------------------------------------------------------------------------

## 📦 Challenge 4 --- S3 Exercise

### Steps

1.  Go to S3 → Create bucket

2.  Configure:

        Bucket name: yourname-aws-challenge-bucket
        Region: eu-west-1
        Block all public access: UNCHECK

3.  Upload a file

4.  Make public:

        Actions → Make public via ACL

5.  Open the object URL.

------------------------------------------------------------------------

## 🏆 Final Challenge --- EC2 ↔ S3 (Optional)

``` bash
sudo yum install -y awscli
aws configure   # set region eu-west-1
aws s3 cp s3://your-bucket-name/your-file .
```

------------------------------------------------------------------------
# 🧹 Final Cleanup Note

After completing all challenges, remove all AWS resources you created to
avoid unwanted charges:

### EC2 Cleanup

``` markdown
EC2 → Instances → Select instance → Instance state → Terminate
EC2 → Security Groups → Delete if no longer used
EC2 → Key Pairs → Delete key pair if not needed
```

### S3 Cleanup

``` markdown
S3 → Buckets → Select your bucket → Empty → Delete bucket
```

------------------------------------------------------------------------

# 🎉 Done!

You have navigated AWS, launched EC2, deployed a webpage, and used S3.
