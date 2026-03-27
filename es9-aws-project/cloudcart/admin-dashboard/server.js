import express from 'express';
import { DynamoDBClient, ScanCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const app = express();
const port = process.env.PORT || 3000;

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE;
const ORDERS_TABLE = process.env.ORDERS_TABLE;
const API_URL = process.env.API_URL;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Home page
app.get('/', (req, res) => {
  res.render('index', {
    title: 'CloudCart Admin Dashboard',
    apiUrl: API_URL
  });
});

// Products page
app.get('/products', async (req, res) => {
  try {
    const result = await ddb.send(new ScanCommand({
      TableName: PRODUCTS_TABLE,
      Limit: 100
    }));

    const products = (result.Items || []).map(unmarshall);

    res.render('products', {
      title: 'Products',
      products,
      apiUrl: API_URL
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).render('error', {
      title: 'Error',
      error: 'Failed to fetch products'
    });
  }
});

// Orders page
app.get('/orders', async (req, res) => {
  try {
    const result = await ddb.send(new ScanCommand({
      TableName: ORDERS_TABLE,
      Limit: 50
    }));

    const orders = (result.Items || []).map(unmarshall).sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    res.render('orders', {
      title: 'Orders',
      orders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).render('error', {
      title: 'Error',
      error: 'Failed to fetch orders'
    });
  }
});

// Metrics page (CloudWatch embedded)
app.get('/metrics', (req, res) => {
  const region = process.env.AWS_REGION || 'us-east-1';
  const dashboardUrl = `https://console.aws.amazon.com/cloudwatch/home?region=${region}#dashboards:name=CloudCart-Metrics`;

  res.render('metrics', {
    title: 'Metrics & Monitoring',
    dashboardUrl,
    region
  });
});

// API endpoint to get stats
app.get('/api/stats', async (req, res) => {
  try {
    const [productsResult, ordersResult] = await Promise.all([
      ddb.send(new ScanCommand({ TableName: PRODUCTS_TABLE, Select: 'COUNT' })),
      ddb.send(new ScanCommand({ TableName: ORDERS_TABLE, Select: 'COUNT' }))
    ]);

    res.json({
      totalProducts: productsResult.Count || 0,
      totalOrders: ordersResult.Count || 0
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.listen(port, () => {
  console.log(`CloudCart Admin Dashboard running on port ${port}`);
  console.log(`Environment:`);
  console.log(`  PRODUCTS_TABLE: ${PRODUCTS_TABLE}`);
  console.log(`  ORDERS_TABLE: ${ORDERS_TABLE}`);
  console.log(`  API_URL: ${API_URL}`);
  console.log(`  AWS_REGION: ${process.env.AWS_REGION || 'us-east-1'}`);
});
