# JellyfinControls for BetterDiscord

> [!IMPORANT]
> This plugin is in very early stages of development and may not work as expected.

A BetterDiscord plugin that adds a control panel for Jellyfin media playback directly in Discord.

## Features

- 🎵 Control Jellyfin playback from Discord
- ⏯️ Play/Pause, Next/Previous track controls
- 🔀 Shuffle and repeat modes
- 🔊 Volume control
- 📊 Timeline scrubber for seeking
- 🖼️ Media artwork display
- 📱 Expandable player view

## Installation

1. Download `JellyfinControls.plugin.js`
2. Place it in your BetterDiscord plugins folder:
   - Windows: `%AppData%/BetterDiscord/plugins/`
   - Mac: `~/Library/Application Support/BetterDiscord/plugins/`
   - Linux: `~/.config/BetterDiscord/plugins/`
3. Restart Discord or reload BetterDiscord
4. Enable the plugin in User Settings > Plugins

## Configuration

### Getting Your Jellyfin Credentials

You need three pieces of information to connect the plugin to your Jellyfin server:

#### 1. Server URL
Your Jellyfin server address, for example:
- Local: `http://localhost:8096`
- Remote: `https://jellyfin.example.com`

**Note:** Make sure to include the port number (typically 8096) and protocol (http:// or https://)

#### 2. Username
Your Jellyfin account username (the one you use to log into Jellyfin)

#### 3. Password
Your Jellyfin account password

**Security Note:** Your credentials are stored locally in BetterDiscord's data folder and are used to generate an access token. The plugin authenticates with your Jellyfin server just like any other Jellyfin client (web browser, mobile app, etc.).

### Plugin Settings

1. Open Discord User Settings
2. Go to **Plugins** → **JellyfinControls** → Settings ⚙️
3. Expand **Jellyfin Server Configuration**
4. Enter your:
   - **Server URL** (e.g., `http://localhost:8096`)
   - **Username** (your Jellyfin username)
   - **Password** (your Jellyfin password)
5. Click **Test Server Connection** to verify the server is reachable (optional)
6. Click **Login** to authenticate and generate an access token
7. Once logged in, you'll see a confirmation message with your User ID
8. Configure button visibility and other preferences in the Settings section

## Usage

Once configured, the plugin will:
- Show a control panel in Discord's left sidebar (above the voice panel)
- Display currently playing media from any Jellyfin client
- Allow you to control playback across all your Jellyfin sessions

### Controls

- **Cover Art**: Click to expand/minimize player
- **⏮ Previous**: Skip to previous track (double-click to restart current track)
- **⏸/▶ Play/Pause**: Toggle playback
- **⏭ Next**: Skip to next track
- **🔀 Shuffle**: Toggle shuffle mode
- **🔁 Repeat**: Cycle through repeat modes (None → All → One)
- **🔊 Volume**: Click to open volume slider, right-click to mute/unmute
- **Timeline**: Click to seek to specific position

## Troubleshooting

### Connection Issues

**"Login failed" error:**
- Verify your server URL is correct and accessible
- Check that your username and password are correct
- Ensure your Jellyfin server is running
- Check firewall/network settings if using remote access
- Try the "Test Server Connection" button first to verify the server is reachable

**No playback controls showing:**
- Make sure you've clicked the "Login" button and see the success message
- Start playing media in any Jellyfin client (web, mobile app, etc.)
- Check that you have an active playback session
- Refresh Discord or restart the plugin

**"Cannot connect to server" error:**
- Ensure the server URL includes the protocol (http:// or https://)
- Include the port number if it's not the default (usually :8096)
- Try accessing the server URL in a web browser to confirm it's working

### Getting Help

If you encounter issues:
1. Check that your Jellyfin server is version 10.8.0 or newer
2. Verify all three configuration fields (Server URL, Username, Password) are filled correctly
3. Use the "Test Server Connection" button to verify the server is reachable
4. Use the "Login" button and wait for the success/failure message
5. Check Discord Developer Console (Ctrl+Shift+I) for error messages

## Credits

- Original SpotifyControls plugin by DevilBro
- Modified for Jellyfin integration
- Uses the BDFDB library

## License

This plugin is provided as-is for personal use.
