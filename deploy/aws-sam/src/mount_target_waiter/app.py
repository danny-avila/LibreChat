import json
import logging
import boto3
import urllib3
import time
from botocore.exceptions import ClientError

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
efs_client = boto3.client('efs')

def lambda_handler(event, context):
    """
    Lambda function to wait for EFS mount targets to be available.
    This ensures mount targets are ready before other resources try to use them.
    """
    logger.info(f"Received event: {json.dumps(event, default=str)}")
    
    # Extract CloudFormation custom resource properties
    request_type = event.get('RequestType')
    resource_properties = event.get('ResourceProperties', {})
    
    # Configuration
    file_system_id = resource_properties.get('FileSystemId')
    
    response_data = {}
    
    try:
        if request_type in ['Create', 'Update']:
            logger.info(f"Processing {request_type} request")
            
            # Validate required parameters
            if not file_system_id:
                raise ValueError("FileSystemId is required in ResourceProperties")
            
            # Wait for mount targets to be available
            logger.info(f"Waiting for mount targets to be available for EFS: {file_system_id}")
            
            max_wait_time = 300  # 5 minutes
            start_time = time.time()
            
            while time.time() - start_time < max_wait_time:
                try:
                    # Get mount targets for the file system
                    response = efs_client.describe_mount_targets(FileSystemId=file_system_id)
                    mount_targets = response.get('MountTargets', [])
                    
                    if not mount_targets:
                        logger.info("No mount targets found yet, waiting...")
                        time.sleep(10)
                        continue
                    
                    # Check if all mount targets are available
                    all_available = True
                    for mt in mount_targets:
                        state = mt.get('LifeCycleState')
                        logger.info(f"Mount target {mt.get('MountTargetId')} state: {state}")
                        if state != 'available':
                            all_available = False
                            break
                    
                    if all_available:
                        logger.info("All mount targets are available!")
                        response_data['MountTargetsReady'] = True
                        response_data['MountTargetCount'] = len(mount_targets)
                        break
                    else:
                        logger.info("Some mount targets are not ready yet, waiting...")
                        time.sleep(10)
                        
                except ClientError as e:
                    logger.warning(f"Error checking mount targets: {e}")
                    time.sleep(10)
            else:
                # Timeout reached
                raise RuntimeError(f"Mount targets did not become available within {max_wait_time} seconds")
                
        elif request_type == 'Delete':
            logger.info("Processing Delete request - nothing to do")
            response_data['Status'] = 'Deleted'
        
        # Send success response to CloudFormation
        send_response(event, context, 'SUCCESS', response_data)
        
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        # Send failure response to CloudFormation
        send_response(event, context, 'FAILED', {'Error': str(e)})
        raise


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
        'PhysicalResourceId': event.get('LogicalResourceId', 'MountTargetWaiterResource'),
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