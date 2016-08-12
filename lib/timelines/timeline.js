"use strict";
class TweetsTimeline {
  constructor(timelineId, manager, template) {
    if(!timelineId || !manager || !template) {
      throw new TypeError("missing arguments");
    }
    Object.defineProperties(this, {
      "timelineId": {
        get: () => {
          return timelineId;
        }
      },
      "manager": {
        get: () => {
          return manager;
        }
      },
      "template": {
        get: () => {
          return template;
        }
      },
      "shouldListenStream": {
        get: () => {
          return this.template.id == TimelineTemplate.HOME ||
                 this.template.id == TimelineTemplate.MENTIONS ||
                 this.template.id == TimelineTemplate.SENT_DMS ||
                 this.template.id == TimelineTemplate.RECEIVED_DMS;
        }
      },
      "timelineStopped": {
        value: false,
        writable: true
      },
      "shouldFetch": {
        get:() => {
          return !(this.timelineStopped || this.manager.suspend)
        }
      },
      "lastRequestedTime": {
        value: 0,
        writable: true
      }
    });

    this.tweetsCache = [];
    this.newTweetsCache = [];
    this.unreadNotified = new Set();

    this.currentError = null;
    this.currentCallback = null;
    this.currentScroll = 0;
    this.firstRun = true;
    this.timelinePath = this.template.templatePath || null;
    this.unifiedRunning = false;
    this.currentRequestId = 0;
    this.canceledRequests = new Set();
  }

  init() {
    this._baseInit();
  }

  remove(){
    this.template.visible = false;
    if(!this.template.includeInUnified) {
      this.killTimeline();
      return true;
    }
    return false;
  }

  getError() {
    return this.currentError;
  }

  killTimeline() {
    if(this.shouldListenStream) {
      StreamListener.unsubscribe(this);
    }
    this.timelineStopped = true;
  }

  giveMeTweets(callback, syncNew, cacheOnly, keepCache, suggestedCount) {
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
      this.currentCallback = callback;
      this._fetchNewTweets();
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
    let params = this._makeOldTweetsRequestParams(suggestedCount);
    let context = {
      usingMaxId: !!params.max_id,
      requestId: this._nextRequestId()
    };
    this._doBackendRequest(this.timelinePath, (success, tweets, status, context) => {
      this._onFetch(success, tweets, status, context);
    }, context, params);
  }

  mergeNewTweets() {
    this.tweetsCache = this.newTweetsCache.concat(this.tweetsCache);
    this.newTweetsCache = [];
    this.unreadNotified.clear();
  }

  newTweetsCount() {
    let unreadCount = 0;
    this.newTweetsCache.forEach((entry) => {
      if(!this.manager.isTweetRead(entry.id_str)) {
        ++unreadCount;
      }
    });
    return [this.newTweetsCache.length, unreadCount];
  }

  getNewUnreadTweets() {
    let unreadNewList = [];
    this.newTweetsCache.forEach((entry) => {
      if(!this.manager.isTweetRead(entry.id_str) && !this.unreadNotified.has(entry.id_str) && entry.user.id_str != this.manager.twitterBackend.userId) {
        unreadNewList.push(entry);
        this.unreadNotified.add(entry.id_str);
      }
    });
    return unreadNewList;
  }

  getNewUnreadIds() {
    let unreadNewIds = [];
    const userId = this.manager.twitterBackend.userId;
    this.newTweetsCache.forEach((entry) => {
      if(!this.manager.isTweetRead(entry.id_str) && entry.user.id_str != userId) {
        unreadNewIds.push(entry.id_str);
      }
    });
    return unreadNewIds;
  }

  removeFromCache(id) {
    this.tweetsCache = this.tweetsCache.filter((entry) => {
      if(entry.id_str !== id) {
        return true;
      }
    });
    this.newTweetsCache = this.newTweetsCache.filter((entry) => {
      if(entry.id_str !== id) {
        return true;
      }
    });
  }

