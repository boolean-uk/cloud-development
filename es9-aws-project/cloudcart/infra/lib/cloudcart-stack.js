
import { Stack, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as node from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwInt from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const L = (p) => path.join(__dirname, '../../services', p);

export class CloudCartStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

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

    const getProductById = new node.NodejsFunction(this, 'GetProductByIdFn', {
      entry: L('products/getProductById.js'),
      environment: { PRODUCTS_TABLE: products.tableName },
      ...defaultFnProps
    });
    products.grantReadData(getProductById);

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

    const checkout = new node.NodejsFunction(this, 'CheckoutFn', {
      entry: L('orders/checkout.js'),
      environment: { CHECKOUT_QUEUE_URL: checkoutQueue.queueUrl },
      ...defaultFnProps
    });
    checkoutQueue.grantSendMessages(checkout);

    const worker = new node.NodejsFunction(this, 'WorkerFn', {
      entry: L('orders/worker.js'),
      ...defaultFnProps,
      timeout: Duration.seconds(60),
      memorySize: 1024
    });
    checkoutQueue.grantConsumeMessages(worker);
    worker.addEventSource(new lambdaEventSources.SqsEventSource(checkoutQueue, {batchSize: 10}));

    // Routes
    const integ = (fn) => new apigwInt.HttpLambdaIntegration(`${fn.node.id}Int`, fn);
    httpApi.addRoutes({ path: '/products', methods: [apigwv2.HttpMethod.GET], integration: integ(getProducts) });
    httpApi.addRoutes({ path: '/products/{id}', methods: [apigwv2.HttpMethod.GET], integration: integ(getProductById) });
    httpApi.addRoutes({ path: '/categories/{name}', methods: [apigwv2.HttpMethod.GET], integration: integ(listByCategory) });

    httpApi.addRoutes({ path: '/cart', methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.DELETE], integration: integ(cart) });
    httpApi.addRoutes({ path: '/checkout', methods: [apigwv2.HttpMethod.POST], integration: integ(checkout) });

    new CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });
    new CfnOutput(this, 'ProductsTable', { value: products.tableName });
  }
}
