# AWS IAM Hands-On Lab 
## Implementing Least Privilege Access Control

**Duration:** 20-30 minutes

**Difficulty:** Beginner to Intermediate

---

## Lab Overview

In this lab, you'll implement real-world IAM patterns:
- Create users and groups with different permission levels
- Write custom policies with tag-based conditions
- Use IAM roles for EC2 (no access keys!)
- Test least privilege access
- Understand policy evaluation

**What you'll build:**
- 3 IAM groups (Developers, DatabaseAdmins, ReadOnly)
- 3 test users with different permissions
- Custom policies with tag-based conditions
- EC2 instances with IAM roles
- Test scenarios to validate permissions

---

## Prerequisites

- AWS Account with admin access
- AWS CLI installed and configured
- Basic understanding of JSON

**Verify setup:**
```bash
aws --version
aws sts get-caller-identity
```

---

## Part 1: Create User Groups (5 minutes)

### What are Groups?

Groups are collections of users with shared permissions. Best practice: attach policies to groups, not individual users.

### Create Groups

```bash
# Create three groups
aws iam create-group --group-name Developers
aws iam create-group --group-name DatabaseAdmins
aws iam create-group --group-name ReadOnlyUsers
```

**Verify:**
```bash
aws iam list-groups
```

---

## Part 2: Create Custom Policies (10 minutes)

### Policy 1: Developer Policy

**What this does:** Allows managing EC2 instances, but ONLY if tagged `Environment=Development`

Create the policy file:
```bash
cat > developer-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EC2DevelopmentAccess",
      "Effect": "Allow",
      "Action": [
        "ec2:Describe*",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:RebootInstances"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "ec2:ResourceTag/Environment": "Development"
        }
      }
    },
    {
      "Sid": "S3ReadOnly",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": "*"
    }
  ]
}
EOF
```

**Key points:**
- `Condition` block restricts actions to specific tagged resources
- Demonstrates **tag-based access control**
- Implements **least privilege**

Create the policy:
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws iam create-policy \
  --policy-name DeveloperPolicy \
  --policy-document file://developer-policy.json

DEVELOPER_POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/DeveloperPolicy"
```

### Policy 2: Database Admin Policy

**What this does:** Allows managing database-related resources only

```bash
cat > database-admin-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DatabaseEC2Access",
      "Effect": "Allow",
      "Action": [
        "ec2:Describe*",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:RebootInstances"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "ec2:ResourceTag/Type": "Database"
        }
      }
    },
    {
      "Sid": "RDSReadAccess",
      "Effect": "Allow",
      "Action": [
        "rds:Describe*"
      ],
      "Resource": "*"
    }
  ]
}
EOF
```

Create the policy:
```bash
aws iam create-policy \
  --policy-name DatabaseAdminPolicy \
  --policy-document file://database-admin-policy.json

DB_ADMIN_POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/DatabaseAdminPolicy"
```

### Attach Policies to Groups

```bash
# Developers get custom policy
aws iam attach-group-policy \
  --group-name Developers \
  --policy-arn "$DEVELOPER_POLICY_ARN"

# Database admins get custom policy
aws iam attach-group-policy \
  --group-name DatabaseAdmins \
  --policy-arn "$DB_ADMIN_POLICY_ARN"

# Read-only users get AWS managed policy
aws iam attach-group-policy \
  --group-name ReadOnlyUsers \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess
```

**Verify:**
```bash
aws iam list-attached-group-policies --group-name Developers
```

---

## Part 3: Create Test Users (5 minutes)

```bash
# Create users
aws iam create-user --user-name alice-developer
aws iam create-user --user-name bob-dbadmin
aws iam create-user --user-name charlie-readonly

# Add users to groups
aws iam add-user-to-group --user-name alice-developer --group-name Developers
aws iam add-user-to-group --user-name bob-dbadmin --group-name DatabaseAdmins
aws iam add-user-to-group --user-name charlie-readonly --group-name ReadOnlyUsers

# Create access keys for testing (save the output!)
aws iam create-access-key --user-name alice-developer > alice-keys.json
aws iam create-access-key --user-name bob-dbadmin > bob-keys.json

echo "Access keys saved to alice-keys.json and bob-keys.json"
```

**Configure AWS CLI profiles for testing:**

```bash
# Get Alice's keys
ALICE_ACCESS_KEY=$(cat alice-keys.json | grep AccessKeyId | cut -d'"' -f4)
ALICE_SECRET_KEY=$(cat alice-keys.json | grep SecretAccessKey | cut -d'"' -f4)

