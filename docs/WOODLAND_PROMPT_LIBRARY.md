# Woodland Agent Prompt Library

**Auto-seeded on startup** • **Category: woodland** • **Version: v2025.11.22**

These prompts are automatically created when LibreChat starts. Sales reps can use them as-is or fork/customize for their workflow.

---

## 📋 Available Prompts

### 1. Quick Tractor Fitment
**Command:** `/tractor-fit`  
**Use Case:** Fast compatibility check when customer provides all tractor details  
**Variables:** `{{make}}`, `{{model}}`, `{{deck}}`, `{{rake}}`

**Example Usage:**
```
/tractor-fit
```
Then fill in: John Deere D130, 42", Commander

**What it does:**
- Validates compatibility
- Returns complete SKU list (MDA, hitch, hose, collar)
- Provides direct product URLs
- Suggests accessories

---

### 2. Guided Tractor Fitment
**Command:** `/guided-fit`  
**Use Case:** Step-by-step conversation when customer is unsure of details  
**Type:** Chat (multi-turn)

**What it does:**
- Asks for make → model → deck → rake in sequence
- Handles unclear inputs (multi-word brands, partial model numbers)
- Uses autocomplete suggestions from database
- Provides grouped table if multiple options exist

---

### 3. Catalog SKU Lookup
**Command:** `/sku-lookup`  
**Use Case:** Find part numbers for specific rake models or accessories  
**Variables:** `{{rake_name}}`, `{{part_type}}`

**Example:**
- "Find impeller for Commercial Pro"
- "What's the SKU for Commander collector bag?"

**What it does:**
- Searches catalog database
- Returns SKU, price, compatibility
- Includes policy notes (special-run SKUs, restrictions)

---

### 4. Equipment Troubleshooting
**Command:** `/troubleshoot`  
**Use Case:** Diagnose customer issues with existing equipment  
**Variables:** `{{model}}`, `{{issue_description}}`

**Example:**
- "Engine surging on Commander"
- "Dumpling assembly won't latch on XL"

**What it does:**
- References Cyclopedia for standard diagnostics
- Asks clarifying questions
- Provides step-by-step fixes
- Suggests replacement parts with SKUs if needed

---

### 5. Accessory Recommendations
**Command:** `/accessories`  
**Use Case:** Upsell enhancements based on customer setup  
**Variables:** `{{make}}`, `{{model}}`, `{{rake}}`, `{{use_case}}`

**Example:**
- "Customer has 3 acres, heavy fall cleanup"
- "Wants to extend pickup reach"

**What it does:**
- Suggests upgrade hose (kink resistance, durability)
- Recommends rubber collar (wear prevention)
- Lists extension kits or sections
- Explains value proposition for each

---

### 6. CRM-Friendly Output
**Command:** `/crm-format`  
**Use Case:** Format results for quick copy-paste into CRM notes  
**Variables:** `{{query_details}}`

**What it does:**
- Outputs compact single line: `jd d130 42" Commander: 206D | 208-090 | 305 | 251`
- Flags special notes (drilling required, exhaust clearance issues)
- Separates URLs for easy reference
- Adds timestamp

---

## 🔧 How to Use

### In LibreChat UI:
1. **Browse Prompts:** Click "Prompts" → Filter by "woodland" category
2. **Use Slash Commands:** Type `/tractor-fit` in chat to quick-invoke
3. **Fork & Customize:** Click prompt → "Save As" → Edit for your workflow
4. **Share:** Share customized prompts with team via "Share" button

### Variables:
- Replace `{{variable}}` with actual values
- Or leave blank and provide context in follow-up message

### Best Practices:
- ✅ Use **Quick Tractor Fitment** when you have all 4 details (make/model/deck/rake)
- ✅ Use **Guided Fitment** when customer is unsure or has incomplete info
- ✅ Use **CRM Format** at end of conversation to capture notes
- ✅ Always verify URLs are tool-returned (never generic or guessed)

---

## 🎯 Prompt Quality Guidelines

All seeded prompts enforce:
1. **Strict URL validation** - Only use URLs from tool results
2. **Source citation** - Include links to catalog/cyclopedia
3. **Policy compliance** - Respect special-run SKU notes, XL impeller restrictions
4. **Structured output** - Tables, bullets, clear next steps
5. **Error handling** - Escalate when data conflicts or missing

---

## 🚀 Advanced: Creating Custom Prompts

Sales reps can create specialized prompts for:
- **Regional use cases** (heavy snow areas, commercial landscapers)
- **Seasonal campaigns** (fall cleanup bundles, spring maintenance)
- **VIP customers** (fleet orders, repeat buyers)

**How to Create:**
1. Go to Prompts → "Create New"
2. Set Category: `woodland` (keeps it with team prompts)
3. Add slash command (optional): `/my-custom-cmd`
4. Write prompt using `{{variables}}` for dynamic fields
5. Test with Tractor Agent or relevant agent
6. Share with team via GLOBAL_PROJECT_NAME

---

## 📊 Monitoring & Updates

**Version History:**
- Prompt groups track all versions (see "Versions" tab in UI)
- Production version = currently active
- Can rollback if needed

**Usage Tracking:**
- `numberOfGenerations` increments each use
- Review popular prompts to identify patterns

**Updates:**
- Prompts auto-update on server restart when template changes
- Creates new version, preserves old ones
- Check version in prompt header: `v2025.11.22`

---

## 🆘 Troubleshooting

**Prompt not showing up?**
- Check category filter = "woodland"
- Verify permissions (should have VIEW access by default)
- Try refreshing page

**Slash command not working?**
- Commands must be lowercase, alphanumeric, hyphens only
- Check for typos: `/tractor-fit` not `/tractorfit`

**Variables not replacing?**
- Variables are placeholders - manually replace before sending
- Or provide context: "Make: John Deere" in message

**Wrong data in results?**
- Report to team lead - prompt may need update
- Check if using outdated version (see version number)

---

## 📞 Support

Questions about prompts or need custom templates?  
Contact: Woodland AI Team

**Useful Links:**
- Prompt Management Docs: `/docs/prompts`
- Agent Configuration: `api/models/AgentSeed.js`
- Prompt Templates: `api/models/PromptSeed.js`
