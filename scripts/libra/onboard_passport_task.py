"""One-shot onboarding for the Passport Navigator task.

This script is the reference implementation for how to onboard a new life-task:
  1. Registers the system prompt in the Bifrost Prompt Repository
  2. Commits version 1 of the prompt content
  3. Adds / updates the task entry in tasks.yaml with the Bifrost prompt ID
  4. Creates (or updates) the LibreChat Agent
  5. Writes the librechat_agent_id back to tasks.yaml

Run from the repo root:
    python scripts/libra/onboard_passport_task.py
    python scripts/libra/onboard_passport_task.py --dry-run
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).parent.parent.parent
TASKS_YAML = REPO_ROOT / "tasks.yaml"

sys.path.insert(0, str(Path(__file__).parent.parent / "bifrost"))
sys.path.insert(0, str(Path(__file__).parent))

from _client import BifrostAdmin  # noqa: E402
from _librechat import LibreChatAdmin  # noqa: E402
from _mongo import get_db  # noqa: E402

# ---------------------------------------------------------------------------
# Task definition
# ---------------------------------------------------------------------------

TASK: dict = {
    "slug": "passport-navigator",
    "display_name": "Passport Navigator",
    "display_name_bn": "পাসপোর্ট নেভিগেটর",
    "category": "government",
    "country": "BD",
    "model": "aivion-mid",
    "bifrost_prompt_id": "",        # filled by this script
    "bifrost_prompt_version": 1,
    "librechat_agent_id": "",       # filled by this script
    "price_bdt": 15,
    "task_type": "text",
}

# ---------------------------------------------------------------------------
# System prompt — the actual AI instructions baked with BD passport knowledge
# ---------------------------------------------------------------------------

PROMPT_NAME = "passport-navigator"

PROMPT_CONTENT = """\
You are the Aivion Passport Navigator — a friendly, knowledgeable assistant that helps
Bangladeshi citizens apply for or renew their passport step by step. You know the full
process, all fees, all office locations, and all required documents.

## Your persona
- Warm, patient, and helpful — like a trusted friend who knows the process.
- Respond in simple conversational Bangla. Use English only for technical terms
  (NID, e-Passport, online application, appointment) that users are familiar with.
- Ask one or two questions at a time — never a long list.
- Always confirm you understood before moving forward.

## Conversation flow

Step 1 — Understand the need:
  Ask: নতুন পাসপোর্ট নাকি নবায়ন (renewal) করতে চাইছেন?
  Also check: পাসপোর্ট হারিয়ে গেছে, নাকি নষ্ট হয়েছে কি? (if lost/damaged, note it)

Step 2 — Collect personal info (one or two at a time):
  - পুরো নাম (NID অনুযায়ী)
  - জন্ম তারিখ
  - জেলা (কোন জেলায় থাকেন?)
  - ১৮ বছরের নিচে হলে: বাবার NID নম্বর এবং মায়ের NID নম্বর

Step 3 — Delivery preference:
  Explain the three options clearly with current fees:

  | ধরন | সময় | ৪৮ পাতা | ৬৪ পাতা |
  |---|---|---|---|
  | সাধারণ (Regular) | ২১ কার্যদিন | ~৳৪,০২৫ | ~৳৬,৩২৫ |
  | এক্সপ্রেস (Express) | ১০ কার্যদিন | ~৳৬,৩২৫ | ~৳৮,৬২৫ |
  | সুপার এক্সপ্রেস | ২ কার্যদিন | ~৳৮,৬২৫ | ~৳১২,০৭৫ |

  Note: ব্যাংক চার্জ সহ। সঠিক ফি অফিসে বা www.epassport.gov.bd তে যাচাই করুন।

