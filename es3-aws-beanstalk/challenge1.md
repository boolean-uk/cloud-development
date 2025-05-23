
# Deploy Spring Boot App to AWS Elastic Beanstalk

## Overview
This guide explains how to deploy a simple Spring Boot Java application to AWS Elastic Beanstalk using a JAR file.

## Prerequisites
- Java 17 installed
- Maven installed
- AWS CLI configured
- Elastic Beanstalk CLI (optional but recommended)

## 1. Clone or Create Spring Boot App
```bash
git clone https://github.com/your-repo/spring-boot-beanstalk-demo.git
cd spring-boot-beanstalk-demo
```
Or create a new app with the following content.

### `src/main/java/com/example/demo/DemoApplication.java`
```java
package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.*;

@SpringBootApplication
@RestController
public class DemoApplication {
    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }

    @GetMapping("/")
    public String home() {
        return "Hello from AWS Elastic Beanstalk!";
    }
}
```

### `pom.xml`
Ensure packaging is `jar` and include the Spring Boot starter dependencies.

```xml
<packaging>jar</packaging>
...
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
</dependencies>
```

## 2. Build Your App
```bash
./mvnw clean package
```

## 3. Create a `Procfile`
```bash
echo "web: java -jar target/demo-0.0.1-SNAPSHOT.jar" > Procfile
```

## 4. Package for Deployment
Make sure the following are present in your root directory:
- `Procfile`
- `target/demo-0.0.1-SNAPSHOT.jar`
- `pom.xml`

Then zip them:
```bash
zip -r demo-app.zip * .[^.]*
```

## 5. Deploy to Elastic Beanstalk
### Using AWS Console
- Go to [AWS Elastic Beanstalk Console](https://console.aws.amazon.com/elasticbeanstalk)
- Create an application and environment
- Choose Java platform (e.g., Corretto 17)
- Upload your `demo-app.zip`

### OR Using EB CLI
```bash
eb init -p java demo-app
# Answer configuration prompts

eb create demo-env
# Deploy your zipped file

eb deploy
```

## 6. Access the Application
Navigate to the environment URL provided by AWS (e.g., `http://demo-env.us-east-1.elasticbeanstalk.com`) to see:
```
Hello from AWS Elastic Beanstalk!
```

## 7. Clean Up
```bash
eb terminate demo-env
```
