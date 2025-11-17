/**
 * @name JellyfinPlayer
 * @author TySP-Dev
 * @version 0.0.1
 * @description Adds a Jellyfin player and controls
 */

module.exports = (_ => {
	const changeLog = {

	};

	return !window.BDFDB_Global || (!window.BDFDB_Global.loaded && !window.BDFDB_Global.started) ? class {
		constructor (meta) {for (let key in meta) this[key] = meta[key];}
		getName () {return this.name;}
		getAuthor () {return this.author;}
		getVersion () {return this.version;}
		getDescription () {return `The Library Plugin needed for ${this.name} is missing. Open the Plugin Settings to download it. \n\n${this.description}`;}

		downloadLibrary () {
			BdApi.Net.fetch("https://mwittrien.github.io/BetterDiscordAddons/Library/0BDFDB.plugin.js").then(r => {
				if (!r || r.status != 200) throw new Error();
				else return r.text();
			}).then(b => {
				if (!b) throw new Error();
				else return require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0BDFDB.plugin.js"), b, _ => BdApi.UI.showToast("Finished downloading BDFDB Library", {type: "success"}));
			}).catch(error => {
				BdApi.UI.alert("Error", "Could not download BDFDB Library Plugin. Try again later or download it manually from GitHub: https://mwittrien.github.io/downloader/?library");
			});
		}

		load () {
			if (!window.BDFDB_Global || !Array.isArray(window.BDFDB_Global.pluginQueue)) window.BDFDB_Global = Object.assign({}, window.BDFDB_Global, {pluginQueue: []});
			if (!window.BDFDB_Global.downloadModal) {
				window.BDFDB_Global.downloadModal = true;
				BdApi.UI.showConfirmationModal("Library Missing", `The Library Plugin needed for ${this.name} is missing. Please click "Download Now" to install it.`, {
					confirmText: "Download Now",
					cancelText: "Cancel",
					onCancel: _ => {delete window.BDFDB_Global.downloadModal;},
					onConfirm: _ => {
						delete window.BDFDB_Global.downloadModal;
						this.downloadLibrary();
					}
				});
			}
			if (!window.BDFDB_Global.pluginQueue.includes(this.name)) window.BDFDB_Global.pluginQueue.push(this.name);
		}
		start () {this.load();}
		stop () {}
		getSettingsPanel () {
			let template = document.createElement("template");
			template.innerHTML = `<div style="color: var(--text-primary); font-size: 16px; font-weight: 300; white-space: pre; line-height: 22px;">The Library Plugin needed for ${this.name} is missing.\nPlease click <a style="font-weight: 500;">Download Now</a> to install it.</div>`;
			template.content.firstElementChild.querySelector("a").addEventListener("click", this.downloadLibrary);
			return template.content.firstElementChild;
		}
	} : (([Plugin, BDFDB]) => {
		var _this;
		var controls;
		var starting, lastMedia, currentVolume, lastVolume, stopTime, previousIsClicked, previousDoubleTimeout;
		var timelineTimeout, timelineDragging, updateInterval;
		var playbackState = {};
		var currentQueue = [];
		var currentQueueIndex = -1;
		var discordSessionId = null;
		var audioElement = null;
		var jellyfinConfig = {
			serverUrl: "",
			username: "",
			password: "",
			accessToken: "",
			userId: ""
		};

		const repeatStates = [
			"RepeatNone",
			"RepeatAll",
			"RepeatOne"
		];

		// Normalize server URL (remove trailing slash)
		const normalizeServerUrl = (url) => {
			if (!url) return "";
			return url.trim().replace(/\/+$/, ""); // Remove trailing slashes
		};

		// Create or get Discord Jellyfin session
		const getOrCreateDiscordSession = () => {
			return new Promise((resolve, reject) => {
				if (!jellyfinConfig.serverUrl || !jellyfinConfig.accessToken) {
					reject(new Error("Not authenticated"));
					return;
				}

				let normalizedUrl = normalizeServerUrl(jellyfinConfig.serverUrl);

				// First, try to find existing Discord session
				BDFDB.LibraryRequires.request(`${normalizedUrl}/Sessions`, {
					method: "get",
					headers: {
						"X-Emby-Token": jellyfinConfig.accessToken
					}
				}, (error, response, result) => {
					if (!error && response && response.statusCode == 200) {
						try {
							let sessions = JSON.parse(result);
							let discordSession = sessions.find(s =>
								s.Client === "BetterDiscord JellyfinControls" &&
								s.UserId == jellyfinConfig.userId
							);

							if (discordSession) {
								discordSessionId = discordSession.Id;
								resolve(discordSession.Id);
							} else {
								// Create new session by making a capabilities post
								BDFDB.LibraryRequires.request(`${normalizedUrl}/Sessions/Capabilities/Full`, {
									method: "post",
									headers: {
										"X-Emby-Token": jellyfinConfig.accessToken,
										"Content-Type": "application/json"
									},
									body: JSON.stringify({
										PlayableMediaTypes: ["Audio"],
										SupportsMediaControl: true,
										SupportedCommands: ["Play", "Pause", "Stop", "Seek", "SetVolume", "SetRepeatMode", "SetShuffleMode"]
									})
								}, (err2, resp2, res2) => {
									if (!err2 && resp2) {
										// Session should be created, fetch it
										setTimeout(() => {
											BDFDB.LibraryRequires.request(`${normalizedUrl}/Sessions`, {
												method: "get",
												headers: {
													"X-Emby-Token": jellyfinConfig.accessToken
												}
											}, (err3, resp3, res3) => {
												if (!err3 && resp3 && resp3.statusCode == 200) {
													let newSessions = JSON.parse(res3);
													let newDiscordSession = newSessions.find(s =>
														s.Client === "BetterDiscord JellyfinControls" &&
														s.UserId == jellyfinConfig.userId
													);
													if (newDiscordSession) {
														discordSessionId = newDiscordSession.Id;
														resolve(newDiscordSession.Id);
													} else {
														reject(new Error("Could not create session"));
													}
												} else {
													reject(new Error("Failed to fetch sessions"));
												}
											});
										}, 500);
									} else {
										reject(new Error("Failed to set capabilities"));
									}
								});
							}
						} catch (err) {
							reject(err);
						}
					} else {
						reject(new Error("Failed to fetch sessions"));
					}
				});
			});
		};

		// Play an item from Jellyfin
		const playJellyfinItem = (itemId, startPositionTicks = 0) => {
			return new Promise((resolve, reject) => {
				if (!jellyfinConfig.serverUrl || !jellyfinConfig.accessToken) {
					reject(new Error("Not authenticated"));
					return;
				}

				let normalizedUrl = normalizeServerUrl(jellyfinConfig.serverUrl);

				// Get stream URL
				let streamUrl = `${normalizedUrl}/Audio/${itemId}/universal?UserId=${jellyfinConfig.userId}&DeviceId=discord-jellyfin-plugin&MaxStreamingBitrate=140000000&Container=opus,mp3|mp3,aac,m4a|aac,m4b|aac,flac,webma,webm,wav,ogg&TranscodingContainer=ts&TranscodingProtocol=hls&AudioCodec=aac&api_key=${jellyfinConfig.accessToken}&StartTimeTicks=${startPositionTicks}`;

				// Create or reuse audio element
				if (!audioElement) {
					audioElement = new Audio();
					audioElement.volume = (playbackState.volume_percent || 100) / 100;

					// Set up event listeners
					audioElement.addEventListener('ended', () => {
						playNextInQueue();
					});

					audioElement.addEventListener('play', () => {
						playbackState.is_playing = true;
						if (controls) BDFDB.ReactUtils.forceUpdate(controls);
					});

					audioElement.addEventListener('pause', () => {
						playbackState.is_playing = false;
						if (controls) BDFDB.ReactUtils.forceUpdate(controls);
					});

					audioElement.addEventListener('timeupdate', () => {
						if (playbackState && !timelineDragging) {
							playbackState.position_ms = audioElement.currentTime * 1000;
							reportPlaybackProgress();
						}
					});

					audioElement.addEventListener('loadedmetadata', () => {
						playbackState.duration_ms = audioElement.duration * 1000;
						if (controls) BDFDB.ReactUtils.forceUpdate(controls);
					});
				}

				audioElement.src = streamUrl;
				audioElement.play().then(() => {
					playbackState.is_playing = true;
					reportPlaybackStart(itemId);
					if (controls) BDFDB.ReactUtils.forceUpdate(controls);
					resolve();
				}).catch(reject);
			});
		};

		// Report playback start to Jellyfin
		const reportPlaybackStart = (itemId) => {
			if (!jellyfinConfig.serverUrl || !jellyfinConfig.accessToken || !discordSessionId) return;

			let normalizedUrl = normalizeServerUrl(jellyfinConfig.serverUrl);
			BDFDB.LibraryRequires.request(`${normalizedUrl}/Sessions/Playing`, {
				method: "post",
				headers: {
					"X-Emby-Token": jellyfinConfig.accessToken,
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					ItemId: itemId,
					SessionId: discordSessionId,
					PositionTicks: (audioElement.currentTime * 10000000) || 0,
					IsPaused: false,
					IsMuted: false,
					VolumeLevel: Math.round((audioElement.volume || 1) * 100),
					PlayMethod: "DirectStream"
				})
			}, () => {});
		};

		// Report playback progress to Jellyfin
		const reportPlaybackProgress = () => {
			if (!jellyfinConfig.serverUrl || !jellyfinConfig.accessToken || !discordSessionId) return;
			if (!playbackState.item || !audioElement) return;

			let normalizedUrl = normalizeServerUrl(jellyfinConfig.serverUrl);
			BDFDB.LibraryRequires.request(`${normalizedUrl}/Sessions/Playing/Progress`, {
				method: "post",
				headers: {
					"X-Emby-Token": jellyfinConfig.accessToken,
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					ItemId: playbackState.item.Id,
					SessionId: discordSessionId,
					PositionTicks: Math.floor((audioElement.currentTime || 0) * 10000000),
					IsPaused: audioElement.paused,
					IsMuted: false,
					VolumeLevel: Math.round((audioElement.volume || 1) * 100),
					PlayMethod: "DirectStream"
				})
			}, () => {});
		};

		// Play next item in queue
		const playNextInQueue = () => {
			if (playbackState.repeat_state === "RepeatOne" && currentQueueIndex >= 0) {
				playJellyfinItem(currentQueue[currentQueueIndex].Id);
				return;
			}

			let nextIndex = currentQueueIndex + 1;
			if (nextIndex >= currentQueue.length) {
				if (playbackState.repeat_state === "RepeatAll") {
					nextIndex = 0;
				} else {
					// End of queue
					playbackState.is_playing = false;
					if (controls) BDFDB.ReactUtils.forceUpdate(controls);
					return;
				}
			}

			currentQueueIndex = nextIndex;
			let nextItem = currentQueue[currentQueueIndex];
			if (nextItem) {
				playbackState.item = nextItem;
				playJellyfinItem(nextItem.Id);
				if (controls) BDFDB.ReactUtils.forceUpdate(controls);
			}
		};

		// Play previous item in queue
		const playPreviousInQueue = () => {
			// If more than 3 seconds in, restart current track
			if (audioElement && audioElement.currentTime > 3) {
				audioElement.currentTime = 0;
				return;
			}

			let prevIndex = currentQueueIndex - 1;
			if (prevIndex < 0) {
				if (playbackState.repeat_state === "RepeatAll") {
					prevIndex = currentQueue.length - 1;
				} else {
					return; // Can't go back
				}
			}

			currentQueueIndex = prevIndex;
			let prevItem = currentQueue[currentQueueIndex];
			if (prevItem) {
				playbackState.item = prevItem;
				playJellyfinItem(prevItem.Id);
				if (controls) BDFDB.ReactUtils.forceUpdate(controls);
			}
		};

		// Fetch music libraries
		const fetchMusicLibraries = () => {
			return new Promise((resolve, reject) => {
				if (!jellyfinConfig.serverUrl || !jellyfinConfig.accessToken) {
					reject(new Error("Not authenticated"));
					return;
				}

				let normalizedUrl = normalizeServerUrl(jellyfinConfig.serverUrl);
				BDFDB.LibraryRequires.request(`${normalizedUrl}/Users/${jellyfinConfig.userId}/Views`, {
					method: "get",
					headers: {
						"X-Emby-Token": jellyfinConfig.accessToken
					}
				}, (error, response, result) => {
					if (!error && response && response.statusCode == 200) {
						try {
							let views = JSON.parse(result);
							// Filter for music libraries
							let musicLibraries = views.Items.filter(item => item.CollectionType === "music");
							resolve(musicLibraries);
						} catch (err) {
							reject(err);
						}
					} else {
						reject(new Error("Failed to fetch libraries"));
					}
				});
			});
		};

		// Fetch items from a library/folder
		const fetchLibraryItems = (parentId, itemTypes = ["MusicAlbum", "MusicArtist", "Audio"]) => {
			return new Promise((resolve, reject) => {
				if (!jellyfinConfig.serverUrl || !jellyfinConfig.accessToken) {
					reject(new Error("Not authenticated"));
					return;
				}

				let normalizedUrl = normalizeServerUrl(jellyfinConfig.serverUrl);
				let url = `${normalizedUrl}/Users/${jellyfinConfig.userId}/Items?ParentId=${parentId}&IncludeItemTypes=${itemTypes.join(",")}&Recursive=false&SortBy=SortName&SortOrder=Ascending`;

				BDFDB.LibraryRequires.request(url, {
					method: "get",
					headers: {
						"X-Emby-Token": jellyfinConfig.accessToken
					}
				}, (error, response, result) => {
					if (!error && response && response.statusCode == 200) {
						try {
							let data = JSON.parse(result);
							resolve(data.Items || []);
						} catch (err) {
							reject(err);
						}
					} else {
						reject(new Error("Failed to fetch items"));
					}
				});
			});
		};

		// Fetch tracks from an album
		const fetchAlbumTracks = (albumId) => {
			return new Promise((resolve, reject) => {
				if (!jellyfinConfig.serverUrl || !jellyfinConfig.accessToken) {
					reject(new Error("Not authenticated"));
					return;
				}

				let normalizedUrl = normalizeServerUrl(jellyfinConfig.serverUrl);
				let url = `${normalizedUrl}/Users/${jellyfinConfig.userId}/Items?ParentId=${albumId}&IncludeItemTypes=Audio&SortBy=SortName&SortOrder=Ascending`;

				BDFDB.LibraryRequires.request(url, {
					method: "get",
					headers: {
						"X-Emby-Token": jellyfinConfig.accessToken
					}
				}, (error, response, result) => {
					if (!error && response && response.statusCode == 200) {
						try {
							let data = JSON.parse(result);
							resolve(data.Items || []);
						} catch (err) {
							reject(err);
						}
					} else {
						reject(new Error("Failed to fetch tracks"));
					}
				});
			});
		};

		// Authenticate with Jellyfin server using username/password
		const authenticateJellyfin = (serverUrl, username, password) => {
			return new Promise((resolve, reject) => {
				const normalizedUrl = normalizeServerUrl(serverUrl);
				const authData = {
					Username: username,
					Pw: password
				};

				BDFDB.LibraryRequires.request(`${normalizedUrl}/Users/AuthenticateByName`, {
					method: "post",
					headers: {
						"Content-Type": "application/json",
						"X-Emby-Authorization": `MediaBrowser Client="BetterDiscord JellyfinControls", Device="Discord", DeviceId="discord-jellyfin-plugin", Version="1.0.0"`
					},
					body: JSON.stringify(authData)
				}, (error, response, result) => {
					if (!error && response && response.statusCode == 200) {
						try {
							let authResult = JSON.parse(result);
							jellyfinConfig.accessToken = authResult.AccessToken;
							jellyfinConfig.userId = authResult.User.Id;
							BDFDB.DataUtils.save({
								serverUrl: jellyfinConfig.serverUrl,
								username: jellyfinConfig.username,
								password: jellyfinConfig.password,
								accessToken: jellyfinConfig.accessToken,
								userId: jellyfinConfig.userId
							}, _this, "config");
							resolve(authResult);
						} catch (err) {
							reject(new Error("Failed to parse authentication response"));
						}
					} else {
						reject(new Error(error || "Authentication failed"));
					}
				});
			});
		};

		// Music Browser Modal Component
		const MusicBrowserModal = class MusicBrowser extends BdApi.React.Component {
			constructor(props) {
				super(props);
				this.state = {
					loading: true,
					breadcrumb: [],
					items: [],
					currentParentId: null,
					currentType: "libraries"
				};
			}

			componentDidMount() {
				this.loadLibraries();
			}

			loadLibraries() {
				this.setState({ loading: true });
				fetchMusicLibraries()
					.then(libraries => {
						this.setState({
							items: libraries,
							loading: false,
							breadcrumb: [{name: "Libraries", id: null}],
							currentType: "libraries"
						});
					})
					.catch(err => {
						BDFDB.NotificationUtils.toast("Failed to load music libraries", {type: "danger"});
						this.setState({ loading: false });
					});
			}

			loadFolder(parentId, parentName, type = "folder") {
				this.setState({ loading: true });
				let itemTypes = type === "album" ? ["Audio"] : ["MusicAlbum", "MusicArtist", "Audio"];

				fetchLibraryItems(parentId, itemTypes)
					.then(items => {
						this.setState({
							items: items,
							loading: false,
							currentParentId: parentId,
							currentType: type,
							breadcrumb: [...this.state.breadcrumb, {name: parentName, id: parentId}]
						});
					})
					.catch(err => {
						BDFDB.NotificationUtils.toast("Failed to load items", {type: "danger"});
						this.setState({ loading: false });
					});
			}

			navigateToBreadcrumb(index) {
				if (index === 0) {
					this.loadLibraries();
				} else {
					let crumb = this.state.breadcrumb[index];
					this.setState({
						breadcrumb: this.state.breadcrumb.slice(0, index + 1)
					}, () => {
						this.loadFolder(crumb.id, crumb.name);
					});
				}
			}

			playItem(item) {
				getOrCreateDiscordSession()
					.then(() => {
						if (item.Type === "Audio") {
							// Play single track
							currentQueue = [item];
							currentQueueIndex = 0;
							playbackState.item = item;
							playbackState.item.imageUrl = item.ImageTags?.Primary ?
								`${normalizeServerUrl(jellyfinConfig.serverUrl)}/Items/${item.Id}/Images/Primary?maxHeight=300&tag=${item.ImageTags.Primary}` : null;
							return playJellyfinItem(item.Id);
						} else if (item.Type === "MusicAlbum") {
							// Load and play album
							return fetchAlbumTracks(item.Id).then(tracks => {
								if (tracks.length > 0) {
									currentQueue = tracks;
									currentQueueIndex = 0;
									playbackState.item = tracks[0];
									playbackState.item.imageUrl = item.ImageTags?.Primary ?
										`${normalizeServerUrl(jellyfinConfig.serverUrl)}/Items/${item.Id}/Images/Primary?maxHeight=300&tag=${item.ImageTags.Primary}` : null;
									return playJellyfinItem(tracks[0].Id);
								}
							});
						}
					})
					.then(() => {
						BDFDB.NotificationUtils.toast(`Now playing: ${item.Name}`, {type: "success"});
						if (controls) BDFDB.ReactUtils.forceUpdate(controls);
						this.props.onClose();
					})
					.catch(err => {
						BDFDB.NotificationUtils.toast(`Failed to play: ${err.message}`, {type: "danger"});
					});
			}

			render() {
				return BDFDB.ReactUtils.createElement("div", {
					style: {padding: "20px"},
					children: [
								// Breadcrumb
								this.state.breadcrumb.length > 0 && BDFDB.ReactUtils.createElement("div", {
									style: {
										marginBottom: "10px",
										display: "flex",
										gap: "5px",
										flexWrap: "wrap"
									},
									children: this.state.breadcrumb.map((crumb, index) => [
										BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Clickable, {
											children: crumb.name,
											style: {
												color: index === this.state.breadcrumb.length - 1 ? "var(--text-normal)" : "var(--text-link)",
												fontWeight: index === this.state.breadcrumb.length - 1 ? "bold" : "normal"
											},
											onClick: () => index < this.state.breadcrumb.length - 1 && this.navigateToBreadcrumb(index)
										}),
										index < this.state.breadcrumb.length - 1 && BDFDB.ReactUtils.createElement("span", {
											children: " > ",
											style: {color: "var(--text-muted)"}
										})
									].filter(n => n)).flat()
								}),
								// Loading state
								this.state.loading && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Spinner, {
									type: BDFDB.LibraryComponents.SpinnerTypes.SPINNING_CIRCLE
								}),
								// Items list
								!this.state.loading && BDFDB.ReactUtils.createElement("div", {
									style: {
										display: "grid",
										gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
										gap: "10px",
										maxHeight: "400px",
										overflowY: "auto"
									},
									children: this.state.items.map(item => BDFDB.ReactUtils.createElement("div", {
										style: {
											padding: "10px",
											backgroundColor: "var(--background-secondary)",
											borderRadius: "5px",
											cursor: "pointer",
											textAlign: "center"
										},
										onClick: () => {
											if (item.Type === "Audio") {
												this.playItem(item);
											} else if (item.Type === "MusicAlbum") {
												// Option: navigate into album or play it
												this.playItem(item);
											} else {
												this.loadFolder(item.Id, item.Name, item.Type === "MusicAlbum" ? "album" : "folder");
											}
										},
										children: [
											// Album art if available
											item.ImageTags?.Primary && BDFDB.ReactUtils.createElement("img", {
												src: `${normalizeServerUrl(jellyfinConfig.serverUrl)}/Items/${item.Id}/Images/Primary?maxHeight=150&tag=${item.ImageTags.Primary}`,
												style: {
													width: "100%",
													height: "150px",
													objectFit: "cover",
													borderRadius: "3px",
													marginBottom: "5px"
												}
											}),
											BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextElement, {
												size: BDFDB.LibraryComponents.TextElement.Sizes.SIZE_12,
												children: item.Name,
												style: {
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap"
												}
											}),
											item.Type && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextElement, {
												size: BDFDB.LibraryComponents.TextElement.Sizes.SIZE_10,
												color: "var(--text-muted)",
												children: item.Type.replace("Music", "")
											})
										]
									}))
								})
					]
				});
			}
		};

		const JellyfinControlsCoverComponent = props => {
			if (props.media && props.media.imageUrl) {
				return BDFDB.ReactUtils.createElement("img", {
					className: "jellyfinControls-cover",
					src: props.media.imageUrl
				});
			}
			return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
				className: "jellyfinControls-cover",
				width: "100%",
				height: "100%",
				name: BDFDB.LibraryComponents.SvgIcon.Names.QUESTIONMARK_ACTIVITY
			});
		};

		const JellyfinControlsComponent = class JellyfinControls extends BdApi.React.Component {
			componentDidMount() {
				controls = this;
				this.fetchPlaybackState();
			}

			fetchPlaybackState() {
				if (!jellyfinConfig.serverUrl || !jellyfinConfig.accessToken) return;

				let normalizedUrl = normalizeServerUrl(jellyfinConfig.serverUrl);
				BDFDB.LibraryRequires.request(`${normalizedUrl}/Sessions`, {
					method: "get",
					headers: {
						"X-Emby-Token": jellyfinConfig.accessToken
					}
				}, (error, response, result) => {
					if (!error && response && response.statusCode == 200) {
						try {
							let sessions = JSON.parse(result);
							let activeSession = sessions.find(s => s.NowPlayingItem && s.UserId == jellyfinConfig.userId);
							if (activeSession) {
								// Update session ID for this component
								if (this.props.sessionId !== activeSession.Id) {
									this.props.sessionId = activeSession.Id;
								}

								playbackState = {
									is_playing: activeSession.PlayState && !activeSession.PlayState.IsPaused,
									position_ms: (activeSession.PlayState?.PositionTicks || 0) / 10000,
									duration_ms: (activeSession.NowPlayingItem?.RunTimeTicks || 0) / 10000,
									shuffle_state: activeSession.PlayState?.ShuffleMode === "Shuffle",
									repeat_state: activeSession.PlayState?.RepeatMode || "RepeatNone",
									volume_percent: activeSession.PlayState?.VolumeLevel || 100,
									item: activeSession.NowPlayingItem,
									sessionId: activeSession.Id
								};
								BDFDB.ReactUtils.forceUpdate(this);
							}
						} catch (err) {}
					}
				});
			}

			request(type, data, callback) {
				if (!jellyfinConfig.serverUrl || !jellyfinConfig.accessToken) {
					BDFDB.NotificationUtils.toast(_this.labels.noconfig_text, {type: "danger"});
					return Promise.resolve({});
				}

				return new Promise(resolve => {
					// Use local audio element if available (standalone mode)
					if (audioElement) {
						switch (type) {
							case "play":
								audioElement.play();
								playbackState.is_playing = true;
								BDFDB.ReactUtils.forceUpdate(this);
								resolve({});
								if (callback) callback();
								return;
							case "pause":
								audioElement.pause();
								playbackState.is_playing = false;
								BDFDB.ReactUtils.forceUpdate(this);
								resolve({});
								if (callback) callback();
								return;
							case "next":
								playNextInQueue();
								resolve({});
								if (callback) callback();
								return;
							case "previous":
								playPreviousInQueue();
								resolve({});
								if (callback) callback();
								return;
							case "seek":
								audioElement.currentTime = data.position_ms / 1000;
								resolve({});
								if (callback) callback();
								return;
							case "volume":
								audioElement.volume = data.volume_percent / 100;
								playbackState.volume_percent = data.volume_percent;
								resolve({});
								if (callback) callback();
								return;
							case "shuffle":
								playbackState.shuffle_state = data.state;
								// TODO: Implement shuffle
								resolve({});
								if (callback) callback();
								return;
							case "repeat":
								playbackState.repeat_state = data.state;
								resolve({});
								if (callback) callback();
								return;
						}
					}

					// Fallback to remote session control
					let endpoint = "";
					let method = "post";

					switch (type) {
						case "play":
							endpoint = `/Sessions/${this.props.sessionId}/Playing/Unpause`;
							break;
						case "pause":
							endpoint = `/Sessions/${this.props.sessionId}/Playing/Pause`;
							break;
						case "next":
							endpoint = `/Sessions/${this.props.sessionId}/Playing/NextTrack`;
							break;
						case "previous":
							endpoint = `/Sessions/${this.props.sessionId}/Playing/PreviousTrack`;
							break;
						case "seek":
							endpoint = `/Sessions/${this.props.sessionId}/Playing/Seek`;
							method = "post";
							data = {SeekPositionTicks: data.position_ms * 10000};
							break;
						case "volume":
							endpoint = `/Sessions/${this.props.sessionId}/Command`;
							data = {
								Name: "SetVolume",
								Arguments: {Volume: data.volume_percent}
							};
							break;
						case "shuffle":
							endpoint = `/Sessions/${this.props.sessionId}/Command`;
							data = {
								Name: "SetShuffleQueue",
								Arguments: {ShuffleMode: data.state ? "Shuffle" : "Sorted"}
							};
							break;
						case "repeat":
							endpoint = `/Sessions/${this.props.sessionId}/Command`;
							data = {
								Name: "SetRepeatMode",
								Arguments: {RepeatMode: data.state}
							};
							break;
					}

					let normalizedUrl = normalizeServerUrl(jellyfinConfig.serverUrl);
					BDFDB.LibraryRequires.request(`${normalizedUrl}${endpoint}`, {
						method: method,
						headers: {
							"X-Emby-Token": jellyfinConfig.accessToken,
							"Content-Type": "application/json"
						},
						body: data ? JSON.stringify(data) : undefined
					}, (error, response, result) => {
						if (!error && response) {
							try {
								resolve(JSON.parse(result || "{}"));
							} catch (err) {
								resolve({});
							}
						} else {
							resolve({});
						}
						if (callback) callback();
					});
				});
			}

			render() {
				// Update media info from current playback state
				if (playbackState.item) {
					this.props.media = {
						title: playbackState.item.Name || "Unknown Title",
						artist: playbackState.item.AlbumArtist || (playbackState.item.Artists && playbackState.item.Artists.join(", ")) || "Unknown Artist",
						type: playbackState.item.Type || "Audio",
						imageUrl: playbackState.item.imageUrl || ""
					};
				}

				if (!this.props.media) return null;
				currentVolume = this.props.draggingVolume ? currentVolume : (playbackState.volume_percent || 100);

			// Calculate noSession dynamically based on current state
			let noSession = !playbackState.sessionId && !audioElement && !playbackState.item;

				return BDFDB.ReactUtils.createElement("div", {
					className: BDFDB.DOMUtils.formatClassName("jellyfinControls-container", !playbackState.is_playing && "jellyfinControls-container-paused", this.props.timeline && "jellyfinControls-container-with-timeline"),
					children: [
						BDFDB.ReactUtils.createElement("div", {
							className: "jellyfinControls-container-inner",
							children: [
								BDFDB.ReactUtils.createElement("div", {
									className: "jellyfinControls-cover-wrapper",
									children: BDFDB.ReactUtils.createElement(JellyfinControlsCoverComponent, {
										media: this.props.media
									})
								}),
								BDFDB.ReactUtils.createElement("div", {
									className: "jellyfinControls-details",
									children: [
										BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextElement, {
											className: "jellyfinControls-media",
											color: BDFDB.LibraryComponents.TextElement.Colors.PRIMARY,
											children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextScroller, {
												children: this.props.media.title
											})
										}),
										BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextElement, {
											className: BDFDB.disCNS.subtext + "jellyfinControls-artist",
											color: BDFDB.LibraryComponents.TextElement.Colors.CUSTOM,
											size: BDFDB.LibraryComponents.TextElement.Sizes.SIZE_12,
											children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextScroller, {
												children: this.props.media.artist || this.props.media.type
											})
										})
									]
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
									text: noSession ? "No active playback session" : null,
									tooltipConfig: {color: "red"},
									children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
										wrap: BDFDB.LibraryComponents.Flex.Wrap.NO_WRAP,
										grow: 0,
										children: [
											BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
												children: "Browse",
												size: BDFDB.LibraryComponents.Button.Sizes.TINY,
												color: BDFDB.LibraryComponents.Button.Colors.BRAND,
												onClick: _ => {
													if (!jellyfinConfig.serverUrl || !jellyfinConfig.accessToken) {
														BDFDB.NotificationUtils.toast("Please configure Jellyfin in plugin settings first", {type: "danger"});
														return;
													}
													BDFDB.LibraryModules.ModalUtils.openModal(modalProps => {
														return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ModalComponents.ModalRoot, {
															...modalProps,
															size: BDFDB.LibraryComponents.ModalComponents.ModalSize.MEDIUM,
															children: [
																BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ModalComponents.ModalHeader, {
																	children: [
																		BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormComponents.FormTitle, {
																			tag: "h4",
																			children: "Browse Music"
																		}),
																		BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ModalComponents.ModalCloseButton, {
																			onClick: modalProps.onClose
																		})
																	]
																}),
																BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ModalComponents.ModalContent, {
																	children: BDFDB.ReactUtils.createElement(MusicBrowserModal, {
																		onClose: modalProps.onClose
																	})
																})
															]
														});
													});
												}
											}),
											BDFDB.ReactUtils.createElement(JellyfinControlsButtonComponent, {
												type: "share",
												player: this,
												onClick: _ => {
													if (playbackState.item && playbackState.item.Id) {
														let itemUrl = `${normalizeServerUrl(jellyfinConfig.serverUrl)}/web/index.html#!/item?id=${playbackState.item.Id}&serverId=${jellyfinConfig.userId}`;
														BDFDB.LibraryModules.WindowUtils.copy(itemUrl);
														BDFDB.NotificationUtils.toast(_this.labels.toast_copyurl_success, {type: "success"});
													} else {
														BDFDB.NotificationUtils.toast(_this.labels.toast_copyurl_fail, {type: "danger"});
													}
												}
											}),
											BDFDB.ReactUtils.createElement(JellyfinControlsButtonComponent, {
												type: "shuffle",
												player: this,
												active: playbackState.shuffle_state,
												disabled: noSession,
												onClick: _ => {
													playbackState.shuffle_state = !playbackState.shuffle_state;
													this.request("shuffle", {
														state: playbackState.shuffle_state
													});
													BDFDB.ReactUtils.forceUpdate(this);
												}
											}),
											BDFDB.ReactUtils.createElement(JellyfinControlsButtonComponent, {
												type: "previous",
												player: this,
												disabled: noSession,
												onClick: _ => {
													if (previousIsClicked || !_this.settings.general.doubleBack) {
														previousIsClicked = false;
														BDFDB.TimeUtils.clear(previousDoubleTimeout);
														this.request("previous");
													}
													else {
														previousIsClicked = true;
														previousDoubleTimeout = BDFDB.TimeUtils.timeout(_ => {
															previousIsClicked = false;
															this.request("seek", {
																position_ms: 0
															});
														}, 300);
													}
												}
											}),
											BDFDB.ReactUtils.createElement(JellyfinControlsButtonComponent, {
												type: "pauseplay",
												player: this,
												icon: playbackState.is_playing ? 0 : 1,
												disabled: noSession,
												onClick: _ => {
													if (playbackState.is_playing) this.request("pause");
													else this.request("play");
													playbackState.is_playing = !playbackState.is_playing;
													BDFDB.ReactUtils.forceUpdate(this);
												}
											}),
											BDFDB.ReactUtils.createElement(JellyfinControlsButtonComponent, {
												type: "next",
												player: this,
												disabled: noSession,
												onClick: _ => this.request("next")
											}),
											BDFDB.ReactUtils.createElement(JellyfinControlsButtonComponent, {
												type: "repeat",
												player: this,
												icon: playbackState.repeat_state === "RepeatOne" ? 1 : 0,
												active: playbackState.repeat_state !== "RepeatNone",
												disabled: noSession,
												onClick: _ => {
													let currentIndex = repeatStates.indexOf(playbackState.repeat_state);
													playbackState.repeat_state = repeatStates[(currentIndex + 1) % repeatStates.length];
													this.request("repeat", {
														state: playbackState.repeat_state
													});
													BDFDB.ReactUtils.forceUpdate(this);
												}
											}),
											BDFDB.ReactUtils.createElement(JellyfinControlsButtonComponent, {
												type: "volume",
												player: this,
												icon: Math.ceil(currentVolume/34),
												disabled: noSession,
												onContextMenu: _ => {
													if (currentVolume == 0) {
														if (lastVolume) this.request("volume", {
															volume_percent: lastVolume
														});
													}
													else {
														lastVolume = currentVolume;
														this.request("volume", {
															volume_percent: 0
														});
													}
												},
												renderPopout: instance => {
													let changeTimeout;
													return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Slider, {
														className: "jellyfinControls-volume-slider",
														defaultValue: currentVolume,
														digits: 0,
														barStyles: {height: 6, top: 3},
														fillStyles: {backgroundColor: "var(--JC-jellyfin-purple)"},
														onValueRender: value => {
															if (currentVolume == value) return value + "%";
															this.props.draggingVolume = true;
															currentVolume = value;
															BDFDB.TimeUtils.clear(changeTimeout);
															changeTimeout = BDFDB.TimeUtils.timeout(_ => this.props.draggingVolume && this.request("volume", {
																volume_percent: currentVolume
															}), 500);
															return value + "%";
														},
														onValueChange: value => {
															if (currentVolume == value) return;
															this.props.draggingVolume = false;
															currentVolume = value;
															this.request("volume", {
																volume_percent: currentVolume
															});
														}
													});
												}
											})
										].filter(n => n)
									})
								})
							]
						}),
						this.props.timeline && BDFDB.ReactUtils.createElement(JellyfinControlsTimelineComponent, {
							media: this.props.media,
							controls: this
						})
					].filter(n => n)
				});
			}
		};

		const JellyfinControlsButtonComponent = class JellyfinControlsButton extends BdApi.React.Component {
			render() {
				if (!_this || !_this.defaults || !_this.defaults.buttons || !_this.defaults.buttons[this.props.type]) return null;
				if (_this.settings && _this.settings.general && _this.settings.general.hideDisabled && this.props.disabled) return null;

				let playerSize = "small";
				// Check settings first, fall back to defaults
				let buttonSettings = (_this.settings && _this.settings.buttons && _this.settings.buttons[this.props.type]) || _this.defaults.buttons[this.props.type].value;
				if (!buttonSettings || !buttonSettings[playerSize]) return null;

				let iconIndex = this.props.icon !== undefined ? this.props.icon : 0;
				let iconChar = _this.defaults.buttons[this.props.type].icons[iconIndex] || _this.defaults.buttons[this.props.type].icons[0] || "?";

				let button = BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, BDFDB.ObjectUtils.exclude(Object.assign({}, this.props, {
					className: BDFDB.DOMUtils.formatClassName(BDFDB.disCN.accountinfobutton, this.props.disabled ? BDFDB.disCN.accountinfobuttondisabled : BDFDB.disCN.accountinfobuttonenabled, this.props.active && "jellyfinControls-button-active"),
					look: BDFDB.LibraryComponents.Button.Looks.BLANK,
					size: BDFDB.LibraryComponents.Button.Sizes.NONE,
					children: iconChar,
					onClick: this.props.disabled ? _ => {} : this.props.onClick,
					onContextMenu: this.props.disabled ? _ => {} : this.props.onContextMenu,
				}), "active", "disabled", "renderPopout", "icon", "type", "player"));
				return !this.props.disabled && typeof this.props.renderPopout == "function" ? BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.PopoutContainer, {
					children: button,
					animation: BDFDB.LibraryComponents.PopoutContainer.Animation.SCALE,
					position: BDFDB.LibraryComponents.PopoutContainer.Positions.TOP,
					align: BDFDB.LibraryComponents.PopoutContainer.Align.CENTER,
					arrow: true,
					open: this.props.player.props.buttonStates.indexOf(this.props.type) > -1,
					onOpen: _ => this.props.player.props.buttonStates.push(this.props.type),
					onClose: _ => BDFDB.ArrayUtils.remove(this.props.player.props.buttonStates, this.props.type, true),
					renderPopout: this.props.renderPopout
				}, true) : button;
			}
		};

		const JellyfinControlsTimelineComponent = class JellyfinControlsTimeline extends BdApi.React.Component {
			componentDidMount() {
				BDFDB.TimeUtils.clear(updateInterval);
				updateInterval = BDFDB.TimeUtils.interval(_ => {
					if (!this.updater || typeof this.updater.isMounted != "function" || !this.updater.isMounted(this)) BDFDB.TimeUtils.clear(updateInterval);
					else if (playbackState.is_playing) {
						BDFDB.ReactUtils.forceUpdate(this);
					}
				}, 1000);
			}

			formatTime(time) {
				let seconds = Math.floor((time / 1000) % 60);
				let minutes = Math.floor((time / (1000 * 60)) % 60);
				let hours = Math.floor((time / (1000 * 60 * 60)) % 24);
				return `${hours > 0 ? hours + ":" : ""}${hours > 0 && minutes < 10 ? "0" + minutes : minutes}:${seconds < 10 ? "0" + seconds : seconds}`
			}

			render() {
				let maxTime = playbackState.duration_ms || 0;
				let currentTime = playbackState.position_ms || 0;
				currentTime = currentTime > maxTime ? maxTime : currentTime;

				return BDFDB.ReactUtils.createElement("div", {
					className: "jellyfinControls-timeline",
					children: [
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Clickable, {
							className: "jellyfinControls-bar",
							children: [
								BDFDB.ReactUtils.createElement("div", {
									className: "jellyfinControls-bar-fill",
									style: {width: `${currentTime / maxTime * 100}%`}
								}),
								BDFDB.ReactUtils.createElement("div", {
									className: "jellyfinControls-bar-grabber",
									style: {left: `${currentTime / maxTime * 100}%`}
								})
							],
							onClick: event => {
								let rects = BDFDB.DOMUtils.getRects(BDFDB.DOMUtils.getParent(".jellyfinControls-bar", event.target));
								if (playbackState.duration_ms) {
									let seekTime = Math.round(BDFDB.NumberUtils.mapRange([rects.left, rects.left + rects.width], [0, playbackState.duration_ms], event.clientX));
									this.props.controls.request("seek", {
									position_ms: seekTime
								});
								}
							}
						}),
						BDFDB.ReactUtils.createElement("div", {
							className: "jellyfinControls-bar-text",
							children: [
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextElement, {
									size: BDFDB.LibraryComponents.TextElement.Sizes.SIZE_10,
									children: this.formatTime(currentTime)
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextElement, {
									size: BDFDB.LibraryComponents.TextElement.Sizes.SIZE_10,
									children: this.formatTime(maxTime)
								})
							]
						})
					]
				});
			}
		};

		return class JellyfinControls extends Plugin {
			onLoad () {
				_this = this;


				this.defaults = {
					general: {
						addTimeline: 		{value: true,		description: "Shows the Media Timeline in the Controls"},
						hideDisabled: 		{value: false,		description: "Hides Buttons which are unclickable"},
						doubleBack: 		{value: true,		description: "Requires the User to press the Back Button twice to go to previous Track"}
					},
					buttons: {
				share: 			{value: {small: false, big: true},		icons: ["🔗"],						description: "Share"},
				shuffle: 		{value: {small: false, big: true},		icons: ["🔀"],						description: "Shuffle"},
				previous: 		{value: {small: true, big: true},		icons: ["⏮"],						description: "Previous"},
				pauseplay: 		{value: {small: true, big: true},		icons: ["⏸", "▶"],				description: "Pause/Play"},
				next: 			{value: {small: true, big: true},		icons: ["⏭"],						description: "Next"},
				repeat: 		{value: {small: false, big: true},		icons: ["🔁", "🔂"],				description: "Repeat"},
				volume: 		{value: {small: false, big: true},		icons: ["🔇", "🔈", "🔉", "🔊"],				description: "Volume"}
					},
					config: {
						serverUrl: 		{value: "",			description: "Jellyfin Server URL"},
						username: 		{value: "",			description: "Jellyfin Username"},
						password: 		{value: "",			description: "Jellyfin Password"}
					}
				};

				this.css = `
					:root {
						--JC-jellyfin-purple: #aa5cc3;
					}
					${BDFDB.dotCN.channelpanels} {
						display: flex;
						flex-direction: column;
					}
					${BDFDB.dotCN.channelpanels}:has(.jellyfinControls-container:first-child) {
						overflow: hidden;
					}
					.jellyfinControls-container {
						display: flex !important;
						flex-direction: column !important;
						justify-content: center;
						min-height: 52px;
						max-height: 80px;
						border-bottom: 1px solid var(--background-modifier-accent);
						padding: 0 8px;
						box-sizing: border-box;
						order: -1;
					}
					${BDFDB.dotCN.themelight + BDFDB.dotCNS.themecustombackground}.jellyfinControls-container {
						background: var(--bg-overlay-3);
					}
					${BDFDB.dotCN.themedark + BDFDB.dotCNS.themecustombackground}.jellyfinControls-container {
						background: var(--bg-overlay-1);
					}
					.jellyfinControls-container.jellyfinControls-container-with-timeline {
						padding-top: 8px;
					}
					.jellyfinControls-container-inner {
						display: flex !important;
						flex-direction: row !important;
						align-items: center !important;
						font-size: 14px;
						width: 100%;
						gap: 8px;
					}
					.jellyfinControls-timeline {
						margin: 6px 0 4px 0;
					}
					.jellyfinControls-bar {
						--bar-size: 4px;
						--grabber-size: 12px;
						position: relative;
						border-radius: 2px;
						background-color: rgba(79, 84, 92, 0.16);
						height: var(--bar-size);
						margin-bottom: 4px;
					}
					.jellyfinControls-bar-fill {
						border-radius: 2px;
						height: 100%;
						min-width: 4px;
						border-radius: 2px;
						background: var(--text-secondary);
					}
					.jellyfinControls-timeline:hover .jellyfinControls-bar-fill {
						background: var(--JC-jellyfin-purple);
					}
					.jellyfinControls-bar-grabber {
						display: none;
						position: absolute;
						top: 0;
						left: 0;
						width: var(--grabber-size);
						height: var(--grabber-size);
						margin-top: calc(-1 * (var(--grabber-size) - var(--bar-size)) / 2);
						margin-left: calc(-1 * var(--grabber-size) / 2);
						background: var(--text-secondary);
						border-radius: 50%;
					}
					.jellyfinControls-timeline:hover .jellyfinControls-bar-grabber {
						display: block;
					}
					.jellyfinControls-bar-text {
						display: flex;
						align-items: center;
						justify-content: space-between;
					}
					.jellyfinControls-cover-wrapper,
					.jellyfinControls-container .jellyfinControls-cover-wrapper,
					.jellyfinControls-container div[class*="jellyfinControls-cover-wrapper"] {
						position: relative !important;
						width: 32px !important;
						min-width: 32px !important;
						max-width: 32px !important;
						height: 32px !important;
						min-height: 32px !important;
						max-height: 32px !important;
						margin-right: 8px !important;
						border-radius: 4px !important;
						overflow: hidden !important;
						flex-shrink: 0 !important;
						flex-grow: 0 !important;
					}
					.jellyfinControls-cover {
						display: block !important;
						width: 32px !important;
						height: 32px !important;
						max-width: 32px !important;
						max-height: 32px !important;
						color: var(--text-primary);
						object-fit: cover;
					}
					.jellyfinControls-details {
						flex-grow: 1;
						margin-right: 4px;
						min-width: 0;
						user-select: text;
					}
					.jellyfinControls-media {
						font-weight: 500;
					}
					.jellyfinControls-artist {
						font-weight: 300;
					}
					.jellyfinControls-volume-slider {
						height: 12px;
						width: 140px;
						margin: 5px;
					}
					.jellyfinControls-container ${BDFDB.dotCN.accountinfobuttondisabled} {
						cursor: no-drop;
					}
					.jellyfinControls-container ${BDFDB.dotCN.accountinfobutton}.jellyfinControls-button-active {
						color: var(--JC-jellyfin-purple) !important;
					}
				${BDFDB.dotCN.accountinfobutton} {
					width: 32px;
					height: 32px;
					min-width: 32px;
					min-height: 32px;
					display: flex;
					align-items: center;
					justify-content: center;
					transition: color 0.17s ease;
					font-size: 18px;
				}
				${BDFDB.dotCN.accountinfobutton}:hover {
					color: var(--JC-jellyfin-purple) !important;
				}
					.jellyfinControls-settings-icon {
						margin: 4px;
						font-size: 16px;
					}
					.jellyfinControls-settings-label {
						margin-left: 10px;
					}
				`;
			}

			onStart () {
				// Clear any old playerState data that might cause maximized view
				BDFDB.DataUtils.remove(this, "playerState");

				// Load saved config
				let savedConfig = BDFDB.DataUtils.load(this, "config");
				if (savedConfig && typeof savedConfig === 'object') {
					jellyfinConfig.serverUrl = normalizeServerUrl(savedConfig.serverUrl || this.settings.config.serverUrl || "");
					jellyfinConfig.username = savedConfig.username || this.settings.config.username || "";
					jellyfinConfig.password = savedConfig.password || this.settings.config.password || "";
					jellyfinConfig.accessToken = savedConfig.accessToken || "";
					jellyfinConfig.userId = savedConfig.userId || "";

					// If we have credentials but no access token, try to authenticate
					if (jellyfinConfig.serverUrl && jellyfinConfig.username && jellyfinConfig.password && !jellyfinConfig.accessToken) {
						authenticateJellyfin(jellyfinConfig.serverUrl, jellyfinConfig.username, jellyfinConfig.password)
							.then(() => {
								BDFDB.NotificationUtils.toast("Successfully authenticated with Jellyfin", {type: "success"});
							})
							.catch(err => {
								BDFDB.NotificationUtils.toast("Failed to authenticate with Jellyfin. Please check your credentials.", {type: "danger"});
							});
					}
				}

				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.InternalReactUtils, ["jsx", "jsxs"], {before: e => {
					if (e.methodArguments[0] == "section" && e.methodArguments[1].className && e.methodArguments[1].className.indexOf(BDFDB.disCN.channelpanels) > -1) {
						let parent = BDFDB.ReactUtils.findChild(e.methodArguments[1].children, {filter: n => n.props && BDFDB.ArrayUtils.is(n.props.children) && n.props.children.find(k => k && k.props && k.props.section == "Account Panel")});
						if (parent) {
							// Get media from playback state or use defaults
							let mediaInfo = {
								title: playbackState.item?.Name || "No media playing",
								artist: playbackState.item?.AlbumArtist || playbackState.item?.Artists?.join(", ") || "Unknown Artist",
								type: playbackState.item?.Type || "Audio",
								imageUrl: playbackState.item?.imageUrl || ""
							};

							parent.props.children.unshift(BDFDB.ReactUtils.createElement(JellyfinControlsComponent, {
								key: "JELLYFIN_CONTROLS",
								media: mediaInfo,
								sessionId: playbackState.sessionId || null,
								noSession: !playbackState.sessionId && !audioElement && !playbackState.item,
								buttonStates: [],
								timeline: this.settings?.general?.addTimeline !== false
							}, true));
						}
					}
				}});

				BDFDB.DiscordUtils.rerenderAll();
			}

			onStop () {
				BDFDB.DiscordUtils.rerenderAll();
			}

			getSettingsPanel (collapseStates = {}) {
				try {
					let settingsPanel, settingsItems = [];

					// Ensure settings are initialized
					if (!this.settings) this.settings = {};
					if (!this.settings.general) this.settings.general = {};
					if (!this.settings.config) this.settings.config = {};

					// Initialize buttons settings from defaults if not exists
					if (!this.settings.buttons) this.settings.buttons = {};
					Object.keys(this.defaults.buttons).forEach(key => {
						if (!this.settings.buttons[key]) {
							this.settings.buttons[key] = this.defaults.buttons[key].value;
						}
					});

					settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
						title: "Jellyfin Server Configuration",
						collapseStates: collapseStates,
						children: [
							BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormComponents.FormItem, {
								children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
									children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextElement, {
										children: "Enter your Jellyfin server URL and login credentials. Your password is stored locally and used to generate an access token."
									})
								})
							})
						].concat(Object.keys(this.defaults.config).map(key => {
							return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
								type: "TextInput",
								plugin: this,
								keys: ["config", key],
								label: this.defaults.config[key].description,
								note: key === "password" ? "Your password is encrypted and stored locally" : undefined,
								value: this.settings.config[key] || "",
								placeholder: key === "serverUrl" ? "http://localhost:8096" : key === "username" ? "Enter your username" : "Enter your password",
								passwordInput: key === "password",
								onChange: (value) => {
									// Normalize server URL if this is the serverUrl field
									let normalizedValue = key === "serverUrl" ? normalizeServerUrl(value) : value;
									jellyfinConfig[key] = normalizedValue;
									this.settings.config[key] = normalizedValue;
									BDFDB.DataUtils.save(this.settings.config, this, "config");
								}
							});
						})).concat([
							jellyfinConfig.accessToken && jellyfinConfig.userId && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextElement, {
								color: "var(--text-positive)",
								children: `✓ Logged in as User ID: ${jellyfinConfig.userId}`
							}),
							BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
								children: [
									BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
										children: "Login",
										color: BDFDB.LibraryComponents.Button.Colors.GREEN,
										look: BDFDB.LibraryComponents.Button.Looks.FILLED,
										size: BDFDB.LibraryComponents.Button.Sizes.MEDIUM,
										style: {marginRight: "10px"},
										onClick: _ => {
											if (!jellyfinConfig.serverUrl || !jellyfinConfig.username || !jellyfinConfig.password) {
												BDFDB.NotificationUtils.toast("Please enter server URL, username, and password", {type: "danger"});
												return;
											}

											BDFDB.NotificationUtils.toast("Authenticating...", {type: "info"});
											authenticateJellyfin(jellyfinConfig.serverUrl, jellyfinConfig.username, jellyfinConfig.password)
												.then(authResult => {
													BDFDB.NotificationUtils.toast(`Successfully logged in as ${authResult.User.Name}`, {type: "success"});
													BDFDB.DiscordUtils.rerenderAll();
												})
												.catch(error => {
													BDFDB.NotificationUtils.toast("Login failed. Check your credentials and server URL.", {type: "danger"});
												});
										}
									}),
									BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
										children: "Test Server Connection",
										color: BDFDB.LibraryComponents.Button.Colors.BRAND,
										look: BDFDB.LibraryComponents.Button.Looks.OUTLINED,
										size: BDFDB.LibraryComponents.Button.Sizes.MEDIUM,
										onClick: _ => {
											if (!jellyfinConfig.serverUrl) {
												BDFDB.NotificationUtils.toast("Please enter server URL first", {type: "danger"});
												return;
											}

											let normalizedUrl = normalizeServerUrl(jellyfinConfig.serverUrl);
											BDFDB.LibraryRequires.request(`${normalizedUrl}/System/Info/Public`, {
												method: "get"
											}, (error, response, result) => {
												if (!error && response && response.statusCode == 200) {
													try {
														let info = JSON.parse(result);
														BDFDB.NotificationUtils.toast(`Found server: ${info.ServerName} (v${info.Version})`, {type: "success"});
													} catch (err) {
														BDFDB.NotificationUtils.toast("Server reachable!", {type: "success"});
													}
												} else {
													BDFDB.NotificationUtils.toast("Cannot connect to server. Check your URL.", {type: "danger"});
												}
											});
										}
									})
								]
							})
						].filter(n => n))
					}));

					settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
						title: "Settings",
						collapseStates: collapseStates,
						children: Object.keys(this.defaults.general).map(key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
							type: "Switch",
							plugin: this,
							keys: ["general", key],
							label: this.defaults.general[key].description,
							value: this.settings.general[key]
						}))
					}));

					settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
						title: "Button Settings",
						collapseStates: collapseStates,
						children: [BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormTitle.Title, {
							className: BDFDB.disCN.marginbottom4,
							tag: BDFDB.LibraryComponents.FormTitle.Tags.H3,
							children: "Add Control Buttons in small and/or big Player Version: "
						}), BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsList, {
							settings: Object.keys(this.defaults.buttons[Object.keys(this.defaults.buttons)[0]].value),
							data: Object.keys(this.defaults.buttons).map(key => Object.assign({}, this.settings.buttons[key], {
								key: key,
								label: this.defaults.buttons[key].description,
								icons: this.defaults.buttons[key].icons
							})),
							noRemove: true,
							renderLabel: data => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
								align: BDFDB.LibraryComponents.Flex.Align.CENTER,
								children: [
									BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
										justify: BDFDB.LibraryComponents.Flex.Justify.CENTER,
										wrap: BDFDB.LibraryComponents.Flex.Wrap.WRAP,
										basis: 50,
										grow: 0,
										children: data.icons.map(icon => BDFDB.ReactUtils.createElement("div", {
											className: "jellyfinControls-settings-icon",
											children: icon
										}))
									}),
									BDFDB.ReactUtils.createElement("div", {
										className: "jellyfinControls-settings-label",
										children: data.label
									})
								]
							}),
							onCheckboxChange: (value, instance) => {
								this.settings.buttons[instance.props.cardId][instance.props.settingId] = value;
								BDFDB.DataUtils.save(this.settings.buttons, this, "buttons");
								this.SettingsUpdated = true;
							}
						})]
					}));

					return settingsPanel = BDFDB.PluginUtils.createSettingsPanel(this, settingsItems);
				} catch (err) {
					console.error("JellyfinControls Settings Panel Error:", err);
					// Return a simple error panel
					let errorPanel = document.createElement("div");
					errorPanel.style.color = "var(--text-danger)";
					errorPanel.style.padding = "20px";
					errorPanel.innerHTML = `
						<h3>Error Loading Settings Panel</h3>
						<p>${err.message}</p>
						<p>Check the console for more details.</p>
					`;
					return errorPanel;
				}
			}

			onSettingsClosed () {
				if (this.SettingsUpdated) {
					delete this.SettingsUpdated;
					BDFDB.DiscordUtils.rerenderAll();
				}
			}

			setLabelsByLanguage () {
				switch (BDFDB.LanguageUtils.getLanguage().id) {
					default:
				return {
					noconfig_text: "Not logged in to Jellyfin. Please enter your credentials and click Login in plugin settings.",
					nosession_text: "No active Jellyfin playback session found",
					toast_copyurl_fail: "Media URL could not be copied to clipboard",
					toast_copyurl_success: "Media URL was copied to clipboard"
				};
				}
			}
		};
	})(window.BDFDB_Global.PluginUtils.buildPlugin(changeLog));
})();
