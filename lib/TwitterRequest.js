"use strict";
class TwitterRequestBase {
  constructor(consumerKey, consumerSecret, cachedOAuthResponse) {
    if(!consumerKey || !consumerSecret) {
      throw new TypeError("consumerKey and consumerSecret are needed");
    }
    Object.defineProperties(this, {
      "consumerKey": {
        get: () => {
          return consumerKey;
        }
      },
      "consumerSecret": {
        get: () => {
          return consumerSecret;
        }
      },
      [Symbol.for("oauthToken")]: {
        value: undefined,
        writable: true
      },
      "oauthToken": {
        get: () => {
          return this[Symbol.for("oauthToken")] || "";
        },
        set: (token) => {
          if(token && typeof token === "string") {
            this[Symbol.for("oauthToken")] = token;
          } else {
            this[Symbol.for("oauthToken")] = undefined;
          }
        }
      },
      [Symbol.for("oauthTokenSecret")]: {
        value: undefined,
        writable: true
      },
      "oauthTokenSecret": {
        get: () => {
          return this[Symbol.for("oauthTokenSecret")] || "";
        },
        set: (secret) => {
          if(secret && typeof secret === "string") {
            this[Symbol.for("oauthTokenSecret")] = secret;
          } else {
            this[Symbol.for("oauthTokenSecret")] = undefined;
          }
        }
      },
      [Symbol.for("userId")]: {
        value: undefined,
        writable: true
      },
      "userId": {
        get: () => {
          return this[Symbol.for("userId")] || "";
        },
        set: (id) => {
          if(id && typeof id === "string") {
            this[Symbol.for("userId")] = id;
          } else {
            this[Symbol.for("userId")] = undefined;
          }
        }
      },
      [Symbol.for("screenName")]: {
        value: undefined,
        writable: true
      },
      "screenName": {
        get: () => {
          return this[Symbol.for("screenName")] || "";
        },
        set: (name) => {
          if(name && typeof name === "string") {
            this[Symbol.for("screenName")] = name;
          } else {
            this[Symbol.for("screenName")] = undefined;
          }
        }
      },
      "baseQuery": {
        get: () => {
          const baseQuery = new Map([
            ["oauth_consumer_key", consumerKey || ""],
            ["oauth_nonce", this.getNonce()],
            ["oauth_timestamp", this.getTimestamp()],
            ["oauth_signature_method", "HMAC-SHA1"],
            ["oauth_version", "1.0"]
          ]);
          if(this.oauthToken !== "") {
            baseQuery.set("oauth_token", this.oauthToken);
          }
          return baseQuery;
        }
      },
      "signKey": {
        get: () => {
          return this.encoder.encode([
            this.consumerSecret,
            this.oauthTokenSecret
          ].join("&"));
        }
      },
      "encoder": {
        value: new TextEncoder()
      }
    });
    if(!!cachedOAuthResponse) {
      this.parseOAuthData(cachedOAuthResponse);
    }
  }
  getNonce() {
    let ret = "";
    for(let i = 0; i < 32; i++) {
      ret += "0123456789abcdef"[Math.random() * 16 | 0];
    }
    return ret;
  }
  getTimestamp() {
    return Date.now() / 1000 | 0;
  }
  sortAscending(a, b) {
    if(a[0] < b[0]) {
      return -1;
    }
    if(a[0] > b[0]) {
      return 1;
    }
    return 0;
  }
  mapJoinEqual(e) {
    return e.join("=");
  }
  parseOAuthData(response) {
    for(let [key, value] of new URLSearchParams(response).entries()) {
      switch(key) {
        case "oauth_token":
          this.oauthToken = value;
          break;
        case "oauth_token_secret":
          this.oauthTokenSecret = value;
          break;
        case "user_id":
          this.userId = value;
          break;
        case "screen_name":
          this.screenName = value;
          break;
        default:
          break;
      }
    }
  }
  generateBaseStrings(request) {
    const baseStrings = [
      request.method,
      encodeURIComponent(request.url.origin + request.url.pathname),
      encodeURIComponent([...request.query].sort(this.sortAscending).map(this.mapPercentEncode).map(this.mapJoinEqual).join("&"))
    ].join("&");
    if(!!request.verbos) {
      console.log("baseStrings: %s", baseStrings);
    }
    return this.encoder.encode(baseStrings);
  }
  generateSignature(request) {
    const target = this.generateBaseStrings(request);
    return window.crypto.subtle.importKey("raw", this.signKey, {
      name: "HMAC",
      hash: {name: "SHA-1"}
    }, false, ["sign"])
    .then((importedKey) => {
      return window.crypto.subtle.sign({
        name: "HMAC",
        hash: "SHA-1"
      }, importedKey, target);
    })
    .then((result) => {
      let str = "";
      for(let i of new Uint8Array(result).values()) {
        str += String.fromCharCode(i);
      }
      request.query.append("oauth_signature", window.btoa(str));
      return Promise.resolve(request);
    });
  }
  fetchRequest() {
    throw new TypeError("needs override");
  }
  mapPercentEncode(entry) {
    return entry.map((str) => {
      return encodeURIComponent(str).replace(/[!'()*]/g, function(c) {
        return '%' + c.charCodeAt(0).toString(16);
      });
    });
  }
}

