# AWS IAM Hands-On Lab 
## Implementing Least Privilege Access Control

**Duration:** 20-30 minutes

**Difficulty:** Beginner to Intermediate

---

## Lab Overview

In this hands-on lab, you'll implement production-ready IAM security patterns:
- Create users and groups following the principle of least privilege
- Write custom IAM policies with tag-based access conditions
- Configure IAM roles for EC2 instances (eliminating the need for hardcoded credentials)
- Test permission boundaries to verify access controls
- Understand how AWS evaluates IAM policies

**What you'll build:**
- 3 IAM groups with distinct permission levels (Developers, DatabaseAdmins, ReadOnlyUsers)
- 3 test users demonstrating different access patterns
- Custom IAM policies enforcing tag-based resource access
- EC2 instances configured with IAM roles for secure access
- Comprehensive test scenarios validating permission boundaries

---

## Prerequisites

Before starting this lab, ensure you have:
- An AWS account with administrative access
- AWS CLI installed and configured with your credentials
- Basic familiarity with JSON syntax
- Understanding of basic IAM concepts (users, groups, policies)

**Verify your setup:**
```bash
# Check AWS CLI is installed (version 2.x recommended)
aws --version

# Verify your credentials are configured and have admin access
aws sts get-caller-identity
```

**Expected output:** You should see your account ID and user ARN, confirming your credentials are working.

---

## Part 1: Create IAM Groups (5 minutes)

### Understanding IAM Groups

IAM groups are collections of users that share the same permissions. Instead of attaching policies to individual users, you attach them to groups—this makes permission management scalable and maintainable.

**Best Practice:** Always attach policies to groups, not directly to users. When a new team member joins, simply add them to the appropriate group.

### Create the Groups

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

**Purpose:** This policy allows developers to manage EC2 instances, but ONLY those tagged with `Environment=Development`. Developers can view all instances but can only start, stop, or reboot development instances.

Create the policy file:
```bash
cat > developer-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EC2DescribeAccess",
      "Effect": "Allow",
      "Action": [
        "ec2:Describe*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "EC2DevelopmentAccess",
      "Effect": "Allow",
      "Action": [
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
- **Two separate statements** for EC2: one for viewing (no restrictions), one for managing (tag-restricted)
- The `Condition` block enforces **tag-based access control**
- Read-only S3 access for application deployments
- Implements the **principle of least privilege**

Create the policy in AWS:
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws iam create-policy \
  --policy-name DeveloperPolicy \
  --policy-document file://developer-policy.json

DEVELOPER_POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/DeveloperPolicy"
```

**Why two statements for EC2?** The `ec2:Describe*` actions don't support resource-level permissions with tags. If we included them in the same statement as the condition, the describe operations would fail. By separating them, developers can view all instances but only manage those with the appropriate tags.

### Policy 2: Database Admin Policy

**Purpose:** This policy allows database administrators to manage database infrastructure. They can view all instances but only start, stop, or reboot instances tagged as `Type=Database`.

```bash
cat > database-admin-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EC2DescribeAccess",
      "Effect": "Allow",
      "Action": [
        "ec2:Describe*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DatabaseEC2Access",
      "Effect": "Allow",
      "Action": [
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

**Key points:**
- **Separation of concerns**: DBAs manage only database infrastructure
- Tag-based isolation prevents accidental changes to non-database resources
- Read-only RDS access for monitoring managed databases

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

This allows you to test permissions by running commands as different users.

```bash
# Extract Alice's credentials from the JSON file
ALICE_ACCESS_KEY=$(cat alice-keys.json | grep AccessKeyId | cut -d'"' -f4)
ALICE_SECRET_KEY=$(cat alice-keys.json | grep SecretAccessKey | cut -d'"' -f4)

# Extract Bob's credentials from the JSON file
BOB_ACCESS_KEY=$(cat bob-keys.json | grep AccessKeyId | cut -d'"' -f4)
BOB_SECRET_KEY=$(cat bob-keys.json | grep SecretAccessKey | cut -d'"' -f4)

