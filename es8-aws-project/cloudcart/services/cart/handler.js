const carts = {}; // in-memory (per warm container)

export const handler = async (event) => {
  const user = event.requestContext?.http?.sourceIp || 'anon';
  carts[user] ||= [];

  const method = event.requestContext?.http?.method || 'GET';
  if (method === 'GET') {
    return json(200, {items: carts[user]});
  }

  const body = JSON.parse(event.body || '{}');
  if (method === 'POST') {
    if (!body.id || !body.qty) {
      return text(400, 'id & qty required');
    }
    const idx = carts[user].findIndex(i => i.id === body.id);
    if (idx >= 0) {
      carts[user][idx].qty += body.qty;
    } else {
      carts[user].push({id: body.id, qty: body.qty});
    }
    return json(200, {items: carts[user]});
  }
  if (method === 'DELETE') {
    if (!body.id) {
      return text(400, 'id required');
    }
    const idx = carts[user].findIndex(i => i.id === body.id);
    if (idx >= 0) {
      carts[user].splice(idx, 1);
    }
    return json(200, {items: carts[user]});
  }
  return text(405, 'Method not allowed');
};

const json = (code, obj) => ({
  statusCode: code,
  headers: {'content-type': 'application/json'},
  body: JSON.stringify(obj)
});
const text = (code, msg) => ({statusCode: code, body: msg});
