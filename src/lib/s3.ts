import { S3Client } from '@aws-sdk/client-s3';

const endpoint = process.env.S3_ENDPOINT || 's3.eu-central-003.backblazeb2.com';
const formattedEndpoint = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;

const s3 = new S3Client({
  endpoint: formattedEndpoint,
  region: process.env.S3_REGION || 'eu-central-003',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  },
});

export default s3;
