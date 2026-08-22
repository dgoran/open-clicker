# Open Clicker

Open-source remote presenter clicker: control slides from your phone or browser.

## Features

- **Web Clicker**: Large next/prev buttons that work on phones and desktop browsers, with screen wake-lock to prevent sleep
- **Producer Controls**: Create sessions with join codes, lock/unlock clicking, manage speaker notes, and set countdown timers
- **Show-Machine Client**: 
  - **Windows App**: Standalone .exe with GUI (no Node.js required) - [Download](https://github.com/dgoran/open-clicker/releases)
  - **macOS App**: Standalone .app/.dmg with GUI (no Node.js required) - [Download](https://github.com/dgoran/open-clicker/releases)
  - **CLI Client**: Node.js command-line client for any platform with Node installed
  - Receives clicks and injects arrow keys into the focused window (PowerPoint, Keynote, browser slides)
- **Speaker Notes**: Simple paste/edit notes field synchronized across devices
- **Countdown Timer**: Visual timer for presentations

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

**Note**: The `robotjs` package (used by the show-machine client) requires native compilation. You'll need build tools installed:

- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Windows**: Visual Studio Build Tools or `windows-build-tools` npm package
- **Linux**: `build-essential`, `libxtst-dev`, `libpng-dev`

If `robotjs` installation fails, you can still run the server and use the browser-based show client for testing.

### 2. Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000`

### 3. Run a Session

#### Option A: Full Setup (Producer + Phone Clicker + Show Machine)

1. **Producer**: Open `http://localhost:3000/producer.html` in a browser
   - Click "Create Session"
   - Note the 6-character session code

2. **Phone Clicker**: On your phone, open `http://localhost:3000/clicker.html`
   - Enter the session code
   - Use the large PREV/NEXT buttons to control slides

3. **Show Machine**: On the computer running your presentation:

   **Option 1 - Standalone Desktop App (Recommended - Windows/macOS)**
   - **Windows**: Download `Open Clicker Show Machine-1.0.0-portable.exe` from [Releases](https://github.com/dgoran/open-clicker/releases)
   - **macOS**: Download the appropriate .dmg or .zip for your Mac (Intel or Apple Silicon) from [Releases](https://github.com/dgoran/open-clicker/releases)
   - Run the app, enter server URL and session code
   - No Node.js installation required!
   - See [Desktop App README](show-machine-app/README.md) for details, including security setup

   **Option 2 - Node.js CLI (Any platform with Node)**
   ```bash
   npm run show-client <SESSION_CODE>
   ```
   - Replace `<SESSION_CODE>` with your session code
   - Focus your PowerPoint, Keynote, or browser presentation
   - Clicks from the phone will inject arrow keys

#### Option B: Browser-Only Testing

1. **Producer**: Open `http://localhost:3000/producer.html`
   - Create a session

2. **Clicker**: Open `http://localhost:3000/clicker.html` in a new tab or phone
   - Join with the session code

3. **Browser Show Client**: Open `http://localhost:3000/show.html` in a new tab
   - Join with the same session code
   - Focus this tab and observe arrow key events in the console

## Usage Guide

### Producer Controls

- **Create Session**: Generates a unique 6-character join code and secure producer token
- **Lock/Unlock Clicker**: Prevent or allow slide advancement
- **Countdown Timer**: Set a timer in minutes, visible to all clients
- **Speaker Notes**: Enter notes that sync to all clickers

### Security

Open Clicker uses role-based authentication to secure sessions:

- **Session Codes**: 6-character codes generated using cryptographically secure random bytes
- **Role Tokens**: When joining a session, clients receive a unique 64-character authentication token
  - **Producer Token**: Issued when creating a session; required for lock/unlock, timer, and notes operations
  - **Clicker Token**: Issued when joining as a clicker; required for sending next/prev commands
  - **Show-Client Token**: Issued when joining as a show client; validated for future privileged operations
- **Token Validation**: All privileged operations require both a valid session code and the appropriate role token
- **Automatic Management**: Tokens are automatically generated and stored by the client applications

This security model is designed for both local network and public internet use, while keeping the join flow simple.

### Web Clicker

- **Large Buttons**: Easy to tap on mobile devices
- **Screen Wake Lock**: Prevents phone from sleeping during presentations
- **Live Status**: Shows lock status, timer, and speaker notes
- **Visual Feedback**: Buttons flash when pressed

### Show-Machine Clients

#### Desktop Apps (Recommended for Windows/macOS)

**No Node.js Required!** Just download and run:

**Windows:**
1. Download from [Releases](https://github.com/dgoran/open-clicker/releases)
   - Portable: `Open Clicker Show Machine-1.0.0-portable.exe` (no installation)
   - Installer: `Open Clicker Show Machine Setup 1.0.0.exe` (traditional installer)
2. Run the app
3. Enter server URL and session code in the GUI
4. Focus your presentation window
5. **Note**: Windows SmartScreen may warn about unsigned apps. Click "More info" → "Run anyway"

**macOS:**
1. Download the appropriate version from [Releases](https://github.com/dgoran/open-clicker/releases)
   - Intel Macs: Download **x64** .dmg or .zip
   - Apple Silicon (M1/M2/M3): Download **arm64** .dmg or .zip
2. Install: Open .dmg and drag to Applications, or extract .zip
3. **First launch**: Right-click the app and choose "Open" (bypasses Gatekeeper for unsigned apps)
4. Grant **Accessibility** permissions when prompted (required for keyboard injection)
5. Enter server URL and session code in the GUI
6. Focus your presentation window

See the [Desktop App README](show-machine-app/README.md) for full documentation, including:
- Detailed security and permissions setup
- Building from source
- Troubleshooting
- Automated builds via GitHub Actions

#### CLI Client (Any platform with Node)

The Node.js CLI client connects to your session and injects keyboard events:

```bash
node show-machine-client.js <SESSION_CODE>
# or
npm run show-client <SESSION_CODE>
```

**Supported Platforms**:
- macOS: Full support (tested)
- Windows: Full support (requires build tools)
- Linux: Full support (requires X11 libraries)

**Recommended Use**: Use the GUI desktop apps (Windows/macOS) for the best experience. The CLI is useful for:
- Linux systems
- Automated/scripted setups
- Development and testing

**How it works**: Both clients inject `Left Arrow` (prev) and `Right Arrow` (next) key presses into the focused window. This works with:
- Microsoft PowerPoint
- Apple Keynote
- Google Slides (in presentation mode)
- PDF viewers
- Any application that uses arrow keys for navigation

## Network Setup

### Local Network

To use your phone as a clicker over local Wi-Fi:

1. Find your computer's local IP address:
   ```bash
   # macOS/Linux
   ifconfig | grep "inet "
   
   # Windows
   ipconfig
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. On your phone, connect to the same Wi-Fi network and navigate to:
   ```
   http://<YOUR_IP>:3000/clicker.html
   ```

### Public Internet Deployment

Open Clicker's token-based authentication makes it safe to deploy on the public internet. Session codes are cryptographically random, and all privileged operations require role-specific tokens that are automatically issued at creation/join time.

### Custom Port

Set a custom port with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

### Remote Server

To connect the show-machine client to a remote server:

```bash
SERVER_URL=http://example.com:3000 npm run show-client <SESSION_CODE>
```

## Architecture

- **Server**: Node.js with Express and Socket.io for real-time communication
- **Frontend**: Plain HTML/CSS/JavaScript (no build step required)
- **Show Client**: Node.js CLI with `robotjs` for keyboard injection
- **Communication**: WebSocket (Socket.io) for low-latency event broadcasting

## Troubleshooting

### robotjs Installation Issues

If `npm install` fails on `robotjs`:

1. Ensure you have the required build tools (see Quick Start #1)
2. You can still use the browser-based show client for testing
3. For production, consider using a pre-built machine or Docker container

### Firewall Issues

If the phone can't connect to the server:

1. Check that your computer's firewall allows incoming connections on port 3000
2. Ensure both devices are on the same network
3. Try disabling VPN connections

### Wake Lock Not Working

The Screen Wake Lock API requires:
- HTTPS connection (or localhost)
- Modern browser (Safari 16.4+, Chrome 84+, Edge 84+)

## Development

### Project Structure

```
open-clicker/
├── server.js                 # Main server with Socket.io
├── show-machine-client.js    # CLI client for keyboard injection
├── package.json
├── LICENSE
├── README.md
└── public/
    ├── index.html           # Landing page
    ├── producer.html        # Producer control panel
    ├── clicker.html         # Mobile/web clicker interface
    └── show.html            # Browser-based test client
```

### Adding Features

The system uses Socket.io events for communication:

- `create-session`: Producer creates a new session
- `join-session`: Clients join with a code
- `next` / `prev`: Advance slides
- `set-lock`: Enable/disable clicking
- `set-notes`: Update speaker notes
- `set-timer`: Set countdown timer

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

This is an independent open-source project. Contributions welcome!

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## Credits

Created for Goran's live event production needs.
