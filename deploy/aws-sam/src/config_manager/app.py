import json
import logging
import os
import boto3
import urllib3
from botocore.exceptions import ClientError

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3_client = boto3.client('s3')

def lambda_handler(event, context):
    """
    Lambda function to copy configuration files from S3 to EFS.
    Handles both CloudFormation custom resource lifecycle events and direct invocations.
    """
    logger.info(f"Received event: {json.dumps(event, default=str)}")
    
    # Check if this is a CloudFormation custom resource call or direct invocation
    is_cloudformation = 'RequestType' in event and 'ResourceProperties' in event
    
    if is_cloudformation:
        # CloudFormation custom resource call
        request_type = event.get('RequestType')
        resource_properties = event.get('ResourceProperties', {})
        s3_bucket = resource_properties.get('S3Bucket')
        s3_key = resource_properties.get('S3Key', 'configs/librechat.yaml')
    else:
        # Direct invocation - get parameters from environment or event
        logger.info("Direct invocation detected - processing config update")
        request_type = 'Update'  # Treat direct calls as updates
        s3_bucket = event.get('S3Bucket') or get_s3_bucket_from_environment()
        s3_key = event.get('S3Key', 'configs/librechat.yaml')
    
    # Configuration
    efs_mount_path = os.environ.get('EFS_MOUNT_PATH', '/mnt/efs')
    efs_file_path = os.path.join(efs_mount_path, 'librechat.yaml')
    
    response_data = {}
    
    try:
        if request_type in ['Create', 'Update']:
            logger.info(f"Processing {request_type} request")
            
            # Validate required parameters
            if not s3_bucket:
                raise ValueError("S3Bucket is required - either in ResourceProperties or environment")
            
            # Ensure EFS mount directory exists
            os.makedirs(efs_mount_path, exist_ok=True)
            logger.info(f"EFS mount path ready: {efs_mount_path}")
            
            # Download file from S3
            logger.info(f"Downloading s3://{s3_bucket}/{s3_key}")
            used_default_config = False
            try:
                s3_response = s3_client.get_object(Bucket=s3_bucket, Key=s3_key)
                file_content = s3_response['Body'].read()
                logger.info(f"Successfully downloaded {len(file_content)} bytes from S3")
            except ClientError as e:
                error_code = e.response['Error']['Code']
                if error_code == 'NoSuchKey':
                    logger.warning(f"Configuration file not found: s3://{s3_bucket}/{s3_key}")
                    logger.info("Creating default configuration file on EFS")
                    used_default_config = True
                    # Create a minimal default config if the file doesn't exist
                    file_content = b"""# Default LibreChat Configuration
# This file was created automatically because no custom config was found
version: 1.2.8
cache: false
interface:
  customWelcome: ""
"""
                elif error_code == 'NoSuchBucket':
                    logger.warning(f"S3 bucket not found: {s3_bucket}")
                    logger.info("Creating default configuration file on EFS")
                    used_default_config = True
                    # Create a minimal default config if the bucket doesn't exist
                    file_content = b"""# Default LibreChat Configuration
# This file was created automatically because S3 bucket was not accessible
version: 1.2.8
cache: false
interface:
  customWelcome: "Welcome to LibreChat! (Using Default Config - S3 Bucket Not Found)"
"""
                elif error_code == 'AccessDenied':
                    logger.warning(f"Access denied to S3: s3://{s3_bucket}/{s3_key}")
                    logger.info("Creating default configuration file on EFS")
                    used_default_config = True
                    # Create a minimal default config if access is denied
                    file_content = b"""# Default LibreChat Configuration
# This file was created automatically because S3 access was denied
version: 1.2.8
cache: false
interface:
  customWelcome: "Welcome to LibreChat! (Using Default Config - S3 Access Denied)"
"""
                else:
                    raise ValueError(f"Failed to download from S3: {str(e)}")
            
            # Write file to EFS
            logger.info(f"Writing file to EFS: {efs_file_path}")
            with open(efs_file_path, 'wb') as f:
                f.write(file_content)
            
            # Set appropriate file permissions (readable by all, writable by owner)
            os.chmod(efs_file_path, 0o644)
            logger.info(f"Set file permissions to 644 for {efs_file_path}")
            
            # Verify file was written correctly
            if os.path.exists(efs_file_path):
                file_size = os.path.getsize(efs_file_path)
                logger.info(f"File successfully written to EFS: {file_size} bytes")
                response_data['FileSize'] = file_size
                response_data['EFSPath'] = efs_file_path
                response_data['UsedDefaultConfig'] = used_default_config
                
                # For direct invocations, return success immediately
                if not is_cloudformation:
                    logger.info("Direct invocation completed successfully")
                    return {
                        'statusCode': 200,
                        'body': json.dumps({
                            'message': 'Configuration updated successfully',
                            'fileSize': file_size,
                            'efsPath': efs_file_path,
                            'usedDefaultConfig': used_default_config
                        })
                    }
            else:
                raise RuntimeError("File was not created on EFS")
                
        elif request_type == 'Delete':
            logger.info("Processing Delete request")
            # For delete operations, we could optionally remove the file
            # but it's safer to leave it in place for potential rollbacks
            if os.path.exists(efs_file_path):
                logger.info(f"Configuration file exists at {efs_file_path} (leaving in place)")
            else:
                logger.info("Configuration file not found (already removed or never created)")
        
        # Send success response to CloudFormation (only for CF calls)
        if is_cloudformation:
            send_response(event, context, 'SUCCESS', response_data)
        
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        
        # Handle errors differently for CF vs direct calls
        if is_cloudformation:
            send_response(event, context, 'FAILED', {'Error': str(e)})
        else:
            # For direct invocations, return error response
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': str(e),
                    'message': 'Configuration update failed'
                })
            }
        raise


