function TwitterLib(onAuthenticated, onHitsUpdated, oauthTokenData, bearerTokenData) {
  this.onAuthenticated = onAuthenticated;
  this.rateLimits = {};
  this.onHitsUpdated = onHitsUpdated;
  this.ignoreRequests = false;
  this.lastAccessLevel = null;
  this.bearerTokenData = bearerTokenData;
  var oauthCallback = function(self) {
    return function() {
      self.verifyCredentials(function() {
        self.onAuthenticated();
      });
      self.updateWindowHitsLimit();
    };
  };
  this.oauthLib = new TwitterOAuth(oauthTokenData, oauthCallback(this));

  TwitterLib.URLS = {
    BASE: 'https://api.twitter.com/1.1/',
    BASE_OAUTH: 'https://api.twitter.com/oauth/',
    BASE_SIGNING: 'https://api.twitter.com/1.1/',
    BASE_OAUTH_SIGNING: 'https://api.twitter.com/oauth/'
  };
}
TwitterLib.prototype = {
  snowflakeIdRegexp: /^(.*)_str$/,

  userid: function() {
    return this.oauthLib.user_id;
  },
  username: function() {
    return this.oauthLib.screen_name;
  },
  authenticated: function() {
    return this.oauthLib.authenticated;
  },
  tokenRequested: function() {
    return this.oauthLib.tokenRequested;
  },
  authenticating: function() {
    return this.oauthLib.authenticating;
  },
  startAuthentication: function() {
    if(!this.oauthLib.authenticating) {
      this.oauthLib.getRequestToken();
    }
  },
  generateOauthHeader: function(signedData, includeRealm) {
    var authorization = 'OAuth ';
    if(includeRealm) {
      authorization += 'realm="https://api.twitter.com/", ';
    }

    authorization +=
      'oauth_consumer_key="' + signedData.oauth_consumer_key + '", ' +
      'oauth_nonce="' + encodeURIComponent(signedData.oauth_nonce) + '", ' +
      'oauth_signature="' + encodeURIComponent(signedData.oauth_signature) + '", ' +
      'oauth_signature_method="HMAC-SHA1", ' +
      'oauth_timestamp="' + signedData.oauth_timestamp + '", ' +
      'oauth_token="' + signedData.oauth_token + '", ' +
      'oauth_version="1.0"';

    return authorization;
  },
  signOauthEcho: function(xhr, url) {
    var signedData = this.oauthLib.prepareSignedParams(url, {}, 'GET');

    xhr.setRequestHeader('X-Auth-Service-Provider', url);
    xhr.setRequestHeader('X-Verify-Credentials-Authorization', this.generateOauthHeader(signedData, true));
  },
  signOauth: function(xhr, url, params, method, type) {
    if(type === 'basic') {
      xhr.setRequestHeader('X-User-Agent', 'Silverbird M ' + JSON.parse(Persistence.version().val()).join('.'));
      xhr.setRequestHeader('Authorization', 'Basic ' + SecretKeys.twitter.bearerCredentials);
      return;
    } else if(type === 'bearer' && this.bearerTokenData.val()) {
      xhr.setRequestHeader('Authorization', 'Bearer ' + this.bearerTokenData.val());
      return;
    }
    var signedData = this.oauthLib.prepareSignedParams(url, params, method);
    xhr.setRequestHeader('Authorization', this.generateOauthHeader(signedData));
  },
  ajaxRequest: function(url, callback, context, requestParams, httpMethod, authType, overriddenTimeout, withMedia) {
    if(!httpMethod) {
      httpMethod = "GET";
    }
    if(!requestParams) {
      requestParams = {};
    }
    var apiName = url.split('/').slice(0, 2).join('/');
    if(!this.rateLimits[apiName]) this.rateLimits[apiName] = {};
    var rateLimits = this.rateLimits[apiName];
    var requestUrl, signingUrl;
    if(authType === 'basic') {
      requestUrl = url;
      signingUrl = url;
    } else {
      requestUrl = TwitterLib.URLS.BASE + url + ".json";
      signingUrl = TwitterLib.URLS.BASE_SIGNING + url + ".json";
    }
    var beforeSendCallback = function(self) {
      return function(request, settings) {
        var now = Date.now();
        if(rateLimits.remaining == 0 && now - rateLimits.reset < 0) {
          request.abort();
          return;
        }
        rateLimits.last = now;
        self.signOauth(request, signingUrl, requestParams, httpMethod, authType);
      };
    };
    var errorCallback = function(self) {
      return function(request, status, error) {
        if(self.ignoreRequests) return;
        console.warn("Failed Request", requestUrl + '?' + $.param(requestParams), request, status, error);
        var fmtError = '', rspObj;
        try{
          rspObj = (JSON.parse(request.responseText))['errors'][0];
        } catch(e) { /* Ignoring */ }
        if(status == 'timeout') {
          fmtError = "(timeout)";
        } else if(status == 'canceled') {
          fmtError = "(Too Many Requests)";
        } else {
          try {
            if(authType === 'bearer') {
              self.bearerTokenData.remove();
              fmtError = '(bearerToken Ignored)';
              if(console) console.warn('BEARER TOKEN ERROR');
              if(console) console.warn(request.responseText);
            }
            if(request && request.readyState == 4) {
              if(request.status == 401) {
                if(self.oauthLib.adjustTimestamp(request, 'Date')) {
                  console.log('Unauthorized, trying again using adjusted timestamp based on server time.');
                  self.ajaxRequest(url, callback, context, requestParams, httpMethod, authType, overriddenTimeout);
                  return;
                } else if(url.match('verify_credentials')) {
                  self.ignoreRequests = true;
                  TweetManager.instance.signoutAndReauthenticate();
                } 
              } else if(request.status == 403) {
                switch(true) {
                  case (rspObj.code == 179):
                    if(/statuses\/show/.test(url)) {
                      fmtError = rspObj.code;
                    } else {
                      fmtError = "(" + rspObj.message + ")";
                    }
                    if(console) console.warn('This user is protected, or you are blocked');
                    if(console) console.warn(request.responseText);
                    break;
                  case /update_with_media/.test(url):
                    //TODO MediaRateLimit headers should be controlled.
                    fmtError = "(" + rspObj.message + ")";
                    if(console) console.warn('Post to pic.twitter.com ERROR: ' + url);
                    if(console) console.warn(request.responseText);
                    break;
                  case /direct_messages/.test(url):
                    var accessLevel = self.findResponseHeader(request, 'X-Access-Level') || self.lastAccessLevel;
                    if(accessLevel) {
                      if(accessLevel.match('directmessages')) {
                        // The permission level is correct so that's some bizarre glitch
                        TweetManager.instance.disableDMS();
                      } else {
                        self.ignoreRequests = true;
                        TweetManager.instance.signoutAndReauthenticate();
                      }
                    }
                    break;
                  default:
                    fmtError = "(" + rspObj.message + ")";
                    if(console) console.warn('RESPONSE 403: ' + url);
                    if(console) console.warn(request.responseText);
                    break;
                }
              } else if(request.status == 429) {
                fmtError = "(Too Many Requests)";
              } else if(request.status == 503 && rspObj.code === 130){
                fmtError = '(' + (rspObj.message || 'Service Unable') + ')';
              } else {
                if(console) console.warn('API CALL ERROR: ' + url);
                if(console) console.warn(request.responseText);
              }
            }
          } catch(e) {
            /* Ignoring */
            if(console) console.warn(e);
          }
        }
        if(fmtError === '') {
          try {
            if(!request.responseText || !rspObj) {
              throw 'no response';
            }
            fmtError = url + ': "' + rspObj.message + '"(' + request.statusText + ')';
          } catch(e) {
            fmtError = url + ': "' + (error || request.statusText) + '"(' + status + ')';
          }
        }
        callback(false, null, fmtError, context, request);
      };
    };
    var successCallback = function(self) {
      return function(data, status, request) {
        if(self.ignoreRequests) return;
        if(request.status === 0) {
          // Empty responses are a pain...
          (errorCallback(self))(request, 'error', 'empty response');
          return;
        }
        if(!data) {
          data = [];
        }else if(url == 'search/tweets') {
          data = data.statuses;
        }
        self.normalizeTweets(data);
        callback(true, data, status, context, request);
      };
    };
    var alwaysCallback = function(self) {
      return function(data, status, request){
        try{
          var target = ['X-Rate-?Limit-Remaining', 'X-Rate-?Limit-Reset', 'X-Rate-?Limit-Limit'];
          for(var i = 0, len = target.length; i < len; i++) {
            var result = self.findResponseHeader(request, target[i]);
            if(!result) break;
            switch(i) {
              case 0:
                rateLimits.remaining = parseInt(result, 10);
                break;
              case 1:
                rateLimits.reset = parseInt(result, 10) * 1000;
                break;
              case 2:
                rateLimits.limit = parseInt(result, 10);
                break;
              default:
                break;;
            }
          }
          //TODO MediaRateLimit headers should be controlled.
          var mediaTarget = ['X-MediaRateLimit-Class', 'X-MediaRateLimit-Remaining', 'X-MediaRateLimit-Reset', 'X-MediaRateLimit-Limit'];
          for(var i = 0, len = mediaTarget.length; i < len && withMedia; i++) {
            var result = self.findResponseHeader(request, mediaTarget[i]);
            if(!result) break;
            switch(i) {
              case 0:
                if(console) console.log('X-MediaRateLimit-Class: ' + result);
                break;
              case 1:
                if(console) console.log('X-MediaRateLimit-Remaining: ' + parseInt(result, 10));
                break;
              case 2:
                if(console) console.log('X-MediaRateLimit-Reset: ' + new Date((parseInt(result, 10) * 1000)).toLocaleString());
                break;
              case 3:
                if(console) console.log('X-MediaRateLimit-Limit: ' + parseInt(result, 10));
                break;
              default:
                break;
            }
          }
          self.onHitsUpdated(self.rateLimits);
        } catch(e) {
          if(status == 'canceled') {
            rateLimits.remaining = 0;
            self.onHitsUpdated(self.rateLimits);
          }
        }
      };
    };
    var ajaxOptions = {
      type: httpMethod,
      url: requestUrl,
      data: requestParams,
      dataType: "json",
      timeout: overriddenTimeout,
      beforeSend: beforeSendCallback(this)
    };
    if(withMedia) {
      ajaxOptions.contentType = false;
      ajaxOptions.processData = false;
    }
    $.ajax(ajaxOptions)
    .done(successCallback(this))
    .fail(errorCallback(this))
    .always(alwaysCallback(this));
  },

  normalizeTweets: function(tweetsOrTweet) {
    if(tweetsOrTweet.hasOwnProperty('id_str')) {
      tweetsOrTweet = [tweetsOrTweet];
    }
    for(var i = 0, len = tweetsOrTweet.length; i < len; ++i) {
      var ti = tweetsOrTweet[i];

      // Damn Snowflake... Damn 53 bits precision limit...
      this.checkSnow(ti);

      if(!ti.user) {
        // DMs
        ti.user = ti.sender;
      }
      if(!ti.user) {
        // Search result
        ti.user = {
          name: ti.from_user,
          screen_name: ti.from_user,
          profile_image_url: ti.profile_image_url
        };
      }
    }
  },

  checkSnow: function(ti) {
    if (!ti) {
      return;
    }
    var regExp = this.snowflakeIdRegexp;
    for (var prop in ti) {
      if (!ti.hasOwnProperty(prop)) {
        continue;
      }
      if (typeof ti[prop] === 'object') {
        this.checkSnow(ti[prop]);
        continue;
      }
      var m = prop.match(regExp);
      if (m) {
        ti[m[1]] = ti[prop];
      }
    }
  },

  verifyCredentials: function(callback) {
    var closure_verifyCredentials = function(self) {
      return function(success, data) {
        if(success) {
          self.oauthLib.screen_name = data.screen_name;
        }
        if(callback) {
          callback(success, data);
        }
      };
    };
    this.ajaxRequest("account/verify_credentials", closure_verifyCredentials(this));
  },

  remainingHitsInfo: function() {
    return this.rateLimits;
  },

  updateWindowHitsLimit: function() {
    var closure_updateWindowHitsLimit = function(self) {
      return function(success, data, status, context, xhr) {
        if(success) {
          $.each(data.resources, function(apiFamilies, api) {
            $.each(api, function(apiEndpoint, apiRateInfo) {
              var apiName = apiEndpoint.split('/').slice(1, 3).join('/');
              if(!self.rateLimits[apiName]) self.rateLimits[apiName] = {};
              var rateLimits = self.rateLimits[apiName];
              rateLimits.remaining = apiRateInfo.remaining;
              rateLimits.reset = apiRateInfo.reset * 1000;
              rateLimits.limit = apiRateInfo.limit;
              if(!$.isNumeric(rateLimits.last)) rateLimits.last = 0;
            });
          });
        }
        if(xhr) {
          var accessLevel = self.findResponseHeader(xhr, 'X-Access-Level');
          if(accessLevel && !accessLevel.match('directmessages')) {
            // For some reason twitter is not authenticating with the correct access
            // level. In this cases we'll disable DMS
            TweetManager.instance.disableDMS();
          }
        }
      };
    };
    this.ajaxRequest("application/rate_limit_status", closure_updateWindowHitsLimit(this), null, {resources: 'search,statuses,direct_messages,users,favorites,lists,blocks,friends,help'});
  },

  showTweet: function(callback, id) {
    var params = {
      id: id,
      include_my_retweet: 'true',
      include_entities: 'true'
    };
    this.ajaxRequest('statuses/show', callback, null, params, "GET");
  },

  tweet: function(callback, msg, replyId) {
    var params = {
      status: msg
    };
    if(replyId) {
      params.in_reply_to_status_id = replyId;
    }
    this.ajaxRequest('statuses/update', callback, null, params, "POST", null, 30000);
  },

  tweet_with_media: function(callback, msg, replyId, media) {
    var params = new FormData();
    params.append('status', msg);
    params.append('media[]', media);
    if(replyId) {
      params.append('in_reply_to_status_id', replyId);
    }
    this.ajaxRequest('statuses/update_with_media', callback, null, params, "POST", null, 30000, true);
  },

  retweet: function(callback, id) {
    this.ajaxRequest('statuses/retweet/' + id, callback, null, null, "POST");
  },

  destroy: function(callback, id) {
    this.ajaxRequest('statuses/destroy/' + id, callback, null, null, "POST");
  },

  newDM: function(callback, msg, replyId) {
    var params = {
      text: msg,
      screen_name: replyId
    };
    this.ajaxRequest('direct_messages/new', callback, null, params, "POST");
  },

  destroyDM: function(callback, id) {
    var params = {
      id: id
    };
    this.ajaxRequest('direct_messages/destroy', callback, null, params, "POST");
  },

  favorite: function(callback, id) {
    var params = {
      id: id
    };
    this.ajaxRequest('favorites/create', callback, null, params, "POST");
  },

  unFavorite: function(callback, id) {
    var params = {
      id: id
    };
    this.ajaxRequest('favorites/destroy', callback, null, params, "POST");
  },

  lists: function(callback) {
    var params = {
      user_id: this.userid(),
      count: '1000'
    };
    this.ajaxRequest('lists/ownerships', callback, null, params, "GET");
  },

  subs: function(callback) {
    var params = {
      user_id: this.userid()
    };
    this.ajaxRequest('lists/subscriptions', callback, null, params, "GET");
  },

  timeline: function(timeline_path, callback, context, params) {
    params = params || {};
    params.include_entities = 'true';
    params.include_rts = 'true';
    this.ajaxRequest(timeline_path, callback, context, params);
  },

  searchTimeline: function(callback, context, params) {
    params.result_type = 'recent';
    params.include_entities = 'true';
    this.ajaxRequest('search/tweets', callback, context, params, "GET", 'bearer');
  },

  blockedUsers: function(callback) {
    var params = {
      cursor: -1
    };
    this.ajaxRequest('blocks/ids', callback, null, params, "GET");
  },

  friendsIds: function(callback) {
    var params = {
      screen_name: this.username(),
      cursor: -1
    };
    this.ajaxRequest('friends/ids', callback, null, params, "GET");
  },

  trendingPlaces: function(callback) {
    this.ajaxRequest('trends/available', callback, null, null, "GET");
  },

  trendingTopics: function(callback, place) {
    var params = {};
    if (place != undefined) {
      params.id = place;
    } else {
      params.id = '1'; //1 - worldwide
    }
    this.ajaxRequest('trends/place', callback, null, params, "GET");
  },

  savedSearches: function(callback) {
    this.ajaxRequest('saved_searches/list', callback, null, null, "GET");
  },

  createSavedSearches: function(callback, query) {
    if(!query) {
      callback(false, null, 'Missing Query');
      return;
    }
    var params = {query: query};
    this.ajaxRequest('saved_searches/create', callback, null, params, "POST");
  },

  destorySavedSearches: function(callback, id) {
    if(!id) {
      callback(false, null, 'Missing SavedSearch ID');
      return;
    }
    this.ajaxRequest('saved_searches/destroy/' + id, callback, null, null, "POST");
  },

  lookupUsers: function(callback, usersIdList) {
    var params = {
      user_id: usersIdList.join(',')
    };
    this.ajaxRequest('users/lookup', callback, null, params, "GET");
  },

  usersTimeline: function(callback, context, params) {
    params.include_rts = 'true';
    this.ajaxRequest('statuses/user_timeline', callback, context, params, "GET", 'bearer');
  },

  follow: function(callback, username) {
    var params = {
      screen_name: username,
      follow: false
    };
    this.ajaxRequest('friendships/create', callback, null, params, "POST");
  },

  unfollow: function(callback, username) {
    var params = {
      screen_name: username
    };
    this.ajaxRequest('friendships/destroy', callback, null, params, "POST");
  },

  block: function(callback, username) {
    var params = {
      screen_name: username
    };
    this.ajaxRequest('blocks/create', callback, null, params, "POST");
  },

  report: function(callback, username) {
    var params = {
      screen_name: username
    };
    this.ajaxRequest('users/report_spam', callback, null, params, "POST");
  },

  retrieveBearerToken: function(callback) {
    var params = {
      grant_type: "client_credentials"
    };
    this.ajaxRequest("https://api.twitter.com/oauth2/token", callback, null, params, "POST", 'basic');
  },

  findResponseHeader: function(request, matchPattern) {
    var allHeaders = request.getAllResponseHeaders().split("\r\n"), ret;
    for(var i = 0, len = allHeaders.length; i < len; i++) {
      var header = allHeaders[i], splited = header.split(/:\s*/), pattern = new RegExp(matchPattern, 'i');
      if(pattern.test(splited[0])) {
        ret = splited[1];
        break;
      }
    }
    return ret;
  }
};