# Get Bob's keys
BOB_ACCESS_KEY=$(cat bob-keys.json | grep AccessKeyId | cut -d'"' -f4)
BOB_SECRET_KEY=$(cat bob-keys.json | grep SecretAccessKey | cut -d'"' -f4)

# Configure profiles
aws configure set aws_access_key_id $ALICE_ACCESS_KEY --profile alice
aws configure set aws_secret_access_key $ALICE_SECRET_KEY --profile alice

aws configure set aws_access_key_id $BOB_ACCESS_KEY --profile bob
aws configure set aws_secret_access_key $BOB_SECRET_KEY --profile bob
```

---

## Part 4: Create Test EC2 Instances (5 minutes)

### Create IAM Role for EC2

**Why?** EC2 instances should use roles, NOT access keys stored on the instance.

```bash
# Create trust policy
cat > ec2-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "ec2.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

# Create role
aws iam create-role \
  --role-name EC2-S3-ReadOnly-Role \
  --assume-role-policy-document file://ec2-trust-policy.json

# Attach S3 read-only policy
aws iam attach-role-policy \
  --role-name EC2-S3-ReadOnly-Role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# Create instance profile
aws iam create-instance-profile --instance-profile-name EC2-S3-Profile
aws iam add-role-to-instance-profile \
  --instance-profile-name EC2-S3-Profile \
  --role-name EC2-S3-ReadOnly-Role

# Wait for propagation
sleep 10
```

### Launch Test Instances

Get the latest Amazon Linux 2 AMI:
```bash
AMI_ID=$(aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2 \
  --query 'Parameter.Value' \
  --output text)

echo "Using AMI: $AMI_ID"
```

Launch development instance:
```bash
DEV_INSTANCE_ID=$(aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t2.micro \
  --iam-instance-profile Name=EC2-S3-Profile \
  --tag-specifications 'ResourceType=instance,Tags=[
    {Key=Name,Value=DevWebServer},
    {Key=Environment,Value=Development},
    {Key=Type,Value=WebServer}
  ]' \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "Development instance: $DEV_INSTANCE_ID"
```

Launch database instance:
```bash
DB_INSTANCE_ID=$(aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t2.micro \
  --tag-specifications 'ResourceType=instance,Tags=[
    {Key=Name,Value=DatabaseServer},
    {Key=Type,Value=Database},
    {Key=Environment,Value=Production}
  ]' \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "Database instance: $DB_INSTANCE_ID"
```

Wait for instances:
```bash
aws ec2 wait instance-running --instance-ids $DEV_INSTANCE_ID $DB_INSTANCE_ID
echo "✅ Instances are running!"
```

---

## Part 5: Testing IAM Permissions (10 minutes)

### Test 1: Alice (Developer) - Should Succeed

Alice should be able to manage the development instance:

```bash
# Test describing instances (should work)
aws ec2 describe-instances --profile alice

# Test stopping development instance (should SUCCEED)
aws ec2 stop-instances --instance-ids $DEV_INSTANCE_ID --profile alice
```

**Expected:** Success! Alice has permission to manage Development instances.

### Test 2: Alice (Developer) - Should Fail

Alice should NOT be able to manage the database instance:

```bash
# Test stopping database instance (should FAIL)
aws ec2 stop-instances --instance-ids $DB_INSTANCE_ID --profile alice
```

**Expected:**
```
An error occurred (UnauthorizedOperation) when calling the StopInstances operation:
You are not authorized to perform this operation.
```

**Why?** The database instance doesn't have `Environment=Development` tag!

### Test 3: Bob (DBA) - Should Succeed

Bob should be able to manage the database instance:

```bash
# Test stopping database instance (should SUCCEED)
aws ec2 stop-instances --instance-ids $DB_INSTANCE_ID --profile bob
```

**Expected:** Success! Bob has permission to manage Database instances.

### Test 4: Bob (DBA) - Should Fail

Bob should NOT be able to manage the development instance:

```bash
# Test stopping dev instance (should FAIL)
aws ec2 stop-instances --instance-ids $DEV_INSTANCE_ID --profile bob
```

**Expected:** Unauthorized error. Dev instance doesn't have `Type=Database` tag.

### Test 5: Using Policy Simulator

AWS provides a tool to test policies without actually running commands:

```bash
# Test Alice's permissions
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::${ACCOUNT_ID}:user/alice-developer \
  --action-names ec2:StopInstances \
  --resource-arns "arn:aws:ec2:*:*:instance/*" \
  --context-entries "ContextKeyName=ec2:ResourceTag/Environment,ContextKeyValues=Development,ContextKeyType=string"
