function TwitterLib(onAuthenticated, oauthTokenData) {
  this.onAuthenticated = onAuthenticated;
  this.ignoreRequests = false;
  this.lastAccessLevel = null;
  this.oauthLib = new TwitterOAuth(oauthTokenData, (function(self) {
    return function() {
      self.verifyCredentials(self.onAuthenticated);
    };
  })(this));

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
  signOauth: function(xhr, url, params, method) {
    var signedData = this.oauthLib.prepareSignedParams(url, params, method);
    xhr.setRequestHeader('Authorization', this.generateOauthHeader(signedData));
  },
  ajaxRequest: function(params) {
    var url = params.endpoint,
        callback = params.callback,
        context = params.context,
        requestParams = params.requestParams || {},
        httpMethod = params.httpMethod || 'GET',
        overriddenTimeout = params.overriddenTimeout,
        withMedia = params.withMedia,
        baseUrl = params.baseUrl || TwitterLib.URLS.BASE_SIGNING,
        targetId = params.targetId;
    if(targetId && targetId !== '') url = [url, targetId].join('/');
    var requestUrl = baseUrl + url + ".json";
    var signingUrl = baseUrl + url + ".json";
    var beforeSendCallback = function(self) {
      return function(request, settings) {
        self.signOauth(request, signingUrl, requestParams, httpMethod);
      };
    };
    var errorCallback = function(self) {
      return function(request, status, error) {
        if(self.ignoreRequests) return;
        console.warn("Failed Request", requestUrl + '?' + $.param(requestParams), request, status, error);
        var fmtError = '', rspObj = {}, retry = true;
        try{
          rspObj = (JSON.parse(request.responseText))['errors'][0];
        } catch(e) { /* Ignoring */ }
        if(status == 'timeout') {
          fmtError = "(timeout)";
        } else if(status == 'canceled') {
          fmtError = "(Too Many Requests)";
        } else {
          try {
            switch(request && request.readyState === 4) {
              case (request.status === 401):
                switch(true) {
                  case (self.oauthLib.adjustTimestamp(request, 'Date')):
                    console.log('Unauthorized, trying again using adjusted timestamp based on server time.');
                    self.ajaxRequest(params);
                    return;
                  case (/verify_credentials/.test(url)):
                    self.ignoreRequests = true;
                    TweetManager.instance.signoutAndReauthenticate();
                    break;
                  case (/user_timeline/.test(url)):
                    fmtError = "(This user is protected)";
                    if(console) console.warn('This user is protected, or you are blocked');
                    break;
                  default:
                    fmtError = "(Could not authenticate you)";
                    if(console) console.warn('RESPONSE 401: ' + url);
                    if(console) console.warn(request.responseText);
                    break;
                }
                break;
              case (request.status === 403):
                switch(true) {
                  case (rspObj.code == 190):
                    if(/statuses\/update/.test(url) || /direct_messages\/new/.test(url)) {
                      fmtError = rspObj.code;
                      retry = false;
                      if(console) console.warn('The text of your tweet is too long.');
                    } else {
                      fmtError = "(" + rspObj.message + ")";
                      if(console) console.warn(request.responseText);
                    }
                    break;
                  case (rspObj.code == 187):
                    if(/statuses\/update/.test(url) || /direct_messages\/new/.test(url)) {
                      fmtError = rspObj.code;
                      retry = false;
                      if(console) console.warn('Status is a duplicate.');
                    } else {
                      fmtError = "(" + rspObj.message + ")";
                      if(console) console.warn(request.responseText);
                    }
                    break;
                  case (rspObj.code == 179):
                    if(/statuses\/show/.test(url)) {
                      fmtError = rspObj.code;
                      if(console) console.warn('This user is protected, or you are blocked');
                    } else {
                      fmtError = "(" + rspObj.message + ")";
                      if(console) console.warn(request.responseText);
                    }
                    break;
                  case (rspObj.code == 170):
                    if(/statuses\/update/.test(url) || /direct_messages\/new/.test(url)) {
                      fmtError = rspObj.code;
                      retry = false;
                      if(console) console.warn('Missing required parameter.');
                    } else {
                      fmtError = "(" + rspObj.message + ")";
                      if(console) console.warn(request.responseText);
                    }
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
                    fmtError = "(403:" + rspObj.message + ")";
                    if(console) console.warn('RESPONSE 403: ' + url);
                    if(console) console.warn(request.responseText);
                    break;
                }
                break;
              case (request.status === 404):
                fmtError = "(404:" + url + ")";
                retry = false;
                if(console) console.warn('404: ' + url);
                if(console) console.warn(request.responseText);
                break;
              case (request.status === 429):
                fmtError = "(Too Many Requests)";
                retry = false;
                break;
              case (request.status === 500 || rspObj.code === 131):
                fmtError = '(' + (rspObj.message || 'Internal error') + ')';
                retry = false;
                break;
              case (request.status === 503 || rspObj.code === 130):
                fmtError = '(' + (rspObj.message || 'Over capacity') + ')';
                retry = false;
                break;
              default:
                if(console) console.warn('API CALL ERROR: ' + url);
                if(console) console.warn(request.responseText);
                break;
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
        callback(false, null, fmtError, context, request, retry);
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
    .fail(errorCallback(this));
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
    this.ajaxRequest({
      endpoint: 'account/verify_credentials',
      callback: (function(self) {
        return function(success, data) {
          if(success) {
            self.oauthLib.screen_name = data.screen_name;
            self.oauthLib.user_id = data.id_str;
          }
          if(callback) {
            callback(success, data);
          }
        };
      })(this)
    });
  },

  showTweet: function(callback, id) {
    if(!id) {
      callback(false, null, 'Missing Tweet ID');
      return;
    }
    var params = {
      id: id,
      include_my_retweet: 'true',
      include_entities: 'true'
    };
    this.ajaxRequest({
      endpoint: 'statuses/show',
      callback: callback,
      requestParams: params
    });
  },

  tweet: function(callback, msg, replyId) {
    var params = {
      status: msg
    };
    if(replyId) {
      params.in_reply_to_status_id = replyId;
    }
    this.ajaxRequest({
      endpoint: 'statuses/update',
      callback: callback,
      requestParams: params,
      httpMethod: 'POST',
      overriddenTimeout: 30000
    });
  },

  tweet_with_media: function(callback, msg, replyId, media) {
    var params = new FormData();
    params.append('status', msg);
    params.append('media[]', media);
    if(replyId) {
      params.append('in_reply_to_status_id', replyId);
    }
    this.ajaxRequest({
      endpoint: 'statuses/update_with_media',
      callback: callback,
      requestParams: params,
      httpMethod: 'POST',
      overriddenTimeout: 30000,
      withMedia: true
    });
  },

  retweet: function(callback, id) {
    if(!id) {
      callback(false, null, 'Missing Tweet ID');
      return;
    }
    this.ajaxRequest({
      endpoint: 'statuses/retweet',
      callback: callback,
      httpMethod: 'POST',
      targetId: id
    });
  },

  destroy: function(callback, id) {
    if(!id) {
      callback(false, null, 'Missing Tweet ID');
      return;
    }
    this.ajaxRequest({
      endpoint: 'statuses/destroy',
      callback: callback,
      httpMethod: 'POST',
      targetId: id
    });
  },

  newDM: function(callback, msg, replyId) {
    var params = {
      text: msg,
      screen_name: replyId
    };
    this.ajaxRequest({
      endpoint: 'direct_messages/new',
      callback: callback,
      requestParams: params,
      httpMethod: 'POST'
    });
  },

  destroyDM: function(callback, id) {
    if(!id) {
      callback(false, null, 'Missing Tweet ID');
      return;
    }
    var params = {
      id: id
    };
    this.ajaxRequest({
      endpoint: 'direct_messages/destroy',
      callback: callback,
      requestParams: params,
      httpMethod: 'POST'
    });
  },

  favorite: function(callback, id) {
    if(!id) {
      callback(false, null, 'Missing Tweet ID');
      return;
    }
    var params = {
      id: id
    };
    this.ajaxRequest({
      endpoint: 'favorites/create',
      callback: callback,
      requestParams: params,
      httpMethod: 'POST'
    });
  },

  unFavorite: function(callback, id) {
    if(!id) {
      callback(false, null, 'Missing Tweet ID');
      return;
    }
    var params = {
      id: id
    };
    this.ajaxRequest({
      endpoint: 'favorites/destroy',
      callback: callback,
      requestParams: params,
      httpMethod: 'POST'
    });
  },

  lists: function(callback) {
    var params = {
      user_id: this.userid(),
      count: '1000'
    };
    this.ajaxRequest({
      endpoint: 'lists/ownerships',
      callback: callback,
      requestParams: params
    });
  },

  subs: function(callback) {
    var params = {
      user_id: this.userid(),
      count: '1000'
    };
    this.ajaxRequest({
      endpoint: 'lists/subscriptions',
      callback: callback,
      requestParams: params
    });
  },

  timeline: function(timeline_path, callback, context, params) {
    params = params || {};
    params.include_entities = 'true';
    params.include_rts = 'true';
    this.ajaxRequest({
      endpoint: timeline_path,
      callback: callback,
      context: context,
      requestParams: params
    });
  },

  searchTimeline: function(callback, context, params) {
    params.result_type = 'recent';
    params.include_entities = 'true';
    params.count = '100';
    this.ajaxRequest({
      endpoint: 'search/tweets',
      callback: callback,
      context: context,
      requestParams: params
    });
  },

  blockedUsers: function(callback, cursor) {
    if(!cursor) cursor = "-1";
    var params = {
      cursor: cursor,
      include_entities: 'false',
      skip_status: 'true'
    };
    this.ajaxRequest({
      endpoint: 'blocks/list',
      callback: callback,
      context: cursor,
      requestParams: params
    });
  },

  friendsIds: function(callback, cursor) {
    if(!cursor) cursor = "-1";
    var params = {
      stringify_ids: 'true',
      user_id: this.userid(),
      cursor: cursor,
      count: '5000'
    };
    this.ajaxRequest({
      endpoint: 'friends/ids',
      callback: callback,
      context: cursor,
      requestParams: params
    });
  },

  trendingPlaces: function(callback) {
    this.ajaxRequest({
      endpoint: 'trends/available',
      callback: callback
    });
  },

  trendingTopics: function(callback, place) {
    var params = {};
    if (place != undefined) {
      params.id = place;
    } else {
      params.id = '1'; //1 - worldwide
    }
    this.ajaxRequest({
      endpoint: 'trends/place',
      callback: callback,
      requestParams: params
    });
  },

  savedSearches: function(callback) {
    this.ajaxRequest({
      endpoint: 'saved_searches/list',
      callback: callback
    });
  },

  createSavedSearches: function(callback, query) {
    if(!query) {
      callback(false, null, 'Missing Query');
      return;
    }
    var params = {
      query: query
    };
    this.ajaxRequest({
      endpoint: 'saved_searches/create',
      callback: callback,
      requestParams: params,
      httpMethod: 'POST'
    });
  },

  destorySavedSearches: function(callback, id) {
    if(!id) {
      callback(false, null, 'Missing SavedSearch ID');
      return;
    }
    this.ajaxRequest({
      endpoint: 'saved_searches/destroy',
      callback: callback,
      httpMethod: 'POST',
      targetId: id
    });
  },

  lookupUsers: function(callback, usersIdList) {
    if(!usersIdList || !Array.isArray(usersIdList)) {
      callback(false);
      return;
    } else if(usersIdList.length == 0) {
      callback(true, []);
      return;
    }
    var params = {
      user_id: usersIdList.join(',')
    };
    this.ajaxRequest({
      endpoint: 'users/lookup',
      callback: callback,
      requestParams: params
    });
  },

  usersTimeline: function(callback, context, params) {
    params.include_rts = 'true';
    this.ajaxRequest({
      endpoint: 'statuses/user_timeline',
      callback: callback,
      context: context,
      requestParams: params
    });
  },

  follow: function(callback, username) {
    var params = {
      screen_name: username, //TODO change to user_id
      follow: false
    };
    this.ajaxRequest({
      endpoint: 'friendships/create',
      callback: callback,
      requestParams: params,
      httpMethod: 'POST'
    });
  },

  unfollow: function(callback, username) {
    var params = {
      screen_name: username //TODO change to user_id
    };
    this.ajaxRequest({
      endpoint: 'friendships/destroy',
      callback: callback,
      requestParams: params,
      httpMethod: 'POST'
    });
  },

  block: function(callback, username) {
    var params = {
      screen_name: username //TODO change to user_id
    };
    this.ajaxRequest({
      endpoint: 'blocks/create',
      callback: callback,
      requestParams: params,
      httpMethod: 'POST'
    });
  },

  unblock: function(callback, username) {
    var params = {
      screen_name: username //TODO change to user_id
    };
    this.ajaxRequest({
      endpoint: 'blocks/destroy',
      callback: callback,
      requestParams: params,
      httpMethod: 'POST'
    });
  },

  report: function(callback, username) {
    var params = {
      screen_name: username //TODO change to user_id
    };
    this.ajaxRequest({
      endpoint: 'users/report_spam',
      callback: callback,
      requestParams: params,
      httpMethod: 'POST'
    });
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
  },

  retrieveConfiguration: function(callback) {
    this.ajaxRequest({
      endpoint: 'help/configuration',
      callback: callback
    });
  },

  mutesUsers: function(callback, cursor) {
    if(!cursor) cursor = "-1";
    var params = {
      cursor: cursor,
      include_entities: 'false',
      skip_status: 'true'
    };
    this.ajaxRequest({
      endpoint: 'mutes/users/list',
      callback: callback,
      context: cursor,
      requestParams: params
    });
  },

  createMutes: function(callback, username) {
    if(!username) {
      callback(false, null, "Missing screen_name");
      return;
    }
    var params = {
      screen_name: username
    };
    this.ajaxRequest({
      endpoint: 'mutes/users/create',
      callback: callback,
      requestParams: params,
      httpMethod: 'POST'
    });
  },

  destroyMutes: function(callback, username) {
    if(!username) {
      callback(false, null, "Missing screen_name");
      return;
    }
    var params = {
      screen_name: username
    };
    this.ajaxRequest({
      endpoint: 'mutes/users/destroy',
      callback: callback,
      requestParams: params,
      httpMethod: 'POST'
    });
  },

  uploadMedia: function(callback, mediaData) {
    if(!mediaData) {
      callback(false, null, "Missing mediaData");
      return;
    }
    var params = {
      media: mediaData
    };
    this.ajaxRequest({
      endpoint: 'media/upload',
      callback: callback,
      requestParams: params,
      httpMethod: 'POST',
      baseUrl: 'https://upload.twitter.com/1.1/'
    });
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
    $.ajax({
      type: 'POST',
      url: requestUrl,
      data: signedParams
    })
    .done((function(self) {
      return function(data, status, xhr) {
        callback.call(self, data, status, xhr);
      };
    })(this))
    .fail((function(self) {
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
    })(this));
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
