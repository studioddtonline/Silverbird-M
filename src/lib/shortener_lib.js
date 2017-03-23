"use strict";
class BaseShortener {
  constructor(option) {
    if(!option) {
      throw new TypeError("Shortener needs OptionsBackend");
    }
    Object.defineProperties(this, {
      "option": {
        value: option
      },
      [Symbol.for("shortener_token")]: { // String
        value: undefined,
        writable: true
      },
      "token": {
        enumerable: true,
        get: function() {
          return this[Symbol.for("shortener_token")] || this.option.get("shortener_token") || "";
        },
        set: function(str) {
          this[Symbol.for("shortener_token")] = str || "";
          this.option.saveOption("shortener_token", this[Symbol.for("shortener_token")]);
        }
      },
      "tokenRequested": {
        value: false,
        writable: true
      }
    });
  }
  shorten(longUrl, callback) {
    if(!this.token || this.token === '') {
      this.getUserGrant();
      return;
    }
    this.sendRequest(longUrl, callback);
  }
  sendRequest() {
    throw new SyntaxError("need to override");
  }
  getUserGrant(grantUrl) {
    throw new SyntaxError("need to override");
  }
  openGrantPage(grantUrl) {
    if(!grantUrl || grantUrl === '') {
      throw new TypeError("missing grantUrl");
    }
    this.token = '';
    this.tokenRequested = true;
    chrome.tabs.create({
      "url": grantUrl,
      "selected": true
    });
  }
  getAccessToken() {
    throw new SyntaxError("need to override");
  }
  setAlarm() {
    // no behavior
  }
  clearAlarm() {
    // no behavior
  }
  destroy() {
    this.token = "";
  }
}
class NoShortener extends BaseShortener {
  shorten(longUrl, callback) {
    callback(0, longUrl);
  }
}
class BitLyShortener extends BaseShortener {
  constructor(option) {
    super(option);
  }
  sendRequest(longUrl, callback) {
    const url = `https://api-ssl.bitly.com/v3/shorten?${[
      "format=json",
      "domain=bit.ly",
      ["access_token", encodeURIComponent(this.token)].join("="),
      ["longUrl", encodeURIComponent(longUrl)].join("=")
    ].join("&")}`;
    const p = new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("GET", url);
      x.timeout = 4000;
      x.responseType = "json";
      x.onload = resolve;
      x.ontimeout = reject;
      x.onerror = reject;
      x.onabort = reject;
      try {
        x.send();
      } catch(e) {
        x.abort();
      }
    });
    p.then(((self) => {
      return (event) => {
        const request = event.target;
        const status = request.status;
        const response = request.response || undefined;
        if(response.status_code === 200) {
          callback(0, response.data.url);
        } else {
          throw new ReferenceError(response.status_code)
        }
      };
    })(this)).catch(((self) => {
      return (event) => {
        const request = event.target || {status: parseInt(event.message, 10)};
        const status = request.status;
        if(status === 401 || status >= 500) {
          self.getUserGrant();
          // open new tab and close popup
        } else {
          callback(-1, 'Error: ' + status);
        }
      };
    })(this));
  }
  getUserGrant() {
    this.openGrantPage('https://bitly.com/oauth/authorize?' + [
      ['client_id', encodeURIComponent(SecretKeys.bitly.clientId)].join('='),
      ['redirect_uri', encodeURIComponent(chrome.extension.getURL('oauth_callback.html'))].join('=')
    ].join('&'));
  }
  getAccessToken(code) {
    if(!code || code === '') {
      console.log('no code');
      return;
    }
    const p = new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      const url = 'https://api-ssl.bitly.com/oauth/access_token?' + [
        ['code', encodeURIComponent(code)].join('='),
        ['client_id', encodeURIComponent(SecretKeys.bitly.clientId)].join('='),
        ['client_secret', encodeURIComponent(SecretKeys.bitly.clientSecret)].join('='),
        ['redirect_uri', encodeURIComponent(chrome.extension.getURL('oauth_callback.html'))].join('='),
        ['grant_type', 'authorization_code'].join('=')
      ].join('&');
      x.open('POST', url);
      x.setRequestHeader('Accept', 'application/json');
      x.responseType = 'json';
      x.onload = resolve;
      x.onerror = reject;
      x.ontimeout = reject;
      x.onabort = reject;
      try {
        x.send();
      } catch(e) {
        console.error(e);
        x.abort();
      }
    });
    p.then(((self) => {
      return (event) => {
        self.tokenRequested = false;
        self.token = event.target.response.access_token;
        Promise.resolve();
      };
    })(this)).catch(((self) => {
      return (event) => {
        self.tokenRequested = false;
        console.log(event);
        Promise.resolve();
      };
    })(this)).then(() => {
      chrome.tabs.query({active: true}, (tabs) => {
        tabs.forEach((tab) => {
          if(tab.url.includes(chrome.runtime.id)) {
            chrome.tabs.remove(tab.id);
          }
        });
      });
    });
  }
}