class OAuthRequest extends TwitterRequestBase {
  constructor(consumerKey, consumerSecret) {
    super(consumerKey, consumerSecret);
    Object.defineProperties(this, {
      "state": {
        value: "ready",
        writable: true
      }
    });
  }
  resetState() {
    this.state = "ready";
    this.oauthToken = undefined;
    this.oauthTokenSecret = undefined;
    this.userId = undefined;
    this.screenName = undefined;
  }
  getRequestToken() {
    if(this.state !== "ready") {
      this.resetState();
    }
    this.generateSignature({
      method: "POST",
      url: new URL("https://api.twitter.com/oauth/request_token"),
      query: new URLSearchParams([...this.baseQuery].map(this.mapJoinEqual).join("&"))
    })
    .then((response) => {
      this.state = "request_token_requested";
      if(response.state === 200) {
        return response.text();
      } else {
        return Promise.reject(response.error());
      }
    })
    .then((oauthTokenStrings) => {
      this.parseOAuthData(oauthTokenStrings);
      this.state = "user_grant_requested";
      chrome.tabs.create({
        url: `https://api.twitter.com/oauth/authorize?oauth_token=${this.oauthToken}`,
        selected: true
      });
    })
    .catch((e) => {
      this.resetStatus();
      console.log(e);
    });
  }
  getAccessToken(pin, onResolve) {
    if(this.state !== "user_grant_requested"
    || (!pin || typeof pin !== "string")) {
      this.resetState();
      return this.getRequestToken();
    }
    this.generateSignature({
      method: "POST",
      url: new URL("https://api.twitter.com/oauth/access_token"),
      query: new URLSearchParams([...this.baseQuery, ["oauth_verifier", pin]].map(this.mapJoinEqual).join("&"))
    })
    .then(() => {
      this.state = "access_token_requested";
      return this.fetchRequest();
    })
    .then((response) => {
      this.state = "access_token_responded";
      if(response.status === 200) {
        return response.text();
      } else {
        Promise.reject(response);
      }
    })
    .then((oauthTokenStrings) => {
      this.parseOAuthData(oauthTokenStrings);
      this.state = "authenticated";
      onResolve(this.serializeOAuthData());
    })
    .catch((response) => {
      console.log("OAuthRequest.getAccessToken: %o", response);
      this.state = "authentication_failed";
      return this.getRequestToken();
    });
  }
  fetchRequest(request) {
    if(!request || !request.url || !request.query) {
      return Promise.reject(Response.error());
    }
    return fetch(request.url, {
      method: "POST",
      body: request.query
    });
  }
  serializeOAuthData() {
    return [
      ["oauth_token", this.oauthToken],
      ["oauth_token_secret", this.oauthTokenSecret],
      ["user_id", this.userId],
      ["screen_name", this.screenName]
    ].filter(this.filterSerializeOAuthData).map(this.mapJoinEqual).join("&");
  }
  filterSerializeOAuthData([key, value]) {
    if(value && typeof value === "string" && value !== "") {
      return true;
    } else {
      return false;
    }
  }
}

class TwitterRequest extends TwitterRequestBase {
  constructor(consumerKey, consumerSecret, cachedOAuthResponse) {
    if(!cachedOAuthResponse) {
      throw new TypeError("OAuth data is needed");
    }
    super(consumerKey, consumerSecret, cachedOAuthResponse);
    Object.defineProperties(this, {
      [Symbol.for("callback")]: {
        value: undefined,
        writable: true
      },
      "callback": {
        get: () => {
          if(!!this[Symbol.for("callback")] && typeof this[Symbol.for("callback")] === "function") {
            return this[Symbol.for("callback")];
          } else {
            return console.log.bind(console);
          }
        },
        set: (callback) => {
          if(!!callback && typeof callback === "function") {
            this[Symbol.for("callback")] = callback;
          } else {
            this[Symbol.for("callback")] = undefined;
          }
        }
      }
    });
  }
  createOAuthHeader(query) {
    return new Headers([
      [
        "Authorization",
        `OAuth ${[...query].filter(this.filterOAuthData).sort(this.sortAscending).map(this.mapOAuthData).join(", ")}`
      ]
    ]);
  }
  filterOAuthData([key, value]) {
    if(key.substring(0, 6) === "oauth_") {
      return true;
    }
  }
  mapOAuthData([key, value]) {
    return `${key}=${encodeURIComponent(value)}`;
  }
}

