const BASE = "/api";
function getToken() { return localStorage.getItem("token"); }
async function request(path, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res  = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  // Auth
  register:       (username, password, accountType) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ username, password, accountType }) }),
  login:          (username, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  me:             () => request("/auth/me"),
  updateProfile:  (formData) => request("/auth/profile", { method: "PUT", body: formData }),

  // Users
  getProfile:     (username) => request(`/users/${username}`),
  followUser:     (username) => request(`/users/${username}/follow`, { method: "POST" }),

  // Tracks
  getTracks:      () => request("/tracks"),
  likeTrack:      (id) => request(`/tracks/${id}/like`,   { method: "POST" }),
  repostTrack:    (id) => request(`/tracks/${id}/repost`, { method: "POST" }),
  recordListen:   (trackId) => request("/listen", { method: "POST", body: JSON.stringify({ trackId }) }),
  getRecommendations: () => request("/recommendations"),
  searchAll:      (q) => request(`/search?q=${encodeURIComponent(q)}`),
  uploadTrack:    (formData) => request("/tracks/upload", { method: "POST", body: formData }),

  // Albums
  getAlbums:      () => request("/albums"),
  getAlbum:       (id) => request(`/albums/${id}`),
  createAlbum:    (formData) => request("/albums", { method: "POST", body: formData }),
  updateAlbum:    (id, formData) => request(`/albums/${id}`, { method: "PUT", body: formData }),
  deleteAlbum:    (id) => request(`/albums/${id}`, { method: "DELETE" }),
  likeAlbum:      (id) => request(`/albums/${id}/like`, { method: "POST" }),
  getAlbumAvailableTracks: (albumId) => request(`/albums/${albumId}/available-tracks`),
  addTrackToAlbum:(albumId, trackId) =>
    request(`/albums/${albumId}/tracks`, { method: "POST", body: JSON.stringify({ trackId }) }),
  removeTrackFromAlbum: (albumId, trackId) =>
    request(`/albums/${albumId}/tracks/${trackId}`, { method: "DELETE" }),

  // Playlists
  getPlaylists: () => request("/playlists"),
  createPlaylist: (formData) => request("/playlists", { method: "POST", body: formData }),
  updatePlaylist: (id, formData) => request(`/playlists/${id}`, { method: "PUT", body: formData }),
  deletePlaylist: (id) => request(`/playlists/${id}`, { method: "DELETE" }),
  addTrackToPlaylist: (playlistId, trackId) => request(`/playlists/${playlistId}/tracks`, { method: "POST", body: JSON.stringify({ trackId }) }),
  removeTrackFromPlaylist: (playlistId, trackId) => request(`/playlists/${playlistId}/tracks/${trackId}`, { method: "DELETE" }),

  // Notifications
  getNotifications:   () => request("/notifications"),
  markAllRead:        () => request("/notifications/read-all", { method: "POST" }),
  deleteNotification: (id) => request(`/notifications/${id}`, { method: "DELETE" }),

  // Comments
  getComments:    (trackId) => request(`/tracks/${trackId}/comments`),
  addComment:     (trackId, text, time) => request(`/tracks/${trackId}/comments`, { method: "POST", body: JSON.stringify({ text, time }) }),
  deleteComment:  (trackId, commentId) => request(`/tracks/${trackId}/comments/${commentId}`, { method: "DELETE" }),

  // Daily playlist
  getDailyPlaylist: () => request("/daily-playlist"),

  // Posts
  getPosts:         (username) => request(`/posts?username=${encodeURIComponent(username)}`),
  getFeed:          (before) => request(`/feed${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  createPost:       (formData) => request("/posts", { method: "POST", body: formData }),
  deletePost:       (id) => request(`/posts/${id}`, { method: "DELETE" }),
  likePost:         (id) => request(`/posts/${id}/like`, { method: "POST" }),
  getPostComments:  (id) => request(`/posts/${id}/comments`),
  addPostComment:   (id, text) => request(`/posts/${id}/comments`, { method: "POST", body: JSON.stringify({ text }) }),
  deletePostComment:(id, commentId) => request(`/posts/${id}/comments/${commentId}`, { method: "DELETE" }),

  // Drops
  getDrops:         () => request("/drops"),
  getArtistDrops:   (username) => request(`/drops/artist/${encodeURIComponent(username)}`),
  createDrop:       (formData) => request("/drops", { method: "POST", body: formData }),
  updateDrop:       (id, data) => request(`/drops/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDrop:       (id) => request(`/drops/${id}`, { method: "DELETE" }),

  // Admin — tracks
  adminGetAllTracks:  () => request("/admin/tracks/all"),
  adminGetPending:    () => request("/admin/tracks/pending"),
  adminGetDropPending:() => request("/admin/tracks/drop-pending"),
  adminApproveTrack:  (id) => request(`/admin/tracks/${id}/approve`, { method: "POST" }),
  adminRejectTrack:   (id, reason) =>
    request(`/admin/tracks/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
  adminUploadTrack:   (formData) => request("/admin/tracks", { method: "POST", body: formData }),
  updateTrack:        (id, formData) => request(`/admin/tracks/${id}`, { method: "PUT", body: formData }),
  deleteTrack:        (id) => request(`/admin/tracks/${id}`, { method: "DELETE" }),

  // Admin — albums
  adminGetAlbums:     () => request("/admin/albums"),
  adminApproveAlbum:  (id) => request(`/admin/albums/${id}/approve`, { method: "POST" }),
  adminRejectAlbum:   (id, reason) =>
    request(`/admin/albums/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),

  // Admin — users
  getUsers:       () => request("/admin/users"),
  deleteUser:     (id) => request(`/admin/users/${id}`, { method: "DELETE" }),
  setUserRole:    (id, role) =>
    request(`/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  setAccountType: (id, accountType) =>
    request(`/admin/users/${id}/accountType`, { method: "PATCH", body: JSON.stringify({ accountType }) }),
};
