# Open Clicker - Windows Build Script
# Run this on Windows to build the show-machine executable

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Open Clicker - Windows Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Host "[1/4] Checking Node.js..." -ForegroundColor Yellow
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "ERROR: Node.js not found!" -ForegroundColor Red
    Write-Host "Please install Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

$nodeVersion = node --version
Write-Host "      Node.js version: $nodeVersion" -ForegroundColor Green

# Check if we're in the right directory
if (!(Test-Path "package.json")) {
    Write-Host ""
    Write-Host "ERROR: package.json not found!" -ForegroundColor Red
    Write-Host "Please run this script from the show-machine-app directory" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Install dependencies
Write-Host ""
Write-Host "[2/4] Installing dependencies..." -ForegroundColor Yellow
Write-Host "      This may take a few minutes and will compile robotjs..." -ForegroundColor Gray
Write-Host ""
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: npm install failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "You may need to install Windows Build Tools:" -ForegroundColor Yellow
    Write-Host "  Run PowerShell as Administrator and execute:" -ForegroundColor Yellow
    Write-Host "  npm install --global windows-build-tools" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Or install Visual Studio Build Tools manually from:" -ForegroundColor Yellow
    Write-Host "  https://visualstudio.microsoft.com/downloads/" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# Test the app (optional)
Write-Host ""
Write-Host "[3/4] Testing app (optional)..." -ForegroundColor Yellow
Write-Host "      Press Ctrl+C in the next 5 seconds to skip testing" -ForegroundColor Gray
Start-Sleep -Seconds 5

if ($?) {
    Write-Host "      Starting Electron app for testing..." -ForegroundColor Gray
    Write-Host "      Close the app window when you're done testing" -ForegroundColor Gray
    Write-Host ""
    npm start
}

# Build
Write-Host ""
Write-Host "[4/4] Building Windows executable..." -ForegroundColor Yellow
Write-Host "      This will create both portable and installer versions..." -ForegroundColor Gray
Write-Host ""
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    Write-Host "Check the error messages above for details." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Success
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " BUILD SUCCESSFUL!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Your executables are ready in the 'dist' folder:" -ForegroundColor Green
Write-Host ""

# List built files
if (Test-Path "dist") {
    $portableExe = Get-ChildItem -Path "dist" -Filter "*portable.exe" -File | Select-Object -First 1
    $installerExe = Get-ChildItem -Path "dist" -Filter "*Setup*.exe" -File | Select-Object -First 1
    
    if ($portableExe) {
        Write-Host "  Portable EXE:" -ForegroundColor Cyan
        Write-Host "    dist\$($portableExe.Name)" -ForegroundColor White
        Write-Host "    Size: $([math]::Round($portableExe.Length / 1MB, 2)) MB" -ForegroundColor Gray
        Write-Host ""
    }
    
    if ($installerExe) {
        Write-Host "  Installer:" -ForegroundColor Cyan
        Write-Host "    dist\$($installerExe.Name)" -ForegroundColor White
        Write-Host "    Size: $([math]::Round($installerExe.Length / 1MB, 2)) MB" -ForegroundColor Gray
        Write-Host ""
    }
}

Write-Host "The portable .exe can be copied to any Windows PC and run without installation." -ForegroundColor Yellow
Write-Host "The installer provides a traditional setup experience with Start Menu shortcuts." -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Test the executable on a different Windows machine" -ForegroundColor White
Write-Host "  2. Upload to GitHub Releases for distribution" -ForegroundColor White
Write-Host "  3. Share the download link with users" -ForegroundColor White
Write-Host ""
