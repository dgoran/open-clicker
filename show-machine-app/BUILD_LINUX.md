# Building the Linux App

This guide explains how to build the Open Clicker Show Machine Linux app (AppImage) on a Linux system.

## Prerequisites

### 1. Install Node.js

Download and install Node.js 18 LTS or newer from [nodejs.org](https://nodejs.org/)

Or use your package manager:

```bash
# Debian/Ubuntu
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Fedora/RHEL
sudo dnf install nodejs

# Arch
sudo pacman -S nodejs npm
```

Verify installation:
```bash
node --version
npm --version
```

### 2. Install Build Dependencies

robotjs requires native compilation. Install build tools and libraries:

**Debian/Ubuntu:**
```bash
sudo apt-get update
sudo apt-get install -y build-essential libxtst-dev libpng-dev
```

**Fedora/RHEL:**
```bash
sudo dnf install -y gcc-c++ make libXtst-devel libpng-devel
```

**Arch:**
```bash
sudo pacman -S base-devel libxtst libpng
```

### 3. Install Git (Optional)

Only needed if you're cloning the repository. Most Linux distributions include git.

```bash
git --version
```

If not installed:
```bash
# Debian/Ubuntu
sudo apt-get install git

# Fedora/RHEL
sudo dnf install git

# Arch
sudo pacman -S git
```

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

This will compile robotjs for Linux. **This step requires the build dependencies from Prerequisites #2.**

If you see errors about missing build tools, go back to Prerequisites #2.

### 3. Test the App (Optional)

Before building the AppImage, you can test it:

```bash
npm start
```

This opens the Electron app. Test connecting to a session.

### 4. Build the AppImage

```bash
npm run build:linux
```

This builds an x64 AppImage, creating a portable executable.

Build time: 2-3 minutes depending on your system's speed.

### 5. Find Your App

Built file is in the `dist` folder:

- **AppImage**: `dist/Open Clicker Show Machine-1.8.0.AppImage`

The AppImage is a portable executable that works on most Linux distributions.

## Build Script (Bash)

For convenience, you can use this bash script to automate the build:

```bash
#!/bin/bash
# Save this as build.sh in the show-machine-app folder

echo "Open Clicker - Linux Build Script"
echo "=================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Please install Node.js from nodejs.org"
    exit 1
fi

echo "Node.js version: $(node --version)"

# Check for build tools
if ! command -v gcc &> /dev/null; then
    echo "ERROR: Build tools not found."
    echo "Install with: sudo apt-get install build-essential libxtst-dev libpng-dev"
    exit 1
fi

echo "Build tools: OK"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: npm install failed. Check error messages above."
    echo "TIP: Make sure build dependencies are installed."
    exit 1
fi

# Build
echo ""
echo "Building Linux AppImage..."
npm run build:linux
if [ $? -ne 0 ]; then
    echo "ERROR: Build failed. Check error messages above."
    exit 1
fi

# Success
echo ""
echo "SUCCESS! Build complete."
echo "Find your app in the 'dist' folder:"
echo "  - AppImage: dist/Open Clicker Show Machine-1.8.0.AppImage"
echo ""
echo "To run:"
echo "  chmod +x dist/Open\ Clicker\ Show\ Machine-1.8.0.AppImage"
echo "  ./dist/Open\ Clicker\ Show\ Machine-1.8.0.AppImage"
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

1. **Install build dependencies**:
   ```bash
   # Debian/Ubuntu
   sudo apt-get install -y build-essential libxtst-dev libpng-dev
   
   # Fedora/RHEL
   sudo dnf install -y gcc-c++ make libXtst-devel libpng-devel
   
   # Arch
   sudo pacman -S base-devel libxtst libpng
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
npm run build:linux
```

### Build succeeds but AppImage doesn't work

**Issue**: The app crashes on launch or shows errors

**Solution**: This usually means robotjs wasn't properly compiled. Try:

1. Delete `node_modules` and `package-lock.json`:
   ```bash
   rm -rf node_modules package-lock.json
   ```
2. Run `npm install` again
3. Run `npm start` to test before building
4. If `npm start` works, build again with `npm run build:linux`

### AppImage won't execute

**Issue**: Permission denied or file not executable

**Solution**: Make the AppImage executable:
```bash
chmod +x "Open Clicker Show Machine-1.8.0.AppImage"
./Open\ Clicker\ Show\ Machine-1.8.0.AppImage
```

### Keyboard injection not working

**Issue**: App connects but doesn't inject keys

**Solutions**:

1. **Install X11 libraries** (usually pre-installed):
   ```bash
   # Debian/Ubuntu
   sudo apt-get install libxtst6
   
   # Fedora/RHEL
   sudo dnf install libXtst
   
   # Arch
   sudo pacman -S libxtst
   ```

2. **Check X11 is running**: AppImages require X11. Wayland users should enable XWayland compatibility.

3. **Test manually**: Try pressing keys when focused on a text editor to verify robotjs is working

## Testing the App

### Test on Your Linux System

1. Start the Open Clicker server:
   ```bash
   cd ..  # Go to project root
   npm install  # If not already done
   npm start
   ```

2. In a browser, open `http://localhost:3000/producer.html` and create a session

3. Run your built AppImage:
   ```bash
   chmod +x dist/Open\ Clicker\ Show\ Machine-1.8.0.AppImage
   ./dist/Open\ Clicker\ Show\ Machine-1.8.0.AppImage
   ```

4. Connect to `http://localhost:3000` with the session code

5. Open a browser presentation or LibreOffice Impress

6. Use the web clicker at `http://localhost:3000/clicker.html` to test

### Test on Another Linux System

To test on a different Linux distribution (simulating a real user):

1. Copy the `.AppImage` to the other system
2. Make it executable and run it
3. Test connecting to a remote server

## Publishing the Release

Once built and tested, you can:

1. **Test on different distributions** if possible
   - Ubuntu/Debian
   - Fedora/RHEL
   - Arch
   - Other popular distributions

2. **Upload to GitHub Releases**:
   - Go to your repository on GitHub
   - Click "Releases" → "Draft a new release"
   - Upload the AppImage
   - Add release notes
   - Mention X11 requirement and libxtst

3. **Document the installation**:
   - Link to the README's Linux section
   - Explain how to make AppImage executable
   - Note X11 requirement

## Continuous Integration (CI/CD)

For automated builds, GitHub Actions can build Linux AppImages on Ubuntu runners:

```yaml
# .github/workflows/build-linux.yml
name: Build Linux App

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install system dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y libxtst-dev libpng-dev build-essential
      - name: Install dependencies
        working-directory: show-machine-app
        run: npm ci
      - name: Build
        working-directory: show-machine-app
        run: npm run build:linux
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: linux-appimage
          path: show-machine-app/dist/*.AppImage
```

This automatically builds the Linux AppImage whenever you create a new release tag.

## Runtime Dependencies

The AppImage bundles most dependencies, but requires these system libraries:

**Required**:
- X11 (libX11)
- libXtst (X11 extension for keyboard/mouse injection)
- glibc (standard C library)

**Usually pre-installed** on desktop Linux distributions. If keyboard injection doesn't work, install:

```bash
# Debian/Ubuntu
sudo apt-get install libxtst6

# Fedora/RHEL
sudo dnf install libXtst

# Arch
sudo pacman -S libxtst
```

## Wayland Compatibility

The app requires X11 for keyboard injection. On Wayland systems:

1. XWayland is usually enabled by default
2. The app will run through XWayland compatibility layer
3. Keyboard injection should work normally

If issues occur on Wayland, try launching the app with:
```bash
GDK_BACKEND=x11 ./Open\ Clicker\ Show\ Machine-1.8.0.AppImage
```

## Support

If you encounter issues not covered here:

1. Check the [main README](README.md)
2. Open an issue on [GitHub](https://github.com/dgoran/open-clicker/issues)
3. Include error messages and your Linux distribution/Node.js versions