class TwitterUpload extends TwitterRequest {
  createMetadata(mediaid, metadata, callback) {
    this.callback = callback;
    this.generateSignature({
      method: "POST",
      url: new URL("https://upload.twitter.com/1.1/media/metadata/create.json"),
      query: new URLSearchParams([...this.baseQuery].map(this.mapJoinEqual).join("&")),
      data: JSON.stringify({
        "media_id": mediaid,
        "alt_text": {
          "text": metadata
        }
      })
    })
    .then((request) => {
      const headers = this.createOAuthHeader(request.query);
      headers.append("Content-Type", "text/plain; charset=UTF-8");
      return fetch(request.url, {
        method: request.method,
        headers: headers,
        body: request.data
      });
    })
    .then((response) => {
      if(response.status === 200) {
        return response.text();
      } else {
        return Promise.reject(response);
      }
    })
    .then((text) => {
      thisf.callback(text);
    })
    .catch(console.log.bind(console));
  }
  uploadMovie(file, callback) {
    this.callback = callback;
    if(!file || !file.size || !file.type) {
      this.callback("missing file");
    }
    let mediaId;
    const params = new Map([
      ["command", "INIT"],
      ["total_bytes", file.size],
      ["media_type", file.type]
    ]);
    this.generateSignature({
      method: "POST",
      url: new URL("https://upload.twitter.com/1.1/media/upload.json"),
      query: new URLSearchParams([...this.baseQuery, ...params].map(this.mapJoinEqual).join("&"))
    })
    .then((request) => {
      const headers = this.createOAuthHeader(request.query);
      return fetch(request.url, {
        method: request.method,
        headers: headers,
        body: request.query
      });
    })
    .then((response) => {
      if(response.ok) {
        return response.json();
      } else {
        return Promise.reject(response);
      }
    })
    .then((json) => {
      console.log(json);
      mediaId = json.media_id_string;
      return this.generateSignature({
        method: "POST",
        url: new URL("https://upload.twitter.com/1.1/media/upload.json"),
        query: new URLSearchParams([...this.baseQuery].map(this.mapJoinEqual).join("&"))
      });
    })
    .then((request) => {
      const headers = this.createOAuthHeader(request.query);
      const body = new FormData();
      body.append("command", "APPEND");
      body.append("media_id", mediaId);
      body.append("media", file, file.name);
      body.append("segment_index", 0);
      return fetch(request.url, {
        method: request.method,
        headers: headers,
        body: body
      });
    })
    .then((nocontext) => {
      const params = new Map([
        ["command", "FINALIZE"],
        ["media_id", mediaId]
      ]);
      return this.generateSignature({
        method: "POST",
        url: new URL("https://upload.twitter.com/1.1/media/upload.json"),
        query: new URLSearchParams([...this.baseQuery, ...params].map(this.mapJoinEqual).join("&"))
      });
    })
    .then((request) => {
      const headers = this.createOAuthHeader(request.query);
      return fetch(request.url, {
        method: request.method,
        headers: headers,
        body: request.query
      });
    })
    .then((response) => {
      if(response.ok) {
        return response.json();
      } else {
        return Promise.reject(response);
      }
    })
    .then((json) => {
      console.log(json);
    })
    .catch(console.log.bind(console));
  }
  uploadMediaInit(file) {
    const params = new Map([
      ["command", "INIT"],
      ["total_bytes", file.size],
      ["media_type", file.type]
    ]);
    return this.generateSignature({
      method: "POST",
      url: new URL("https://upload.twitter.com/1.1/media/upload.json"),
      query: new URLSearchParams([...this.baseQuery, ...params].map(this.mapJoinEqual).join("&"))
    })
    .then((request) => {
      const headers = this.createOAuthHeader(request.query);
      return fetch(request.url, {
        method: request.method,
        headers: headers,
        body: request.query
      });
    })
    .then((response) => {
      if(response.ok) {
        return response.json();
      } else {
        return Promise.reject(response);
      }
    })
    .catch((e) => {
      console.log(e);
    });
  }
}

