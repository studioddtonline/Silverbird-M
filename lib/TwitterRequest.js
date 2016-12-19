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
  async generateSignature(request) {
    const target = this.generateBaseStrings(request);
    const importKey = await window.crypto.subtle.importKey("raw", this.signKey, {
      name: "HMAC",
      hash: {name: "SHA-1"}
    }, false, ["sign"]);
    const signedResult = await window.crypto.subtle.sign({
      name: "HMAC",
      hash: "SHA-1"
    }, importKey, target);
    let str = "";
    for(let i of new Uint8Array(signedResult).values()) {
      str += String.fromCharCode(i);
    }
    request.query.append("oauth_signature", window.btoa(str));
    return request;
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
  async getRequestToken() {
    if(this.state !== "ready") {
      this.resetState();
    }
    try {
      const signedRequest = await this.generateSignature({
        method: "POST",
        url: new URL("https://api.twitter.com/oauth/request_token"),
        query: new URLSearchParams([...this.baseQuery].map(this.mapJoinEqual).join("&"))
      });
      this.state = "request_token_requested";
      const response = await fetch(signedRequest.url, {
        method: signedRequest.method,
        body: signedRequest.query
      });
      if(response.status !== 200) {
        throw new TypeError(response.error());
      }
      this.parseOAuthData(await response.text());
      this.state = "user_grant_requested";
      chrome.tabs.create({
        url: `https://api.twitter.com/oauth/authorize?oauth_token=${this.oauthToken}`,
        selected: true
      });
      return true;
    } catch(e) {
      console.warn(e);
      this.resetState();
      return false;
    }
  }
  async getAccessToken(pin, onResolve = console.info) {
    if(this.state !== "user_grant_requested"
    || (!pin || typeof pin !== "string")) {
      this.resetState();
      return false;
    }
    try {
      const signedRequest = await this.generateSignature({
        method: "POST",
        url: new URL("https://api.twitter.com/oauth/access_token"),
        query: new URLSearchParams([...this.baseQuery, ["oauth_verifier", pin]].map(this.mapJoinEqual).join("&"))
      });
      this.state = "access_token_requested";
      const response = await fetch(signedRequest.url, {
        method: signedRequest.method,
        body: signedRequest.query
      });
      this.state = "access_token_responded";
      if(response.status !== 200) {
        throw new TypeError(response.error());
      }
      this.parseOAuthData(await response.text());
      this.state = "authenticated";
      onResolve(this.serializeOAuthData());
      return true;
    } catch(e) {
      console.log("OAuthRequest.getAccessToken: %o", response);
      this.state = "authentication_failed";
      return false;
    }
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
  async createMetadata(mediaid, metadata, callback) {
    this.callback = callback;
    try {
      const signedRequest = await this.generateSignature({
        method: "POST",
        url: new URL("https://upload.twitter.com/1.1/media/metadata/create.json"),
        query: new URLSearchParams([...this.baseQuery].map(this.mapJoinEqual).join("&")),
        data: JSON.stringify({
          "media_id": mediaid,
          "alt_text": {
            "text": metadata
          }
        })
      });
      const headers = this.createOAuthHeader(request.query);
      headers.append("Content-Type", "text/plain; charset=UTF-8");
      const response = await fetch(request.url, {
        method: request.method,
        headers: headers,
        body: request.data
      });
      if(response.status !== 200) {
        throw new TypeError(response.error());
      }
      this.callback(await response.text());
      return true;
    } catch(e) {
      console.warn(e);
      return false;
    }
  }
  async uploadMedia(file, async = false, callback = console.log) {
    this.callback = callback;
    if(!file || !file.size || !file.type) {
      this.callback("missing file");
    }
    try {
      const json = await this.uploadMediaInit(file, async);
      if(!json) {
        throw new TypeError("missing json");
      }
      const mediaId = json.media_id_string;
      const appendSucceeded = await this.uploadMediaAppend(file, mediaId);
      if(!appendSucceeded) {
        throw new TypeError("fail append");
      }
      const result = await this.uploadMediaFinalize(mediaId);
      if(!async) {
        this.callback(result); //TODO
      } else {
        //TODO result.processing_info.check_after_secs
        let status = await this.uploadMediaStatus(mediaId);
        if(status.processing_info.state === "succeeded") {
          this.callback(status);
        } else if(status.processing_info.state === "pending") {
          //TODO
        } else if(status.processing_info.state === "failed") {
          console.warn(status);
          throw new TypeError(status.processing_info.error.name);
        }
      }
    } catch(e) {
      console.warn(e);
      return false;
    }
  }
  async uploadMediaInit(file, async = false) {
    const params = new Map([
      ["command", "INIT"],
      ["total_bytes", file.size],
      ["media_type", file.type]
    ]);
    if(async) {
      switch(true) {
        case /video\/mp4/i.test(file.type):
          params.set("media_category", "tweet_video");
          break;
        case /image\/gif/i.test(file.type):
          params.set("media_category", "tweet_gif");
          break;
        case /image\//i.test(file.type):
        default:
          params.set("media_category", "tweet_image");
          break;
      }
    }
    try {
      const signedRequest = await this.generateSignature({
        method: "POST",
        url: new URL("https://upload.twitter.com/1.1/media/upload.json"),
        query: new URLSearchParams([...this.baseQuery, ...params].map(this.mapJoinEqual).join("&"))
      });
      const headers = this.createOAuthHeader(signedRequest.query);
      const response = await fetch(signedRequest.url, {
        method: signedRequest.method,
        headers: headers,
        body: signedRequest.query
      });
      if(!response.ok) {
        throw new TypeError(await response.text());
      }
      return await response.json();
    } catch(e) {
      console.warn(e);
      return undefined;
    }
  }
  async uploadMediaAppend(file, mediaId) {
    if(!mediaId) {
      throw new TypeError("missing media_id_string");
    }
    try {
      const signedRequest = await this.generateSignature({
        method: "POST",
        url: new URL("https://upload.twitter.com/1.1/media/upload.json"),
        query: new URLSearchParams([...this.baseQuery].map(this.mapJoinEqual).join("&"))
      });
      const headers = this.createOAuthHeader(signedRequest.query);
      const fileSlicer = function* (file, sliceSize) {
        const blobs = [];
        for(let i = 0; i * sliceSize <= file.size; i++) {
          blobs.push(file.slice(i * sliceSize, (i + 1) * sliceSize));
        }
        yield* blobs;
      };
      let segmentIndex = 0;
      for(let sliced of fileSlicer(file, 5 * 1024* 1024)) {
        let body = new FormData();
        body.append("command", "APPEND");
        body.append("media_id", mediaId);
        body.append("media", sliced, file.name);
        body.append("segment_index", segmentIndex);
        let response = await fetch(signedRequest.url, {
          method: signedRequest.method,
          headers: headers,
          body: body
        });
        if(response.status >= 400) {
          console.warn(response);
          throw new TypeError(await response.text());
        }
        ++segmentIndex;
      }
      return true;
    } catch(e) {
      console.warn(e);
      return false;
    }
  }
  async uploadMediaFinalize(mediaId) {
    if(!mediaId) {
      throw new TypeError("missing media_id_string");
    }
    const params = new Map([
      ["command", "FINALIZE"],
      ["media_id", mediaId]
    ]);
    try {
      const signedRequest = await this.generateSignature({
        method: "POST",
        url: new URL("https://upload.twitter.com/1.1/media/upload.json"),
        query: new URLSearchParams([...this.baseQuery, ...params].map(this.mapJoinEqual).join("&"))
      });
      const headers = this.createOAuthHeader(signedRequest.query);
      const response = await fetch(signedRequest.url, {
        method: signedRequest.method,
        headers: headers,
        body: signedRequest.query
      });
      if(!response.ok) {
        throw new TypeError(await response.text());
      }
      return await response.json();
    } catch(e) {
      console.warn(e);
      return undefined;
    }
  }
  async uploadMediaStatus(mediaId) {
    if(!mediaId) {
      throw new TypeError("missing media_id_string");
    }
    const params = new Map([
      ["command", "STATUS"],
      ["media_id", mediaId]
    ]);
    try {
      const signedRequest = await this.generateSignature({
        method: "GET",
        url: new URL("https://upload.twitter.com/1.1/media/upload.json"),
        query: new URLSearchParams([...this.baseQuery, ...params].map(this.mapJoinEqual).join("&"))
      });
      const headers = this.createOAuthHeader(signedRequest.query);
      signedRequest.url.search = `?${signedRequest.query.toString()}`;
      const response = await fetch(signedRequest.url, {
        method: signedRequest.method,
        headers: headers
      });
      if(!response.ok) {
        throw new TypeError(await response.text());
      }
      return await response.json();
    } catch(e) {
      console.warn(e);
      return undefined;
    }
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
  async connect(callback) {
    if(!this.oauthToken || !this.oauthTokenSecret) {
      throw new Error("OAuth token is broken");
    }
    if(!!this.state) {
      return Promise.resolve(false);
    }
    this.callback = callback;
    const params = new Map([
      ["tweet_mode", "extended"],
      ["stall_warnings", "true"],
      ["with", "followings"],
      ["replies", "all"],
      ["stringify_friend_ids", "true"]
    ]);
    try {
      let request = await this.generateSignature({
        method: "GET",
        url: new URL("https://userstream.twitter.com/1.1/user.json"),
        query: new URLSearchParams([...this.baseQuery, ...params].map(this.mapJoinEqual).join("&"))
      });
      request.url.search = `?${request.query.toString()}`;
      const response = await fetch(request.url, {
        method: "GET",
        headers: this.createOAuthHeader(request.query)
      });
      if(response.status !== 200) {
        console.log("UserStream.fetchRequest: %o", response);
        throw new TypeError(response.status);
      }
      this.state = true;
      console.info("UserStream.connect succeeded: %s", this.state);
      const gen = function* (stream) {
        if(!stream) {
          throw new TypeError("missing stream");
        }
        while(true) {
          yield stream.read();
        }
      };
      this.streamReader = response.body.getReader();
      for(let readStream of gen(this.streamReader)) {
        let result = await readStream;
        this.processStream(this.decoder.decode(result.value));
        if(!!result.done) {
          throw new TypeError("done");
        }
      }
    } catch(e) {
      console.log("UserStream.connect: %o", e);
      this.disconnect();
    } finally {
      return this.state;
    }
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
