// Simple API key-based authorizer
// In production, use JWT, OAuth, or Cognito

const API_KEYS = {
  'admin-key-cloudcart-2024': {
    role: 'admin',
    userId: 'admin-user'
  },
  'customer-key-cloudcart-2024': {
    role: 'customer',
    userId: 'customer-user'
  }
};

export const handler = async (event) => {
  console.log('Authorizer event:', JSON.stringify(event, null, 2));

  const apiKey = event.headers?.['x-api-key'] || event.headers?.['X-Api-Key'];

  if (!apiKey) {
    console.log('No API key provided');
    return generatePolicy(null, 'Deny', event.routeArn);
  }

  const user = API_KEYS[apiKey];

  if (!user) {
    console.log('Invalid API key');
    return generatePolicy(null, 'Deny', event.routeArn);
  }

  console.log('Valid API key for user:', user.userId, 'role:', user.role);

  // Check if admin role is required for this route
  const isAdminRoute = event.routeKey?.includes('/admin/');

  if (isAdminRoute && user.role !== 'admin') {
    console.log('Admin role required but user is:', user.role);
    return generatePolicy(user.userId, 'Deny', event.routeArn);
  }

  return generatePolicy(user.userId, 'Allow', event.routeArn, {
    role: user.role,
    userId: user.userId
  });
};

function generatePolicy(principalId, effect, resource, context = {}) {
  const authResponse = {
    principalId: principalId || 'unknown'
  };

  if (effect && resource) {
    authResponse.policyDocument = {
      Version: '2012-10-17',
      Statement: [{
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: resource
      }]
    };
  }

  // Add context to pass to Lambda
  authResponse.context = context;

  return authResponse;
}