class GooglShortener extends BaseShortener {
  constructor(option) {
    super(option);
    Object.defineProperties(this, {
      [Symbol.for("refresh_token")]: {
        value: undefined,
        writable: true
      },
      "refresh_token": {
        enumerable: true,
        get: function() {
          return this[Symbol.for("refresh_token")] || this.option.get("shortener_refresh_token") || "";
        },
        set: function(str) {
          this[Symbol.for("refresh_token")] = str || "";
          this.option.saveOption("shortener_refresh_token", this[Symbol.for("refresh_token")]);
        }
      },
      "alarmName": {
        get: () => {
          return "google_shortener_refresh"
        }
      }
    });
    this.handlerOnAlarm = ((self) => {
      return (alarm) => {
        if(alarm.name && alarm.name === self.alarmName) {
          console.log("Google Shortener Token Refresh");
          self.refreshToken();
        }
      };
    })(this);
    this.deleteAlarm = ((self) => {
      return (alarms) => {
        alarms = alarms.filter((alarm) => {
          if(alarm.name === self.alarmName) {
            return true;
          }
        });
        for(let alarm of alarms) {
          chrome.alarms.clear(alarm.name, (wasCleared) => {});
        }
      };
    })(this);
  }
  sendRequest(longUrl, callback) {
    const token = this.token;
    const p = new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("POST", "https://www.googleapis.com/urlshortener/v1/url");
      x.setRequestHeader("Content-Type", "application/json");
      x.setRequestHeader("Authorization", `Bearer ${token}`);
      x.timeout = 4000;
      x.responseType = "json";
      x.onload = resolve;
      x.ontimeout = reject;
      x.onerror = reject;
      x.onabort = reject;
      try {
        x.send(JSON.stringify({longUrl: longUrl}));
      } catch(e) {
        x.abort();
      }
    });
    p.then(((self) => {
      return (event) => {
        const request = event.target;
        const status = request.status;
        const response = request.response || undefined;
        if(status === 200) {
          callback(0, response.id);
        } else {
          throw new ReferenceError(status);
        }
      };
    })(this)).catch(((self) => {
      return (event) => {
        const request = event.target || {status: parseInt(event.message, 10)};
        const status = request.status;
        if(status === 401) { //Our token probably got revoked. (401 - Unauthorized)
          if(self.refresh_token !== "") {
            self.refreshToken().then(function(event) {
              callback(1);
            });
          } else {
            self.getUserGrant();
            // open new tab and close popup
          }
        } else {
          callback(-1, 'Error: ' + status);
        }
      };
    })(this));
  }
  getUserGrant() {
    this.tokenRequested = true;
    this.token = '';
    this.refresh_token = '';
    this.clearAlarm();
    const grantUrl = "https://accounts.google.com/o/oauth2/auth?" + [
      ['response_type', 'code'].join('='),
      ['client_id', encodeURIComponent(SecretKeys.google.clientId)].join('='),
      ['redirect_uri', encodeURIComponent('urn:ietf:wg:oauth:2.0:oob')].join('='),
      ['scope', encodeURIComponent('https://www.googleapis.com/auth/urlshortener')].join('='),
      ['access_type', 'offline'].join('=')
    ].join('&');
    chrome.tabs.create({
      "url": grantUrl,
      "selected": true
    }, ((self) => {
      return (tab) => {
        let intervalId = setInterval(() => {
          chrome.tabs.get(tab.id, (tab) => {
            if(!tab) {
              clearInterval(intervalId);
              return;
            }
            const url = new URL(tab.url);
            if((url.origin + url.pathname) === 'https://accounts.google.com/o/oauth2/approval') {
              clearInterval(intervalId);
              chrome.runtime.onMessage.addListener((message) => {
                if(message
                && message.context && message.context === "approval"
                && message.site && message.site === "google"
                && message.code) {
                  self.getAccessToken(message.code);
                }
              });
              chrome.tabs.executeScript(tab.id, {
                code: `chrome.runtime.sendMessage("${chrome.runtime.id}", {context: "approval", site: "google", code: document.querySelector("#code").value}, () => {window.close()});`
              }, () => {chrome.tabs.remove(tab.id)});
            }
          });
        }, 500);
      };
    })(this));
  }
  getAccessToken(code) {
    const p = new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      const url = 'https://www.googleapis.com/oauth2/v3/token?' + [
        ['code', encodeURIComponent(code)].join('='),
        ['client_id', encodeURIComponent(SecretKeys.google.clientId)].join('='),
        ['client_secret', encodeURIComponent(SecretKeys.google.clientSecret)].join('='),
        ['redirect_uri', encodeURIComponent('urn:ietf:wg:oauth:2.0:oob')].join('='),
        ['grant_type', 'authorization_code'].join('=')
      ].join('&');
      x.open('POST', url);
      x.responseType = 'json';
      x.onload = resolve;
      x.onerror = reject;
      x.ontimeout = reject;
      x.onabort = reject;
      try {
        x.send();
      } catch(e) {
        console.error(e);
        x.abort();
      }
    });
    p.then(((self) => {
      return (event) => {
        self.tokenRequested = false;
        const response = event.target.response;
        self.token = response.access_token;
        if(response.refresh_token) {
          self.refresh_token = response.refresh_token;
          self.setAlarm(response.expires_in);
        }
      };
    })(this)).catch(((self) => {
      return (event) => {
        self.tokenRequested = false;
        console.log(event);
      };
    })(this));
  }
  refreshToken() {
    if(this.refresh_token === '') {
      this.clearAlarm();
      return;
    }
    const p = new Promise(((self) => {
      return (resolve, reject) => {
        const x = new XMLHttpRequest();
        const url = 'https://www.googleapis.com/oauth2/v3/token?' + [
          ['refresh_token', encodeURIComponent(self.refresh_token)].join('='),
          ['client_id', encodeURIComponent(SecretKeys.google.clientId)].join('='),
          ['client_secret', encodeURIComponent(SecretKeys.google.clientSecret)].join('='),
          ['grant_type', 'refresh_token'].join('=')
        ].join('&');
        x.open('POST', url);
        x.responseType = 'json';
        x.onload = resolve;
        x.onerror = reject;
        x.ontimeout = reject;
        x.onabort = reject;
        try {
          x.send();
        } catch(e) {
          console.error(e);
          x.abort();
        }
      };
    })(this));
    p.then(((self) => {
      return (event) => {
        const response = event.target.response;
        if(self.token !== response.access_token) {
          self.token = response.access_token;
        }
      };
    })(this)).catch(((self) => {
      return (event) => {
        self.refresh_token = '';
        self.clearAlarm();
        console.log(event);
      };
    })(this));
    return p;
  }
  setAlarm(expireSeconds) {
    this.clearAlarm();
    if(this.refresh_token !== '') {
      const period = (expireSeconds || 3600) / 60 / 2 | 0;
      chrome.alarms.onAlarm.addListener(this.handlerOnAlarm);
      chrome.alarms.create(this.alarmName, {
        when: Date.now(),
        periodInMinutes: period
      });
    }
  }
  clearAlarm() {
    chrome.alarms.getAll(this.deleteAlarm);
    chrome.alarms.onAlarm.removeListener(this.handlerOnAlarm);
  }
  destroy() {
    this.clearAlarm();
    this.token = "";
    this.refresh_token = "";
  }
}