  findTweet(id) {
    let ret = null;
    this.tweetsCache.forEach((entry) => {
      if(entry.id_str === id) {
        ret = entry;
      }
    });
    return ret;
  }

  getNewTweetsCache() {
    return this.newTweetsCache;
  }

  getTweetsCache() {
    return this.tweetsCache;
  }

  reset() {
    this.tweetsCache = [];
    this.newTweetsCache = [];
    this.unreadNotified.clear();
    this.firstRun = true;
    this.lastRequestedTime = 0;
  }

  onStreamData(data) {
    if(!!data.event || !!data.friends_str) {
      return;
    }
    if(this.shouldListenStream) {
      this._handleStreamData(data);
    }
  }

  purgeBlockedTweets() {
    this.newTweetsCache = this.newTweetsCache.filter((entry) => {
      return !this._isTweetBlocked(entry);
    });
    this.tweetsCache = this.tweetsCache.filter((entry) => {
      return !this._isTweetBlocked(entry);
    });
  }

  /* Private Methods */
  _handleStreamData(data) {
    let tweets;
    const userId = this.manager.twitterBackend.userId;
    if(!!data.delete) {
      return;
    } else if(!!data.text) {
      const selfTweet = (!!data.sender)? (data.sender.id_str === userId): (data.user.id_str === userId);
      if(!!data.sender) {
        if(this.template.id === TimelineTemplate.SENT_DMS && selfTweet) {
          tweets = [data];
        } else if(this.template.id === TimelineTemplate.RECEIVED_DMS && !selfTweet) {
          tweets = [data];
        }
      } else {
        let mentionStr = '@' + this.manager.twitterBackend.userName;
        if(data.in_reply_to_user_id_str === userId) {
          if(this.template.id === TimelineTemplate.MENTIONS) {
            tweets = [data];
          } else if(this.template.id === TimelineTemplate.HOME && selfTweet) {
            tweets = [data];
          }
        } else if(data.text.match(mentionStr)) {
          if(this.template.id === TimelineTemplate.MENTIONS && !selfTweet) {
            tweets = [data];
          } else if(this.template.id === TimelineTemplate.HOME && selfTweet) {
            tweets = [data];
          }
        } else if(this.template.id === TimelineTemplate.HOME) {
          tweets = [data];
        }
      }
    } else if(!!data.direct_message) {
      if(data.direct_message.sender.id_str === userId) {
        if(this.template.id === TimelineTemplate.SENT_DMS) {
          tweets = [data.direct_message];
        }
      } else {
        if(this.template.id === TimelineTemplate.RECEIVED_DMS) {
          tweets = [data.direct_message];
        }
      }
    }

    if(tweets) {
      let newCount = this._syncNewTweets(tweets, {});
      if(newCount > 0) {
        this.manager.notifyNewTweets();
      }
    }
  }

  _setError(status) {
    this.currentError = status;
  }

  _setTimelinePath(path) {
    this.timelinePath = path;
  }

  _onFetchNew(success, tweets, status, context) {
    if(!this.shouldFetch) {
      return;
    }
    if(this._isRequestCanceled(context.requestId)) {
      return;
    }
    if(!success) {
      this._setError(status);
      if(context.onFinish) {
        context.onFinish(0);
      }
      return;
    }
    this._setError(null);

    let newCount = this._syncNewTweets(tweets, context);

    if(newCount > 0) {
      this.manager.notifyNewTweets();
    }
    if(context.onFinish) {
      context.onFinish(newCount);
    }
  }

  _doBackendRequest(path, callback, context, params) {
    const now = Date.now();
    if(now - this.lastRequestedTime < 5 * 30 * 1000) {
      callback(true, [], undefined, context);
      return;
    }
    this.lastRequestedTime = now;
    this.manager.twitterBackend.timeline(path, callback, context, params);
  }

