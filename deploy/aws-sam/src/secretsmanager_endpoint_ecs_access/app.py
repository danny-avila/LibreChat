"""
CloudFormation custom resource: add this stack's ECS security group to an existing
Secrets Manager VPC endpoint's security group so ECS tasks can pull secrets.
Runs during stack create/update (after ECSSecurityGroup exists, before ECS Service).
"""
import json
import logging
import urllib3
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)
ec2 = boto3.client('ec2')


def lambda_handler(event, context):
    request_type = event.get('RequestType')
    props = event.get('ResourceProperties', {})
    endpoint_sg_id = (props.get('EndpointSecurityGroupId') or '').strip()
    ecs_sg_id = (props.get('EcsSecurityGroupId') or '').strip()
    response_data = {}

    try:
        if request_type in ('Create', 'Update'):
            if endpoint_sg_id and ecs_sg_id:
                logger.info(
                    "Adding ingress to endpoint SG %s: TCP 443 from ECS SG %s",
                    endpoint_sg_id, ecs_sg_id
                )
                try:
                    ec2.authorize_security_group_ingress(
                        GroupId=endpoint_sg_id,
                        IpPermissions=[{
                            'IpProtocol': 'tcp',
                            'FromPort': 443,
                            'ToPort': 443,
                            'UserIdGroupPairs': [{'GroupId': ecs_sg_id}],
                        }],
                    )
                    response_data['RuleAdded'] = 'true'
                except ClientError as e:
                    if e.response['Error']['Code'] == 'InvalidPermission.Duplicate':
                        logger.info("Rule already exists, no change")
                        response_data['RuleAdded'] = 'already_exists'
                    else:
                        raise
            else:
                logger.info(
                    "EndpointSecurityGroupId or EcsSecurityGroupId empty; skipping (no-op)"
                )
        elif request_type == 'Delete':
            if endpoint_sg_id and ecs_sg_id:
                try:
                    ec2.revoke_security_group_ingress(
                        GroupId=endpoint_sg_id,
                        IpPermissions=[{
                            'IpProtocol': 'tcp',
                            'FromPort': 443,
                            'ToPort': 443,
                            'UserIdGroupPairs': [{'GroupId': ecs_sg_id}],
                        }],
                    )
                    response_data['RuleRevoked'] = 'true'
                except ClientError as e:
                    if e.response['Error']['Code'] in (
                        'InvalidPermission.NotFound', 'InvalidGroup.NotFound'
                    ):
                        logger.info("Rule or group already gone, ignoring")
                    else:
                        logger.warning("Revoke failed (non-fatal): %s", e)
        send_response(event, context, 'SUCCESS', response_data)
    except Exception as e:
        logger.error("Error: %s", e, exc_info=True)
        send_response(event, context, 'FAILED', {'Error': str(e)})
        raise


def send_response(event, context, response_status, response_data):
    response_url = event.get('ResponseURL')
    if not response_url:
        return
    body = {
        'Status': response_status,
        'Reason': f'See CloudWatch Log Stream: {context.log_stream_name}',
        'PhysicalResourceId': event.get('LogicalResourceId', 'SecretsManagerEndpointEcsAccess'),
        'StackId': event.get('StackId'),
        'RequestId': event.get('RequestId'),
        'LogicalResourceId': event.get('LogicalResourceId'),
        'Data': response_data,
    }
    http = urllib3.PoolManager()
    http.request(
        'PUT', response_url,
        body=json.dumps(body),
        headers={'Content-Type': 'application/json'},
    )
