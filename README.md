# Open Clicker

Open-source remote presenter clicker: control slides from your phone or browser.

## Features

- **Web Clicker**: Large next/prev buttons that work on phones and desktop browsers, with screen wake-lock to prevent sleep
- **Producer Controls**: Create sessions with join codes, lock/unlock clicking, manage speaker notes, and set countdown timers
- **Show-Machine Client**: 
  - **Windows App**: Standalone .exe with GUI (no Node.js required) - [Download](https://github.com/dgoran/open-clicker/releases)
  - **macOS App**: Standalone .app/.dmg with GUI for Apple Silicon (no Node.js required) - [Download](https://github.com/dgoran/open-clicker/releases)
  - **Linux App**: Standalone AppImage with GUI (no Node.js required) - [Download](https://github.com/dgoran/open-clicker/releases)
  - **CLI Client**: Node.js command-line client for any platform with Node installed
  - Choose to control PowerPoint, Keynote, or any focused window
  - Automatically brings the target app forward and sends keys to it
  - Receives clicks and injects arrow keys into the targeted application
- **Speaker Notes**: Notes shown on every presenter's clicker — typed by the producer, or read live from PowerPoint/Keynote by the show-machine app
- **Speaker Chat**: Producer sends chat messages to presenters mid-show
- **Screen Casting**: Show machine sends a live preview of the slide screen to presenters' phones
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

   **Option 1 - Standalone Desktop App (Recommended - Windows/macOS/Linux)**
   - **Windows**: Download `Open Clicker Show Machine-1.8.4-portable.exe` from [Releases](https://github.com/dgoran/open-clicker/releases)
   - **macOS**: Download the .dmg or .zip for Apple Silicon Macs (M1/M2/M3/M4) from [Releases](https://github.com/dgoran/open-clicker/releases)
   - **Linux**: Download the .AppImage from [Releases](https://github.com/dgoran/open-clicker/releases), make it executable (`chmod +x`), and run
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
- **Presenter Access Control**: Toggle individual presenter's click access on/off in real-time
  - Each presenter must provide a display name when joining
  - Access defaults to enabled (presenters can click immediately)
  - Producer can suspend/enable any presenter's clicking independently
  - Presenters see clear "Access Suspended" status when disabled
- **Global Clicker Lock**: Prevent or allow slide advancement for all clickers at once
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

- **Display Name Required**: Enter your name before joining (no anonymous presenters)
- **Large Buttons**: Easy to tap on mobile devices
- **Screen Wake Lock**: Prevents phone from sleeping during presentations
- **Live Status**: Shows global lock status, personal access status, timer, and speaker notes
- **Visual Feedback**: Buttons flash when pressed, disabled when access suspended

### Show-Machine Clients

#### Desktop Apps (Recommended for Windows/macOS/Linux)

**No Node.js Required!** Just download and run:

**Windows:**
1. Download from [Releases](https://github.com/dgoran/open-clicker/releases)
   - Portable: `Open Clicker Show Machine-1.8.4-portable.exe` (no installation)
   - Installer: `Open Clicker Show Machine Setup 1.8.4.exe` (traditional installer)
2. Run the app
3. Enter server URL and session code in the GUI
4. Focus your presentation window
5. **Note**: Windows SmartScreen may warn about unsigned apps. Click "More info" → "Run anyway"

**macOS (Apple Silicon only):**
1. Download from [Releases](https://github.com/dgoran/open-clicker/releases)
   - Apple Silicon (M1/M2/M3/M4): Download **arm64** .dmg or .zip
2. Install: Open .dmg and drag to `/Applications`, or extract .zip and move to `/Applications`
3. **Remove quarantine** to avoid "damaged" error:
   ```bash
   xattr -cr "/Applications/Open Clicker Show Machine.app"
   ```
4. **First launch**: Open the app (or right-click → "Open" if blocked)
5. Grant **Accessibility** permissions when prompted (required for keyboard injection)
6. Enter server URL and session code in the GUI
7. Focus your presentation window

**Linux:**
1. Download the .AppImage from [Releases](https://github.com/dgoran/open-clicker/releases)
2. Make it executable: `chmod +x Open-Clicker-Show-Machine-*.AppImage`
3. Run: `./Open-Clicker-Show-Machine-*.AppImage`
4. Enter server URL and session code in the GUI
5. Focus your presentation window
6. **Note**: Requires X11 and libxtst. Most desktop Linux distributions include these by default.

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

**How it works**: Both clients inject `Left Arrow` (prev) and `Right Arrow` (next) key presses. The desktop apps support three modes:
- **Focused Window**: Injects keys into the currently focused window
- **PowerPoint** (Windows/macOS): Automatically brings PowerPoint forward and sends keys to it
- **Keynote** (macOS only): Automatically brings Keynote forward and sends keys to it

The CLI client uses focused window mode. This works with:
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

### Public Internet Deployment (Render)

Open Clicker's token-based authentication makes it safe to deploy on the public internet. Session codes are cryptographically random, and all privileged operations require role-specific tokens that are automatically issued at creation/join time.

#### Render Deployment with Persistent Storage

**Important**: User data and sessions require persistent storage. Render's default filesystem is ephemeral (wiped on every deploy/restart). You must attach a persistent disk.

**Deployment Steps:**

1. **Create Web Service** on Render:
   - Connect your GitHub repository
   - Choose "Node" runtime
   - Build command: `npm install`
   - Start command: `npm start`

2. **Attach Persistent Disk**:
   - In your Render service dashboard, go to "Disks"
   - Click "Add Disk"
   - Name: `open-clicker-data` (or any name)
   - Mount Path: `/data`
   - Size: 1 GB (sufficient for user database)
   - Click "Create"

3. **Set Environment Variables**:
   ```
   SESSION_SECRET=<generate-secure-random-string>
   SUPERADMIN_USER=admin
   SUPERADMIN_PASSWORD=<your-secure-password>
   ```
   
   To generate a secure SESSION_SECRET:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. **Deploy**: Render will automatically deploy your application

**Important Notes:**
- The SQLite database is stored at `/data/users.sqlite` on the persistent disk
- **Single Instance Required**: Persistent disks only work with a single instance. Do not enable autoscaling or multiple instances.
- **No Zero-Downtime Deploys**: Deploys will cause brief downtime while the disk is remounted
- User accounts and sessions will persist across deploys and restarts
- Access the superadmin panel at `https://your-app.onrender.com/superadmin`

**Alternative: Using render.yaml Blueprint**

If your repository includes `render.yaml`, Render will automatically configure the disk:

```yaml
services:
  - type: web
    name: open-clicker
    runtime: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: SESSION_SECRET
        generateValue: true
      - key: SUPERADMIN_USER
        value: admin
      - key: SUPERADMIN_PASSWORD
        sync: false
    disk:
      name: open-clicker-data
      mountPath: /data
      sizeGB: 1
```

You'll still need to set `SUPERADMIN_PASSWORD` manually in the dashboard (it's marked `sync: false` for security).

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

## HTTP API

Sessions can be created and managed programmatically. All session endpoints require an
authenticated account: sign in first and reuse the returned cookie.

```bash
# Sign in and keep the session cookie
curl -c cookies.txt -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'

# Create a session
curl -b cookies.txt -X POST http://localhost:3000/api/sessions
```

The create response returns the code, the producer token, and ready-to-share links:

```json
{
  "code": "A1B2C3",
  "locked": false,
  "requireName": true,
  "presenterCount": 0,
  "producerConnected": false,
  "producerToken": "…64 hex chars…",
  "presenterUrl": "http://localhost:3000/clicker.html?code=A1B2C3",
  "cueUrl": "http://localhost:3000/show.html?code=A1B2C3",
  "producerUrl": "http://localhost:3000/producer.html?code=A1B2C3"
}
```

Every producer function is available over HTTP as well as over the socket
connection, and both drive the same code, so changes made through the API reach
connected clickers and cue displays immediately.

### Sessions

| Method   | Endpoint                     | Description                                              |
| -------- | ---------------------------- | -------------------------------------------------------- |
| `POST`   | `/api/sessions`              | Create a session owned by the signed-in account          |
| `GET`    | `/api/sessions/:code`        | Summary of a session you own                             |
| `GET`    | `/api/sessions/:code/detail` | Full state: notes, timer, features and connected presenters |
| `PATCH`  | `/api/sessions/:code`        | Update settings (see below)                              |
| `DELETE` | `/api/sessions/:code`        | End a session you own and disconnect its participants    |
| `GET`    | `/api/my-sessions`           | List all of your active sessions                         |
| `GET`    | `/api/session/:code`         | Public join info for a code (no authentication required) |

`PATCH /api/sessions/:code` accepts any combination of `locked`, `notes`,
`requireName`, `timerMinutes`, `resetTimer`, and `features` (a partial object
merged over the current feature flags):

```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/sessions/A1B2C3 \
  -H 'Content-Type: application/json' \
  -d '{"locked":true,"notes":"Slide 4 is the demo","timerMinutes":10,"features":{"screenshotEnabled":true}}'
```

### Running the show

| Method  | Endpoint                                       | Description                                        |
| ------- | ---------------------------------------------- | -------------------------------------------------- |
| `POST`  | `/api/sessions/:code/advance`                  | Advance the deck — `{"direction":"next"\|"prev"}`  |
| `GET`   | `/api/sessions/:code/presenters`               | Connected presenters and their click access        |
| `PATCH` | `/api/sessions/:code/presenters/:presenterId`  | Grant or suspend one presenter's clicking          |
| `POST`  | `/api/sessions/:code/prompt-name`              | Ask anonymous presenters to enter a name           |
| `POST`  | `/api/sessions/:code/message`                  | Send a Speaker Chat message — `{"message":"…"}`    |

`advance` is not blocked by the clicker lock: the lock exists to hold back
presenters, while the API acts as the session owner. Speaker Chat returns `409`
unless `messagesEnabled` is on for the session.

### Other

| Method | Endpoint       | Description                     |
| ------ | -------------- | ------------------------------- |
| `GET`  | `/api/version` | The running server version      |
| `GET`  | `/api/me`      | The signed-in account, if any   |

Sessions created this way are identical to those made in the browser: they persist across
server restarts, appear in your Control Center, and can be opened at any time via
`producerUrl`. Requests for a session belonging to another account return `403`.

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
- `set-notes`: Producer updates speaker notes
- `set-show-notes`: Show machine pushes PowerPoint/Keynote notes for the current slide
- `send-message`: Producer sends a Speaker Chat message to presenters
- `screenshot-upload`: Show machine sends a slide screenshot to presenters
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
