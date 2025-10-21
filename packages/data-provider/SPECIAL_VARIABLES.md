# Special Variables in LibreChat

LibreChat supports special variables that can be used in agent prompts, conversation prompts, and other text fields. These variables are automatically replaced with their corresponding values at runtime.

## Available Special Variables

### Date and Time Variables

#### UTC-based Variables
- **`{{current_date}}`**: Current date in UTC timezone
  - Format: `YYYY-MM-DD (D)` where D is the day of week (0=Sunday, 1=Monday, etc.)
  - Example: `2024-04-29 (1)` (Monday, April 29, 2024)

- **`{{current_datetime}}`**: Current date and time in UTC timezone
  - Format: `YYYY-MM-DD HH:mm:ss (D)` where D is the day of week
  - Example: `2024-04-29 12:34:56 (1)` (Monday, April 29, 2024 at 12:34:56 PM UTC)

- **`{{iso_datetime}}`**: Current date and time in ISO 8601 format (UTC)
  - Format: ISO 8601 standard
  - Example: `2024-04-29T16:34:56.000Z`

#### Local Timezone Variables
- **`{{local_date}}`**: Current date in the user's local timezone
  - Format: `YYYY-MM-DD (D)` where D is the day of week
  - Example: `2024-04-29 (1)` (Monday, April 29, 2024 in user's timezone)
  - Note: Falls back to UTC if timezone is not available

- **`{{local_datetime}}`**: Current date and time in the user's local timezone
  - Format: `YYYY-MM-DD HH:mm:ss (D)` where D is the day of week
  - Example: `2024-04-29 08:34:56 (1)` (Monday, April 29, 2024 at 8:34:56 AM in America/New_York)
  - Note: Falls back to UTC if timezone is not available

### User Variables
- **`{{current_user}}`**: Name of the current user
  - Example: `John Doe`
  - Note: Only replaced if user information is available

## Day of Week Reference
- `0` = Sunday
- `1` = Monday
- `2` = Tuesday
- `3` = Wednesday
- `4` = Thursday
- `5` = Friday
- `6` = Saturday

## Usage Examples

### Agent Instructions
```
You are an AI assistant helping {{current_user}}.
Today's date is {{local_date}}.
Current time in user's timezone: {{local_datetime}}
UTC time: {{current_datetime}}
```

### System Prompts
```
System time (UTC): {{current_datetime}}
User's local time: {{local_datetime}}
Remember to consider the user's timezone when scheduling or discussing times.
```

### Conversation Starters
```
Good morning {{current_user}}! Today is {{local_date}}.
How can I help you today?
```

## Technical Details

### Timezone Detection
The user's timezone is automatically detected from their browser using the JavaScript `Intl.DateTimeFormat().resolvedOptions().timeZone` API. This provides an IANA timezone identifier (e.g., `America/New_York`, `Europe/London`, `Asia/Tokyo`).

### Fallback Behavior
If the timezone cannot be detected or is invalid:
- `{{local_date}}` falls back to `{{current_date}}` (UTC)
- `{{local_datetime}}` falls back to `{{current_datetime}}` (UTC)

### Case Insensitivity
All special variables are case-insensitive. The following are all equivalent:
- `{{current_date}}` = `{{Current_Date}}` = `{{CURRENT_DATE}}`
- `{{local_datetime}}` = `{{Local_DateTime}}` = `{{LOCAL_DATETIME}}`

## Implementation Notes

For developers working with special variables:

1. **Server-side processing**: The `replaceSpecialVars` function in `packages/data-provider/src/parsers.ts` handles all replacements.

2. **Timezone propagation**: The timezone is automatically included in API requests from the client.

3. **Testing**: Comprehensive tests are available in `packages/data-provider/specs/parsers.spec.ts`.

4. **Dependencies**: The implementation uses `dayjs` with `timezone` and `utc` plugins for timezone conversions.

## Migration Guide

If you were using the old UTC-only variables in your prompts, they continue to work exactly as before. The new local timezone variables are additive and don't break existing functionality.

### Upgrading Existing Prompts
```diff
- Current time (UTC): {{current_datetime}}
+ Current time (UTC): {{current_datetime}}
+ Current time (Your timezone): {{local_datetime}}
```

## Future Enhancements

Potential future additions:
- Custom date/time formats
- Relative time expressions (e.g., "tomorrow", "next week")
- User-specified timezone overrides
- Additional locale-aware formatting options
