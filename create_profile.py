import boto3

# Initialize the Bedrock client
bedrock = boto3.client(service_name='bedrock')

# Define the parameters for the inference profile
inference_profile_name = 'MyBedrockAppProfile'
description = 'Application inference profile for tracking costs of a specific application.'
# Replace with the actual ARN of the foundation model you want to associate
# You can get this from the Bedrock console or by using list_foundation_models()
model_arn = 'arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0'
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
    print(f"Profile ARN: {response['inferenceProfileArn']}")

except Exception as e:
    print(f"Error creating application inference profile: {e}")
