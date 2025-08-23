#!/bin/bash

# Check if main-icon.png exists
if [ ! -f "main-icon.png" ]; then
    echo "Error: main-icon.png not found in the current directory"
    echo "Please ensure main-icon.png exists in the project root"
    exit 1
fi

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "ImageMagick is not installed. Installing via Homebrew..."
    if command -v brew &> /dev/null; then
        brew install imagemagick
    else
        echo "Error: Homebrew is not installed. Please install ImageMagick manually:"
        echo "  brew install imagemagick"
        exit 1
    fi
fi

echo "Generating Chrome extension icons..."

# Generate 16x16 icon
convert main-icon.png -resize 16x16 extension/icon-16.png
echo "✓ Created extension/icon-16.png"

# Generate 48x48 icon
convert main-icon.png -resize 48x48 extension/icon-48.png
echo "✓ Created extension/icon-48.png"

# Generate 128x128 icon
convert main-icon.png -resize 128x128 extension/icon-128.png
echo "✓ Created extension/icon-128.png"

echo "All icons generated successfully!"