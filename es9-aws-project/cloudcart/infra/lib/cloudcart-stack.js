
import { Stack, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as node from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwInt from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const L = (p) => path.join(__dirname, '../../services', p);

export class CloudCartStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    // S3 Bucket for Product Images
    const imagesBucket = new s3.Bucket(this, 'ProductImagesBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: true,
      cors: [{
        allowedOrigins: ['*'],
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
        allowedHeaders: ['*'],
        exposedHeaders: ['ETag']
      }],
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false
      })
    });

    // DynamoDB Products
    const products = new dynamodb.Table(this, 'ProductsTableName', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });
    products.addGlobalSecondaryIndex({
      indexName: 'gsi_category',
      partitionKey: { name: 'category', type: dynamodb.AttributeType.STRING }
    });

    // DynamoDB Orders with Streams
    const orders = new dynamodb.Table(this, 'OrdersTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // SQS Queue for checkout (+ DLQ)
    const dlq = new sqs.Queue(this, 'CheckoutDLQ', { retentionPeriod: Duration.days(14) });
    const checkoutQueue = new sqs.Queue(this, 'CheckoutQueue', {
      visibilityTimeout: Duration.seconds(60),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 }
    });

    // HTTP API
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'cloudcart-mvp-http',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['*']
      }
    });

    const defaultFnProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: Duration.seconds(15),
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: { minify: true, format: node.OutputFormat.ESM }
    };

    // Lambdas
    const getProducts = new node.NodejsFunction(this, 'GetProductsFn', {
      entry: L('products/getProducts.js'),
      environment: { PRODUCTS_TABLE: products.tableName },
      ...defaultFnProps
    });
    products.grantReadData(getProducts);
    getProducts.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*']
    }));

    const getProductById = new node.NodejsFunction(this, 'GetProductByIdFn', {
      entry: L('products/getProductById.js'),
      environment: { PRODUCTS_TABLE: products.tableName },
      ...defaultFnProps
    });
    products.grantReadData(getProductById);

    const generateUploadUrl = new node.NodejsFunction(this, 'GenerateUploadUrlFn', {
      entry: L('products/generateUploadUrl.js'),
      environment: { IMAGES_BUCKET: imagesBucket.bucketName },
      ...defaultFnProps
    });
    imagesBucket.grantPut(generateUploadUrl);

    const listByCategory = new node.NodejsFunction(this, 'ListByCategoryFn', {
      entry: L('products/listByCategory.js'),
      environment: { PRODUCTS_TABLE: products.tableName },
      ...defaultFnProps
    });
    products.grantReadData(listByCategory);

    const cart = new node.NodejsFunction(this, 'CartFn', {
      entry: L('cart/handler.js'),
      ...defaultFnProps
    });
    cart.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*']
    }));

    const checkout = new node.NodejsFunction(this, 'CheckoutFn', {
      entry: L('orders/checkout.js'),
      environment: { CHECKOUT_QUEUE_URL: checkoutQueue.queueUrl },
      ...defaultFnProps
    });
    checkoutQueue.grantSendMessages(checkout);
    checkout.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*']
    }));

    const worker = new node.NodejsFunction(this, 'WorkerFn', {
      entry: L('orders/worker.js'),
      environment: { ORDERS_TABLE: orders.tableName },
      ...defaultFnProps,
      timeout: Duration.seconds(60),
      memorySize: 1024
    });
    checkoutQueue.grantConsumeMessages(worker);
    worker.addEventSource(new lambdaEventSources.SqsEventSource(checkoutQueue, {batchSize: 10}));
    orders.grantWriteData(worker);
    worker.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*']
    }));

    const streamProcessor = new node.NodejsFunction(this, 'StreamProcessorFn', {
      entry: L('orders/streamProcessor.js'),
      ...defaultFnProps,
      timeout: Duration.seconds(30)
    });
    streamProcessor.addEventSource(new lambdaEventSources.DynamoEventSource(orders, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 10,
      retryAttempts: 2
    }));

    const getOrders = new node.NodejsFunction(this, 'GetOrdersFn', {
      entry: L('orders/getOrders.js'),
      environment: { ORDERS_TABLE: orders.tableName },
      ...defaultFnProps
    });
    orders.grantReadData(getOrders);

    const getOrderById = new node.NodejsFunction(this, 'GetOrderByIdFn', {
      entry: L('orders/getOrderById.js'),
      environment: { ORDERS_TABLE: orders.tableName },
      ...defaultFnProps
    });
    orders.grantReadData(getOrderById);

    // Lambda Authorizer
    const authorizer = new node.NodejsFunction(this, 'AuthorizerFn', {
      entry: L('auth/authorizer.js'),
      ...defaultFnProps
    });

    const authorizerConfig = new apigwv2.CfnAuthorizer(this, 'ApiAuthorizer', {
      apiId: httpApi.apiId,
      authorizerType: 'REQUEST',
      authorizerUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${authorizer.functionArn}/invocations`,
      name: 'CloudCartAuthorizer',
      identitySource: ['$request.header.x-api-key'],
      authorizerPayloadFormatVersion: '2.0',
      enableSimpleResponses: false,
      authorizerResultTtlInSeconds: 300
    });

    authorizer.addPermission('AuthorizerInvokePermission', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${httpApi.apiId}/*`
    });

    // Admin Lambda Functions
    const createProduct = new node.NodejsFunction(this, 'CreateProductFn', {
      entry: L('admin/createProduct.js'),
      environment: { PRODUCTS_TABLE: products.tableName },
      ...defaultFnProps
    });
    products.grantWriteData(createProduct);

    const updateProduct = new node.NodejsFunction(this, 'UpdateProductFn', {
      entry: L('admin/updateProduct.js'),
      environment: { PRODUCTS_TABLE: products.tableName },
      ...defaultFnProps
    });
    products.grantReadWriteData(updateProduct);

    const deleteProduct = new node.NodejsFunction(this, 'DeleteProductFn', {
      entry: L('admin/deleteProduct.js'),
      environment: { PRODUCTS_TABLE: products.tableName },
      ...defaultFnProps
    });
    products.grantReadWriteData(deleteProduct);

    // Routes
    const integ = (fn) => new apigwInt.HttpLambdaIntegration(`${fn.node.id}Int`, fn);
    httpApi.addRoutes({ path: '/products', methods: [apigwv2.HttpMethod.GET], integration: integ(getProducts) });
    httpApi.addRoutes({ path: '/products/{id}', methods: [apigwv2.HttpMethod.GET], integration: integ(getProductById) });
    httpApi.addRoutes({ path: '/products/{id}/upload-url', methods: [apigwv2.HttpMethod.POST], integration: integ(generateUploadUrl) });
    httpApi.addRoutes({ path: '/categories/{name}', methods: [apigwv2.HttpMethod.GET], integration: integ(listByCategory) });

    httpApi.addRoutes({ path: '/cart', methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.DELETE], integration: integ(cart) });
    httpApi.addRoutes({ path: '/checkout', methods: [apigwv2.HttpMethod.POST], integration: integ(checkout) });
    httpApi.addRoutes({ path: '/orders', methods: [apigwv2.HttpMethod.GET], integration: integ(getOrders) });
    httpApi.addRoutes({ path: '/orders/{id}', methods: [apigwv2.HttpMethod.GET], integration: integ(getOrderById) });

    // Admin routes (protected by authorizer)
    const adminRoute1 = httpApi.addRoutes({
      path: '/admin/products',
      methods: [apigwv2.HttpMethod.POST],
      integration: integ(createProduct)
    });
    const adminRoute2 = httpApi.addRoutes({
      path: '/admin/products/{id}',
      methods: [apigwv2.HttpMethod.PATCH],
      integration: integ(updateProduct)
    });
    const adminRoute3 = httpApi.addRoutes({
      path: '/admin/products/{id}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: integ(deleteProduct)
    });

    // Attach authorizer to admin routes
    for (const route of [...adminRoute1, ...adminRoute2, ...adminRoute3]) {
      const cfnRoute = route.node.defaultChild;
      cfnRoute.authorizerId = authorizerConfig.ref;
      cfnRoute.authorizationType = 'CUSTOM';
    }

    // SNS Topic for Alarms
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      displayName: 'CloudCart Alarms'
    });
    // To subscribe via email: alarmTopic.addSubscription(new subscriptions.EmailSubscription('your-email@example.com'));

    // CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'CloudCartDashboard', {
      dashboardName: 'CloudCart-Metrics'
    });

    // Add widgets to dashboard
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway Requests',
        left: [
          httpApi.metricCount(),
          httpApi.metricClientError(),
          httpApi.metricServerError()
        ],
        width: 12
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        left: [checkout.metricErrors(), worker.metricErrors(), getProducts.metricErrors()],
        width: 12
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration',
        left: [checkout.metricDuration(), worker.metricDuration()],
        width: 12
      }),
      new cloudwatch.GraphWidget({
        title: 'SQS Queue Depth',
        left: [checkoutQueue.metricApproximateNumberOfMessagesVisible()],
        width: 12
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        left: [checkout.metricInvocations(), worker.metricInvocations(), cart.metricInvocations()],
        width: 12
      }),
      new cloudwatch.GraphWidget({
        title: 'DLQ Messages',
        left: [dlq.metricApproximateNumberOfMessagesVisible()],
        width: 12
      })
    );

    // CloudWatch Alarms
    const apiErrorAlarm = new cloudwatch.Alarm(this, 'ApiErrorAlarm', {
      metric: httpApi.metricServerError({ statistic: 'sum', period: Duration.minutes(5) }),
      threshold: 10,
      evaluationPeriods: 1,
      alarmDescription: 'Alert when API 5xx errors exceed threshold',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    apiErrorAlarm.addAlarmAction(new actions.SnsAction(alarmTopic));

    const queueDepthAlarm = new cloudwatch.Alarm(this, 'QueueDepthAlarm', {
      metric: checkoutQueue.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) }),
      threshold: 100,
      evaluationPeriods: 2,
      alarmDescription: 'Alert when queue depth is too high',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    queueDepthAlarm.addAlarmAction(new actions.SnsAction(alarmTopic));

    const workerErrorAlarm = new cloudwatch.Alarm(this, 'WorkerErrorAlarm', {
      metric: worker.metricErrors({ statistic: 'sum', period: Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: 'Alert when worker function has too many errors',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    workerErrorAlarm.addAlarmAction(new actions.SnsAction(alarmTopic));

    // VPC for ECS/Fargate (minimal setup with public subnets only)
    const vpc = new ec2.Vpc(this, 'CloudCartVpc', {
      maxAzs: 2,
      natGateways: 0, // No NAT Gateway to keep costs down
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC
        }
      ]
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'AdminCluster', {
      vpc,
      clusterName: 'cloudcart-admin-cluster'
    });

    // Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'AdminTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256
    });

    // Grant DynamoDB read permissions to task
    products.grantReadData(taskDefinition.taskRole);
    orders.grantReadData(taskDefinition.taskRole);

    // Container - we'll use a placeholder image first, students will build and push their own
    const container = taskDefinition.addContainer('AdminDashboard', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:22-alpine'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'admin-dashboard',
        logRetention: logs.RetentionDays.ONE_WEEK
      }),
      environment: {
        PORT: '3000',
        PRODUCTS_TABLE: products.tableName,
        ORDERS_TABLE: orders.tableName,
        API_URL: httpApi.apiEndpoint,
        AWS_REGION: this.region
      },
      command: [
        'sh', '-c',
        'echo "Container started - Replace with admin dashboard image" && while true; do sleep 30; done'
      ]
    });

    container.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP
    });

    // Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'AdminALB', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'cloudcart-admin-alb'
    });

    const listener = alb.addListener('HttpListener', {
      port: 80,
      open: true
    });

    // Fargate Service
    const service = new ecs.FargateService(this, 'AdminService', {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true, // Required since we're in public subnets without NAT
      serviceName: 'admin-dashboard-service'
    });

    // Target Group
    const targetGroup = listener.addTargets('AdminTarget', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: '/health',
        interval: Duration.seconds(60),
        timeout: Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3
      }
    });

    // ECR Repository for admin dashboard (optional, students can push their image here)
    const ecrRepo = new ecr.Repository(this, 'AdminDashboardRepo', {
      repositoryName: 'cloudcart-admin-dashboard',
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true
    });

    new CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });
    new CfnOutput(this, 'ProductsTable', { value: products.tableName });
    new CfnOutput(this, 'OrdersTableName', { value: orders.tableName });
    new CfnOutput(this, 'ImagesBucket', { value: imagesBucket.bucketName });
    new CfnOutput(this, 'AlarmTopicArn', { value: alarmTopic.topicArn });
    new CfnOutput(this, 'DashboardUrl', { value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=CloudCart-Metrics` });
    new CfnOutput(this, 'AdminDashboardUrl', { value: `http://${alb.loadBalancerDnsName}` });
    new CfnOutput(this, 'ECRRepositoryUri', { value: ecrRepo.repositoryUri });
    new CfnOutput(this, 'ECSClusterName', { value: cluster.clusterName });
  }
}