Step 4 — Tell them their passport office:

  DHAKA: আগারগাঁও পাসপোর্ট অফিস, E/5, ঢাকা — সকাল ৯টা – বিকেল ৫টা (শুক্র-শনি বন্ধ)
  GAZIPUR: গাজীপুর জেলা পাসপোর্ট অফিস
  NARAYANGANJ: নারায়ণগঞ্জ জেলা পাসপোর্ট অফিস
  CHITTAGONG: আঞ্চলিক পাসপোর্ট অফিস চট্টগ্রাম, কদমতলী
  COXS_BAZAR: কক্সবাজার জেলা পাসপোর্ট অফিস
  COMILLA: কুমিল্লা আঞ্চলিক পাসপোর্ট অফিস
  SYLHET: আঞ্চলিক পাসপোর্ট অফিস সিলেট, সুবিদবাজার
  RAJSHAHI: আঞ্চলিক পাসপোর্ট অফিস রাজশাহী
  BOGURA: বগুড়া জেলা পাসপোর্ট অফিস
  KHULNA: আঞ্চলিক পাসপোর্ট অফিস খুলনা
  JESSORE: যশোর জেলা পাসপোর্ট অফিস (Jashore)
  BARISAL: আঞ্চলিক পাসপোর্ট অফিস বরিশাল
  RANGPUR: আঞ্চলিক পাসপোর্ট অফিস রংপুর
  DINAJPUR: দিনাজপুর জেলা পাসপোর্ট অফিস
  MYMENSINGH: আঞ্চলিক পাসপোর্ট অফিস ময়মনসিংহ

  For smaller districts not listed above, direct the user to their nearest divisional office.

Step 5 — Walk through the application process:

  1. www.epassport.gov.bd ওয়েবসাইটে যান
  2. "Apply for e-Passport" বাটনে ক্লিক করুন
  3. NID নম্বর ও মোবাইল নম্বর দিয়ে নিবন্ধন করুন
  4. ফর্ম পূরণ করুন (নাম, জন্মতারিখ, ঠিকানা, পাসপোর্ট অফিস, ডেলিভারি ধরন)
  5. অ্যাপয়েন্টমেন্টের তারিখ বেছে নিন
  6. ফি পরিশোধ করুন:
     - যেকোনো সোনালী ব্যাংক শাখায় চালান
     - বিকাশ / নগদ / রকেট (যদি সুযোগ থাকে)
     - ডাচ-বাংলা ব্যাংক
  7. আবেদন ফর্ম প্রিন্ট করুন
  8. নির্ধারিত তারিখে অফিসে যান

Step 6 — Final: produce the PASSPORT APPLICATION SUMMARY card (see below).

## Required documents checklist

For adults (18+) — New passport:
  ☐ NID কার্ড (মূল + ফটোকপি)
  ☐ জন্ম নিবন্ধন সনদ
  ☐ ২ কপি সাম্প্রতিক পাসপোর্ট সাইজ ছবি (সাদা ব্যাকগ্রাউন্ড, 35mm×45mm)
  ☐ ফি পরিশোধের রশিদ
  ☐ অনলাইন আবেদন ফর্মের প্রিন্ট

For adults — Renewal:
  ☐ সব উপরের কাগজ
  ☐ পুরনো পাসপোর্ট (মূল)

For minors (under 18):
  ☐ জন্ম নিবন্ধন সনদ
  ☐ বাবার NID + মায়ের NID
  ☐ বাবার/মায়ের পাসপোর্ট (যদি থাকে)
  ☐ ২ কপি ছবি
  ☐ ফি রশিদ
  ☐ আবেদন ফর্ম প্রিন্ট

For lost passport:
  ☐ থানায় GD (General Diary) করুন → GD কপি আনুন
  ☐ সব নতুন পাসপোর্টের কাগজ + GD কপি
  ☐ হলফনামা (affidavit) প্রয়োজন হতে পারে

## Final output — PASSPORT APPLICATION SUMMARY card

When you have collected all info, produce a clean summary like this:

---
📋 **পাসপোর্ট আবেদন সারসংক্ষেপ**

**নাম:** [name from NID]
**জন্ম তারিখ:** [date of birth]
**আবেদনের ধরন:** [নতুন / নবায়ন / হারানো]
**পাতার সংখ্যা:** [৪৮ / ৬৪]
**ডেলিভারি:** [সাধারণ / এক্সপ্রেস / সুপার এক্সপ্রেস]
**আনুমানিক ফি:** ৳[amount]
**পাসপোর্ট অফিস:** [office name and area]

**আবেদনের ওয়েবসাইট:** www.epassport.gov.bd

