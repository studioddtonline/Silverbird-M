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
    var sourceForEntities = {
      "id": data.source.id,
      "id_str": data.source.id_str,
      "screen_name": data.source.screen_name,
      "name": data.source.name,
      "indices": [
        0,
        data.source.screen_name.length
      ]
    };
    switch(data.event) {
      case 'block':
        console.log('You block ' + data.target.screen_name);
        console.log(data);
        return; // do not notification
      case 'unblock':
        console.log('You unblock ' + data.target.screen_name);
        console.log(data);
        return; // do not notification
      case 'favorite':
        if(data.source.id == this.manager.twitterBackend.userid()) {
          var favTimeline = this.manager.timelines[TimelineTemplate.FAVORITES];
          if(favTimeline) {
            favTimeline.pushTweet(data.target_object);
          }
          this.manager.eachTimeline(function(timeline) {
            var tweet = timeline.findTweet(data.target_object.id);
            if(tweet) tweet.favorited = true;
          }, true);
          return; // do not notification
        } else {
          notification.text = chrome.i18n.getMessage("n_favorite", [data.source.screen_name]);
          notification.entities.user_mentions.push(sourceForEntities);
          notification.in_favorite_to = data.target_object;
        }
        break;
      case 'unfavorite':
        if(data.source.id == this.manager.twitterBackend.userid()) {
          var favTimeline = this.manager.timelines[TimelineTemplate.FAVORITES];
          if(favTimeline) {
            favTimeline.removeFromCache(data.target_object.id);
          }
          this.manager.eachTimeline(function(timeline) {
            var tweet = timeline.findTweet(data.target_object.id);
            if(tweet) tweet.favorited = false;
          }, true);
          return; // do not notification
        } else {
          notification.text = chrome.i18n.getMessage("n_unfavorite", [data.source.screen_name]);
          notification.entities.user_mentions.push(sourceForEntities);
          notification.in_unfavorite_to = data.target_object;
        }
        break;
      case 'follow':
        if(data.source.id == this.manager.twitterBackend.userid()) {
          console.log('You follow ' + data.target.screen_name);
          console.log(data);
          return; // do not notification
        } else {
          notification.text = chrome.i18n.getMessage("n_follow", [data.source.screen_name]);
          notification.entities.user_mentions.push(sourceForEntities);
        }
        break;
      case 'unfollow':
        console.log('You unfollow ' + data.target.screen_name);
        console.log(data);
        return; // do not notification
      case 'list_created':
      case 'list_destroyed':
      case 'list_updated':
        //TODO list indexes may update here.
        return; // do not notification
      case 'list_member_added':
        if(data.source.id == this.manager.twitterBackend.userid()) {
          console.log('You add member for list ' + data.target_object.full_name);
          console.log(data);
          return; // do not notification
        } else {
          notification.text = chrome.i18n.getMessage("n_list_member_added", [data.source.screen_name]);
          notification.entities.user_mentions.push(sourceForEntities);
        }
        break;
      case 'list_member_removed':
        if(data.source.id == this.manager.twitterBackend.userid()) {
          console.log('You remove member for list ' + data.target_object.full_name);
          console.log(data);
          return; // do not notification
        } else {
          notification.text = chrome.i18n.getMessage("n_ist_member_removed", [data.source.screen_name]);
          notification.entities.user_mentions.push(sourceForEntities);
        }
        break;
      case 'list_user_subscribed':
        if(data.source.id == this.manager.twitterBackend.userid()) {
          console.log('You subscribe list ' + data.target_object.full_name);
          console.log(data);
          return; // do not notification
        } else {
          notification.text = chrome.i18n.getMessage("n_list_user_subscribed", [data.source.screen_name]);
          notification.entities.user_mentions.push(sourceForEntities);
        }
        break;
      case 'list_user_unsubscribed':
        if(data.source.id == this.manager.twitterBackend.userid()) {
          console.log('You unsubscribe list ' + data.target_object.full_name);
          console.log(data);
          return; // do not notification
        } else {
          notification.text = chrome.i18n.getMessage("n_list_user_unsubscribed", [data.source.screen_name]);
          notification.entities.user_mentions.push(sourceForEntities);
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
        console.log(data);
        return;
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