#!/usr/bin/env node

console.log('CloudCart API Keys for Testing\n');
console.log('================================\n');

console.log('Admin API Key (full access):');
console.log('  x-api-key: admin-key-cloudcart-2024\n');

console.log('Customer API Key (read-only):');
console.log('  x-api-key: customer-key-cloudcart-2024\n');

console.log('Usage examples:\n');

console.log('# Test admin access (should succeed):');
console.log('curl -X POST $API/admin/products \\');
console.log('  -H "x-api-key: admin-key-cloudcart-2024" \\');
console.log('  -H "Content-Type: application/json" \\');
console.log('  -d \'{"id":"4","name":"Laptop","price":999.99,"category":"electronics"}\'\n');

console.log('# Test customer access to admin endpoint (should fail):');
console.log('curl -X POST $API/admin/products \\');
console.log('  -H "x-api-key: customer-key-cloudcart-2024" \\');
console.log('  -H "Content-Type: application/json" \\');
console.log('  -d \'{"id":"4","name":"Laptop","price":999.99,"category":"electronics"}\'\n');

console.log('# Test without API key (should fail):');
console.log('curl -X POST $API/admin/products \\');
console.log('  -H "Content-Type: application/json" \\');
console.log('  -d \'{"id":"4","name":"Laptop","price":999.99,"category":"electronics"}\'\n');
