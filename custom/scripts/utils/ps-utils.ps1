# PowerShell utility functions for LibreChat scripts

# Function to check if a string is Base64 encoded
function Test-IsBase64 {
    param([string]$Value)
    
    if ([string]::IsNullOrEmpty($Value)) { return $false }
    
    try {
        # Attempt to decode - if it fails, it's not valid Base64
        [Convert]::FromBase64String($Value) | Out-Null
        
        # Check if the string has valid Base64 length (multiple of 4)
        # and contains only valid Base64 characters
        return ($Value.Length % 4 -eq 0) -and ($Value -match "^[a-zA-Z0-9\+/]*={0,2}$")
    }
    catch {
        return $false
    }
}