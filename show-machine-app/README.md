# Open Clicker - Show Machine App

Standalone desktop applications for the Open Clicker show-machine client. No Node.js installation required on the show machine.

Available for:
- **Windows**: Portable .exe and installer
- **macOS**: .dmg and .zip for Apple Silicon (M1/M2/M3/M4)
- **Linux**: AppImage (x64)

## Download Pre-Built Applications

**For Users**: Download the latest release from the [Releases page](https://github.com/dgoran/open-clicker/releases).

### Windows

Two versions are available:
- **Portable**: `Open Clicker Show Machine-1.7.0-portable.exe` - No installation required, just run it
- **Installer**: `Open Clicker Show Machine Setup 1.7.0.exe` - Traditional Windows installer with Start Menu shortcut

### macOS

Two versions are available:
- **DMG (Apple Silicon)**: `Open Clicker Show Machine-1.7.0-arm64.dmg` - Disk image for M1/M2/M3/M4 Macs
- **ZIP (Apple Silicon)**: `Open Clicker Show Machine-1.7.0-arm64-mac.zip` - Zip archive for M1/M2/M3/M4 Macs

**Note**: macOS apps are **unsigned** and will trigger Gatekeeper warnings. See [macOS Security](#macos-security) below.

### Linux

One version is available:
- **AppImage (x64)**: `Open Clicker Show Machine-1.7.0.AppImage` - Portable Linux application

**Note**: Requires X11 and libxtst. Most desktop Linux distributions include these by default.

### Automated Builds

Windows, macOS, and Linux applications are automatically built via GitHub Actions:
- Every push to `main` that modifies `show-machine-app/`
- Every pull request that modifies `show-machine-app/`
- Every version tag (e.g., `v1.0.0`)

Tagged releases automatically upload executables to the Releases page. Other builds are available as workflow artifacts on the [Actions page](https://github.com/dgoran/open-clicker/actions).

## Features

- **No Node.js Required**: Runs on any Windows, macOS, or Linux machine without installing Node.js or npm
- **Paste the Cue Link**: Paste the cue link straight from the producer dashboard and the app fills in both the server and the session code; a bare 6-character code also works
- **Target App Selection**: Choose to control PowerPoint, Keynote, or any focused window
- **Real Keyboard Injection**: Uses system-level keyboard simulation to control PowerPoint, browser slides, PDF viewers, etc.
- **Manual Arrows**: Advance or go back straight from the app, without touching a phone
- **Screen Casting**: Send screenshots of a chosen monitor to the presenters' clickers, with a resolution slider and a live bandwidth readout
- **Speaker Notes**: Read the current slide's notes out of PowerPoint or Keynote and push them to the presenters' phones
- **Activity Log**: See every next/prev command, feature change, and error as it happens
- **Resilient Reconnection**: Retries indefinitely and rejoins automatically, so a server restart or network blip does not end your show

### Screen casting and speaker notes

Both are opt-in on **both** ends. The producer enables the feature for the session
(Feature Settings on the producer dashboard), and you tick the matching box in the app.
Until the producer enables it, the checkbox stays disabled and tells you so.

- **Screen casting** needs Screen Recording permission on macOS
  (System Settings > Privacy & Security > Screen Recording). Frames are sent every 2
  seconds as JPEG; pick the resolution with the quality slider and watch the measured
  bandwidth underneath.
- **Speaker notes** require PowerPoint or Keynote to be running with a presentation
  open. Notes are read every 1.5 seconds and only sent when they change. This is not
  available on Linux, which has no PowerPoint or Keynote automation.

Key injection is optional: if `robotjs` fails to load, the app still connects and works
as a manual clicker, screen caster, and speaker-notes bridge.

## Usage

### 1. Start the Open Clicker Server

On your server machine (can be the same machine or a different computer on the network):

```bash
npm start
```

The server runs at `http://localhost:3000` by default.

### 2. Create a Session

Open `http://localhost:3000/producer.html` in a browser and create a session. Note the 6-character session code.

### 3. Run the Show Machine App

#### Choosing the Target Application

The show machine app lets you choose which application to control:

- **Focused Window** (default): Sends arrow keys to whichever window is currently active. Works with browser-based presentations (Google Slides, reveal.js, etc.), PDF viewers, and any application that uses arrow keys for navigation. This is the traditional behavior and maintains compatibility with all workflows.

- **PowerPoint** (Windows & macOS): Automatically brings PowerPoint to the foreground and sends arrow keys to it. The app will bring PowerPoint forward whenever you click next/prev, so you can have other windows open without accidentally advancing them. PowerPoint must be running.

- **Keynote** (macOS only): Automatically brings Keynote to the foreground and sends arrow keys to it. The app will bring Keynote forward whenever you click next/prev. Keynote must be running. This option is hidden on Windows and Linux.

**Permissions:**
- **macOS**: When using PowerPoint or Keynote targets, the first time you connect the system may prompt you to grant **Accessibility** permissions. This is required to detect and activate applications. See [macOS Accessibility](#macos-accessibility) for setup instructions.

**Persistence:** Your target app choice is automatically saved and will be remembered when you restart the application.

**Platform Notes:**
- **Linux**: PowerPoint and Keynote are not typically available on Linux. The "Focused Window" option works well with LibreOffice Impress, browser presentations, and PDF viewers.

#### Windows

On the Windows computer running your presentation:

1. Download and run `Open Clicker Show Machine-1.7.0-portable.exe`
2. If Windows SmartScreen appears, click "More info" → "Run anyway" (see [Windows Security](#windows-security))
3. Enter the **Server URL** (e.g., `http://192.168.1.100:3000` or `http://localhost:3000`)
4. Enter the **Session Code** from the producer
5. Choose your **Target Application**:
   - **Focused Window**: Keys sent to whatever window is active
   - **PowerPoint**: Automatically activates PowerPoint and sends keys to it
6. Click **Connect**
7. If using "Focused Window", focus your presentation window
8. If using "PowerPoint", ensure PowerPoint is running with your presentation open
9. Use your phone or web clicker to control the slides!

#### macOS

On the Mac running your presentation:

1. Download the **arm64** .dmg or .zip from [Releases](https://github.com/dgoran/open-clicker/releases)
   - **Note**: Apple Silicon (M1/M2/M3/M4) only. Intel Macs are not supported.
2. Install the app:
   - **DMG**: Open the .dmg and drag the app to `/Applications`
   - **ZIP**: Extract the .zip and move the app to `/Applications`
3. **Remove quarantine** (important - see [macOS Security](#macos-security)):
   ```bash
   xattr -cr "/Applications/Open Clicker Show Machine.app"
   ```
4. Launch the app:
   - Open from Applications
   - If blocked, right-click the app and choose "Open"
   - Click "Open" in the Gatekeeper dialog
5. Grant **Accessibility** permissions when prompted (required for keyboard injection - see [macOS Accessibility](#macos-accessibility))
6. Enter the **Server URL** (e.g., `http://192.168.1.100:3000` or `http://localhost:3000`)
7. Enter the **Session Code** from the producer
8. Choose your **Target Application**:
   - **Focused Window**: Keys sent to whatever window is active
   - **PowerPoint**: Automatically activates PowerPoint and sends keys to it
   - **Keynote**: Automatically activates Keynote and sends keys to it
9. Click **Connect**
10. If using "Focused Window", focus your presentation window
11. If using "PowerPoint" or "Keynote", ensure the app is running with your presentation open
12. Use your phone or web clicker to control the slides!

#### Linux

On the Linux computer running your presentation:

1. Download the .AppImage from [Releases](https://github.com/dgoran/open-clicker/releases)
2. Make it executable:
   ```bash
   chmod +x Open-Clicker-Show-Machine-*.AppImage
   ```
3. Run the app:
   ```bash
   ./Open-Clicker-Show-Machine-*.AppImage
   ```
4. Enter the **Server URL** (e.g., `http://192.168.1.100:3000` or `http://localhost:3000`)
5. Enter the **Session Code** from the producer
6. Choose your **Target Application**:
   - **Focused Window**: Keys sent to whatever window is active (recommended for Linux)
   - **PowerPoint**: Listed but not typically available on Linux
7. Click **Connect**
8. Focus your browser presentation, LibreOffice Impress, or slide deck
9. Use your phone or web clicker to control the slides!

**Dependencies**: The app requires X11 and libxtst, which are typically pre-installed on desktop Linux distributions. If keyboard injection doesn't work, install:
```bash
# Debian/Ubuntu
sudo apt-get install libxtst6

# Fedora/RHEL
sudo dnf install libXtst

# Arch
sudo pacman -S libxtst
```

### 4. Use Your Phone as a Clicker

Open `http://<SERVER_IP>:3000/clicker.html` on your phone (same network) and use the large PREV/NEXT buttons.

## Building from Source

### Requirements

**IMPORTANT**: 
- **Windows builds** must be built on Windows because robotjs requires native compilation for Windows
- **macOS builds** must be built on macOS because robotjs requires native compilation for macOS
- **Linux builds** must be built on Linux because robotjs requires native compilation for Linux

#### Windows
- **OS**: Windows 10 or 11
- **Node.js**: 18 LTS or 20 LTS
- **Build Tools**: Visual Studio Build Tools or `windows-build-tools` npm package

#### macOS
- **OS**: macOS 10.13 or later (Apple Silicon recommended)
- **Node.js**: 18 LTS or 20 LTS
- **Build Tools**: Xcode Command Line Tools (`xcode-select --install`)

#### Linux
- **OS**: Ubuntu 18.04+, Debian 10+, Fedora 30+, or similar
- **Node.js**: 18 LTS or 20 LTS
- **Build Tools**: `build-essential`, `libxtst-dev`, `libpng-dev`

### Quick Build

#### Windows

Use the provided PowerShell script:

```powershell
cd show-machine-app
PowerShell -ExecutionPolicy Bypass -File build.ps1
```

This script will:
1. Check prerequisites
2. Install dependencies (including robotjs)
3. Build the Windows executable
4. Show you where to find the .exe files

#### macOS

```bash
cd show-machine-app
npm install
npm run build:mac
```

Built files will be in `show-machine-app/dist/`:
- `Open Clicker Show Machine-1.7.0-arm64.dmg` (Apple Silicon)
- `Open Clicker Show Machine-1.7.0-arm64-mac.zip` (Apple Silicon)

#### Linux

```bash
cd show-machine-app
npm install
npm run build:linux
```

Built file will be in `show-machine-app/dist/`:
- `Open Clicker Show Machine-1.7.0.AppImage` (x64)

### Manual Build

#### Windows

1. **Install Prerequisites**

   Install Windows Build Tools (run PowerShell as Administrator):
   ```powershell
   npm install --global windows-build-tools
   ```

2. **Install Dependencies**

   ```cmd
   cd show-machine-app
   npm install
   ```

   This compiles robotjs for Windows. It may take a few minutes.

3. **Build the Executable**

   ```cmd
   npm run build
   ```

   Or build specific versions:
   ```cmd
   npm run build:portable    # Just the portable .exe
   npm run build:installer   # Just the installer
   ```

4. **Find Your Executable**

   Built files are in `show-machine-app/dist/`:
   - Portable: `Open Clicker Show Machine-1.7.0-portable.exe`
   - Installer: `Open Clicker Show Machine Setup 1.7.0.exe`

#### macOS

1. **Install Prerequisites**

   Install Xcode Command Line Tools:
   ```bash
   xcode-select --install
   ```

2. **Install Dependencies**

   ```bash
   cd show-machine-app
   npm install
   ```

   This compiles robotjs for macOS. It may take a few minutes.

3. **Build the App**

   ```bash
   npm run build:mac
   ```

4. **Find Your App**

   Built files are in `show-machine-app/dist/`:
   - `Open Clicker Show Machine-1.7.0-arm64.dmg` (Apple Silicon)
   - `Open Clicker Show Machine-1.7.0-arm64-mac.zip` (Apple Silicon)

#### Linux

1. **Install Prerequisites**

   Install build dependencies:
   ```bash
   # Debian/Ubuntu
   sudo apt-get update
   sudo apt-get install -y build-essential libxtst-dev libpng-dev

   # Fedora/RHEL
   sudo dnf install -y gcc-c++ make libXtst-devel libpng-devel

   # Arch
   sudo pacman -S base-devel libxtst libpng
   ```

2. **Install Dependencies**

   ```bash
   cd show-machine-app
   npm install
   ```

   This compiles robotjs for Linux. It may take a few minutes.

3. **Build the App**

   ```bash
   npm run build:linux
   ```

4. **Find Your App**

   Built file is in `show-machine-app/dist/`:
   - `Open Clicker Show Machine-1.7.0.AppImage` (x64)

### Full Documentation

See [BUILD_WINDOWS.md](BUILD_WINDOWS.md) and [BUILD_MACOS.md](BUILD_MACOS.md) for detailed instructions, troubleshooting, and CI/CD setup.

### Development Mode

To run the app without building an executable:

**Windows:**
```cmd
cd show-machine-app
npm install
npm start
```

**macOS:**
```bash
cd show-machine-app
npm install
npm start
```

This opens the Electron app for testing. You must be on the respective platform to install and test robotjs.

## Technical Details

### How It Works

1. **Electron**: Provides the cross-platform desktop app framework
2. **Socket.io Client**: Connects to the Open Clicker server using WebSocket
3. **RobotJS**: Native keyboard simulation library for injecting arrow keys
4. **electron-builder**: Packages the app into a standalone Windows executable

### Key Files

- `src/main.js` - Electron main process (handles Socket.io and keyboard injection)
- `src/renderer.js` - Frontend JavaScript (UI logic)
- `src/index.html` - App interface
- `src/preload.js` - Electron IPC bridge
- `package.json` - Dependencies and build configuration

### Keyboard Injection

The app uses `robotjs` to inject system-level keyboard events:
- **Next**: Injects `Right Arrow` key
- **Prev**: Injects `Left Arrow` key

**Target App Selection**: When you choose a specific target (PowerPoint or Keynote), the app will:
1. Bring that application to the foreground
2. Send the arrow key to it
3. Keep other windows from receiving the key press accidentally

**Focused Window Mode**: Uses the traditional behavior of sending keys to whichever window is currently active.

This works with:
- **PowerPoint** (Windows & macOS): Automatically activated when selected as target
- **Keynote** (macOS): Automatically activated when selected as target
- **Google Slides** (in present mode): Use "Focused Window" mode
- **Browser-based presentations**: Use "Focused Window" mode
- **PDF viewers**: Use "Focused Window" mode
- **Any arrow-key-controlled software**: Use "Focused Window" mode

## Security and Permissions

### Windows Security

When you first run the portable .exe, Windows may show a "Windows protected your PC" warning because the executable is not code-signed. This is normal for unsigned apps.

**To run anyway**:
1. Click "More info"
2. Click "Run anyway"

Code signing is outside the scope of this open-source project. If you're concerned about security, you can build the app yourself from source.

### macOS Security

The macOS app is **unsigned** and will trigger Gatekeeper warnings. This is normal for open-source applications without Apple Developer code-signing certificates.

#### Recommended Installation & First Launch

**If you see "Open Clicker Show Machine.app is damaged and can't be opened"**, this is a Gatekeeper quarantine issue (not a corrupt file). Follow these steps:

1. **Copy the app to Applications**:
   - Open the .dmg or extract the .zip
   - Drag "Open Clicker Show Machine.app" to `/Applications`

2. **Remove the quarantine attribute**:
   ```bash
   xattr -cr "/Applications/Open Clicker Show Machine.app"
   ```

3. **Launch the app**:
   - Open from Applications
   - If still blocked, right-click → "Open" → confirm "Open"

After these steps, you can launch the app normally.

#### Alternative Methods

**Method 1: Right-Click Open**
1. Locate the app in Finder (usually in `/Applications`)
2. Right-click (or Control-click) the app
3. Choose "Open" from the context menu
4. Click "Open" in the dialog that appears

This adds a permanent exception for the app, but may not work if the "damaged" dialog appears first.

**Method 2: System Settings**

If you accidentally double-clicked and got blocked:
1. Open **System Settings** → **Privacy & Security**
2. Scroll to the "Security" section at the bottom
3. Look for a message about "Open Clicker Show Machine" being blocked
4. Click **"Open Anyway"**
5. Confirm by clicking **"Open"**

**Note**: Do NOT disable Gatekeeper system-wide. The methods above create exceptions only for this app.

#### Why Unsigned?

Code-signing requires:
- An Apple Developer account ($99/year)
- Notarization process for each build
- Ongoing maintenance for certificate renewal

For an open-source project, we've chosen to distribute unsigned builds with ad-hoc code signing. You can verify the source code and build it yourself if preferred.

**Technical note**: The app uses ad-hoc code signing (`identity: null` in electron-builder config), which is the recommended setting for unsigned macOS apps to minimize Gatekeeper friction.

### macOS Accessibility

**robotjs** (the keyboard injection library) requires **Accessibility** permissions to inject arrow keys into other applications.

#### Granting Permissions

When you first connect to a session, macOS may prompt you to grant Accessibility access:

1. A dialog will appear asking to control your computer
2. Click "Open System Settings"
3. In **Privacy & Security** → **Accessibility**, enable "Open Clicker Show Machine"
4. You may need to restart the app after granting permission

#### Manual Setup

If the prompt doesn't appear automatically:

1. Open **System Settings** (System Preferences on older macOS)
2. Go to **Privacy & Security** → **Accessibility**
3. Click the lock icon to make changes (enter your password)
4. Click the **+** button
5. Navigate to and select **Open Clicker Show Machine.app**
6. Ensure the checkbox next to the app is enabled

**Note**: Without Accessibility permission, the app can still connect to the server but will not be able to inject keyboard events into your presentation software.

## Troubleshooting

- **"Connection error"**: Check that the server is running and the URL is correct
- **"Session not found"**: Verify the session code is correct and the session is active
- **"Keyboard injection not available"**: The robotjs library failed to load (shouldn't happen in built .exe)

### Network Setup

- If the show machine and server are on the same computer, use `http://localhost:3000`
- If on different machines, use the server's local IP (e.g., `http://192.168.1.100:3000`)
- Ensure firewall allows connections on port 3000
- Both machines must be on the same network

### Build Issues

#### Windows

If `npm install` fails during build:

1. **Install Visual Studio Build Tools**:
   ```bash
   npm install --global windows-build-tools
   ```
   Or download from Microsoft: Visual Studio Build Tools 2019/2022

2. **Node version**: Use Node.js 18 or 20 (LTS versions work best with robotjs)

3. **Python**: robotjs requires Python 3.x during compilation

#### macOS

If `npm install` fails during build:

1. **Install Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```

2. **Node version**: Use Node.js 18 or 20 (LTS versions work best with robotjs)

#### Linux

If `npm install` fails during build:

1. **Install build dependencies**:
   ```bash
   # Debian/Ubuntu
   sudo apt-get install -y build-essential libxtst-dev libpng-dev

   # Fedora/RHEL
   sudo dnf install -y gcc-c++ make libXtst-devel libpng-devel
   ```

2. **Node version**: Use Node.js 18 or 20 (LTS versions work best with robotjs)

3. **Clean and retry**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### macOS Keyboard Injection Not Working

If the app connects but keys aren't being injected:

1. **Check Accessibility permissions**: Ensure the app is enabled in System Settings → Privacy & Security → Accessibility
2. **Restart the app** after granting permissions
3. **Focus the presentation window**: Make sure your Keynote/PowerPoint/browser window is focused
4. **Try manual test**: Press the test buttons in the app activity log to verify keys are being sent

## Limitations

- **Platform-specific builds**: Windows builds must be built on Windows, macOS builds on macOS, Linux builds on Linux
- **Unsigned apps**: Apps are not code-signed and will trigger security warnings
- **Accessibility required**: macOS requires Accessibility permissions for keyboard injection
- **No auto-update**: Users must manually download new versions
- **macOS Intel not supported**: Only Apple Silicon (M1/M2/M3/M4) Macs are supported

## License

MIT License - see main project [LICENSE](../LICENSE) file for details.

## Contributing

To contribute improvements or bug fixes:

1. Fork the repository
2. Make changes in the `show-machine-app/` directory
3. Test the build on your platform (Windows/macOS/Linux)
4. Submit a pull request

## Support

For issues, questions, or feature requests, open an issue on the [GitHub repository](https://github.com/dgoran/open-clicker/issues).
