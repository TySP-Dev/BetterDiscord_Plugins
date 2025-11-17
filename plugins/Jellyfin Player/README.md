# Jellyfin Player for BetterDiscord

> [!IMPORTANT]
> This plugin is in active and early development. Please report any issues or feature requests on [GitHub](https://github.com/TySP-Dev/BetterDiscord_Plugins/issues).

A BetterDiscord plugin that adds a Jellyfin music client. Browse your media library, play music, and control playback without leaving Discord.

## What is This?

This is **not** a remote control for Jellyfin - it's a **Jellyfin client** built into Discord. You can:
- Browse your entire Jellyfin music library
- Play music directly in Discord (local audio playback)
- View album art, track info, and progress

Think of it as having the Jellyfin web player embedded in Discord's sidebar.

## Features

### 🎵 Media Playback
- **Local playback**: Play music directly in Discord using the built-in audio player

#### Media Playback incoming:
- Queue songs, create playlists
- Control remote sessions
- Pick up from anywhere (Unplanned right now)

### 📚 Library Browser
- Browse your entire Jellyfin music library from Discord
- View album art and media information

#### Library Browser incoming:
- Search for artists, albums, and tracks
- Queue songs and manage playback queue

### 🎛️ Playback Controls
- ⏮ **Previous**: Skip to previous track (double-click to restart current track)
- ⏸/▶ **Play/Pause**: Toggle playback
- ⏭ **Next**: Skip to next track
- 🔀 **Shuffle**: Toggle shuffle mode (purple when active)
- 🔁 **Repeat**: Cycle through repeat modes (None → All → One)
- 🔊 **Volume**: Click to adjust volume, right-click to mute/unmute
- 📊 **Timeline**: Visual progress bar with click-to-seek

### 🖼️ Media Display
- Album artwork
- Track title and artist (scrollable for long names)
- Real-time progress tracking

### ⚙️ Customization
- Show/hide individual control buttons
- Toggle timeline display
- Adjustable button behavior
- Cross-platform compatibility (Windows, Mac, Linux)

## Installation

1. Download `JellyfinPlayer.plugin.js`
2. Place it in your BetterDiscord plugins folder:
   - **Windows**: `%AppData%/BetterDiscord/plugins/`
   - **Mac**: `~/Library/Application Support/BetterDiscord/plugins/`
   - **Linux**: `~/.config/BetterDiscord/plugins/`
3. Restart Discord or reload BetterDiscord (Ctrl+R)
4. Enable the plugin in **User Settings → Plugins**

## Configuration

### Initial Setup

1. Open **Discord User Settings**
2. Go to **Plugins → JellyfinPlayer → Settings** ⚙️
3. Expand **Jellyfin Server Configuration**
4. Enter your credentials:

#### Server URL
Your Jellyfin server address. Examples:
- Local network: `http://192.168.1.100:8096`
- Localhost: `http://localhost:8096`
- Remote (HTTPS): `https://jellyfin.example.com`

**Important**:
- Must include protocol (`http://` or `https://`)
- Include port number if not using standard or a reverse proxy (typically `:8096`)

#### Username & Password
Your Jellyfin account credentials (same as you use for the web interface)

**Security Note**: Credentials are stored locally and used to generate an access token. The plugin authenticates using Jellyfin's standard API, just like any official client.

### Authenticating

1. Fill in all three fields (Server URL, Username, Password)
2. Click **Test Server Connection** to verify the server is reachable (optional)
3. Click **Login** to authenticate
4. You'll see a success message with your User ID if login succeeds
5. The plugin is now ready to use!

### Customizing Controls

In the plugin settings, you can:
- **Add Timeline**: Show/hide the progress bar
- **Hide Disabled Buttons**: Auto-hide buttons when they can't be used
- **Double Back**: Require double-click to skip to previous track (vs. restart current)
- **Button Visibility**: Show/hide individual control buttons (Share, Shuffle, Volume, etc.)

## Usage

### Player Interface

The player appears in Discord's left sidebar, above the voice controls:

### Playing Music

**Method 1: Browse Your Library**
1. Click the **Browse** button
2. Navigate your Jellyfin music library
3. Click a song, album, or artist to play

**Method 2: Control Existing Playback**
- If music is already playing in another Jellyfin client (web, phone, TV)
- The controls will automatically appear and sync with that session
- Use the controls to manage playback across devices

### Understanding Button States

- **Purple buttons**: Feature is active (shuffle on, repeat enabled)
- **Gray buttons**: Feature is off or unavailable
- **Disabled**: No active playback session (tooltip explains why)

## Troubleshooting

### Common Issues

**❌ No controls showing / "No active playback session"**
- Make sure you've logged in successfully (check for success message)
- Start playing music either:
  - Click the **Browse** button and select a song
  - Start playback in another Jellyfin client
- Check that the plugin is enabled in Discord settings

**❌ Login fails**
- Verify server URL is correct (include `http://` or `https://`)
- Check username and password are correct
- Ensure Jellyfin server is running and accessible
- Use **Test Server Connection** first to verify the URL
- Check firewall settings if using remote access

**❌ Album art too large / UI looks broken**
- Reload the plugin (disable and re-enable in settings)
- Check Discord console (Ctrl+Shift+I) for errors
- The album art should be 32px × 32px on the left side
- If issues persist, check or create a [GitHub issue](https://github.com/TySP-Dev/BetterDiscord_Plugins/issues)

**❌ Buttons showing as squares**
- This should be fixed in with emoji icons
- If you see squares, you may need to reload Discord (Ctrl+R)
- Check that you're running the latest version of the plugin

**❌ Progress bar not visible**
- Check plugin settings: **Add Timeline** should be enabled
- Ensure there's an active playback session
- Try reloading the plugin

**❌ "Cannot connect to server" error**
- Verify the server URL is accessible (try opening it in a browser)
- Check network/firewall settings
- Ensure port forwarding is configured for remote access
- Try switching between `http://` and `https://`

### Debug Mode

To see detailed error messages:
1. Open Discord Developer Console (Ctrl+Shift+I / Cmd+Option+I)
2. Go to the **Console** tab
3. Look for messages starting with `[JellyfinPlayer]` or `[BDFDB]`
4. Check for network errors or authentication failures

### Getting Help

If issues persist:
1. Verify Jellyfin server is **version 10.8.0 or newer**
2. Check all configuration fields are filled correctly
3. Test the server URL in a web browser first
4. Review the console for specific error messages
5. Check or create a [GitHub issue](https://github.com/TySP-Dev/BetterDiscord_Plugins/issues)

## Technical Details

### Playback Modes

**Local Playback** (Built-in Audio Player):
- Music plays directly in Discord
- Uses HTML5 Audio API
- Streams from Jellyfin server
- Controlled exclusively by this plugin

### Privacy & Security

- Credentials are stored **locally only** (BetterDiscord data folder)
- No data sent to third parties
- Communication is direct between Discord and your Jellyfin server
- Access tokens are refreshed automatically
- Uses standard Jellyfin authentication API

### Architecture

- **Frontend**: React components via BDFDB
- **API**: Jellyfin REST API (standard endpoints)
- **Audio**: HTML5 Audio element for local playback
- **State Management**: Real-time session synchronization
- **Styling**: Custom CSS with Discord theme integration

## Known Limitations

- No playlist creation (use existing playlists)
- Limited to music library (no movies/TV shows)
- Requires active internet connection to Jellyfin server

## License

GNU General Public License v3.0

This plugin is free and open source. See LICENSE file for details.

---

> [!Note] 
> This is an unofficial community plugin and is not affiliated with or endorsed by Jellyfin or Discord.
