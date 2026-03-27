import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({});
const BUCKET = process.env.IMAGES_BUCKET;

export const handler = async (event) => {
  const productId = event?.pathParameters?.id;
  if (!productId) {
    return { statusCode: 400, body: 'Missing product id' };
  }

  // Generate a unique key for the image
  const key = `products/${productId}/${Date.now()}.jpg`;

  // Create a presigned URL for PUT operation
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: 'image/jpeg'
  });

  try {
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes
    const imageUrl = `https://${BUCKET}.s3.amazonaws.com/${key}`;

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        uploadUrl,
        imageUrl,
        key,
        expiresIn: 300
      })
    };
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to generate upload URL' })
    };
  }
};
