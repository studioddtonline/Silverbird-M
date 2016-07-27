function TweetsTimeline(timelineId, manager, template) {
  this.timelineId = timelineId;
  this.manager = manager;
  this.template = template;

  this.stagedStreamTweets = [];
  this.tweetsCache = [];
  this.newTweetsCache = [];
  this.unreadNotified = new Set();

  this.timerId = null;
  this.currentError = null;
  this.currentCallback = null;
  this.currentScroll = 0;
  this.firstRun = true;
  this.timelinePath = null;
  this.timelineId = timelineId;
  this.timelineStopped = false;
  this.timelinePath = this.template.templatePath;
  this.unifiedRunning = false;
  this.currentRequestId = 0;
  this.canceledRequests = new Set();

  StreamListener.subscribe(this.onStreamData, this);
}

TweetsTimeline.prototype = {
  init: function() {
    this._baseInit();
  },

  remove: function(){
    this.template.visible = false;
    if(!this.template.includeInUnified) {
      this.killTimeline();
      return true;
    }
    return false;
  },

  getError: function() {
    return this.currentError;
  },

  killTimeline: function() {
    StreamListener.unsubscribe(this);
    this.timelineStopped = true;
    this._stopTimer();
  },

  giveMeTweets: function(callback, syncNew, cacheOnly, keepCache, suggestedCount) {
    if(!this.timelinePath) {
      callback([], this.timelineId, this);
      return;
    }
    if(this.unifiedRunning) {
      this._cancelRequest();
    }
    if(this.currentCallback) {
      if(this.unifiedRunning) {
        try {
          this.currentCallback([], this.timelineId, this);
        } catch(e) {
          /* ignoring */
        } finally {
          this.currentCallback = null;
        }
      } else {
        //Handling multiple calls to giveMeTweets, just update the registered
        //callback and let the first request finish.
        this.currentCallback = callback;
        return;
      }
    }
    if(syncNew) {
      //We should fetch new tweets, update the cache and then return the
      //cached results.
      var oldNewTweetsCallback = this.manager.newTweetsCallback;
      this.currentCallback = callback;
      this.manager.newTweetsCallback = null;
      this._fetchNewTweets((function(self) {
        return function() {
          var tweetsCallback = self.currentCallback;
          self.currentCallback = null;

          self.updateNewTweets();
          self.manager.updateAlert();
          self.giveMeTweets(tweetsCallback, false, true);
          self.manager.newTweetsCallback = oldNewTweetsCallback;
        };
      })(this));
      return;
    }
    if(cacheOnly && !this.firstRun) {
      //Only return cached results if this is not the first run.
      if(!keepCache) {
        this._cleanUpCache();
      }
      try {
        callback(this.tweetsCache, this.timelineId, this);
      } catch(e) {
        /* ignoring exception, popup might be closed */
      }
      return;
    }
    //If we didn't return yet it's because we want to fetch old tweets
    //from twitter's API.

    this.currentCallback = callback;
    var params = this._makeOldTweetsRequestParams(suggestedCount);
    var context = {
      usingMaxId: !!params.max_id,
      requestId: this._nextRequestId()
    };
    this._doBackendRequest(this.timelinePath, (function(self) {
      return function(success, tweets, status, context) {
        self._onFetch(success, tweets, status, context);
      };
    })(this), context, params);
  },

  updateNewTweets: function() {
    this.tweetsCache = this.newTweetsCache.concat(this.tweetsCache);
    this.newTweetsCache = [];
    this.unreadNotified.clear();
  },

  newTweetsCount: function() {
    let unreadCount = 0;
    this.newTweetsCache.forEach((entry) => {
      if(!this.manager.isTweetRead(entry.id_str)) {
        ++unreadCount;
      }
    });
    return [this.newTweetsCache.length, unreadCount];
  },

  getNewUnreadTweets: function() {
    var unreadNewList = [];
    for(var i = 0, len = this.newTweetsCache.length; i < len; ++i) {
      var tweet = this.newTweetsCache[i];
      if(!this.manager.isTweetRead(tweet.id) && !this.unreadNotified.has(tweet.id) && tweet.user.screen_name != this.manager.twitterBackend.userName) {
        unreadNewList.push(tweet);
        this.unreadNotified.add(tweet.id);
      }
    }
    return unreadNewList;
  },

  getNewUnreadIds: function() {
    let unreadNewIds = [];
    const userId = this.manager.twitterBackend.userId;
    this.newTweetsCache.forEach((entry) => {
      if(!this.manager.isTweetRead(entry.id_str) && entry.user.id_str != userId) {
        unreadNewIds.push(entry.id_str);
      }
    });
    return unreadNewIds;
  },

  removeFromCache: function(id) {
    this.tweetsCache = this.tweetsCache.filter((entry) => {
      if(entry.id_str !== id) {
        return true;
      }
    });
  },

  findTweet: function(id) {
    let ret = null;
    this.tweetsCache.forEach((entry) => {
      if(entry.id_str === id) {
        ret = entry;
      }
    });
    return ret;
  },

  getNewTweetsCache: function() {
    return this.newTweetsCache;
  },

  getTweetsCache: function() {
    return this.tweetsCache;
  },

  reset: function() {
    this.stagedStreamTweets = [];
    this.tweetsCache = [];
    this.newTweetsCache = [];
    this.unreadNotified.clear();
    this.firstRun = true;
    this._stopTimer();
  },

  onStreamData: function(data) {
    if(data.event && data.event == StreamListener.events.DISCONNECTED) {
      this.shouldListenStream = false;
      if(this.listeningStream) {
        this.listeningStream = false;
        this._fetchNewTweets();
      }
      return;
    }
    if(this.shouldListenStream) {
      this.listeningStream = true;
      this._handleStreamData(data);
    } else {
      this.shouldListenStream = this._shouldListenStream();
    }
  },

  purgeBlockedTweets: function() {
    var newTweetsCache = [];
    for(var i = 0, len = this.tweetsCache.length; i < len; ++i) {
      var tweet = this.tweetsCache[i];
      if(!this._isTweetBlocked(tweet)) newTweetsCache.push(tweet);
    }
    this.tweetsCache = newTweetsCache;
  },

  /* Private Methods */

  _shouldListenStream: function() {
    return this.template.id == TimelineTemplate.HOME ||
      this.template.id == TimelineTemplate.MENTIONS ||
      this.template.id == TimelineTemplate.SENT_DMS ||
      this.template.id == TimelineTemplate.RECEIVED_DMS;
  },

  _handleStreamData: function(data) {
    var tweets;
    if(data.delete) {
      if(data.delete.direct_message) {
        this.removeFromCache(data.delete.direct_message.id_str);
      } else {
        this.removeFromCache(data.delete.status.id_str);
      }
      return;
    } else if(data.text) {
      if(data.sender && data.sender.id_str === this.manager.twitterBackend.userId) {
        if( this.template.id == TimelineTemplate.SENT_DMS) {
          tweets = [data];
        }
      } else {
        var mentionStr = '@' + this.manager.twitterBackend.userName;
        if(data.text.match(mentionStr)) {
          if(this.template.id == TimelineTemplate.MENTIONS) {
            tweets = [data];
          }
        } else if(this.template.id == TimelineTemplate.HOME) {
          tweets = [data];
        }
      }
    } else if(data.direct_message) {
      if(data.direct_message.sender.id_str == this.manager.twitterBackend.userId) {
        if(this.template.id == TimelineTemplate.SENT_DMS) {
          tweets = [data.direct_message];
        }
      } else {
        if(this.template.id == TimelineTemplate.RECEIVED_DMS) {
          tweets = [data.direct_message];
        }
      }
    }

    if(tweets) {
      if(this.listeningStream) {
        if(this.stagedStreamTweets.length > 0) {
          tweets = tweets.concat(this.stagedStreamTweets);
          this.stagedStreamTweets = [];
        }
        var newCount = this._syncNewTweets(tweets, {});
        if(newCount > 0) {
          this.manager.notifyNewTweets();
        }
      } else {
        this.stagedStreamTweets = tweets.concat(this.stagedStreamTweets);
      }
    }

  },

  _setError: function(status) {
    this.currentError = status;
  },

  _setTimelinePath: function(path) {
    this.timelinePath = path;
  },

  _stopTimer: function() {
    if(this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  },

  _onFetchNew: function(success, tweets, status, context) {
    if(this.timelineStopped) {
      return;
    }
    if(this._isRequestCanceled(context.requestId)) {
      this.timerId = setTimeout(function(self) {
        self._fetchNewTweets();
      }, this.template.refreshInterval, this);
      return;
    }
    if(!success) {
      this._setError(status);
      if(context.onFinish)
        context.onFinish(0);
      this.timerId = setTimeout(function(self) {
        self._fetchNewTweets();
      }, this.template.refreshInterval, this);
      return;
    }
    this._setError(null);

    var newCount = this._syncNewTweets(tweets, context);

    if(newCount > 0) {
      this.manager.notifyNewTweets();
    }
    if(context.onFinish) {
      context.onFinish(newCount);
    }
    if(this.listeningStream) {
      this.timerId = null;
    } else {
      this.timerId = setTimeout(function(self) {
        self._fetchNewTweets();
      }, this.template.refreshInterval, this);
      return;
    }
  },

  _doBackendRequest: function(path, callback, context, params) {
    this.manager.twitterBackend.timeline(path, callback, context, params);
  },

  _fetchNewTweets: function(onFinishCallback) {
    this._stopTimer();
    if(this.manager.suspend && !onFinishCallback) {
      this.timerId = setTimeout(function(self) {
        self._fetchNewTweets();
      }, this.template.refreshInterval, this);
      return;
    }
    var context = {
      requestId: this._nextRequestId(),
      onFinish: onFinishCallback
    };
    var params = this._makeNewTweetsRequestParams();
    this._doBackendRequest(this.timelinePath, (function(self) {
      return function(success, tweets, status, context) {
        self._onFetchNew(success, tweets, status, context);
      };
    })(this), context, params);
  },

  _onFetch: function(success, tweets, status, context) {
    if(this.timelineStopped || this._isRequestCanceled(context.requestId)) {
      return;
    }
    if(!success) {
      this._setError(status);
      try {
        this.currentCallback(null, this.timelineId, this);
      } catch(e) {
        /* ignoring exception, popup might be closed */
      }

      this._setError(null);
      this.currentCallback = null;
      return;
    }
    this._setError(null);
    this._syncOldTweets(tweets, context);

    // Let's clean this.currentCallback before calling it as
    // there might be unexpected errors and this should not block
    // the extension.
    var callback = this.currentCallback;
    this.currentCallback = null;
    try {
      callback(this.tweetsCache, this.timelineId, this);
    } catch(e) {
      /* ignoring exception, popup might be closed */
    }

    if(this.firstRun) {
      this.firstRun = false;
      this.timerId = setTimeout(function(self) {
        self._fetchNewTweets();
      }, this.template.refreshInterval, this);
    }
  },

  _cleanUpCache: function() {
    var maxCachedTweets = OptionsBackend.get('max_cached_tweets') + 1;
    if(this.tweetsCache.length < maxCachedTweets) {
      return;
    } else {
      this.tweetsCache = this.tweetsCache.slice(0, maxCachedTweets);
    }
  },

  _makeOldTweetsRequestParams: function(suggestedCount) {
    if(!suggestedCount) {
      suggestedCount = OptionsBackend.get('tweets_per_page');
    }
    var params = {count: suggestedCount, per_page: suggestedCount};
    var maxId = null;
    if(this.tweetsCache.length > 0) {
      maxId = this.tweetsCache[this.tweetsCache.length - 1].id_str;
    }
    if(maxId) {
      params.max_id = maxId;
    }
    return params;
  },

  _makeNewTweetsRequestParams: function() {
    var lastId = null;
    if(this.newTweetsCache.length > 0) {
      lastId = this.newTweetsCache[0].id_str;
    } else if(this.tweetsCache.length > 0) {
      lastId = this.tweetsCache[0].id_str;
    }
    var params = {count: 200};
    if(lastId) {
      params.since_id = lastId;
    }
    return params;
  },

  _syncOldTweets: function(tweets, context) {
    let tweetsCacheLastId = (this.tweetsCache.length > 0) ? this.tweetsCache[this.tweetsCache.length - 1].id_str : -1;
    for(let i = 0, len = tweets.length; i < len; ++i) {
      let tweet = tweets[i];
      if(tweet.id_str == tweetsCacheLastId || this._isTweetBlocked(tweet)) {
        continue;
      }
      this.tweetsCache.push(tweet);
    }
  },

  _syncNewTweets: function(tweets, context) {
    var newCount = 0;
    for(var i = tweets.length - 1; i >= 0; --i) {
      var tweet = tweets[i], tid = tweet.id_str;
      if(this.listeningStream && !this._isTweetNew(tid)) {
        continue;
      }
      if(this._isTweetBlocked(tweet)) {
        continue;
      }
      newCount += 1;
      this.newTweetsCache.unshift(tweet);
      if(context.onFinish) {
        this.manager.readTweet(tid);
      } else {
        this.manager.unreadTweetsSet.add(tid);
      }
    }
    return newCount;
  },

  _isTweetNew: function(tweetId) {
    var newTweets = this.newTweetsCache,
        tweets = this.tweetsCache;

    for(var i = newTweets.length - 1; i >= 0; --i) {
      if(newTweets[i].id_str == tweetId) {
        return false;
      }
    }

    for(var i = tweets.length - 1; i >= 0; --i) {
      if(tweets[i].id_str == tweetId) {
        return false;
      }
    }

    return true;
  },

  _isTweetBlocked: function(tweet) {
    if(!tweet) {
      throw new TypeError("missing tweet");
    }
    if(!tweet.user) {
      return false;
    }
    const blockedIdsSet = this.manager.blockedIdsSet;
    const mutingIdsSet = this.manager.mutingIdsSet;
    const isRT = !!tweet.retweeted_status || false;
    if(blockedIdsSet.has(tweet.user.id_str) || (isRT && blockedIdsSet.has(tweet.retweeted_status.user.id_str))) {
      return true;
    }
    if(this.template.excludeBlockedMuted && (mutingIdsSet.has(tweet.user.id_str) || mutingIdsSet.has(tweet.retweeted_status.user.id_str))) {
      return true;
    }
    if(this.template.excludeRetweet && isRT) {
      return true;
    }
    return false;
  },

  _baseInit: function(timeout = 1000) {
    if(timeout >= (5 * 60 * 1000)) {
      timeout = (5 * 60 * 1000);
    }
    this.giveMeTweets((success = false) => {
      if(!success) {
        setTimeout(() => {
          if(this.firstRun && !this.timelineStopped && !this.currentCallback) {
            this._baseInit(timeout * 2);
          }
        }, timeout);
      }
    });
  },

  _cancelRequest: function() {
    this.canceledRequests.add(this.currentRequestId);
  },

  _nextRequestId: function() {
    this.currentRequestId += 1;
    return this.currentRequestId;
  },

  _isRequestCanceled: function(requestId) {
    return this.canceledRequests.delete(requestId);
  }
};
