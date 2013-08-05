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
  onStreamData: function(data) {
    if(!data.event) return;
    var notification = {
      "created_at": new Date().toUTCString(),
      "id": "Notification" + Date.now(),
      "id_str": "",
      "text": "",
      "source": "Silverbird M",
      "user":{
        "id":"1266336019",
        "id_str":"1266336019",
        "name":"Silverbird M",
        "screen_name":"Silverbird_M",
        "protected":false,
        "verified":false,
        "profile_image_url":"/img/icon128.png",
        "profile_image_url_https":"/img/icon128.png"
      },
      "entities":{
        "hashtags":[],
        "symbols":[],
        "urls":[],
        "user_mentions":[]
      }
    };
    switch(data.event) {
      case 'block':
        notification.text = 'block';
        break;
      case 'unblock':
        notification.text = 'unblock';
        break;
      case 'favorite':
        if(data.source.id == this.manager.twitterBackend.userid()) {
          notification.text = 'favorite: you are source';
        } else {
          notification.text = 'favorite: you are not source';
        }
        break;
      case 'unfavorite':
        if(data.source.id == this.manager.twitterBackend.userid()) {
          notification.text = 'unfavorite: you are source';
        } else {
          notification.text = 'unfavorite: you are not source';
        }
        break;
      case 'follow':
        if(data.source.id == this.manager.twitterBackend.userid()) {
          notification.text = 'follow: you are source';
        } else {
          notification.text = 'follow: you are not source';
        }
        break;
      case 'unfollow':
        notification.text = 'unfollow';
        break;
      case 'list_created':
        notification.text = 'list created';
        break;
      case 'list_destroyed':
        notification.text = 'list destroyed';
        break;
      case 'list_updated':
        notification.text = 'list updated';
        break;
      case 'list_member_added':
        if(data.source.id == this.manager.twitterBackend.userid()) {
          notification.text = 'list member added: you are source';
        } else {
          notification.text = 'list member added: you are not source';
        }
        break;
      case 'list_member_removed':
        if(data.source.id == this.manager.twitterBackend.userid()) {
          notification.text = 'list member removed: you are source';
        } else {
          notification.text = 'list member removed: you are not source';
        }
        break;
      case 'list_user_subscribed':
        if(data.source.id == this.manager.twitterBackend.userid()) {
          notification.text = 'subscribed: you are source';
        } else {
          notification.text = 'subscribed: you are not source';
        }
        break;
      case 'list_user_unsubscribed':
        if(data.source.id == this.manager.twitterBackend.userid()) {
          notification.text = 'unsubscribed: you are source';
        } else {
          notification.text = 'unsubscribed: you are not source';
        }
        break;
      case 'user_update':
        notification.text = 'user update';
        break;
      case 'api_warn':
        notification.text = 'api warn';
        break;
      case 'api_limit':
        notification.text = 'api limit';
        break;
      default:
        break;
    }
    this._handleStreamData(notification);
  },

  /* overridden */
  _handleStreamData: function(data) {
    this.newTweetsCache.unshift(data);
    this.manager.notifyNewTweets();
  },

  /* overridden */
  giveMeTweets: function(callback, syncNew, cacheOnly, keepCache, suggestedCount) {
    callback(this.tweetsCache, this.timelineId, this);
  }
});