var globalOAuthInstance;
chrome.runtime.onConnect.addListener(function(port) {
  if(port.name !== 'getAuthPin') return;
  port.onMessage.addListener(function(message) {
    if(message.check_pin_needed) {
      if(!globalOAuthInstance.authenticated && globalOAuthInstance.tokenRequested) {
        port.postMessage({tokenRequested: true});
        return;
      }
    } else if(message.cr_oauth_pin) {
      globalOAuthInstance.authenticating = true;
      globalOAuthInstance.getAccessToken.call(globalOAuthInstance, message.cr_oauth_pin, function(data) {
        if(data) {
          port.postMessage({success: data});
        }
      });
    }
  });
});

function TwitterOAuth(oauthTokenData, onAuthenticated) {
  this.user_id = null;
  this.screen_name = null;
  this.authenticated = false;
  this.onAuthenticated = onAuthenticated;
  this.responseCallback = null;
  this.authenticating = false;
  this.tokenRequested = false;
  this.timeAdjusted = false;
  this.oauthTokenData = oauthTokenData;
  this.consumerSecret = SecretKeys.twitter.consumerSecret;
  this.consumerKey    = SecretKeys.twitter.consumerKey;

  globalOAuthInstance = this;

  var cachedToken = this.oauthTokenData.val();
  if(cachedToken) {
    this.authenticating = true;
    this.tokenRequested = true;
    setTimeout(function(self) {
      self.accessTokenCallback.call(self, cachedToken);
    }, 0, this);
  }
}
TwitterOAuth.prototype = {
  getAccessToken: function(pin, callback) {
    this.responseCallback = callback;
    this.makeRequest.call(this, 'access_token',
      { oauth_verifier: pin }, this.accessTokenCallback);
  },
  prepareSignedParams: function(url, params, httpMethod) {
    var accessor = {
      consumerSecret: this.consumerSecret,
      tokenSecret: this.oauth_token_secret
    };
    if(!httpMethod)
      httpMethod = 'POST';
    var message = {
      action: url,
      method: httpMethod,
      parameters: [
        ['oauth_consumer_key', this.consumerKey],
        ['oauth_signature_method', 'HMAC-SHA1']
      ]
    };
    if(this.oauth_token) {
      OAuth.setParameter(message, 'oauth_token', this.oauth_token);
    }
    for(var p in params) {
      if(!params.hasOwnProperty(p)) continue;
      OAuth.setParameter(message, p, params[p]);
    }
    OAuth.completeRequest(message, accessor);
    return OAuth.getParameterMap(message.parameters);
  },
  adjustTimestamp: function(request) {
    var serverHeaderFields = ['Last-Modified', 'Date'];
    var serverTimestamp;
    for(var i = 0, len = serverHeaderFields.length; i < len; ++i) {
      var headerField = serverHeaderFields[i];
      var fieldValue = request.getResponseHeader(headerField);
      if(!fieldValue) {
        continue;
      }
      serverTimestamp = Date.parse(fieldValue);
      if(serverTimestamp && !isNaN(serverTimestamp)) {
        break;
      }
    }
    if(serverTimestamp) {
      var beforeAdj = OAuth.timeCorrectionMsec;
      OAuth.timeCorrectionMsec = serverTimestamp - Date.now();
      if(Math.abs(beforeAdj - OAuth.timeCorrectionMsec) > 5000) {
        console.log("Server timestamp: " + serverTimestamp + " Correction (ms): " + OAuth.timeCorrectionMsec);
        return true;
      }
    }
    return false;
  },
  makeRequest: function(url, params, callback) {
    var signingUrl = TwitterLib.URLS.BASE_OAUTH_SIGNING + url;
    var signedParams = this.prepareSignedParams(signingUrl, params);
    var requestUrl = TwitterLib.URLS.BASE_OAUTH + url;
    var closure_done = function(self) {
      return function(data, status, xhr) {
        callback.call(self, data, status, xhr);
      };
    };
    var closure_fail = function(self) {
      return function(request, status, error) {
        var fmtError = '';
        try {
          if(self.adjustTimestamp(request)) {
            console.log('First OAuth token request failed: ' + status + '. Trying again using adjusted timestamp.');
            callback.call(self, null, null, true);
            return;
          }
          fmtError = '"' + request.responseText + '"(' + request.statusText + ')';
        } catch(e) {
          fmtError = '"' + error + '"(' + status + ')';
        }
        callback.call(self, null, fmtError);
      };
    };
    $.ajax({
      type: 'POST',
      url: requestUrl,
      data: signedParams
    })
    .done(closure_done(this))
    .fail(closure_fail(this));
  },
  accessTokenCallback: function(data, status, xhr) {
    this.authenticating = false;
    var success = true;
    if(!data) {
      success = false;
      this.error = status;
      console.log('accessTokenCallback error: ' + status);
    } else {
      var paramMap = OAuth.getParameterMap(data);
      this.oauthTokenData.save(data);
      this.oauth_token = paramMap['oauth_token'];
      this.oauth_token_secret = paramMap['oauth_token_secret'];
      this.user_id = paramMap['user_id'];
      this.screen_name = paramMap['screen_name'];
      this.authenticated = true;
      if(this.onAuthenticated) {
        this.onAuthenticated();
      }
    }
    if(this.responseCallback) {
      try {
        this.responseCallback(success);
      } catch(e) { /* ignoring */ }
      this.responseCallback = null;
    }
  },
  requestTokenCallback: function(data, status, tryAgain) {
    var alertRequestError = function(self) {
      return function(errorMsg) {alertRequestError
        self.error = errorMsg;
        console.log('requestTokenCallback error: ' + errorMsg);
        alert(chrome.i18n.getMessage("request_token_error", [errorMsg]));
      };
    };
    if(!data) {
      if(tryAgain) {
        this.getRequestToken();
        return;
      }
      (alertRequestError(this))(status);
      return;
    }

    var paramMap = OAuth.getParameterMap(data);
    this.oauth_token = paramMap['oauth_token'];
    this.oauth_token_secret = paramMap['oauth_token_secret'];

    if(!this.oauth_token || !this.oauth_token_secret) {
      (alertRequestError(this))("Invalid oauth_token: " + data);
      return;
    }

    chrome.tabs.create({
      "url": TwitterLib.URLS.BASE_OAUTH + 'authorize?oauth_token=' + this.oauth_token,
      "selected": true
    });
    this.tokenRequested = true;
  },
  getRequestToken: function() {
    this.oauth_token_secret = '';
    this.oauth_token = null;
    this.makeRequest('request_token', {}, this.requestTokenCallback);
  }
};
