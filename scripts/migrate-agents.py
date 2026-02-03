#!/usr/bin/env python3
"""
LibreChat Agent Migration Script

Migrates agents from one LibreChat MongoDB instance to another,
updating ownership and optionally making them publicly accessible.

Usage:
    # Export from source cluster (run this first)
    oc exec <mongodb-pod> -n <namespace> -- mongosh --quiet \
        --eval "JSON.stringify(db.agents.find().toArray())" LibreChat > agents-export.json
    oc exec <mongodb-pod> -n <namespace> -- mongosh --quiet \
        --eval "JSON.stringify(db.aclentries.find().toArray())" LibreChat > aclentries-export.json

    # Then run migration against target cluster
    python3 migrate-agents.py --agents agents-export.json \
        --new-user-email admin@example.com \
        --make-public \
        --target-namespace librechat-fips
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime
from typing import Optional
import uuid


def generate_object_id() -> str:
    """Generate a MongoDB-style ObjectId (24 hex chars)."""
    import time
    timestamp = int(time.time())
    random_part = uuid.uuid4().hex[:16]
    return f"{timestamp:08x}{random_part}"


def run_mongosh(namespace: str, pod_name: str, command: str) -> str:
    """Run a mongosh command in the target MongoDB pod."""
    cmd = [
        "oc", "exec", pod_name, "-n", namespace, "--",
        "mongosh", "--quiet", "--eval", command, "LibreChat"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"mongosh failed: {result.stderr}")
    return result.stdout.strip()


def get_mongodb_pod(namespace: str) -> str:
    """Get the MongoDB pod name in the target namespace."""
    cmd = ["oc", "get", "pods", "-n", namespace, "-l", "app.kubernetes.io/name=mongodb",
           "-o", "jsonpath={.items[0].metadata.name}"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 or not result.stdout.strip():
        # Try alternate label
        cmd = ["oc", "get", "pods", "-n", namespace,
               "-o", "jsonpath={.items[?(@.metadata.name contains 'mongodb')].metadata.name}"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0 or not result.stdout.strip():
            raise Exception(f"Could not find MongoDB pod in namespace {namespace}")
    return result.stdout.strip().split()[0]


def get_or_create_user(namespace: str, pod_name: str, email: str, name: Optional[str] = None) -> dict:
    """Get existing user by email or create a new admin user."""
    # Check if user exists
    check_cmd = f'db.users.findOne({{email: "{email}"}})'
    result = run_mongosh(namespace, pod_name, check_cmd)

    if result and result != "null":
        user_data = json.loads(result.replace("ObjectId(", '"').replace(")", '"')
                              .replace("ISODate(", '"').replace(")", '"'))
        print(f"Found existing user: {email}")
        return user_data

    # Create new user
    user_id = generate_object_id()
    username = email.split("@")[0]
    display_name = name or username
    now = datetime.utcnow().isoformat() + "Z"

    create_cmd = f'''db.users.insertOne({{
        _id: ObjectId("{user_id}"),
        name: "{display_name}",
        username: "{username}",
        email: "{email}",
        role: "ADMIN",
        provider: "local",
        createdAt: ISODate("{now}"),
        updatedAt: ISODate("{now}")
    }})'''

    run_mongosh(namespace, pod_name, create_cmd)
    print(f"Created new admin user: {email} with ID: {user_id}")

    return {"_id": user_id, "email": email, "name": display_name}


def import_agents(namespace: str, pod_name: str, agents: list, new_author_id: str,
                  new_author_name: str, make_public: bool = False) -> dict:
    """Import agents with updated ownership."""
    results = {"imported": 0, "skipped": 0, "errors": []}

    for agent in agents:
        agent_id = agent.get("id")
        agent_name = agent.get("name", "Unknown")

        # Check if agent already exists
        check_cmd = f'db.agents.findOne({{id: "{agent_id}"}})'
        existing = run_mongosh(namespace, pod_name, check_cmd)

        if existing and existing != "null":
            print(f"  Skipping existing agent: {agent_name} ({agent_id})")
            results["skipped"] += 1
            continue

        try:
            # Prepare agent document for insertion
            # Remove MongoDB-specific fields that will be regenerated
            agent_copy = {k: v for k, v in agent.items() if k not in ["_id", "__v"]}

            # Update ownership
            agent_copy["author"] = f'ObjectId("{new_author_id}")'
            agent_copy["authorName"] = new_author_name

            # Clear project associations (they won't exist in new cluster)
            agent_copy["projectIds"] = []

            # Convert to mongosh-compatible format
            now = datetime.utcnow().isoformat() + "Z"

            # Handle arrays and nested objects - use json.dumps for safe escaping
            tools_str = json.dumps(agent_copy.get("tools", []))
            tool_kwargs_str = json.dumps(agent_copy.get("tool_kwargs", []))
            actions_str = json.dumps(agent_copy.get("actions", []))
            starters_str = json.dumps(agent_copy.get("conversation_starters", []))
            versions_str = json.dumps(agent_copy.get("versions", []))
            model_params_str = json.dumps(agent_copy.get("model_parameters", {}))
            tool_resources_str = json.dumps(agent_copy.get("tool_resources", {}))
            edges_str = json.dumps(agent_copy.get("edges", []))

            # Handle string fields - use json.dumps for safe escaping
            agent_id_str = agent_copy['id']
            name_str = json.dumps(agent_copy.get('name', ''))
            desc_str = json.dumps(agent_copy.get('description', ''))
            instr_str = json.dumps(agent_copy.get('instructions', ''))
            provider_str = agent_copy.get('provider', '')
            model_str = agent_copy.get('model', '')
            artifacts_str = agent_copy.get('artifacts', '')
            category_str = agent_copy.get('category', 'general')

            # Handle avatar
            avatar = agent_copy.get("avatar")
            avatar_str = json.dumps(avatar) if avatar else "null"

            # Handle booleans
            is_collab = str(agent_copy.get('isCollaborative', False)).lower()
            is_promo = str(agent_copy.get('is_promoted', False)).lower()

            insert_cmd = f'''db.agents.insertOne({{
                id: "{agent_id_str}",
                name: {name_str},
                description: {desc_str},
                instructions: {instr_str},
                avatar: {avatar_str},
                provider: "{provider_str}",
                model: "{model_str}",
                model_parameters: {model_params_str},
                artifacts: "{artifacts_str}",
                tools: {tools_str},
                tool_kwargs: {tool_kwargs_str},
                actions: {actions_str},
                author: ObjectId("{new_author_id}"),
                authorName: "{new_author_name}",
                agent_ids: [],
                edges: {edges_str},
                isCollaborative: {is_collab},
                conversation_starters: {starters_str},
                tool_resources: {tool_resources_str},
                projectIds: [],
                versions: {versions_str},
                category: "{category_str}",
                is_promoted: {is_promo},
                createdAt: ISODate("{now}"),
                updatedAt: ISODate("{now}")
            }})'''

            run_mongosh(namespace, pod_name, insert_cmd)
            print(f"  Imported: {agent_name} ({agent_id})")
            results["imported"] += 1

            # Make public if requested
            if make_public:
                create_public_acl(namespace, pod_name, agent_id, new_author_id)

        except Exception as e:
            print(f"  Error importing {agent_name}: {e}")
            results["errors"].append({"agent": agent_name, "error": str(e)})

    return results


def create_public_acl(namespace: str, pod_name: str, agent_id: str, granted_by: str):
    """Create a public ACL entry for an agent."""
    now = datetime.utcnow().isoformat() + "Z"

    # First get the agent's _id
    get_id_cmd = f'db.agents.findOne({{id: "{agent_id}"}}, {{_id: 1}})'
    result = run_mongosh(namespace, pod_name, get_id_cmd)

    if not result or result == "null":
        print(f"    Warning: Could not find agent {agent_id} for ACL creation")
        return

    # Parse the ObjectId from the result
    # Result looks like: { _id: ObjectId('...') }
    import re
    match = re.search(r"ObjectId\(['\"]([^'\"]+)['\"]\)", result)
    if not match:
        print(f"    Warning: Could not parse agent _id from: {result}")
        return

    agent_object_id = match.group(1)

    # Create public ACL entry with VIEW permission (permBits: 1)
    acl_cmd = f'''db.aclentries.insertOne({{
        principalType: "public",
        resourceType: "agent",
        resourceId: ObjectId("{agent_object_id}"),
        permBits: 1,
        grantedBy: ObjectId("{granted_by}"),
        grantedAt: ISODate("{now}"),
        createdAt: ISODate("{now}"),
        updatedAt: ISODate("{now}")
    }})'''

    run_mongosh(namespace, pod_name, acl_cmd)
    print(f"    Made public: {agent_id}")


def main():
    parser = argparse.ArgumentParser(
        description="Migrate LibreChat agents between MongoDB instances"
    )
    parser.add_argument("--agents", required=True, help="Path to agents JSON export file")
    parser.add_argument("--aclentries", help="Path to ACL entries JSON export file (optional)")
    parser.add_argument("--new-user-email", required=True, help="Email for the new owner")
    parser.add_argument("--new-user-name", help="Display name for new owner")
    parser.add_argument("--make-public", action="store_true", help="Make all agents publicly viewable")
    parser.add_argument("--target-namespace", default="librechat-fips", help="Target OpenShift namespace")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without making changes")

    args = parser.parse_args()

    # Load agents
    print(f"Loading agents from {args.agents}...")
    with open(args.agents, "r") as f:
        agents = json.load(f)
    print(f"Found {len(agents)} agents to migrate")

    if args.dry_run:
        print("\n=== DRY RUN MODE ===")
        for agent in agents:
            print(f"  Would import: {agent.get('name')} ({agent.get('id')})")
            if args.make_public:
                print(f"    Would make public")
        return

    # Get MongoDB pod
    print(f"\nConnecting to MongoDB in namespace {args.target_namespace}...")
    pod_name = get_mongodb_pod(args.target_namespace)
    print(f"Found MongoDB pod: {pod_name}")

    # Get or create user
    print(f"\nSetting up owner user: {args.new_user_email}...")
    user = get_or_create_user(
        args.target_namespace,
        pod_name,
        args.new_user_email,
        args.new_user_name
    )

    # Extract user ID (handle both string and dict formats)
    if isinstance(user.get("_id"), dict):
        user_id = user["_id"].get("$oid", str(user["_id"]))
    else:
        user_id = str(user["_id"]).replace("ObjectId('", "").replace("')", "")

    user_name = user.get("name", args.new_user_email.split("@")[0])

    # Import agents
    print(f"\nImporting agents...")
    results = import_agents(
        args.target_namespace,
        pod_name,
        agents,
        user_id,
        user_name,
        args.make_public
    )

    # Summary
    print(f"\n=== Migration Complete ===")
    print(f"Imported: {results['imported']}")
    print(f"Skipped (already exist): {results['skipped']}")
    if results['errors']:
        print(f"Errors: {len(results['errors'])}")
        for err in results['errors']:
            print(f"  - {err['agent']}: {err['error']}")


if __name__ == "__main__":
    main()
