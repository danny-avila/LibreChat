my_config = Config(
 region_name = 'us-east-1',
 signature_version = 'v4',
 retries = {
 'max_attempts': 10,
 'mode': 'standard'
 }
)

client = boto3.client('bedrock', config=my_config)

response = client.create_inference_profile(
 inferenceProfileName='string',
 description='string',
 clientRequestToken='string',
 modelSource={
 'copyFrom': "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-haiku-20241022-v1:0"
 },
 tags=[
 {
 'key': 'creator',
 'value': 'nikitafe'
 },
 ]
)

import boto3

# Initialize the Bedrock client
bedrock = boto3.client(service_name='bedrock')

# Define the parameters for the inference profile
inference_profile_name = 'MyBedrockAppProfile'
description = 'Application inference profile for tracking costs of a specific application.'
# Replace with the actual ARN of the foundation model you want to associate
# You can get this from the Bedrock console or by using list_foundation_models()
model_arn = 'arn:aws:bedrock:us-west-2:007376685526:inference-profile/us.anthropic.claude-3-sonnet-20240229-v1:0' 
tags = [
    {'key': 'ProfileOwner', 'value': 'nikitafe'},
    {'key': 'Project', 'value': 'LibreChat'}
]

try:
    # Call the create_inference_profile API
    response = bedrock.create_inference_profile(
        inferenceProfileName=inference_profile_name,
        description=description,
        modelSource={
            'copyFrom': model_arn  # Use 'copyFrom' to specify the model ARN
        },
        tags=tags
    )
    print(f"Application inference profile '{inference_profile_name}' created successfully.")
    print(response)

except Exception as e:
    print(f"Error creating application inference profile: {e}")