**নিয়ে যেতে হবে:**
☐ NID কার্ড (মূল + ফটোকপি)
☐ জন্ম নিবন্ধন সনদ
☐ ২ কপি পাসপোর্ট সাইজ ছবি (সাদা ব্যাকগ্রাউন্ড)
☐ ফি পরিশোধের রশিদ
☐ অনলাইন আবেদন ফর্মের প্রিন্ট
[add renewal/lost/minor items as applicable]

**মনে রাখুন:**
- অফিসে যাওয়ার আগে অনলাইনে আবেদন ও ফি পরিশোধ সম্পন্ন করুন
- অ্যাপয়েন্টমেন্টের দিন সব মূল কাগজ নিয়ে যান
- ফি ও প্রক্রিয়া পরিবর্তন হতে পারে — www.epassport.gov.bd তে যাচাই করুন
---

After the summary, ask: "আর কোনো প্রশ্ন আছে? যেমন — ছবির মাপ, ব্যাংক পেমেন্ট পদ্ধতি, বা ট্র্যাকিং?"
Be ready to answer follow-up questions about photo requirements, payment, tracking, etc.

## Important notes
- Always remind the user that fees and processes can change — verify at www.epassport.gov.bd
- If a user mentions they are abroad (প্রবাসী), tell them to contact the nearest Bangladesh Embassy/High Commission
- Never make up information. If unsure about a specific sub-district office, direct to the divisional office
- Keep the tone warm and encouraging — many people find this process stressful
"""

COMMIT_MESSAGE = "Initial version — Bangladesh e-Passport navigator with full process guide"

# ---------------------------------------------------------------------------
# Agent body for LibreChat
# ---------------------------------------------------------------------------

AGENT_BODY = {
    "name": TASK["display_name"],
    "description": "পাসপোর্ট নেভিগেটর · আপনার পাসপোর্ট আবেদনের পুরো প্রক্রিয়া ধাপে ধাপে · Standard tier · 15 BDT",
    "instructions": "",  # must stay empty — system prompt comes from Bifrost
    "provider": "Aivion",  # must match allowedProviders in librechat.yaml agents block
    "model": TASK["model"],
    "tools": [],
    "conversation_starters": [
        "আমি নতুন পাসপোর্ট বানাতে চাই",
        "আমার পাসপোর্ট নবায়ন করতে হবে",
        "পাসপোর্ট হারিয়ে গেছে, কী করব?",
        "পাসপোর্টের জন্য কী কী কাগজ লাগবে?",
    ],
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_tasks() -> list[dict]:
    with TASKS_YAML.open() as f:
        return yaml.safe_load(f) or []


def save_tasks(tasks: list[dict]) -> None:
    with TASKS_YAML.open("w") as f:
        yaml.dump(tasks, f, allow_unicode=True, sort_keys=False, default_flow_style=False)


def upsert_task_entry(tasks: list[dict], slug: str, updates: dict) -> list[dict]:
    for t in tasks:
        if t.get("slug") == slug:
            t.update(updates)
            return tasks
    # Not found — prepend in its own section
    tasks.append(updates)
    return tasks


def create_bifrost_prompt(admin: BifrostAdmin, dry_run: bool) -> str | None:
    # Check if a prompt with this name already exists
    existing = next((p for p in admin.list_prompts() if p.get("name") == PROMPT_NAME), None)
    if existing:
        prompt_id = existing["id"]
        print(f"  Bifrost prompt already exists: {prompt_id}")
        return prompt_id

    if dry_run:
        print(f"  (dry-run) would create Bifrost prompt '{PROMPT_NAME}'")
        return "dry-run-uuid"

    r = admin.client.post(
        "/api/prompt-repo/prompts",
        json={"name": PROMPT_NAME},
    )
    r.raise_for_status()
    prompt_id = r.json()["prompt"]["id"]
    print(f"  Bifrost prompt created: {prompt_id}")

    r2 = admin.client.post(
        f"/api/prompt-repo/prompts/{prompt_id}/versions",
        json={
            "messages": [{"role": "system", "content": PROMPT_CONTENT}],
            "commit_message": COMMIT_MESSAGE,
        },
    )
    r2.raise_for_status()
    version_number = r2.json()["version"]["version_number"]
    print(f"  Committed version {version_number}")
    return prompt_id


def grant_public_acl(agent_id: str, author_oid: object, db: object, dry_run: bool) -> None:
    # resourceId in aclentries must be the agent's ObjectId _id, not the string id field
    agent_doc = db.agents.find_one({"id": agent_id}, {"_id": 1, "author": 1})
    if not agent_doc:
        print(f"  error: agent {agent_id} not found in MongoDB — cannot insert ACL entries")
        return

    agent_oid = agent_doc["_id"]
    resolved_author = agent_doc.get("author") or author_oid

    # LibreChat auto-creates owner entries on agent creation — only add the public entry if missing
    public_exists = db.aclentries.find_one({
        "resourceId": agent_oid,
        "resourceType": "agent",
        "principalType": "public",
    })
    if public_exists:
        print(f"  Public ACL entry already exists for {agent_id} — skipping")
        return

    if dry_run:
        print(f"  (dry-run) would insert public aclentry (resourceId={agent_oid})")
        return

    db.aclentries.insert_one({
        "resourceId": agent_oid,
        "resourceType": "agent",
        "principalType": "public",
        "permBits": 1,
    })
    # Also ensure isPublic flag is set on the agent document
    db.agents.update_one({"_id": agent_oid}, {"$set": {"isPublic": True}})
    print(f"  Public ACL entry inserted + isPublic=true set (resourceId={agent_oid})")


def create_librechat_agent(lc: LibreChatAdmin, dry_run: bool) -> str | None:
    if dry_run:
        print(f"  (dry-run) would upsert LibreChat agent '{AGENT_BODY['name']}'")
        return "dry-run-agent-id"

    agent = lc.upsert_agent(AGENT_BODY)
    agent_id = agent.get("id") or agent.get("_id")
    return str(agent_id) if agent_id else None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("=== Onboarding: Passport Navigator ===\n")

    # Step 1 — Bifrost prompt
    print("Step 1: Bifrost Prompt Repository")
    with BifrostAdmin() as admin:
        prompt_id = create_bifrost_prompt(admin, args.dry_run)

    if not prompt_id:
        print("error: failed to create Bifrost prompt", file=sys.stderr)
        return 1

    # Step 2 — tasks.yaml
    print("\nStep 2: tasks.yaml")
    tasks = load_tasks()
    task_entry = {**TASK, "bifrost_prompt_id": prompt_id, "bifrost_prompt_version": 1}
    tasks = upsert_task_entry(tasks, TASK["slug"], task_entry)
    if not args.dry_run:
        save_tasks(tasks)
        print(f"  tasks.yaml updated (slug={TASK['slug']}, prompt_id={prompt_id})")
    else:
        print(f"  (dry-run) would write slug={TASK['slug']} prompt_id={prompt_id}")

    # Step 3 — LibreChat agent
    print("\nStep 3: LibreChat Agent")
    with LibreChatAdmin() as lc:
        agent_id = create_librechat_agent(lc, args.dry_run)

    if agent_id and not args.dry_run:
        tasks = load_tasks()
        tasks = upsert_task_entry(tasks, TASK["slug"], {"librechat_agent_id": agent_id})
        save_tasks(tasks)
        print(f"  tasks.yaml updated (agent_id={agent_id})")

    # Step 4 — ACL entries (public marketplace visibility)
    print("\nStep 4: ACL Entries")
    if agent_id:
        db = get_db()
        grant_public_acl(agent_id, None, db, args.dry_run)
    else:
        print("  skipped — no agent_id available")

    # Step 5 — Summary

    print("\n=== Done ===")
    print(f"  Bifrost prompt ID : {prompt_id}")
    print(f"  Bifrost version   : 1")
    print(f"  LibreChat agent ID: {agent_id}")
    print()
    print("Next steps:")
    print("  1. Open LibreChat → Agents → 'Passport Navigator' → Share → enable Public")
    print("  2. Test the agent in LibreChat chat")
    print("  3. When prompt needs updating: POST /api/prompt-repo/prompts/{id}/versions")
    print("     Bump bifrost_prompt_version in tasks.yaml — never auto-roll 'latest'")

    return 0


if __name__ == "__main__":
    sys.exit(main())
