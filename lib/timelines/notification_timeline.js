"use strict";
class NotificationTimeline extends TweetsTimeline {
  constructor(timelineId, manager, template) {
    super(timelineId, manager, template);
  }
  pushTweet(tweet) {
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
  }
  /* overridden */
  onStreamData(data) {
    return;
  }
  /* Private Methods */
  /* overridden */
  _cleanUpCache() {
    this.tweetsCache = [];
  }
  /* overridden */
  _makeOldTweetsRequestParams() {
    return {};
  }
  /* overridden */
  _makeNewTweetsRequestParams() {
    return {};
  }
  /* overridden */
  _syncOldTweets(tweets, context) {
    for(var i = 0, len = tweets.length; i < len; ++i) {
      this.pushTweet(tweets[i]);
    }
  }
  /* overridden */
  _shouldIncludeTemplate() {
    return true;
  }
  /* overridden */
  _handleStreamData(data) {
    if(this.newTweetsCache[0] && data.text === this.newTweetsCache[0].text) {
      console.log("omitt duplicated notifications");
      return;
    }
    this._cleanUpCache();
    this.newTweetsCache.unshift(data);
    this.manager.notifyNewTweets();
  }
  /* overridden */
  giveMeTweets(callback, syncNew, cacheOnly, keepCache, suggestedCount) {
    callback(this.tweetsCache, this.timelineId, this);
  }
}

