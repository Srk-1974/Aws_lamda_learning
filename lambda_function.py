import json
import urllib.parse
import boto3
import time

# Initialize SDK clients OUTSIDE the handler for connection reuse across warm starts
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('ImageMetadata')

def lambda_handler(event, context):
    """
    Main Lambda entry point executed automatically upon S3 file upload.
    """
    print(f"Received event: {json.dumps(event)}")
    
    # 1. Extract Bucket Name and Key from incoming Event payload
    record = event['Records'][0]
    bucket_name = record['s3']['bucket']['name']
    file_key = urllib.parse.unquote_plus(record['s3']['object']['key'])
    file_size = record['s3']['object'].get('size', 0)
    
    # Prevent recursive loops (ignore files already in 'thumbnails/' prefix)
    if file_key.startswith('thumbnails/'):
        print("File is already a thumbnail. Skipping processing.")
        return {'statusCode': 200, 'body': 'Skipped thumbnail recursive loop'}

    # 2. Fetch image metadata from S3
    response = s3_client.head_object(Bucket=bucket_name, Key=file_key)
    content_type = response.get('ContentType', 'image/jpeg')

    # 3. Persist record into Amazon DynamoDB table
    item = {
        'ImageId': file_key,
        'Bucket': bucket_name,
        'FileSize': file_size,
        'ContentType': content_type,
        'UploadedAt': int(time.time()),
        'Status': 'PROCESSED'
    }
    table.put_item(Item=item)
    print(f"Successfully recorded metadata for {file_key} into DynamoDB!")

    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'Image processed successfully via Python 3.12',
            'fileKey': file_key,
            'sizeBytes': file_size
        })
    }