```

**Or use the web interface:** https://policysim.aws.amazon.com/

---

## Part 6: Understanding the Results

### What You Learned

1. **Tag-Based Access Control**
   - Policies can restrict actions based on resource tags
   - Very powerful for implementing least privilege
   - Used in production environments for separation

2. **IAM Roles vs Access Keys**
   - EC2 instance has S3 access via role (no keys stored!)
   - Roles use temporary credentials that rotate automatically
   - Much more secure than storing keys

3. **Policy Evaluation**
   - IAM evaluates all policies attached to a user
   - Explicit deny always wins
   - Conditions add fine-grained control

4. **Groups for Scale**
   - Manage permissions at group level
   - New users inherit group permissions automatically
   - Much easier than managing individual user policies

---

## Cleanup (IMPORTANT!)

Delete all resources to avoid charges:

```bash
# Terminate instances
aws ec2 terminate-instances --instance-ids $DEV_INSTANCE_ID $DB_INSTANCE_ID

# Wait for termination
aws ec2 wait instance-terminated --instance-ids $DEV_INSTANCE_ID $DB_INSTANCE_ID

# Delete access keys
aws iam delete-access-key --user-name alice-developer --access-key-id $ALICE_ACCESS_KEY
aws iam delete-access-key --user-name bob-dbadmin --access-key-id $BOB_ACCESS_KEY

# Remove users from groups
aws iam remove-user-from-group --user-name alice-developer --group-name Developers
aws iam remove-user-from-group --user-name bob-dbadmin --group-name DatabaseAdmins
aws iam remove-user-from-group --user-name charlie-readonly --group-name ReadOnlyUsers

# Delete users
aws iam delete-user --user-name alice-developer
aws iam delete-user --user-name bob-dbadmin
aws iam delete-user --user-name charlie-readonly

# Detach policies from groups
aws iam detach-group-policy --group-name Developers --policy-arn $DEVELOPER_POLICY_ARN
aws iam detach-group-policy --group-name DatabaseAdmins --policy-arn $DB_ADMIN_POLICY_ARN
aws iam detach-group-policy --group-name ReadOnlyUsers --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess

# Delete groups
aws iam delete-group --group-name Developers
aws iam delete-group --group-name DatabaseAdmins
aws iam delete-group --group-name ReadOnlyUsers

# Delete custom policies
aws iam delete-policy --policy-arn $DEVELOPER_POLICY_ARN
aws iam delete-policy --policy-arn $DB_ADMIN_POLICY_ARN

# Delete IAM role
aws iam remove-role-from-instance-profile --instance-profile-name EC2-S3-Profile --role-name EC2-S3-ReadOnly-Role
aws iam delete-instance-profile --instance-profile-name EC2-S3-Profile
aws iam detach-role-policy --role-name EC2-S3-ReadOnly-Role --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
aws iam delete-role --role-name EC2-S3-ReadOnly-Role

# Clean up files
rm -f developer-policy.json database-admin-policy.json ec2-trust-policy.json
rm -f alice-keys.json bob-keys.json

echo "✅ Cleanup complete!"
```

---

## Key Takeaways

### 1. Least Privilege in Action
- Alice can only manage dev instances
- Bob can only manage database instances
- Policies enforce separation of duties

### 2. Tag-Based Access Control
- Simple but powerful
- Used in enterprise environments
- Easy to audit and understand

### 3. IAM Roles for EC2
- No credentials stored on instances
- Temporary credentials that rotate
- Industry best practice

### 4. Policy Evaluation
- Multiple policies can apply
- Conditions add fine-grained control
- Explicit deny always wins

---

## Bonus Challenges

1. **Add MFA Requirement**
   - Modify policies to require MFA for stop/terminate actions

2. **Time-Based Access**
   - Add condition to only allow actions during business hours

3. **IP-Based Restrictions**
   - Restrict actions to specific IP ranges

4. **Cross-Account Access**
   - Create role that can be assumed from another account

5. **Service Control Policies**
   - If you have AWS Organizations, try SCPs

---

## Additional Resources

- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [Policy Evaluation Logic](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)
- [IAM Policy Simulator](https://policysim.aws.amazon.com/)
- [Attribute-Based Access Control](https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction_attribute-based-access-control.html)

---

## Lab Complete!

You've successfully:
- ✅ Created users and groups with different permissions
- ✅ Written custom policies with tag-based conditions
- ✅ Implemented least privilege access
- ✅ Used IAM roles for EC2 instead of access keys
- ✅ Tested and validated permission boundaries

These skills are directly applicable to real-world AWS environments!
