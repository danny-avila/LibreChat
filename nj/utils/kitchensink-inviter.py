import boto3
import os
import argparse
import re

EMAIL_PATTERN=re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

def get_kitchensink_container(client, cluster_arn, service_name):
    task_list = client.list_tasks(
        cluster=cluster_arn,
        serviceName=service_name
    )

    tasks = client.describe_tasks(
        cluster=cluster_arn,
        tasks=task_list["taskArns"]
    )

    for container in tasks["tasks"][0]["containers"]:
        if container["name"] == "librechat":
            return tasks["tasks"][0]["taskArn"], container["containerArn"]

    raise ValueError("Librechat container not found")


def create_user(client, cluster_arn, task_arn, email, password):
    name = email[0:email.index("@")]

    command = f"npm run create-user -- {email} {name} {name} {password} --email-verified=true"

    client.execute_command(
        cluster = cluster_arn,
        container = "librechat",
        task = task_arn,
        command = command,
        interactive = True
    )


def _validate_email(email):
    if not EMAIL_PATTERN.match(email):
        raise argparse.ArgumentTypeError(f"Invalid email: {email}")
    return email


def _get_account_id():
    sts_client = boto3.client("sts")
    response = sts_client.get_caller_identity()
    return response.get("Account")
    

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("email",
                        type=_validate_email,
                        help="Email address for the user"
                        )
    args = parser.parse_args()
    session = boto3.session.Session()
    client = session.client("ecs")

    cluster_name = os.getenv("KITCHENSINK_CLUSTER_NAME")
    service_name = os.getenv("KITCHENSINK_SERVICE_NAME")
    password = os.getenv("USER_PASSWORD")

    if not password:
        raise ValueError("USER_PASSWORD environment variable is required")

    cluster_arn = f"arn:aws:ecs:{session.region_name}:{_get_account_id()}:cluster/{cluster_name}"

    task_arn, container_arn = get_kitchensink_container(client, cluster_arn, service_name)

    print(f"KitchenSink Container found, creating user: {args.email}")

    create_user(client, cluster_arn, task_arn, args.email, password)


if __name__ == "__main__": 
    main()
