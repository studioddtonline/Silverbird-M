function NotificationTimeline(timelineId, manager, template) {
  TweetsTimeline.call(this, timelineId, manager, template);
}

$.extend(NotificationTimeline.prototype, TweetsTimeline.prototype, {
  pushTweet: function(tweet) {
    var list = this.tweetsCache;
    var baseTime = Date.parse(tweet.created_at);
    var i = 0;
    for(var len = list.length; i < len; ++i) {
      var tweetTime = Date.parse(list[i].created_at);
      if(baseTime >= tweetTime) {
        break;
      }
    }
    if(i == list.length || list[i].id != tweet.id) {
      list.splice(i, 0, tweet);
    }
  },

  /* overridden */
  onStreamData: function(data) {
    return;
  },

  /* Private Methods */

  /* overridden */
  _cleanUpCache: function() {
    this.tweetsCache = [];
  },

  /* overridden */
  _makeOldTweetsRequestParams: function() {
    return {};
  },

  /* overridden */
  _makeNewTweetsRequestParams: function() {
    return {};
  },

  /* overridden */
  _syncOldTweets: function(tweets, context) {
    for(var i = 0, len = tweets.length; i < len; ++i) {
      this.pushTweet(tweets[i]);
    }
  },

  /* overridden */
  _shouldIncludeTemplate: function() {
    return true;
  },

  /* overridden */
  _handleStreamData: function(data) {
    this._cleanUpCache();
    this.newTweetsCache.unshift(data);
    this.manager.notifyNewTweets();
  },

  /* overridden */
  giveMeTweets: function(callback, syncNew, cacheOnly, keepCache, suggestedCount) {
    callback(this.tweetsCache, this.timelineId, this);
  }
});