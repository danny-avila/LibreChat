#!/usr/bin/env python3
"""
Import large agents via file copy to pod.
Handles agents that are too large for command-line mongosh.
"""

import json
import subprocess
import sys
from datetime import datetime
import tempfile
import os


def run_cmd(cmd):
    """Run a shell command and return output."""
    result = subprocess.run(cmd, capture_output=True, text=True, shell=isinstance(cmd, str))
    if result.returncode != 0:
        raise Exception(f"Command failed: {result.stderr}")
    return result.stdout.strip()


def import_large_agent(namespace: str, pod_name: str, agent: dict, new_author_id: str,
                       new_author_name: str, make_public: bool = False):
    """Import a single large agent via file transfer."""

    agent_name = agent.get("name", "Unknown")
    agent_id = agent.get("id")
    now = datetime.utcnow().isoformat() + "Z"

    # Prepare the document
    doc = {
        "id": agent["id"],
        "name": agent.get("name", ""),
        "description": agent.get("description", ""),
        "instructions": agent.get("instructions", ""),
        "avatar": agent.get("avatar"),
        "provider": agent.get("provider", ""),
        "model": agent.get("model", ""),
        "model_parameters": agent.get("model_parameters", {}),
        "artifacts": agent.get("artifacts", ""),
        "tools": agent.get("tools", []),
        "tool_kwargs": agent.get("tool_kwargs", []),
        "actions": agent.get("actions", []),
        "author": {"$oid": new_author_id},
        "authorName": new_author_name,
        "agent_ids": [],
        "edges": agent.get("edges", []),
        "isCollaborative": agent.get("isCollaborative", False),
        "conversation_starters": agent.get("conversation_starters", []),
        "tool_resources": agent.get("tool_resources", {}),
        "projectIds": [],
        "versions": agent.get("versions", []),
        "category": agent.get("category", "general"),
        "is_promoted": agent.get("is_promoted", False),
        "createdAt": {"$date": now},
        "updatedAt": {"$date": now}
    }

    # Write to temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(doc, f)
        temp_file = f.name

    try:
        # Copy file to pod
        remote_path = f"/tmp/agent-{agent_id}.json"
        run_cmd(["oc", "cp", temp_file, f"{pod_name}:{remote_path}", "-n", namespace, "-c", "mongodb"])

        # Import using mongoimport
        import_cmd = f"mongoimport --db LibreChat --collection agents --file {remote_path}"
        run_cmd(["oc", "exec", pod_name, "-n", namespace, "-c", "mongodb", "--", "sh", "-c", import_cmd])

        # Cleanup remote file
        run_cmd(["oc", "exec", pod_name, "-n", namespace, "-c", "mongodb", "--", "rm", remote_path])

        print(f"  Imported: {agent_name} ({agent_id})")

        # Make public if requested
        if make_public:
            # Get the inserted document's _id
            get_id_cmd = f'''mongosh --quiet --eval "JSON.stringify(db.agents.findOne({{id: '{agent_id}'}}, {{_id: 1}}))" LibreChat'''
            result = run_cmd(["oc", "exec", pod_name, "-n", namespace, "-c", "mongodb", "--", "sh", "-c", get_id_cmd])

            if result and result != "null":
                result_data = json.loads(result)
                agent_oid = result_data.get("_id", {}).get("$oid")

                if agent_oid:
                    # Create public ACL entry
                    acl_doc = {
                        "principalType": "public",
                        "resourceType": "agent",
                        "resourceId": {"$oid": agent_oid},
                        "permBits": 1,
                        "grantedBy": {"$oid": new_author_id},
                        "grantedAt": {"$date": now},
                        "createdAt": {"$date": now},
                        "updatedAt": {"$date": now}
                    }

                    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                        json.dump(acl_doc, f)
                        acl_file = f.name

                    try:
                        acl_remote = f"/tmp/acl-{agent_id}.json"
                        run_cmd(["oc", "cp", acl_file, f"{pod_name}:{acl_remote}", "-n", namespace, "-c", "mongodb"])
                        acl_import_cmd = f"mongoimport --db LibreChat --collection aclentries --file {acl_remote}"
                        run_cmd(["oc", "exec", pod_name, "-n", namespace, "-c", "mongodb", "--", "sh", "-c", acl_import_cmd])
                        run_cmd(["oc", "exec", pod_name, "-n", namespace, "-c", "mongodb", "--", "rm", acl_remote])
                        print(f"    Made public: {agent_id}")
                    finally:
                        os.unlink(acl_file)

        return True

    finally:
        os.unlink(temp_file)


def main():
    if len(sys.argv) < 5:
        print("Usage: python3 import-large-agent.py <namespace> <pod> <agents.json> <author_id> [author_name] [--public]")
        sys.exit(1)

    namespace = sys.argv[1]
    pod_name = sys.argv[2]
    agents_file = sys.argv[3]
    author_id = sys.argv[4]
    author_name = sys.argv[5] if len(sys.argv) > 5 and not sys.argv[5].startswith("--") else "Admin"
    make_public = "--public" in sys.argv

    # Load agents
    with open(agents_file) as f:
        agents = json.load(f)

    # Filter to failed agents (the ones with long instructions)
    failed_names = [
        "ServiceNow Chat",
        "FBI - Crime Stats Chat",
        "Public Health Researcher",
        "FAA Agent",
        "USAF - Findings Analyst"
    ]

    large_agents = [a for a in agents if a.get("name") in failed_names]

    print(f"Found {len(large_agents)} large agents to import")

    for agent in large_agents:
        try:
            import_large_agent(namespace, pod_name, agent, author_id, author_name, make_public)
        except Exception as e:
            print(f"  Error importing {agent.get('name')}: {e}")


if __name__ == "__main__":
    main()