class UserStream extends TwitterRequest {
  constructor(consumerKey, consumerSecret, cachedOAuthResponse) {
    super(consumerKey, consumerSecret, cachedOAuthResponse);
    Object.defineProperties(this, {
      [Symbol.for("state")]: {
        value: false,
        writable: true
      },
      "state": {
        get: () => {
          return this[Symbol.for("state")] || false;
        },
        set: (bool) => {
          this[Symbol.for("state")] = !!bool;
        }
      },
      [Symbol.for("reader")]: {
        value: undefined,
        writable: true
      },
      "streamReader": {
        get: () => {
          return this[Symbol.for("reader")];
        },
        set: (reader) => {
          if(!!reader) {
            this[Symbol.for("reader")] = reader;
          } else {
            this[Symbol.for("reader")] = undefined;
          }
        }
      },
      "buffer": {
        value: []
      },
      "decoder": {
        value: new TextDecoder()
      }
    });
  }
  connect(callback) {
    if(!this.oauthToken || !this.oauthTokenSecret) {
      throw new Error("OAuth token is broken");
    }
    if(!!this.state) {
      return;
    }
    this.callback = callback;
    const params = new Map([
      ["stall_warnings", "true"],
      ["with", "followings"],
      ["replies", "all"],
      ["stringify_friend_ids", "true"]
    ]);
    return this.generateSignature({
      method: "GET",
      url: new URL("https://userstream.twitter.com/1.1/user.json"),
      query: new URLSearchParams([...this.baseQuery, ...params].map(this.mapJoinEqual).join("&"))
    })
    .then((request) => {
      return this.fetchRequest(request);
    })
    .then(() => {
      console.info("UserStream.connect succeeded: %s", this.state);
      return Promise.resolve();
    })
    .catch((e) => {
      console.log("UserStream.connect: %o", e);
      this.disconnect();
      return Promise.reject();
    });
  }
  disconnect() {
    try {
      if(!!this.streamReader) {
        this.streamReader.cancel();
      }
    } catch(e) {
      console.log("UserStream.disconnect.fail: %o", e);
    } finally {
      console.log("UserStream.disconnect.finally");
      this.state = false;
      this.streamReader = undefined;
    }
  }
  fetchRequest(request) {
    if(!request || !request.url) {
      return Promise.reject(Response.error());
    }
    request.url.search = `?${request.query.toString()}`;
    return fetch(request.url, {
      method: "GET",
      headers: this.createOAuthHeader(request.query)
    })
    .then((response) => {
      if(response.status === 200) {
        this.state = true;
        this.streamReader = response.body.getReader();
        this.streamReader.closed.then(() => {
          console.log("UserStream.streamReader.closed:success");
          if(this.state) {
            console.log("UserStream: Uncaught Disconnect");
            this.disconnect();
          }
          return Promise.resolve();
        }).catch((e) => {
          return Promise.reject(e);
        });
        this.readStream();
        return Promise.resolve();
      } else {
        return Promise.reject(response);
      }
    })
    .catch((e) => {
      console.log("UserStream.fetchRequest: %o", e);
      if(e.status === 420) {
        this.disconnect();
      } else if(e.status === 401) {
        this.oauthToken = undefined;
        this.oauthTokenSecret = undefined;
        //TODO re-authenticate
      }
    });
  }
  readStream() {
    if(!this.streamReader) {
      throw new ReferenceError("streamReader is undefined");
    }
    return this.streamReader.read().then((result = {value: new Uint8Array()}) => {
      this.processStream(this.decoder.decode(result.value));
      if(!result.done) {
        return this.readStream();
      }
    }).catch((e) => {
      console.log("UserStream.readStream error: %o", e);
      this.disconnect();
    });
  }
  processStream(stream = "") {
    if(typeof stream !== "string") {
      return;
    }
    this.buffer.push(stream);
    if(!/\r\n$/.test(stream) || stream === "\r\n") {
      return;
    }
    try {
      this.dispatch(JSON.parse(this.buffer.filter((entry) => {
        return entry !== "\r\n";
      }).join("")));
    } catch(e) {
      console.error("broken data: %o", this.buffer);
    } finally {
      this.buffer.splice(0);
      return;
    }
  }
  dispatch(data) {
    try {
      this.callback(data);
    } catch(e) {
      console.log(e);
    }
  }
}
