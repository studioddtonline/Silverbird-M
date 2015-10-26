"use strict";
class BitLyShortener {
  constructor(token) {
    Object.defineProperties(this, {
      "token": {
        value: token || "",
        writable: true,
        enumerable: true
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
    $.ajax({
      url: 'https://api-ssl.bitly.com/v3/shorten',
      method: 'GET',
      dataType: 'json',
      data: {
        format: 'json',
        access_token: this.token,
        domain: 'bit.ly',
        longUrl: longUrl
      }
    })
    .done(((self) => {
      return (data, status, req) => {
        var status = data.status_code;
        if(status == 200) {
          callback(0, data.data.url);
        } else if(status == 500) {
          self.getUserGrant();
        } else {
          callback(status, data.status_txt);
        }
      };
    })(this))
    .fail(((self) => {
      return (req, status, error) => {
        if(req.status == 401 || req.status == 500) {
          self.getUserGrant();
        } else {
          callback(-1, 'Error: ' + status);
        }
      };
    })(this));
  }
  getUserGrant() {
    this.token = '';
    this.tokenRequested = true;
    var grantUrl = 'https://bitly.com/oauth/authorize?' + [
      ['client_id', encodeURIComponent(SecretKeys.bitly.clientId)].join('='),
      ['redirect_uri', encodeURIComponent(chrome.extension.getURL('oauth_callback.html'))].join('=')
    ].join('&');
    chrome.tabs.create({
      "url": grantUrl,
      "selected": true
    });
  }
  getAccessToken(code) {
    if(!code || code === '') {
      console.log('no code');
      return;
    }
    var p = new Promise((resolve, reject) => {
      var x = new XMLHttpRequest();
      var url = 'https://api-ssl.bitly.com/oauth/access_token?' + [
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
          if(tab.url.indexOf(chrome.runtime.id) !== -1) {
            chrome.tabs.remove(tab.id);
          }
        });
      });
    });
  }
  setAlarm() {
    // no behavior
  }
  destroy() {
    this.token = "";
  }
}

class GooglShortener {
  constructor(token, refresh_token) {
    Object.defineProperties(this, {
      "token": {
        value: token || "",
        writable: true,
        enumerable: true
      },
      "refresh_token": {
        value: refresh_token || "",
        writable: true,
        enumerable: true
      },
      "tokenRequested": {
        value: false,
        writable: true
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
        for(var alarm of alarms.entries()) {
          chrome.alarms.clear(alarm[1].name, (wasCleared) => {});
        }
      };
    })(this);
  }
  shorten(longUrl, callback) {
    if(!this.token || this.token === '') {
      this.getUserGrant();
      return;
    }
    this.sendRequest(longUrl, callback);
  }
  sendRequest(longUrl, callback) {
    $.ajax({
      url: 'https://www.googleapis.com/urlshortener/v1/url',
      type: 'POST',
      data: '{"longUrl":"' + longUrl + '"}',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + this.token
      }
    })
    .done(((self) => {
      return (data, status) => {
        callback(0, data.id);
      };
    })(this))
    .fail(((self) => {
      return (request, status, error) => {
        var fmtError = ' Error: ' + request.statusText;
        if(request.status == 401) { //Our token probably got revoked. (401 - Unauthorized)
          if(self.refresh_token !== "") {
            self.refreshToken(); // TODO: need to re-shorten after token refreshing
          } else {
            self.getUserGrant();
          }
        } else {
          callback(-1, fmtError);
        }
      };
    })(this));
  }
  getUserGrant() {
    this.tokenRequested = true;
    this.token = '';
    this.refresh_token = '';
    this.clearAlarm();
    var grantUrl = "https://accounts.google.com/o/oauth2/auth?" + [
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
        var intervalId = setInterval(() => {
          chrome.tabs.get(tab.id, (tab) => {
            if(!tab) {
              clearInterval(intervalId);
              return;
            }
            var url = new URL(tab.url);
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
    var p = new Promise((resolve, reject) => {
      var x = new XMLHttpRequest();
      var url = 'https://www.googleapis.com/oauth2/v3/token?' + [
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
        var response = event.target.response;
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
    var p = new Promise(((self) => {
      return (resolve, reject) => {
        var x = new XMLHttpRequest();
        var url = 'https://www.googleapis.com/oauth2/v3/token?' + [
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
        var response = event.target.response;
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
  }
  setAlarm(expireSeconds) {
    this.clearAlarm();
    if(this.refresh_token !== '') {
      var period = (expireSeconds || 3600) / 60 / 2 | 0;
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
  constructor(backendId) {
    Object.defineProperties(this, {
      "backend": {
        value: this.create(backendId) || null,
        writable: true
      },
      "backendObserver": {
        value: undefined,
        writable: true
      },
      "services": {
        get: () => {
          return ['bit.ly', 'goo.gl']
        }
      }
    });
    if(!backendId || this.services.indexOf(backendId) === -1) {
      throw new TypeError('unknown serivce');
    }
    this.backendObserver = ((self) => {
      return (changes) => {
        changes.forEach((change) => {
          if(change.name === 'token' || change.name === 'refresh_token') {
            OptionsBackend.saveOption(`shortener_${change.name}`, change.object[change.name])
          }
        });
      };
    })(this);
    Object.observe(this.backend, this.backendObserver);
    this.setRefresh();
  }
  create(service) {
    switch(service) {
      case 'bit.ly':
        return new BitLyShortener(OptionsBackend.get('shortener_token'));
      case 'goo.gl':
        return new GooglShortener(OptionsBackend.get('shortener_token'), OptionsBackend.get('shortener_refresh_token'));
      default:
        throw new TypeError('unknown service');
    }
  }
  shorten(longUrl, callback) {
    if(!this.backend) {
      throw new TypeError("missing backend")
    }
    this.backend.shorten(longUrl, (errorCode, msg) => {
      var cbMsg = null, success = true;
      if(errorCode === 0 && msg) {
        cbMsg = msg;
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
      throw new TypeError("missing backend")
    }
    this.backend.setAlarm();
  }
  readyToChange() {
    if(!this.backend) {
      throw new TypeError("missing backend")
    }
    this.backend.destroy();
    Object.unobserve(this.backend, this.backendObserver);
    this.backend = null;
    console.log("Ready to change Shortener");
  }
}
