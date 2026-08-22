# Build Assets

## Icon

The Windows executable can use a custom icon. If you want to add one:

1. Create or obtain a 256x256 PNG icon for Open Clicker
2. Convert it to .ico format using a tool like ImageMagick or an online converter:
   ```bash
   convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
   ```
3. Place the `icon.ico` file in this directory

If no icon is provided, electron-builder will use the default Electron icon.
