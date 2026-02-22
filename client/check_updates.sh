#!/bin/bash

# Set the directory containing the package.json file
dir=${1:-.}

# Today's date and the date 3 days ago in seconds since the Unix epoch
today=$(date +%s)
three_days_ago=$(date -d "3 days ago" +%s)

# Read dependencies and devDependencies from package.json
dependencies=$(jq -r '.dependencies,.devDependencies|keys[]' "$dir/package.json")
packages=($dependencies) # Convert JSON array to bash array

# Array to hold update messages
declare -a updates

# Loop over each package
for pkg in "${packages[@]}"
do
    echo "Checking $pkg..."
    # Retrieve the version time information as JSON
    times=$(npm view "$pkg" time --json)

    # Loop through dates from the JSON object and check if any are within the last 3 days
    echo $times | jq -r '. | to_entries[] | select(.key as $k | $k|test("^[0-9]")) | [.key, .value] | @csv' | while IFS="," read -r version date
    do
        # Format the date to remove quotes and trim it
        date=$(echo $date | tr -d '"' | xargs)
        # Convert date to seconds since the Unix epoch
        version_date=$(date -d "$date" +%s)

        # Check if this date is within the last three days
        if (( version_date > three_days_ago && version_date <= today ))
        then
            # Convert UTC to Eastern Time (ET), ensuring compatibility
            et_date=$(date -u -d "$date" +"%Y-%m-%d %H:%M:%S UTC")
            et_date=$(date -d "$et_date -4 hours" +"%Y-%m-%d %H:%M:%S ET")
            update_message="Version $version of $pkg was released on $et_date"
            echo "$update_message"
            updates+=("$update_message")
        fi
    done
done

# Display all collected updates
if [ ${#updates[@]} -eq 0 ]; then
    echo "No recent updates found within the last three days."
else
    echo "Recent updates within the last three days:"
    printf "%s\n" "${updates[@]}"
fi
