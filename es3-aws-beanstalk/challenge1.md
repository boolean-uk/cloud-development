
# Deploy Spring Boot App to AWS Elastic Beanstalk

## Overview
This guide explains how to deploy a simple Spring Boot Java application to AWS Elastic Beanstalk using a JAR file.

## Prerequisites
- Java 21 installed
- Maven installed (optional but recommended)

## 1. Clone the repository
```bash
git clone git@github.com:boolean-uk/cloud-development.git
cd es3-aws-beanstalk/demo
```

## 2. Build Your App
```bash
./mvnw clean package
```

## 3. Deploy to Elastic Beanstalk
- Go to [AWS Elastic Beanstalk Console](https://console.aws.amazon.com/elasticbeanstalk)
- Create an application and environment
- Choose Java platform (e.g., Corretto 21)
- Upload your `target/demo-beanstalk-0.0.1-SNAPSHOT.jar`

## 4. Add PORT env variable
- Go to newly created environment **Configuration > Updates, monitoring, and logging**
- Select Edit
- Go to the Environment properties section 
- Add PORT as Name and 8080 as value
- Click Apply

## 6. Access the Application
Navigate to the environment URL provided by AWS (e.g., `http://demo-env.eu-west-1.elasticbeanstalk.com`) to see:
```
Hello from AWS Elastic Beanstalk!
```

## 7. Clean Up
Terminate the environment