# Get your current AWS region
CURRENT_REGION=$(aws configure get region)

# Configure Alice's profile
aws configure set aws_access_key_id $ALICE_ACCESS_KEY --profile alice
aws configure set aws_secret_access_key $ALICE_SECRET_KEY --profile alice
aws configure set region $CURRENT_REGION --profile alice

# Configure Bob's profile
aws configure set aws_access_key_id $BOB_ACCESS_KEY --profile bob
aws configure set aws_secret_access_key $BOB_SECRET_KEY --profile bob
aws configure set region $CURRENT_REGION --profile bob

echo "Profiles configured successfully!"
```

---

## Part 4: Create Test EC2 Instances (5 minutes)

### Create IAM Role for EC2

**Why use IAM roles instead of access keys?**
- **Security**: No credentials stored on the instance that could be compromised
- **Automatic rotation**: Temporary credentials are rotated automatically by AWS
- **Best practice**: IAM roles are the AWS-recommended way to grant permissions to applications running on EC2

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

### Test 1: Alice (Developer) - View All Instances

Alice should be able to view all instances regardless of tags:

```bash
# View all instances (should work - no tag restrictions on Describe)
aws ec2 describe-instances --profile alice \
  --query 'Reservations[*].Instances[*].[InstanceId,Tags[?Key==`Name`].Value|[0],Tags[?Key==`Environment`].Value|[0],State.Name]' \
  --output table
```

**Expected:** Success! Alice can view all instances, including both dev and database instances.

### Test 2: Alice (Developer) - Manage Development Instance

Alice should be able to stop the development instance:

```bash
# Stop development instance (should SUCCEED)
aws ec2 stop-instances --instance-ids $DEV_INSTANCE_ID --profile alice
```

**Expected:** Success! Alice has permission to manage instances tagged with `Environment=Development`.

### Test 3: Alice (Developer) - Denied Database Access

Alice should NOT be able to manage the database instance:

```bash
# Try to stop database instance (should FAIL)
aws ec2 stop-instances --instance-ids $DB_INSTANCE_ID --profile alice
```

**Expected:**
```
An error occurred (UnauthorizedOperation) when calling the StopInstances operation:
You are not authorized to perform this operation.
```

**Why does this fail?** The database instance is tagged with `Environment=Production` and `Type=Database`, but Alice's policy only allows actions on instances with `Environment=Development`. This demonstrates tag-based access control in action!

### Test 4: Bob (Database Admin) - Manage Database Instance

Bob should be able to manage the database instance:

```bash
# Stop database instance (should SUCCEED)
aws ec2 stop-instances --instance-ids $DB_INSTANCE_ID --profile bob
```

**Expected:** Success! Bob has permission to manage instances tagged with `Type=Database`.

### Test 5: Bob (Database Admin) - Denied Development Access

Bob should NOT be able to manage the development instance:

```bash
# Try to stop development instance (should FAIL)
aws ec2 stop-instances --instance-ids $DEV_INSTANCE_ID --profile bob
```

**Expected:** Unauthorized error.

**Why does this fail?** The development instance has `Type=WebServer`, but Bob's policy requires `Type=Database`. Each team is isolated to their own infrastructure!

### Test 6: Using IAM Policy Simulator (Optional)

AWS provides a policy simulator to test permissions without actually executing actions. This is useful for debugging and validating policies.

**Command-line simulator:**
```bash
# Test if Alice can stop a Development-tagged instance
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::${ACCOUNT_ID}:user/alice-developer \
  --action-names ec2:StopInstances \
  --resource-arns "arn:aws:ec2:*:*:instance/*" \
  --context-entries "ContextKeyName=ec2:ResourceTag/Environment,ContextKeyValues=Development,ContextKeyType=string"
