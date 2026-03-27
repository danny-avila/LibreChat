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


def create_users(client, cluster_arn, task_arn, email_list, default_password):
    for email in email_list:
        name = email[0:email.index("@")]

        command = f"npm run create-user -- {email} {name} {name} {default_password} --email-verified=true"

        client.execute_command(
            cluster = cluster_arn,
            container = "librechat",
            task = task_arn,
            command = command,
            interactive = True
        )


def _parse_emails(s):
    emails = [e.strip() for e in s.split(',')]
    for email in emails:
        if not EMAIL_PATTERN.match(email):
            raise argparse.ArgumentTypeError(f"Invalid email: {email}")
    return emails


def _get_account_id():
    sts_client = boto3.client("sts")
    response = sts_client.get_caller_identity()
    return response.get("Account")
    

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("email_list", 
                        type=_parse_emails,
                        help="Comma-separated list of emails"
                        )
    args = parser.parse_args()
    session = boto3.session.Session()
    client = session.client("ecs")

    cluster_name = os.getenv("KITCHENSINK_CLUSTER_NAME")
    service_name = os.getenv("KITCHENSINK_SERVICE_NAME")
    default_password = os.getenv("DEFAULT_PASSWORD")

    cluster_arn = f"arn:aws:ecs:{session.region_name}:{_get_account_id()}:cluster/{cluster_name}"
    
    task_arn, container_arn = get_kitchensink_container(client, cluster_arn, service_name)

    print(f"KitchenSink Container found, creating the following users: {args.email_list}")

    create_users(client, cluster_arn, task_arn, args.email_list, default_password)


if __name__ == "__main__": 
    main()
