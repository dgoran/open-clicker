# Open Clicker - Windows Show Machine App

A standalone Windows executable for the Open Clicker show-machine client. No Node.js installation required on the show machine.

## Download Pre-Built Executable

**For Users**: Download the latest release from the [Releases page](https://github.com/dgoran/open-clicker/releases).

Two versions are available:
- **Portable**: `Open Clicker Show Machine-1.0.0-portable.exe` - No installation required, just run it
- **Installer**: `Open Clicker Show Machine Setup 1.0.0.exe` - Traditional Windows installer with Start Menu shortcut

### Automated Builds

Windows executables are automatically built via GitHub Actions:
- Every push to `main` that modifies `show-machine-app/`
- Every pull request that modifies `show-machine-app/`
- Every version tag (e.g., `v1.0.0`)

Tagged releases automatically upload executables to the Releases page. Other builds are available as workflow artifacts on the [Actions page](https://github.com/dgoran/open-clicker/actions).

## Features

- **No Node.js Required**: Runs on any Windows machine without installing Node.js or npm
- **Simple GUI**: Easy-to-use interface for connecting to your session
- **Real Keyboard Injection**: Uses system-level keyboard simulation to control PowerPoint, browser slides, PDF viewers, etc.
- **Activity Log**: See every next/prev command as it happens
- **Reconnection**: Automatically attempts to reconnect if the connection drops

## Usage

### 1. Start the Open Clicker Server

On your server machine (can be the same Windows machine or a different computer on the network):

```bash
npm start
```

The server runs at `http://localhost:3000` by default.

### 2. Create a Session

Open `http://localhost:3000/producer.html` in a browser and create a session. Note the 6-character session code.

### 3. Run the Show Machine App

On the Windows computer running your presentation:

1. Download and run `Open Clicker Show Machine-1.0.0-portable.exe`
2. Enter the **Server URL** (e.g., `http://192.168.1.100:3000` or `http://localhost:3000`)
3. Enter the **Session Code** from the producer
4. Click **Connect**
5. Focus your PowerPoint, Keynote, or browser presentation window
6. Use your phone or web clicker to control the slides!

### 4. Use Your Phone as a Clicker

Open `http://<SERVER_IP>:3000/clicker.html` on your phone (same network) and use the large PREV/NEXT buttons.

## Building from Source

### Requirements

**IMPORTANT**: This app **must be built on Windows** because robotjs (keyboard injection library) requires native compilation for Windows.

- **OS**: Windows 10 or 11
- **Node.js**: 18 LTS or 20 LTS
- **Build Tools**: Visual Studio Build Tools or `windows-build-tools` npm package

### Quick Build (Windows)

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

### Manual Build (Windows)

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
   - Portable: `Open Clicker Show Machine-1.0.0-portable.exe`
   - Installer: `Open Clicker Show Machine Setup 1.0.0.exe`

### Full Documentation

See [BUILD_WINDOWS.md](BUILD_WINDOWS.md) for detailed instructions, troubleshooting, and CI/CD setup.

### Development Mode

To run the app without building an executable:

```cmd
cd show-machine-app
npm install
npm start
```

This opens the Electron app for testing. You must still be on Windows to install robotjs.

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

This works with any Windows application that responds to arrow keys:
- Microsoft PowerPoint
- Google Slides (in present mode)
- Browser-based presentations
- PDF viewers
- Any arrow-key-controlled software

## Troubleshooting

### Windows SmartScreen Warning

When you first run the portable .exe, Windows may show a "Windows protected your PC" warning because the executable is not code-signed. This is normal for unsigned apps.

**To run anyway**:
1. Click "More info"
2. Click "Run anyway"

Code signing is outside the scope of this open-source project. If you're concerned about security, you can build the app yourself from source.

### Connection Issues

- **"Connection error"**: Check that the server is running and the URL is correct
- **"Session not found"**: Verify the session code is correct and the session is active
- **"Keyboard injection not available"**: The robotjs library failed to load (shouldn't happen in built .exe)

### Network Setup

- If the show machine and server are on the same computer, use `http://localhost:3000`
- If on different machines, use the server's local IP (e.g., `http://192.168.1.100:3000`)
- Ensure firewall allows connections on port 3000
- Both machines must be on the same network

### Build Issues

If `npm install` fails during build:

1. **Install Visual Studio Build Tools**:
   ```bash
   npm install --global windows-build-tools
   ```
   Or download from Microsoft: Visual Studio Build Tools 2019/2022

2. **Node version**: Use Node.js 18 or 20 (LTS versions work best with robotjs)

3. **Python**: robotjs requires Python 3.x during compilation

## Limitations

- **Windows only**: This build targets Windows. macOS/Linux users can use the CLI client
- **Unsigned**: The executable is not code-signed and will trigger SmartScreen warnings
- **No auto-update**: Users must manually download new versions

## License

MIT License - see main project [LICENSE](../LICENSE) file for details.

## Contributing

To contribute improvements or bug fixes:

1. Fork the repository
2. Make changes in the `show-machine-app/` directory
3. Test the build on Windows
4. Submit a pull request

## Support

For issues, questions, or feature requests, open an issue on the [GitHub repository](https://github.com/dgoran/open-clicker/issues).
