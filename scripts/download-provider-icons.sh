#!/bin/bash

# Download Provider Icons for OpenRouter Integration
# This script downloads provider logos that are missing from the assets directory

ASSETS_DIR="client/public/assets"

# Ensure we're in the LibreChat root directory
if [ ! -f "package.json" ] || [ ! -d "client" ]; then
    echo "Error: This script must be run from the LibreChat root directory"
    exit 1
fi

# Create assets directory if it doesn't exist
mkdir -p "$ASSETS_DIR"

echo "Downloading provider icons..."

# Meta/Facebook logo (for Llama models)
if [ ! -f "$ASSETS_DIR/meta.png" ]; then
    echo "Downloading Meta logo..."
    curl -s -o "$ASSETS_DIR/meta.png" "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Meta_Platforms_Inc._logo.svg/240px-Meta_Platforms_Inc._logo.svg.png"
fi

# DeepSeek logo
if [ ! -f "$ASSETS_DIR/deepseek.png" ]; then
    echo "Downloading DeepSeek logo..."
    # Using a placeholder as DeepSeek logo may need to be obtained from their official site
    # For now, we'll use the letter icon in the code
    echo "DeepSeek logo not available - using letter icon"
fi

# xAI logo (Grok models)
if [ ! -f "$ASSETS_DIR/x-ai.png" ]; then
    echo "Downloading xAI logo..."
    # xAI typically uses the X logo
    curl -s -o "$ASSETS_DIR/x-ai.png" "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/X_logo_2023.svg/240px-X_logo_2023.svg.png"
fi

# NVIDIA logo
if [ ! -f "$ASSETS_DIR/nvidia.png" ]; then
    echo "Downloading NVIDIA logo..."
    curl -s -o "$ASSETS_DIR/nvidia.png" "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/NVIDIA_logo.svg/240px-NVIDIA_logo.svg.png"
fi

# Hugging Face logo
if [ ! -f "$ASSETS_DIR/huggingface.png" ]; then
    echo "Downloading Hugging Face logo..."
    curl -s -o "$ASSETS_DIR/huggingface.png" "https://huggingface.co/front/assets/huggingface_logo-noborder.png"
fi

# AI21 Labs logo
if [ ! -f "$ASSETS_DIR/ai21.png" ]; then
    echo "Downloading AI21 Labs logo..."
    # Using a placeholder - actual logo should be obtained from AI21
    echo "AI21 logo not available - using letter icon"
fi

# Inflection AI logo
if [ ! -f "$ASSETS_DIR/inflection.png" ]; then
    echo "Downloading Inflection AI logo..."
    # Using a placeholder - actual logo should be obtained from Inflection
    echo "Inflection logo not available - using letter icon"
fi

# Databricks logo
if [ ! -f "$ASSETS_DIR/databricks.png" ]; then
    echo "Downloading Databricks logo..."
    curl -s -o "$ASSETS_DIR/databricks.png" "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Databricks_Logo.png/240px-Databricks_Logo.png"
fi

# Alibaba/Qwen logo
if [ ! -f "$ASSETS_DIR/alibaba.png" ]; then
    echo "Downloading Alibaba logo..."
    curl -s -o "$ASSETS_DIR/alibaba.png" "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Alibaba_Group_Logo.svg/240px-Alibaba_Group_Logo.svg.png"
fi

echo "Icon download complete!"
echo ""
echo "Note: Some provider logos are not publicly available and will use stylized letter icons instead."
echo "You can manually add provider logos to $ASSETS_DIR/ if you have access to them."
echo ""
echo "Icons successfully downloaded:"
ls -la "$ASSETS_DIR"/*.png 2>/dev/null | grep -E "(meta|x-ai|nvidia|huggingface|databricks|alibaba)\.png" | awk '{print "  - " $NF}'