def get_s3_bucket_from_environment():
    """
    Try to determine the S3 bucket name from the Lambda function's environment.
    This is used for direct invocations when the bucket isn't provided in the event.
    Prefers S3_BUCKET_NAME (set by the template) to avoid needing CloudFormation permissions.
    """
    # Prefer environment variable (set by CloudFormation template; no extra IAM needed)
    bucket_name = os.environ.get('S3_BUCKET_NAME')
    if bucket_name:
        logger.info(f"Found S3 bucket from environment: {bucket_name}")
        return bucket_name

    # Fallback: try to get from CloudFormation stack outputs (requires cloudformation:DescribeStacks)
    function_name = os.environ.get('AWS_LAMBDA_FUNCTION_NAME', '')
    if function_name.endswith('-config-manager'):
        stack_name = function_name[:-15]  # Remove '-config-manager'
        try:
            cf_client = boto3.client('cloudformation')
            response = cf_client.describe_stacks(StackName=stack_name)
            outputs = response['Stacks'][0].get('Outputs', [])
            for output in outputs:
                if output['OutputKey'] == 'S3BucketName':
                    bucket_name = output['OutputValue']
                    logger.info(f"Found S3 bucket from CloudFormation: {bucket_name}")
                    return bucket_name
        except Exception as e:
            logger.warning(f"Could not get S3 bucket from CloudFormation: {str(e)}")

    logger.warning("Could not determine S3 bucket name")
    return None


def send_response(event, context, response_status, response_data):
    """
    Send response to CloudFormation custom resource.
    """
    response_url = event.get('ResponseURL')
    if not response_url:
        logger.warning("No ResponseURL provided - this may be a test invocation")
        return
    
    # Prepare response payload
    response_body = {
        'Status': response_status,
        'Reason': f'See CloudWatch Log Stream: {context.log_stream_name}',
        'PhysicalResourceId': event.get('LogicalResourceId', 'ConfigManagerResource'),
        'StackId': event.get('StackId'),
        'RequestId': event.get('RequestId'),
        'LogicalResourceId': event.get('LogicalResourceId'),
        'Data': response_data
    }
    
    json_response_body = json.dumps(response_body)
    logger.info(f"Sending response to CloudFormation: {response_status}")
    logger.debug(f"Response body: {json_response_body}")
    
    try:
        # Send HTTP PUT request to CloudFormation
        http = urllib3.PoolManager()
        response = http.request(
            'PUT',
            response_url,
            body=json_response_body,
            headers={
                'Content-Type': 'application/json',
                'Content-Length': str(len(json_response_body))
            }
        )
        logger.info(f"CloudFormation response status: {response.status}")
        
    except Exception as e:
        logger.error(f"Failed to send response to CloudFormation: {str(e)}")
        raise