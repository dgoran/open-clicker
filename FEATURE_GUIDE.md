# Presenter Click Access Control - User Guide

## For Presenters (Clicker Users)

### Joining a Session

1. **Open the clicker**: Navigate to `/clicker.html`
2. **Enter your name**: Required field (e.g., "John Smith")
3. **Enter session code**: 6-character code from producer
4. **Click "Join Session"**

### What You'll See

**Status Indicator** (below session code):
- 🟢 **"Ready"** → You can click (access enabled)
- 🔴 **"Locked"** → Global lock active (all clickers disabled)
- 🔴 **"Access Suspended"** → Your personal access is disabled

### When Access is Suspended

- **PREV** and **NEXT** buttons are disabled (grayed out)
- Status shows "Access Suspended" in red
- Clicks are blocked until producer re-enables your access
- You can still see notes and timer
- Page refresh maintains your suspended state

### Important Notes

- ✅ You must provide a display name (no anonymous joining)
- ✅ Access is enabled by default when you join
- ✅ Only the producer can suspend/enable your access
- ✅ Show-machine clients are not affected by this feature

---

## For Producers (Control Panel)

### Viewing Connected Presenters

1. **Create a session** in producer UI
2. **"Presenters" section** appears above "Global Clicker Lock"
3. Each presenter shows:
   - Display name
   - Current status (Click Access: Enabled/Suspended)
   - Toggle button (Suspend/Enable)

### Controlling Presenter Access

**To Suspend a Presenter:**
- Click the **"Suspend"** button next to their name
- Their status changes to "Click Access: Suspended" (red)
- They immediately see "Access Suspended" on their device
- Their clicks are blocked until you re-enable them

**To Re-Enable a Presenter:**
- Click the **"Enable"** button next to their name
- Their status changes to "Click Access: Enabled" (green)
- They immediately see "Ready" status
- They can click again

### Global Lock vs. Per-Presenter Access

**Global Clicker Lock** (applies to ALL clickers):
- Locks/unlocks everyone at once
- Use for planned breaks, interruptions
- Existing feature, unchanged

**Per-Presenter Access** (individual control):
- Control each presenter independently
- Use to temporarily suspend a specific presenter
- Does not affect others or show-machine clients

**Combined Effect:**
- If global lock is ON → all clickers disabled (regardless of individual access)
- If global lock is OFF → each presenter's individual access applies

### Presenter List Updates

The presenter list updates automatically when:
- ✅ A presenter joins the session
- ✅ A presenter disconnects
- ✅ You toggle someone's access

---

## Use Cases

### 1. Multiple Presenters in Rotation
**Scenario**: Three speakers, only one should control slides at a time

**Solution**: 
- All three join with their names
- Producer enables access for the current speaker
- Suspend access for the other two
- Toggle between speakers as needed

### 2. Test Presenter Before Show
**Scenario**: Test your clicker connection without affecting the show

**Solution**:
- Join with your name before the show
- Producer suspends your access during testing
- Producer enables your access when you're ready

### 3. Unexpected Clicks
**Scenario**: Someone is accidentally clicking or testing

**Solution**:
- Producer sees who is connected by display name
- Producer suspends that person's access immediately
- No need to kick them out or restart the session

### 4. Guest/Backup Presenter
**Scenario**: Backup presenter connected but shouldn't click yet

**Solution**:
- Backup joins with their name
- Producer keeps their access suspended
- Producer enables if they need to take over

---

## Technical Details

### Session State
- Presenter access state is stored in server memory
- State persists through presenter page refreshes
- State is lost if server restarts (Render free tier behavior)

### Real-time Updates
- Uses WebSocket (Socket.io) for instant updates
- Producer sees presenter join immediately
- Presenter sees access change immediately
- No page refresh needed

### Security
- Display names are HTML-escaped (prevents XSS)
- Producer token required to toggle access
- Presenter token required for clicks
- Unauthorized actions return errors

### Compatibility
- Works with all existing features (timer, notes, global lock)
- Show-machine clients unaffected
- Role-token authentication unchanged
- Target app selection preserved

---

## Troubleshooting

### "Display name is required" Error
**Problem**: Tried to join without entering a name
**Solution**: Enter your name in the first input field before joining

### Access Seems Stuck
**Problem**: Access state not updating after toggle
**Solution**: 
1. Check network connection
2. Refresh the clicker page
3. Rejoin the session if needed

### Can't Click Even Though Status Shows "Ready"
**Possible Causes**:
1. Global lock is ON (check producer panel)
2. Network latency (wait a moment)
3. Session ended (producer disconnected)

### Presenter Not Showing in List
**Problem**: Joined but producer doesn't see them
**Solution**:
1. Verify using correct session code
2. Check network connection
3. Producer should see them within 1-2 seconds

---

## Quick Reference

| Action | Result |
|--------|--------|
| Presenter joins | Access enabled (default ON) |
| Producer clicks "Suspend" | Presenter's clicks blocked immediately |
| Producer clicks "Enable" | Presenter can click again |
| Presenter refreshes page | Access state preserved |
| Global lock ON | All clickers disabled (overrides individual access) |
| Show-machine client clicks | Never affected by presenter access control |

---

## Demo Workflow

### Step-by-Step Test

1. **Producer**: Create session, note the code
2. **Presenter 1**: Join with name "Alice", verify status shows "Ready"
3. **Presenter 2**: Join with name "Bob", verify status shows "Ready"
4. **Producer**: See both Alice and Bob in Presenters list
5. **Producer**: Click "Suspend" next to Bob
6. **Bob**: Verify status changes to "Access Suspended"
7. **Bob**: Try clicking NEXT → blocked
8. **Alice**: Try clicking NEXT → works
9. **Producer**: Click "Enable" next to Bob
10. **Bob**: Verify status changes back to "Ready"
11. **Bob**: Try clicking NEXT → works
12. **Producer**: Click "Lock All Clickers"
13. **Both**: Verify status shows "Locked", clicks blocked
14. **Producer**: Click "Unlock All Clickers"
15. **Both**: Verify status shows "Ready", clicks work

✅ All steps should work as described above.
