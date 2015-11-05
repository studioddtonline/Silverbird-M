"use strict";
class LikesTweetsTimeline extends TweetsTimeline {
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
  /* Private Methods */
  /* overridden */
  _makeOldTweetsRequestParams() {
    return {
      page: (this.tweetsCache.length / 20) + 1
    };
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
  _syncNewTweets(tweets, context) {
    var newCount = 0;
    for(var i = 0, len = tweets.length; i < len; ++i) {
      var j = 0;
      for(var leng = this.tweetsCache.length; j < leng; ++j) {
        if(tweets[i].id == this.tweetsCache[j].id) {
          break;
        }
      }
      if(j != this.tweetsCache.length) {
        break;
      }
      newCount += 1;
      this.newTweetsCache.push(tweets[i]);
    }
    return newCount;
  }
}
