export const handler = async (event) => {
  for (const rec of (event.Records || [])) {
    const msg = JSON.parse(rec.body);
    console.log('Order received:', msg);
  }
  return {};
};
