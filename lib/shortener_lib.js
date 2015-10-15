function BitLyShortener(token) {
  this.token = token || '';
}
BitLyShortener.prototype = {
  token: '',
  tokenRequested: false,
  shorten: function(longUrl, callback) {
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
    .done((function(self) {
      return function(data, status, req) {
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
    .fail((function(self) {
      return function(req, status, error) {
        if(req.status == 401 || req.status == 500) {
          self.getUserGrant();
        } else {
          callback(-1, 'Error: ' + status);
        }
      };
    })(this));
  },
  getUserGrant: function() {
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
  },
  getAccessToken: function(code) {
    if(!code || code === '') {
      console.log('no code');
      return;
    }
    var p = new Promise(function(resolve, reject) {
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
    p.then((function(self) {
      return function(event) {
        self.tokenRequested = false;
        self.token = event.target.response.access_token;
        Promise.resolve();
      };
    })(this)).catch((function(self) {
      return function(event) {
        self.tokenRequested = false;
        console.log(event);
        Promise.resolve();
      };
    })(this)).then(function() {
      chrome.tabs.query({active: true}, function(tabs) {
        [...tabs].forEach(function(tab) {
          if(tab.url.indexOf(chrome.runtime.id) !== -1) {
            chrome.tabs.remove(tab.id);
          }
        });
      });
    });
  },
  setAlarm: function() {
    // no behavior
  }
};

function GooglShortener(token, refresh_token) {
  this.token = token || '';
  this.refresh_token = refresh_token || '';
}
GooglShortener.prototype = {
  token: '',
  refresh_token: '',
  handlerOnAlarm: null,
  alarmName: 'google_shortener_refresh',
  tokenRequested: false,
  shorten: function(longUrl, callback) {
    if(!this.token || this.token === '') {
      this.getUserGrant();
      return;
    }
    this.sendRequest(longUrl, callback);
  },
  sendRequest: function(longUrl, callback) {
    $.ajax({
      url: 'https://www.googleapis.com/urlshortener/v1/url',
      type: 'POST',
      data: '{"longUrl":"' + longUrl + '"}',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + this.token
      }
    })
    .done((function(self) {
      return function(data, status) {
        callback(0, data.id);
      };
    })(this))
    .fail((function(self) {
      return function (request, status, error) {
        var fmtError = ' Error: ' + request.statusText;
        if(request.status == 401) {//Our token probably got revoked. (401 - Unauthorized)
          self.getUserGrant();
        } else {
          callback(-1, fmtError);
        }
      };
    })(this));
  },
  getUserGrant: function() {
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
    }, (function(self) {
      return function(tab) {
        var intervalId = setInterval(function() {
          chrome.tabs.get(tab.id, function(tab) {
            if(!tab) {
              clearInterval(intervalId);
              return;
            }
            var url = new URL(tab.url);
            if((url.origin + url.pathname) === 'https://accounts.google.com/o/oauth2/approval') {
              clearInterval(intervalId);
              chrome.runtime.onMessage.addListener(function(message) {
                if(message
                && message.context && message.context === "approval"
                && message.site && message.site === "google"
                && message.code
                && !self.tokenRequested) {
                  self.getAccessToken(message.code);
                }
              });
              chrome.tabs.executeScript(tab.id, {
                code: `chrome.runtime.sendMessage("${chrome.runtime.id}", {context: "approval", site: "google", code: document.querySelector("#code").value}, function() {window.close();});`
              }, function() {
                chrome.tabs.remove(tab.id);
              });
            }
          });
        }, 250);
      };
    })(this));
  },
  getAccessToken: function(code) {
    this.tokenRequested = true;
    this.clearAlarm();
    this.token = '';
    this.refresh_token = '';
    var p = new Promise(function(resolve, reject) {
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
    p.then((function(self) {
      return function(event) {
        self.tokenRequested = false;
        var response = event.target.response;
        self.token = response.access_token;
        if(response.refresh_token) {
          self.refresh_token = response.refresh_token;
          self.setAlarm(response.expires_in);
        }
      };
    })(this)).catch((function(self) {
      return function(event) {
        self.tokenRequested = false;
        console.log(event);
      };
    })(this));
  },
  refreshToken: function() {
    if(this.refresh_token === '') {
      this.clearAlarm();
      return;
    }
    var p = new Promise((function(self) {
      return function(resolve, reject) {
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
    p.then((function(self) {
      return function(event) {
        var response = event.target.response;
        if(self.token !== response.access_token) {
          self.token = response.access_token;
        }
      };
    })(this)).catch((function(self) {
      return function(event) {
        self.refresh_token = '';
        self.clearAlarm();
        console.log(event);
      };
    })(this));
  },
  setAlarm: function(expireSeconds) {
    if(this.refresh_token === '') {
      this.clearAlarm();
      return;
    }
    chrome.alarms.getAll((function(self) {
      return function(alarms) {
        alarms = alarms.filter(function(alarm) {
          if(alarm.name === self.alarmName) {
            return true;
          }
        });
        if(alarms.length === 0) {
          self.handlerOnAlarm = (function(alarm) {
            if(alarm.name && alarm.name === this.alarmName) {
              this.refreshToken();
            }
          }).bind(self);
          var period = (expireSeconds || 3600) / 60 / 2 | 0;
          chrome.alarms.onAlarm.addListener(self.handlerOnAlarm);
          chrome.alarms.create(self.alarmName, {when: Date.now(), periodInMinutes: period});
        }
      };
    })(this));
  },
  clearAlarm: function() {
    chrome.alarms.getAll((function(self) {
      return function(alarms) {
        alarms = alarms.filter(function(alarm) {
          if(alarm.name === self.alarmName) {
            return true;
          }
        });
        if(alarms.length > 0) {
          chrome.alarms.onAlarm.removeListener(self.handlerOnAlarm);
          self.handlerOnAlarm = null;
          chrome.alarms.clear(self.alarmName, function(wasCleared) {
            // no behavior
          });
        }
      };
    })(this));
  }
};

function Shortener(backendId) {
  if(!backendId || this.services.indexOf(backendId) === -1) {
    throw new TypeError('unknown serivce');
  }
  this.backend = this.create(backendId);
  Object.observe(this.backend, (function(self) {
    return function(changes) {
      changes.forEach(function(change) {
        if(change.name === 'token' || change.name === 'refresh_token') {
          OptionsBackend.saveOption(`shortener_${change.name}`, change.object[change.name])
        }
      });
    };
  })(this));
  this.setRefresh();
}

Shortener.prototype = {
  backend: null,
  services: ['bit.ly', 'goo.gl'],
  create: function(service) {
    switch(service) {
      case 'bit.ly':
        return new BitLyShortener(OptionsBackend.get('shortener_token'));
      case 'goo.gl':
        return new GooglShortener(OptionsBackend.get('shortener_token'), OptionsBackend.get('shortener_refresh_token'));
      default:
        throw new TypeError('unknown service');
    }
  },
  shorten: function(longUrl, callback) {
    if(!this.backend) {
      return;
    }
    this.backend.shorten(longUrl, function(errorCode, msg) {
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
  },
  setRefresh: function() {
    if(!this.backend) {
      return;
    }
    this.backend.setAlarm();
  }
};
