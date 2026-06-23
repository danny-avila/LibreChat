# Metrics

Ad-hoc analytics queries, written for a `mongosh` session connected to the application database.

## How to run

1. Open a `mongosh` session against the target environment's database (see our _DevOps Common
   Procedures_ document)
2. Copy a query from one of the `.js` files, paste it into the `mongosh` prompt, and run it.
3. Write the output to our _Production Metrics_ sheet.

Each file is self-contained and targets one metric or a few highly-related metrics. Most print their
results as CSV output (a header row followed by data rows) so the output can then be uploaded into a
spreadsheet. Files that need a config value (a date, a user id) declare it near the top -- edit it
before running.

Currently, these are meant to be run by hand, not imported or executed as a script.

## Queries

| File                            | What it reports                                                            | Edit before running             |
| ------------------------------- |----------------------------------------------------------------------------|---------------------------------|
| `countAgents.js`                | Total saved agents                                                         | n/a                             |
| `countConversations.js`         | Total / archived / non-archived conversations                              | n/a                             |
| `countUsers.js`                 | **All users** by email domain, and **active users** by domain for one week | `WEEK_START` (a Sunday)         |
| `activeConversationsPerWeek.js` | Conversations with ≥1 message, per week                                    | n/a                             |
| `conversationsWithAgents.js`    | Percent of conversations that use a Platform Agent, since launch           | `AGENTS_LAUNCH_DATE` (set once) |
| `platformAgentUsage.js`         | Per Platform Agent: conversation count + distinct users                    | `AGENT_CREATOR` (admin User ID) |
| `fileSizeHistogram.js`          | File counts bucketed by size (MB), plus a zero/null-byte count datapoint   | n/a                             |

## Things to know

**Weeks are based in the UTC timezone, Sunday-to-Saturday.** DocumentDB unfortunately does not
support `$dateTrunc`, so week bucketing is done with some ugly date arithmetic (shift each timestamp
back to its Sunday, then format to `YYYY-MM-DD`). We deliberately keep everything in UTC while using
the granularity of weeks. This should be revisited if/when we collect more granular metrics. All of
our week-based metrics use the same boundaries.

**Partial weeks read low, avoid storing them.** The current (in-progress) week shouldn't be recorded
since its metrics aren't finalized.

**"Active" refers to a user-sent message** (`isCreatedByUser: true`), not just any message on the
conversation. This is consistent across the user-activity queries.

**Ephemeral agents are excluded.** In certain situations, LibreChat will create a temporary
"ephemeral" agent in order to use agent-machinery (tools, file-search, etc.) even if the user isn't
using a saved-agent. LibreChat specifies in [parsers.ts](/packages/data-provider/src/parsers.ts#L566)
that distinguishing saved vs. ephemeral agents can be accomplished by just checking for the `agent_`
prefix of the `agent_id`. Saved agents always start as `agent_*`, so our agent queries filter on
that prefix. Performing the `agents.countDocuments()` query is already clean since ephemeral agents
are never stored, but the conversation-level queries must filter explicitly.

**Platform Agents are identified by author.** There is currently no built-in flag distinguishing
official agents from user-created agents, so `platformAgentUsage.js` treats every agent authored by
`AGENT_CREATOR` (the admin who seeds them) as a Platform Agent. If that admin created an agent which
was never shared with the platform, that would be obvious to spot since `distinctUsers` would be 1.
Confirm that the user's ID is correct for the environment you're running against.

**Email domain is a proxy for agency.** Users have no department/agency field, but NJ agencies use
distinct email subdomains, so the domain works as a stand-in. Two caveats: some agencies may span
multiple distinct domains, and a few generic domains (a Gmail account, a generic Office365 account,
etc.) come through.

**Archiving doesn't delete data.** We have a job which archives conversations that have been
untouched for 60+ days, but it never removes conversations or messages. So message history is
complete all the way back, and `isArchived` is a "staleness" flag. `countConversations.js` thus
reports total, archived, and non-archived counts separately.

**File size quirks.** `fileSizeHistogram.js` divides by `1024 * 1024`, so a "1MB" bucket is really 1
MiB. As well, everything ≥25 MB collapses into a single `25+MB` bucket (this should be updated if we
ever support larger file sizes). There is also a bucket for files which are recorded as having zero
or null bytes. This should always have a count of zero, if it ever has any non-zero count, that is
worth investigating.

**Include a `collectedDate` for non-bucketed metrics.** Some of these metrics are bucketed and
produce consistent output for buckets in the past. Other metrics are currently not bucketed, they
produce different output depending on when you run them. In the future, we should shift more and
more towards using bucketed metrics only, but in the meantime, all non-bucketed data should be
reported along with the date when the query was executed.
