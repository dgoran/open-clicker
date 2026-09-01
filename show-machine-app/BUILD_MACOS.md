# Building the macOS App

This guide explains how to build the Open Clicker Show Machine macOS app for Apple Silicon Macs.

**Note**: Only Apple Silicon (M1/M2/M3/M4) is supported. Intel Mac builds have been discontinued.

## Prerequisites

### 1. Install Node.js

Download and install Node.js 18 LTS or newer from [nodejs.org](https://nodejs.org/)

Verify installation:
```bash
node --version
npm --version
```

### 2. Install Xcode Command Line Tools

robotjs requires native compilation. Install Xcode Command Line Tools:

```bash
xcode-select --install
```

Click "Install" in the dialog that appears. This installs compilers and build tools needed for native modules.

To verify installation:
```bash
xcode-select -p
# Should show: /Library/Developer/CommandLineTools
```

### 3. Install Git (Optional)

Only needed if you're cloning the repository. macOS usually includes git. Check with:
```bash
git --version
```

If not installed, it will prompt you to install it, or download from [git-scm.com](https://git-scm.com/)

## Build Steps

### 1. Get the Source Code

**Option A: Clone with Git**
```bash
git clone https://github.com/dgoran/open-clicker.git
cd open-clicker/show-machine-app
```

**Option B: Download ZIP**
1. Download the repository as ZIP from GitHub
2. Extract it
3. Open Terminal
4. Navigate to the `show-machine-app` folder:
   ```bash
   cd ~/Downloads/open-clicker-main/show-machine-app
   ```

### 2. Install Dependencies

```bash
npm install
```

This will compile robotjs for macOS. **This step requires Xcode Command Line Tools from Prerequisites #2.**

If you see errors about missing build tools, go back to Prerequisites #2.

### 3. Test the App (Optional)

Before building the app bundle, you can test it:

```bash
npm start
```

This opens the Electron app. Test connecting to a session.

### 4. Build the App

```bash
npm run build:mac
```

This builds Apple Silicon (arm64) versions, creating:
- `.dmg` disk image (user-friendly installer)
- `.zip` archive (alternative distribution)

Build time: 2-3 minutes depending on your Mac's speed.

### 5. Find Your App

Built files are in the `dist` folder:

- **Apple Silicon DMG**: `dist/Open Clicker Show Machine-1.8.0-arm64.dmg`
- **Apple Silicon ZIP**: `dist/Open Clicker Show Machine-1.8.0-arm64-mac.zip`

The DMG file provides the best user experience—users just drag the app to Applications.

## Build Script (Bash)

For convenience, you can use this bash script to automate the build:

```bash
#!/bin/bash
# Save this as build.sh in the show-machine-app folder

echo "Open Clicker - macOS Build Script"
echo "================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Please install Node.js from nodejs.org"
    exit 1
fi

echo "Node.js version: $(node --version)"

# Check Xcode Command Line Tools
if ! xcode-select -p &> /dev/null; then
    echo "ERROR: Xcode Command Line Tools not found."
    echo "Install with: xcode-select --install"
    exit 1
fi

echo "Xcode tools: $(xcode-select -p)"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: npm install failed. Check error messages above."
    echo "TIP: Make sure Xcode Command Line Tools are installed: xcode-select --install"
    exit 1
fi

# Build
echo ""
echo "Building macOS app..."
npm run build:mac
if [ $? -ne 0 ]; then
    echo "ERROR: Build failed. Check error messages above."
    exit 1
fi

# Success
echo ""
echo "SUCCESS! Build complete."
echo "Find your apps in the 'dist' folder:"
echo "  - Apple Silicon DMG: dist/Open Clicker Show Machine-1.8.0-arm64.dmg"
echo "  - Apple Silicon ZIP: dist/Open Clicker Show Machine-1.8.0-arm64-mac.zip"
```

Make it executable and run:
```bash
chmod +x build.sh
./build.sh
```

## Troubleshooting

### robotjs Installation Failed

**Error**: `gyp ERR! build error` or `node-gyp rebuild failed`

**Solutions**:

1. **Install Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```

2. **Use the correct Node.js version**:
   - robotjs works best with Node.js 18 LTS or 20 LTS
   - Avoid the very latest Node versions if you see errors

3. **Clean and retry**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### electron-builder: Cannot find module

**Error**: `Cannot find module` during build

**Solution**: Ensure you're in the `show-machine-app` folder and dependencies are installed:
```bash
cd show-machine-app
npm install
npm run build:mac
```

### Build succeeds but app doesn't work

**Issue**: The app crashes on launch or shows errors

**Solution**: This usually means robotjs wasn't properly compiled. Try:

1. Delete `node_modules` and `package-lock.json`:
   ```bash
   rm -rf node_modules package-lock.json
   ```
2. Run `npm install` again
3. Run `npm start` to test before building
4. If `npm start` works, build again with `npm run build:mac`

### "App can't be opened" or "damaged" Gatekeeper warning

This is **expected** for unsigned apps. It's not an error—macOS protects users from unsigned software.

#### Recommended Fix (works for "damaged" dialog):

1. **Copy the app to Applications**:
   ```bash
   cp -r "dist/mac/Open Clicker Show Machine.app" /Applications/
   ```

2. **Remove the quarantine attribute**:
   ```bash
   xattr -cr "/Applications/Open Clicker Show Machine.app"
   ```

3. **Launch the app** from Applications

This removes the quarantine flag that macOS applies to downloaded files.

#### Alternative (may not work for "damaged" dialog):

1. Right-click the app in Finder
2. Choose "Open" from the context menu
3. Click "Open" in the confirmation dialog

**Note**: Do NOT disable Gatekeeper system-wide (`spctl --master-disable`). The methods above create exceptions only for this app.

### Keyboard injection not working

**Issue**: App connects but doesn't inject keys

**Solutions**:

1. **Grant Accessibility permissions**:
   - Open System Settings → Privacy & Security → Accessibility
   - Add "Open Clicker Show Machine" and enable it
   - Restart the app

2. **Test manually**: Try pressing keys when focused on a text editor to verify robotjs is working

3. **Check the app isn't sandboxed**: Self-built apps should work, but sandboxing can block keyboard injection

## Testing the App

### Test on Your Mac

1. Start the Open Clicker server:
   ```bash
   cd ..  # Go to project root
   npm install  # If not already done
   npm start
   ```

2. In a browser, open `http://localhost:3000/producer.html` and create a session

3. Run your built app from `dist/Open Clicker Show Machine.app`

4. Connect to `http://localhost:3000` with the session code

5. Open Keynote, PowerPoint, or a browser presentation

6. Use the web clicker at `http://localhost:3000/clicker.html` to test

### Test on Another Mac

To test on a different Mac (simulating a real user):

1. Copy the `.dmg` or `.zip` to another Apple Silicon Mac
2. Install the app
3. Grant Accessibility permissions
4. Test connecting to a remote server

## Publishing the Release

Once built and tested, you can:

1. **Test on Apple Silicon Mac** (M1/M2/M3/M4)

2. **Upload to GitHub Releases**:
   - Go to your repository on GitHub
   - Click "Releases" → "Draft a new release"
   - Upload both files (.dmg and .zip for Apple Silicon)
   - Add release notes
   - Mention Gatekeeper (right-click → Open) and Accessibility permissions

3. **Document the installation**:
   - Link to the README's security section
   - Note that only Apple Silicon is supported
   - Mention unsigned app workflow

## Continuous Integration (CI/CD)

For automated builds, GitHub Actions can build macOS apps on macOS runners:

```yaml
# .github/workflows/build-macos.yml
name: Build macOS App

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        working-directory: show-machine-app
        run: npm ci
      - name: Build
        working-directory: show-machine-app
        run: npm run build:mac
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: macos-apps
          path: |
            show-machine-app/dist/*.dmg
            show-machine-app/dist/*.zip
```

This automatically builds macOS apps whenever you create a new release tag.

**Note**: GitHub's macOS runners build Apple Silicon versions.

## Code Signing (Optional - Advanced)

To distribute without Gatekeeper warnings, you need:

1. **Apple Developer Account** ($99/year)
2. **Developer ID Application certificate**
3. **Notarization** via Apple's notary service

This is beyond the scope of the basic build, but electron-builder supports it:

```json
// In package.json build.mac section
{
  "mac": {
    "identity": "Developer ID Application: Your Name (TEAM_ID)",
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "entitlements.mac.plist",
    "entitlementsInherit": "entitlements.mac.plist"
  }
}
```

Then run:
```bash
npm run build:mac
xcrun notarytool submit dist/Open\ Clicker\ Show\ Machine-1.8.0-x64.dmg \
  --apple-id your@email.com --team-id TEAM_ID --password app-specific-password
```

For most open-source projects, unsigned builds with right-click → Open are acceptable.

## Support

If you encounter issues not covered here:

1. Check the [main README](README.md)
2. Open an issue on [GitHub](https://github.com/dgoran/open-clicker/issues)
3. Include error messages and your macOS/Node.js versions
