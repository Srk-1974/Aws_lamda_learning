// index.mjs — Node.js 20.x runtime (ESM format)
// Note: @aws-sdk/* is BUILT-IN to AWS Lambda Node 18 & 20 runtimes! No npm install needed!
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

// 1. Initialize SDK clients OUTSIDE the handler for TCP socket reuse
const s3Client = new S3Client({});
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

export const handler = async (event, context) => {
  console.log("Incoming S3 Event:", JSON.stringify(event, null, 2));

  // 2. Parse S3 Event records
  const record = event.Records?.[0];
  if (!record) {
    throw new Error("No S3 records found in event payload.");
  }

  const bucketName = record.s3.bucket.name;
  // Decode URL-encoded key (spaces replaced by + or %20)
  const fileKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
  const fileSize = record.s3.object.size || 0;

  // 3. Prevent recursive billing loops
  if (fileKey.startsWith("thumbnails/")) {
    console.log("File is already in thumbnails folder. Skipping execution.");
    return { statusCode: 200, body: "Skipped recursive loop" };
  }

  // 4. Fetch image metadata from Amazon S3
  const headCmd = new HeadObjectCommand({
    Bucket: bucketName,
    Key: fileKey
  });
  const s3Meta = await s3Client.send(headCmd);
  const contentType = s3Meta.ContentType || "image/jpeg";

  // 5. Persist indexed metadata into Amazon DynamoDB table
  const putCmd = new PutCommand({
    TableName: "ImageMetadata",
    Item: {
      ImageId: fileKey,
      Bucket: bucketName,
      FileSize: fileSize,
      ContentType: contentType,
      UploadedAt: Math.floor(Date.now() / 1000),
      Status: "PROCESSED"
    }
  });

  await docClient.send(putCmd);
  console.log(`Successfully recorded metadata for ${fileKey} into DynamoDB!`);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Image processed successfully via Node.js 20.x",
      fileKey,
      sizeBytes: fileSize
    })
  };
};
