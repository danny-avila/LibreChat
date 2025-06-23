#!/bin/bash

# Setup script for embedding generation cron job
# This will install a cron job to run the embedding generation script periodically

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="$SCRIPT_DIR/generate-missing-embeddings.js"
LOG_PATH="$SCRIPT_DIR/../logs/embedding-generation.log"

# Default cron schedule: every hour at minute 15
CRON_SCHEDULE="${1:-15 * * * *}"

echo "🔧 Setting up embedding generation cron job..."
echo "Script path: $SCRIPT_PATH"
echo "Log path: $LOG_PATH"
echo "Schedule: $CRON_SCHEDULE"

# Create logs directory if it doesn't exist
mkdir -p "$(dirname "$LOG_PATH")"

# Create the cron job entry
CRON_JOB="$CRON_SCHEDULE cd $SCRIPT_DIR && node generate-missing-embeddings.js --limit=50 --batch-size=5 >> $LOG_PATH 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "generate-missing-embeddings.js"; then
    echo "⚠️  Cron job already exists. Removing old one..."
    crontab -l 2>/dev/null | grep -v "generate-missing-embeddings.js" | crontab -
fi

# Add the new cron job
echo "📅 Adding cron job..."
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "✅ Cron job installed successfully!"
echo ""
echo "The script will run with the following schedule:"
echo "  $CRON_SCHEDULE"
echo ""
echo "To view the cron job:"
echo "  crontab -l"
echo ""
echo "To remove the cron job:"
echo "  crontab -e  # and delete the line containing 'generate-missing-embeddings.js'"
echo ""
echo "To view logs:"
echo "  tail -f $LOG_PATH"
echo ""
echo "To test the script manually:"
echo "  cd $SCRIPT_DIR && node generate-missing-embeddings.js --dry-run"