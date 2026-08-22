# Build Assets

## Icons

### Windows

The Windows executable can use a custom icon. If you want to add one:

1. Create or obtain a 256x256 PNG icon for Open Clicker
2. Convert it to .ico format using a tool like ImageMagick or an online converter:
   ```bash
   convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
   ```
3. Place the `icon.ico` file in this directory

If no icon is provided, electron-builder will use the default Electron icon.

### macOS

The macOS app can use either a PNG or ICNS icon:

**Option 1: PNG (Simple)**
1. Create or obtain a 512x512 or 1024x1024 PNG icon
2. Place the `icon.png` file in this directory
3. electron-builder will automatically generate the .icns file

**Option 2: ICNS (Professional)**
1. Create an icon set with multiple sizes:
   ```bash
   mkdir icon.iconset
   # Add icon_16x16.png, icon_32x32.png, icon_128x128.png, icon_256x256.png, icon_512x512.png
   # Add @2x versions for Retina displays
   iconutil -c icns icon.iconset -o icon.icns
   ```
2. Place the `icon.icns` file in this directory

If no icon is provided, electron-builder will use the default Electron icon.