```

**Web-based simulator:** https://policysim.aws.amazon.com/

The policy simulator is invaluable when designing complex IAM policies—you can test various scenarios without creating actual resources.

---

## Part 6: Understanding the Results

### What You Learned

**1. Tag-Based Access Control (ABAC)**
   - IAM policies can enforce permissions based on resource tags
   - Enables dynamic, scalable access control without policy updates
   - Widely used in enterprise environments for multi-team isolation
   - Example: `Environment=Development` tags limit developers to dev resources only

**2. IAM Roles vs Access Keys**
   - **With roles**: EC2 instances receive temporary, auto-rotating credentials
   - **Without roles**: Long-lived access keys stored on disk (security risk!)
   - Roles eliminate credential theft risk and management overhead
   - This is the AWS-recommended approach for applications

**3. Policy Evaluation Logic**
   - AWS evaluates all policies attached to a principal (user/role)
   - **Explicit deny always wins** over any allow
   - Conditions provide fine-grained, context-aware access control
   - Multiple policies combine—permissions are additive (unless denied)

**4. Groups Enable Scalable Permission Management**
   - Attach policies to groups, not individual users
   - New team members automatically inherit group permissions
   - Changes to group policies apply to all members instantly
   - Dramatically reduces management overhead in large organizations

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

### 1. Least Privilege Principle
✅ Alice can only manage development instances
✅ Bob can only manage database instances
✅ Both can view all resources but modify only their assigned scope
✅ Policies enforce clear separation of duties between teams

### 2. Tag-Based Access Control (Attribute-Based Access Control)
✅ Simple to implement yet powerful in practice
✅ Scales automatically as you add new resources
✅ Used extensively in enterprise AWS environments
✅ Easy to audit: "Who can access what?" is answered by tags

### 3. IAM Roles for Applications
✅ Never store access keys on EC2 instances
✅ Temporary credentials rotate automatically every few hours
✅ Industry best practice endorsed by AWS security teams
✅ Eliminates entire classes of credential theft attacks

### 4. IAM Policy Evaluation
✅ Multiple policies can apply to a single principal
✅ Permissions are additive (all allows combine)
✅ Explicit deny always overrides any allow
✅ Conditions enable context-aware, dynamic access control

---

## Bonus Challenges

Ready to take your IAM skills further? Try these advanced scenarios:

**1. Add MFA Requirement**
- Modify policies to require multi-factor authentication for destructive actions (stop/terminate)
- Hint: Use the `aws:MultiFactorAuthPresent` condition key

**2. Time-Based Access Control**
- Add conditions to only allow actions during business hours (9 AM - 5 PM)
- Hint: Use the `aws:CurrentTime` condition key

**3. IP-Based Restrictions**
- Restrict actions to specific IP ranges (e.g., office network)
- Hint: Use the `aws:SourceIp` condition key

**4. Cross-Account Access**
- Create an IAM role that can be assumed from another AWS account
- Useful for centralized management or third-party access

**5. Service Control Policies (SCPs)**
- If you have AWS Organizations, experiment with SCPs to enforce organization-wide guardrails
- SCPs override IAM policies—ultimate account-level controls

---

## Additional Resources

- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [Policy Evaluation Logic](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)
- [IAM Policy Simulator](https://policysim.aws.amazon.com/)
- [Attribute-Based Access Control](https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction_attribute-based-access-control.html)

---

## 🎉 Lab Complete!

Congratulations! You've successfully:
- ✅ Created IAM users and groups following security best practices
- ✅ Written custom IAM policies with tag-based access conditions
- ✅ Implemented the principle of least privilege
- ✅ Configured IAM roles for EC2 (eliminating hardcoded credentials)
- ✅ Tested and validated permission boundaries
- ✅ Understood how AWS evaluates IAM policies

**Real-World Impact:**
These are the exact same IAM patterns used by production AWS environments at companies of all sizes. Tag-based access control, IAM roles, and group-based permission management are foundational skills for any AWS professional.

**Next Steps:**
- Review the [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) guide
- Explore AWS IAM Identity Center (formerly AWS SSO) for enterprise user management
- Learn about AWS CloudTrail for auditing IAM actions
- Study for the AWS Certified Security - Specialty certification
