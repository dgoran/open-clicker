# Building the Windows Executable

This guide explains how to build the Open Clicker Show Machine Windows executable on a Windows computer.

## Prerequisites

### 1. Install Node.js

Download and install Node.js 18 LTS or newer from [nodejs.org](https://nodejs.org/)

Verify installation:
```cmd
node --version
npm --version
```

### 2. Install Windows Build Tools

robotjs requires native compilation. Install Visual Studio Build Tools:

**Option A: Using npm (Recommended)**
```cmd
npm install --global windows-build-tools
```

This installs Python and Visual Studio Build Tools automatically. **Run as Administrator**.

**Option B: Manual Installation**

1. Install Python 3.x from [python.org](https://www.python.org/)
2. Install Visual Studio 2019 or 2022 Build Tools from [visualstudio.microsoft.com](https://visualstudio.microsoft.com/downloads/)
   - Select "Desktop development with C++"

### 3. Install Git (Optional)

Only needed if you're cloning the repository. Download from [git-scm.com](https://git-scm.com/)

## Build Steps

### 1. Get the Source Code

**Option A: Clone with Git**
```cmd
git clone https://github.com/dgoran/open-clicker.git
cd open-clicker\show-machine-app
```

**Option B: Download ZIP**
1. Download the repository as ZIP from GitHub
2. Extract it
3. Open Command Prompt or PowerShell
4. Navigate to the `show-machine-app` folder

### 2. Install Dependencies

```cmd
npm install
```

This will compile robotjs for Windows. **This step requires the build tools from Prerequisites #2.**

If you see errors about missing Python or Visual Studio, go back to Prerequisites #2.

### 3. Test the App (Optional)

Before building the executable, you can test the app:

```cmd
npm start
```

This opens the Electron app. Test connecting to a session.

### 4. Build the Executable

**Build everything (portable + installer):**
```cmd
npm run build
```

**Build only portable .exe:**
```cmd
npm run build:portable
```

**Build only installer:**
```cmd
npm run build:installer
```

### 5. Find Your Executable

Built files are in the `dist` folder:

- **Portable**: `dist/Open Clicker Show Machine-1.8.4-portable.exe`
- **Installer**: `dist/Open Clicker Show Machine Setup 1.8.4.exe`

The portable .exe is a single file that can be copied to any Windows computer and run immediately.

## Build Script (PowerShell)

For convenience, you can use this PowerShell script to automate the build:

```powershell
# Save this as build.ps1 in the show-machine-app folder

Write-Host "Open Clicker - Windows Build Script" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js not found. Please install Node.js from nodejs.org" -ForegroundColor Red
    exit 1
}

Write-Host "Node.js version: $(node --version)" -ForegroundColor Green

# Install dependencies
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install failed. Check error messages above." -ForegroundColor Red
    Write-Host "TIP: You may need to install Windows Build Tools: npm install --global windows-build-tools" -ForegroundColor Yellow
    exit 1
}

# Build
Write-Host ""
Write-Host "Building Windows executable..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed. Check error messages above." -ForegroundColor Red
    exit 1
}

# Success
Write-Host ""
Write-Host "SUCCESS! Build complete." -ForegroundColor Green
Write-Host "Find your executable in the 'dist' folder:" -ForegroundColor Green
Write-Host "  - Portable: dist/Open Clicker Show Machine-1.8.4-portable.exe" -ForegroundColor Cyan
Write-Host "  - Installer: dist/Open Clicker Show Machine Setup 1.8.4.exe" -ForegroundColor Cyan
```

Run it with:
```powershell
PowerShell -ExecutionPolicy Bypass -File build.ps1
```

## Troubleshooting

### robotjs Installation Failed

**Error**: `gyp ERR! build error` or `node-gyp rebuild failed`

**Solutions**:

1. **Install Windows Build Tools** (Run as Administrator):
   ```cmd
   npm install --global windows-build-tools
   ```

2. **Use the correct Node.js version**:
   - robotjs works best with Node.js 18 LTS or 20 LTS
   - Avoid the very latest Node versions if you see errors

3. **Check Python**:
   ```cmd
   python --version
   ```
   Should show Python 3.x. If not, install Python from python.org

4. **Clean and retry**:
   ```cmd
   rmdir /s /q node_modules
   del package-lock.json
   npm install
   ```

### electron-builder: Cannot find module

**Error**: `Cannot find module` during build

**Solution**: Ensure you're in the `show-machine-app` folder and dependencies are installed:
```cmd
cd show-machine-app
npm install
npm run build
```

### Build succeeds but .exe doesn't work

**Issue**: The executable opens briefly then closes, or shows errors

**Solution**: This usually means robotjs wasn't properly compiled. Try:

1. Delete `node_modules` and `package-lock.json`
2. Run `npm install` again
3. Run `npm start` to test before building
4. If `npm start` works, build again with `npm run build`

### "Windows protected your PC" when running

This is expected for unsigned executables. It's not an error—just a Windows SmartScreen warning.

**To run**: Click "More info" → "Run anyway"

## Publishing the Release

Once built, you can:

1. **Test the executable** on a clean Windows machine
2. **Upload to GitHub Releases**:
   - Go to your repository on GitHub
   - Click "Releases" → "Draft a new release"
   - Upload both the portable .exe and installer
   - Add release notes

3. **Share the download link** with users

## Continuous Integration (CI/CD)

For automated builds, you can use GitHub Actions with a Windows runner:

```yaml
# .github/workflows/build-windows.yml
name: Build Windows App

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install dependencies
        working-directory: show-machine-app
        run: npm install
      - name: Build
        working-directory: show-machine-app
        run: npm run build
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: windows-executables
          path: show-machine-app/dist/*.exe
```

This automatically builds the Windows executable whenever you create a new release tag.

## Support

If you encounter issues not covered here:

1. Check the [main README](../README.md)
2. Open an issue on [GitHub](https://github.com/dgoran/open-clicker/issues)
3. Include error messages and your Windows/Node.js versions