  _fetchNewTweets() {
    if(!this.shouldFetch) {
      return;
    }
    let context = {
      requestId: this._nextRequestId(),
      onFinish: (count) => {
        let tweetsCallback = this.currentCallback;
        this.currentCallback = null;

        this.mergeNewTweets();
        this.manager.updateAlert();
        this.giveMeTweets(tweetsCallback, false, true);
      }
    };
    let params = this._makeNewTweetsRequestParams();
    this._doBackendRequest(this.timelinePath, (success, tweets, status, context) => {
      this._onFetchNew(success, tweets, status, context);
    }, context, params);
  }

  _onFetch(success, tweets, status, context) {
    if(!this.shouldFetch || this._isRequestCanceled(context.requestId)) {
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
    let callback = this.currentCallback;
    this.currentCallback = null;
    try {
      callback(this.tweetsCache, this.timelineId, this);
    } catch(e) {
      /* ignoring exception, popup might be closed */
    }

    if(this.firstRun) {
      this.firstRun = false;
    }
  }

  _cleanUpCache() {
    let maxCachedTweets = OptionsBackend.get('max_cached_tweets') + 1;
    if(this.tweetsCache.length < maxCachedTweets) {
      return;
    } else {
      this.tweetsCache = this.tweetsCache.slice(0, maxCachedTweets);
    }
  }

  _makeOldTweetsRequestParams(suggestedCount) {
    if(!suggestedCount) {
      suggestedCount = OptionsBackend.get('tweets_per_page');
    }
    let params = {count: suggestedCount, per_page: suggestedCount};
    let maxId = null;
    if(this.tweetsCache.length > 0) {
      maxId = this.tweetsCache[this.tweetsCache.length - 1].id_str;
    }
    if(maxId) {
      params.max_id = maxId;
    }
    return params;
  }

  _makeNewTweetsRequestParams() {
    let lastId = null;
    if(this.newTweetsCache.length > 0) {
      lastId = this.newTweetsCache[0].id_str;
    } else if(this.tweetsCache.length > 0) {
      lastId = this.tweetsCache[0].id_str;
    }
    let params = {count: 200};
    if(lastId) {
      params.since_id = lastId;
    }
    return params;
  }

  _syncOldTweets(tweets = [], context) {
    const tweetsCacheLastId = (this.tweetsCache.length > 0) ? this.tweetsCache[this.tweetsCache.length - 1].id_str : -1;
    tweets.forEach((tweet) => {
      if(tweet.id_str !== tweetsCacheLastId && !this._isTweetBlocked(tweet)) {
        this.tweetsCache.push(tweet);
      }
    });
  }

  _syncNewTweets(tweets = [], context) {
    let newCount = 0;
    for(let i = tweets.length - 1; i >= 0; --i) {
      let tweet = tweets[i], tid = tweet.id_str;
      if(!this._isTweetNew(tid)) {
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
  }

  _isTweetNew(tweetId) {
    let newTweets = this.newTweetsCache, tweets = this.tweetsCache;
    for(let i = newTweets.length - 1; i >= 0; --i) {
      if(newTweets[i].id_str == tweetId) {
        return false;
      }
    }
    for(let i = tweets.length - 1; i >= 0; --i) {
      if(tweets[i].id_str == tweetId) {
        return false;
      }
    }
    return true;
  }

  _isTweetBlocked(tweet) {
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
  }

  _baseInit(timeout = 1000) {
    if(timeout >= (5 * 60 * 1000)) {
      timeout = (5 * 60 * 1000);
    }
    this.giveMeTweets((success = false) => {
      if(!success) {
        setTimeout(() => {
          if(this.firstRun && this.shouldFetch && !this.currentCallback) {
            this._baseInit(timeout * 2);
          }
        }, timeout);
      } else if(this.shouldListenStream) {
        StreamListener.subscribe(this.onStreamData, this);
      }
    });
  }

  _cancelRequest() {
    this.canceledRequests.add(this.currentRequestId);
  }

  _nextRequestId() {
    this.currentRequestId += 1;
    return this.currentRequestId;
  }

  _isRequestCanceled(requestId) {
    return this.canceledRequests.delete(requestId);
  }
}
