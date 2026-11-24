import request from "@/utils/request";

function playerCommand(action, data = {}, config = {}) {
  return request({
    url: "/tk_custom/jukebox/player",
    method: "post",
    data: { ...data, action },
    timeout: 15000,
    ...config,
    headers: {
      repeatSubmit: "false",
      ...(config.headers || {}),
    },
  });
}

export function getJukeboxHealth(config = {}) {
  return request({ url: "/tk_custom/jukebox/health", method: "get", timeout: 15000, ...config });
}

export function getJukeboxQueue(config = {}) {
  return request({ url: "/tk_custom/jukebox/queue", method: "get", timeout: 15000, ...config });
}

export function getJukeboxNowPlaying(config = {}) {
  return getJukeboxPlayer(config);
}

export function getJukeboxPlayer(config = {}) {
  return request({ url: "/tk_custom/jukebox/player", method: "get", timeout: 5000, ...config });
}

export function playNextSong() {
  return playerCommand("next");
}

export function submitSongRequest(payload) {
  return request({ url: "/tk_custom/jukebox/queue", method: "post", data: payload, timeout: 15000 });
}

export function deleteSong(id) {
  return request({ url: `/tk_custom/jukebox/queue/${id}`, method: "delete", timeout: 15000 });
}

export function pausePlayback() {
  return playerCommand("pause");
}

export function resumePlayback() {
  return playerCommand("resume");
}

export function playJukeboxSongImmediately(payload) {
  return playerCommand("play", payload);
}

export function setJukeboxVolume(volume) {
  return playerCommand("volume", { volume: Number(volume) });
}

export function stopPlayback() {
  return playerCommand("stop");
}

export function getBackendJukeboxHealth(config = {}) {
  return request({
    url: "/tk_custom/jukebox/health",
    method: "get",
    timeout: 15000,
    ...config,
  });
}

// 保留旧调用方兼容性；当前页面不再提供自愈入口。
export function postBackendJukeboxHeal() {
  return request({
    url: "/tk_custom/jukebox/heal",
    method: "post",
    timeout: 30000,
  });
}

export function syncBackendJukeboxSchedule() {
  return request({
    url: "/tk_custom/jukebox/schedule/sync",
    method: "post",
    timeout: 10 * 60 * 1000,
  });
}
