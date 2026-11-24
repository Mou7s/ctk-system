const sessionCache = {
  set (key, value) {
    if (typeof sessionStorage === 'undefined') {
      return
    }
    if (key != null && value != null) {
      sessionStorage.setItem(key, value)
    }
  },
  get (key) {
    if (typeof sessionStorage === 'undefined') {
      return null
    }
    if (key == null) {
      return null
    }
    return sessionStorage.getItem(key)
  },
  setJSON (key, jsonValue) {
    if (jsonValue != null) {
      this.set(key, JSON.stringify(jsonValue))
    }
  },
  getJSON (key) {
    const value = this.get(key)
    if (value != null) {
      return JSON.parse(value)
    }
  },
  remove (key) {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.removeItem(key);
  }
}
const localCache = {
  set (key, value) {
    if (typeof localStorage === 'undefined') {
      return
    }
    if (key != null && value != null) {
      localStorage.setItem(key, value)
    }
  },
  get (key) {
    if (typeof localStorage === 'undefined') {
      return null
    }
    if (key == null) {
      return null
    }
    return localStorage.getItem(key)
  },
  setJSON (key, jsonValue) {
    if (jsonValue != null) {
      this.set(key, JSON.stringify(jsonValue))
    }
  },
  getJSON (key) {
    const value = this.get(key)
    if (value != null) {
      return JSON.parse(value)
    }
  },
  remove (key) {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(key);
  }
}

export default {
  /**
   * 会话级缓存
   */
  session: sessionCache,
  /**
   * 本地缓存
   */
  local: localCache
}
