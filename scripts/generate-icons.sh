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

# Generate enabled state icons from main-icon.png
echo "Generating enabled state icons..."
convert main-icon.png -resize 16x16 extension/icon-16.png
echo "✓ Created extension/icon-16.png"

convert main-icon.png -resize 48x48 extension/icon-48.png
echo "✓ Created extension/icon-48.png"

convert main-icon.png -resize 128x128 extension/icon-128.png
echo "✓ Created extension/icon-128.png"

convert main-icon.png -resize 256x256 docs/icon-256.png
echo "✓ Created docs/icon-256.png"

# Generate disabled state icons from main-icon-off.png (if it exists)
if [ -f "main-icon-off.png" ]; then
    echo "Generating disabled state icons..."
    
    convert main-icon-off.png -resize 16x16 extension/icon-16-off.png
    echo "✓ Created extension/icon-16-off.png"
    
    convert main-icon-off.png -resize 48x48 extension/icon-48-off.png
    echo "✓ Created extension/icon-48-off.png"
    
    convert main-icon-off.png -resize 128x128 extension/icon-128-off.png
    echo "✓ Created extension/icon-128-off.png"
    
    echo "Disabled state icons generated successfully!"
else
    echo "Note: main-icon-off.png not found, skipping disabled state icons"
fi

echo "All icons generated successfully!"