class Shortener{
  constructor(option) {
    Object.defineProperties(this, {
      "backend": {
        value: this.create(option) || null,
        writable: true
      },
      "services": {
        get: () => {
          return [
            {
              name: "bit.ly",
              label: "bit.ly",
              refresh: false
            },
            {
              name: "goo.gl",
              label: "Google",
              refresh: true
            },
            {
              name: "none",
              label: chrome.i18n.getMessage("o_no_shorten"),
              refresh: false
            }
          ];
        }
      }
    });
    this.setRefresh();
  }
  create(option) {
    switch(option.get("url_shortener")) {
      case 'bit.ly':
        return new BitLyShortener(option);
      case 'goo.gl':
        return new GooglShortener(option);
      case 'none':
        return new NoShortener(option);
      default:
        throw new TypeError('unknown service');
    }
  }
  shorten(longUrl, callback) {
    if(!this.backend) {
      throw new TypeError("missing backend")
    }
    this.backend.shorten(longUrl, (errorCode, msg) => {
      let cbMsg = null, success = true;
      if(errorCode === 0 && msg) {
        cbMsg = msg;
      } else if(errorCode === 1) {
        return this.shorten(longUrl, callback);
      } else if(errorCode !== 0 && msg) {
        cbMsg = 'Error ' + errorCode + ': ' + msg;
        success = false;
      } else {
        cbMsg = 'Unknown Error';
        success = false;
      }
      callback(success, cbMsg, longUrl);
    });
  }
  setRefresh() {
    if(!this.backend) {
      return;
    }
    this.backend.setAlarm();
  }
  readyToChange() {
    if(!this.backend) {
      return;
    }
    this.backend.destroy();
    this.backend = null;
    console.log("Ready to change Shortener");
  }
}
