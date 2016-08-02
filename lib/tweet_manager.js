"use strict";

function TweetManager() {
  this.unreadTweetsSet = new Set();
  this.retweetsMap = new Map();

  // Using an object instead of an array to take advantage of hash look-ups
  this.followingUsersIds = [];
  this.followingUsersNames = [];
  this.followingIdsMap = new Map();
  this.followersIdsSet = new Set();
  this.blockedIdsSet = new Set();
  this.mutingIdsSet = new Set();
  this.churnActionsMap = new Map([[Symbol.for("SilM"), Date.now()]]);

  this.composerData = new ComposerData();

  this.timelines = new Map();
  this.iconImg = null;

  this.timelineOrderData = Persistence.timelineOrder();
  this.oauthTokenData = Persistence.oauthTokenData();
  this.windowPositionData = Persistence.windowPosition();
  this.popupSizeData = Persistence.popupSize();

  TimelineTemplate.initTemplates(this);
  TimelineTemplate.eachTimelineTemplate((template) => {
    this.createTimelineTemplate(template, true);
  });

  this.orderedEachTimeline((timeline) => {
    this.currentTimelineId = timeline.timelineId;
    return false;
  });
  this.previousTimelineId = null;

  this.ttLocales = null;
  this.urlExpander = null;
  this.shortener = null;

  this.authenticated = false;
  this.ready = false;
  this.twitterConfiguration = {
    characters_reserved_per_media: 24,
    max_media_per_upload: 1,
    photo_size_limit: 3145728,
    short_url_length: 23,
    short_url_length_https: 23,
    tweet_text_character_limit: 140,
    dm_text_character_limit: 10000,
    once: false
  };

  Object.defineProperties(this, {
    [Symbol.for("setterForArrayMember")]: {
      value: (name, value, event) => {
        if(!Boolean(name && value) || !Array.isArray(value) || !this[Symbol.for(name)]) {
          throw new TypeError();
        }
        this[Symbol.for(name)] = value;
        if(event && event !== "") {
          this.dispatchPopupEvent(event, value);
        }
      }
    },
    [Symbol.for("lists")]: { // Array
      value: [],
      writable: true
    },
    "cachedLists": {
      get: () => {
        return this[Symbol.for("lists")] || [];
      },
      set: (lists) => {
        this[Symbol.for("setterForArrayMember")]("lists", lists, "updateLists");
      }
    },
    [Symbol.for("savedSearches")]: { // Array
      value: [],
      writable: true
    },
    "cachedSavedSearches": {
      get: () => {
        return this[Symbol.for("savedSearches")] || [];
      },
      set: (savedSearches) => {
        this[Symbol.for("setterForArrayMember")]("savedSearches", savedSearches, "updateSavedSearches");
      }
    },
    [Symbol.for("trendingTopics")]: { // Object or undefined
      value: undefined,
      writable: true
    },
    "cachedTrendingTopics": {
      get: () => {
        return this[Symbol.for("trendingTopics")] || {
          created_at: (new Date(0)).toUTCString(),
          trends: []
        };
      },
      set: (trendingTopics) => {
        if(!trendingTopics || !Array.isArray(trendingTopics.trends)) {
          this[Symbol.for("trendingTopics")] = undefined;
          return;
        }
        this.createNotificationForUpdateTrends(trendingTopics.trends, this.cachedTrendingTopics.trends);
        this[Symbol.for("trendingTopics")] = trendingTopics;
        this.dispatchPopupEvent("updateTrendingTopics", trendingTopics);
      }
    },
    "detachedWindowPosition": {
      get: () => {
        return this.windowPositionData.val() || {
          left: 100,
          top: 100,
          height: null,
          width: null
        };
      },
      set: (pos) => {
        this.windowPositionData.save(pos);
      }
    },
    "popupWindowSize": {
      get: () => {
        return this.popupSizeData.val();
      },
      set: (size) => {
        if(size !== null) {
          this.popupSizeData.save(size);
        } else {
          this.popupSizeData.remove();
        }
      }
    },
    [Symbol.for("suspend")]: { // boolean
      value: false,
      writable: true
    },
    "suspend": {
      get: () => {
        return this[Symbol.for("suspend")] || false;
      },
      set: (bool) => {
        if(this[Symbol.for("suspend")] !== !!bool) {
          this[Symbol.for("suspend")] = !!bool;
          this.dispatchPopupEvent("updateSuspend", this[Symbol.for("suspend")]);
        }
        if(this[Symbol.for("suspend")]) {
          this.disconnectStreaming();
          this.clearAlarms();
        } else {
          this.connectStreaming();
          this.setAlarms();
        }
      }
    }
  });

  this.twitterBackend = new TwitterLib(
    (function(self) {
      return function(success, data) {
        TimelineTemplate.initAfterAuthentication(self.twitterBackend.userName);
        self.authenticated = true;
        $.when(
          self.retrieveLists(true)
        )
        .done((function(self) {
          return function() {
            self.eachTimeline(function(timeline) {
              timeline.init();
            }, true);
            self.setAlarms();
            self.sendQueue = new SendQueue(self.twitterBackend);
            self.urlExpander = new Expander();
            self.shortener = new Shortener(OptionsBackend);
            self.connectStreaming();
            self.ready = true;
          }
        })(self))
        .fail(function(e) {
          alert(chrome.i18n.getMessage("a_initial_fetch_error"));
          self.restart();
        });
      };
    })(this),
    this.oauthTokenData,
    SecretKeys.twitter.consumerSecret,
    SecretKeys.twitter.consumerKey
  );
}

TweetManager.prototype = {

  disableDMS: function() {
    this.hideTimelineTemplate(TimelineTemplate.DMS);
    this.toggleUnified(TimelineTemplate.DMS, false);
    var views = chrome.extension.getViews({type: 'popup'});
    if(views) {
      for(var i = 0, len = views.length; i < len; ++i) {
        if(views[i].TimelineTab) {
          views[i].TimelineTab.removeTab(TimelineTemplate.DMS);
          break;
        }
      }
    }
    this.setWarning(chrome.i18n.getMessage("ue_disable_dm"));
  },

  showTimelineTemplate: function(timelineTemplateId, showOnly) {
    var template = TimelineTemplate.getTemplate(timelineTemplateId);
    template.visible = true;
    return this.createTimelineTemplate(template, showOnly);
  },

  hideTimelineTemplate: function(timelineTemplateId) {
    var template = TimelineTemplate.getTemplate(timelineTemplateId);
    template.visible = false;
    this.eachTimeline((function(self) {
      return function(timeline) {
        if(timeline.template.id == timelineTemplateId) {
          timeline.killTimeline();
          self.timelines.delete(timeline.timelineId);
        }
      };
    })(this), true);
  },

  createTimelineTemplate: function(template, showOnly) {
    var createdTimelines = [];
    var shownTimelines = [];
    if(template.multipleTimelines && !showOnly) {
      createdTimelines = [template.addTimeline()];
    } else {
      var createTimelines = true;
      this.eachTimeline(function(timeline) {
        if(timeline.template.id == template.id) {
          createTimelines = false;
          shownTimelines.push(timeline);
        }
      });
      if(createTimelines) {
        createdTimelines = template.createTimelines();
      }
    }
    for(var i = 0, len = createdTimelines.length; i < len; ++i) {
      var timeline = createdTimelines[i];
      this.timelines.set(timeline.timelineId, timeline);
      if(this.authenticated) {
        timeline.init();
      }
      shownTimelines.push(timeline);
    }
    return shownTimelines;
  },

  hideTimeline: function(timelineId){
    const timeline = this.getTimeline(timelineId);
    if(!timeline) {
      return;
    }
    if(!!timeline.remove()) {
      this.timelines.delete(timelineId);
    }
  },

  toggleUnified: function(templateId, forcedState) {
    var template = TimelineTemplate.getTemplate(templateId);
    var newState = !template.includeInUnified;
    if(forcedState !== undefined) {
      newState = forcedState;
    }
    template.includeInUnified = newState;
    if(template.multipleTimelines || template.visible) {
      return;
    }
    if(template.includeInUnified) {
      this.createTimelineTemplate(template);
    } else {
      this.hideTimeline(template.id);
    }
  },

  toggleNotify: function(templateId) {
    var template = TimelineTemplate.getTemplate(templateId);
    var newState = !template.showNotification;
    template.showNotification = newState;
  },

  setWarning: function(msg) {
    if(OptionsBackend.get('unified_visible') && OptionsBackend.get('notification_include_unified')) {
      this.onStreamData({
        "created_at": new Date().toUTCString(),
        "warning":{
          "code": "SET_WARNING",
          "message": msg
        }
      });
    } else {
      this.dispatchPopupEvent("updateWarningMessage", msg);
    }
  },

  retrieveBlockedUsers: function(D, cursor) {
    var d;
    if(!D) {
      d = new $.Deferred();
    } else {
      d = D;
    }
    if(!cursor) {
      this.blockedIdsSet.clear();
      cursor = "-1";
    }
    this.twitterBackend.blockedUsers((function(self, deferred) {
      return function(success, data, status) {
        if(!success) {
          return deferred.reject();
        }
        var blockedUsers = data.users;
        for(var i = 0, len = blockedUsers.length; i < len; ++i) {
          var user = blockedUsers[i];
          self.blockedIdsSet.add(user.id_str);
        }
        if(data.next_cursor_str !== '0') {
          self.retrieveBlockedUsers(deferred, data.next_cursor_str);
          return deferred.notify();
        } else {
          self.eachTimeline(function(timeline) {
            timeline.purgeBlockedTweets();
          }, true);
          return deferred.resolve();
        }
      };
    })(this, d), cursor);
    if(!D) {
      return d.promise();
    } else {
      return d.notify();
    }
  },

  eachTimeline: function(callback, includeHidden) {
    for(let [tId, timeline] of this.timelines.entries()) {
      if(!includeHidden && (!timeline.template.visible || timeline.template.hiddenTemplate)) {
        continue;
      }
      if(callback.call(tId, timeline) === false) {
        break;
      }
    }
  },

  /* Lists timelines won't be included as they'll only be shown later */
  orderedEachTimeline: function(callback) {
    var retList = [], tId, timeline;
    for([tId, timeline] of this.timelines.entries()) {
      var orderedPos = this.getTimelinePosition(tId);
      if(orderedPos == -1) {
        orderedPos = retList.length;
      }
      if(retList[orderedPos]) {
        retList.splice(orderedPos, 0, tId);
      } else {
        retList[orderedPos] = tId;
      }
    }
    for(var i = 0, len = retList.length; i < len; ++i) {
      tId = retList[i];
      if(tId) {
        timeline = this.getTimeline(tId);
        if(timeline.template.visible && !timeline.template.hiddenTemplate) {
          var ret = callback.call(tId, timeline);
          if(ret === false) {
            break;
          }
        }
      }
    }
  },

  getTimelinePosition: function(timelineId) {
    if(!this.timelineOrderCache) {
      var storedOrder = this.timelineOrderData.val();
      if(storedOrder) {
        this.timelineOrderCache = JSON.parse(storedOrder);
      } else {
        this.timelineOrderCache = [];
      }
    }
    for(var i = 0, len = this.timelineOrderCache.length; i < len; ++i) {
      if(timelineId == this.timelineOrderCache[i]) {
        return i;
      }
    }
    return -1;
  },

  setTimelineOrder: function(sortedTimelinesArray) {
    this.timelineOrderCache = sortedTimelinesArray.slice(0);
    this.timelineOrderData.save(JSON.stringify(sortedTimelinesArray));
  },

  updateAlert: function() {
    var unreadNewTweets = [], totalUnreadNewIds = [];
    this.eachTimeline(function(timeline) {
      if(timeline.template.showNotification) {
        unreadNewTweets = unreadNewTweets.concat(timeline.getNewUnreadTweets());
      }
      if(OptionsBackend.get('badge_only_for_notification') && !timeline.template.showNotification) return;
      totalUnreadNewIds = totalUnreadNewIds.concat(timeline.getNewUnreadIds());
    }, true);
    var uniqueCounter = new Set();
    totalUnreadNewIds.forEach((value) => {
      if(!uniqueCounter.has(value)) {
        uniqueCounter.add(value);
      }
    });
    this.badgeIcon(uniqueCounter.size);
    if(OptionsBackend.get('tweets_notification_style') !== 'never') {
      this.showTweetsNotifications(unreadNewTweets);
    }
  },

  badgeIcon: function(num = 0) {
    if(num === 0) {
      chrome.browserAction.setTitle({title: "Silverbird M"});
      chrome.browserAction.setBadgeText({text: ''});
    } else {
      const tweet_string = num > 1 ? 'newtweets_plural' : 'newtweets_singular';
      const title = chrome.i18n.getMessage("newTweets", [num, chrome.i18n.getMessage(tweet_string)]);
      chrome.browserAction.setTitle({title: title});
      chrome.browserAction.setBadgeText({text: '' + num});
    }
  },

  showTweetsNotifications: function(tweetsToNotify) {
    if(!tweetsToNotify || tweetsToNotify.length === 0) return;
    try {
      var fadeoutTime = OptionsBackend.get('notification_fade_timeout') || 4000;
      for(let [index, tweet] of tweetsToNotify.entries()) {
        if(tweet.retweeted_status) {
          tweet = tweet.retweeted_status;
        }
        if(!tweet.text || tweet.text === "") {
          continue;
        }
        let notificationId = chrome.runtime.id + tweet.id_str;
        chrome.notifications.getAll((notifications) => {
          if(!notifications[notificationId]) {
            (new Promise((resolve, reject) => {
              setTimeout(resolve, fadeoutTime, notificationId);
              chrome.notifications.create(notificationId, {
                type: 'basic',
                iconUrl: tweet.user.profile_image_url.replace(/_normal\.(jpe?g|gif|png|bmp)$/, '.$1'),
                title: tweet.user.name + ' @' + tweet.user.screen_name,
                message: tweet.text.replace(/\r|\r?\n/g, "\n")
              }, (nId) => {
                // no behavior
              });
            })).then((nId) => {
              chrome.notifications.getAll((notifications) => {
                if(notifications[nId]) {
                  chrome.notifications.clear(nId, (wasCleared) => {
                    // no behavior
                  });
                }
              });
            }).catch(function(e) {
              // no behavior
            });
          }
        });
      }
    } catch(e) {
      console.warn(e);
      OptionsBackend.saveOption('tweets_notification_style', 'never');
    }
  },

  readTweet: function(id) {
    this.unreadTweetsSet.delete(id);
  },

  isTweetRead: function(id) {
    return !this.unreadTweetsSet.has(id);
  },

  isRetweet: function(tweet) {
    var tweetId = tweet.id;
    if(tweet.retweeted_status) {
      tweetId = tweet.retweeted_status.id;
    }
    return this.retweetsMap.has(tweetId) || tweet.current_user_retweet;
  },

  notifyNewTweets: function() {
    this.eachTimeline((timeline) => {
      const [count, unreadCount] = timeline.newTweetsCount();
      this.dispatchPopupEvent("updateTimeline", {
        timelineId: timeline.timelineId,
        count: count,
        unreadCount: unreadCount
      });
    });
    this.updateAlert();
  },

  enqueueTweet: function(msg, replyId, replyUser, isDM, mediaIds) {
    this.sendQueue.enqueueTweet(msg, replyId, replyUser, isDM, mediaIds);
  },

  postRetweet: function(callback, id) {
    if(this.isChurnAction(id)) {
      return callback(false, {churn: true});
    }
    this.churnActionsMap.set(id, Date.now());
    return this.twitterBackend.retweet((function(self) {
      return function(success, data, status) {
        if(success) {
          self.retweetsMap.set(id, data.id);
        } else {
          self.churnActionsMap.delete(id);
        }
        callback(success, data, status);
      };
    })(this), id);
  },

  getInReplyToTweet: function(callback, tweet) {
    if(tweet.inReplyToTweet) {
      callback(true, tweet.inReplyToTweet);
      return;
    }
    this.twitterBackend.showTweet((function(self) {
      return function(success, data, status) {
        if(success) {
          tweet.inReplyToTweet = data;
        } else {
          data = self.getDummyTweet();
          data.id = data.id_str = tweet.in_reply_to_status_id;
          switch(status) {
            case 144:
            case 179:
              data.text = chrome.i18n.getMessage("ue_expand_in_reply");
              break;
            default:
              console.log(status);
              data.text = chrome.i18n.getMessage("undefined_message");
              break;
          }
          success = true;
          status = "success";
          tweet.inReplyToTweet = data;
        }
        callback(success, data, status);
      };
    })(this), tweet.in_reply_to_status_id);
  },

  destroy: function(callback, tweetTimelineId, id) {
    var closure_destroy = function(self) {
      return function(success, data, status) {
        if(success) {
          self.eachTimeline(function(timeline) {
            timeline.removeFromCache(id);
          }, true);
        }
        callback(success, data, status);
      };
    };
    if(tweetTimelineId == TimelineTemplate.RECEIVED_DMS || tweetTimelineId == TimelineTemplate.SENT_DMS) {
      return this.twitterBackend.destroyDM(closure_destroy(this), id);
    } else {
      return this.twitterBackend.destroy(closure_destroy(this), id);
    }
  },

  createLike: function(callback, id) {
    if(this.isChurnAction(id)) {
      return callback(false, {churn: true});
    }
    return this.twitterBackend.createLike((function(self) {
      return function(success, data, status) {
        if(success) {
          var favTimeline = self.getTimeline(TimelineTemplate.LIKES);
          if(favTimeline) {
            favTimeline.pushTweet(data);
          }
          self.eachTimeline(function(timeline) {
            var tweet = timeline.findTweet(id);
            if(tweet) {
              tweet.favorited = true;
            }
          }, true);
        }
        callback(success, data, status);
      };
    })(this), id);
  },

  destroyLike: function(callback, id) {
    if(this.isChurnAction(id)) {
      return callback(false, {churn: true});
    }
    this.churnActionsMap.set(id, Date.now());
    return this.twitterBackend.destroyLike((function(self) {
      return function(success, data, status) {
        if(success) {
          var favTimeline = self.getTimeline(TimelineTemplate.LIKES);
          if(favTimeline) {
            favTimeline.removeFromCache(id);
          }
          self.eachTimeline(function(timeline) {
            var tweet = timeline.findTweet(id);
            if(tweet) {
              tweet.favorited = false;
            }
          }, true);
        } else {
          self.churnActionsMap.delete(id);
        }
        callback(success, data, status);
      }
    })(this), id);
  },

  retrieveLists: function(force) {
    var d = new $.Deferred();
    var newLists = force ? null: this.cachedLists;
    this.twitterBackend.lists((function(self, deferred) {
      return function(success, data, status) {
        if(success && data) {
          newLists = data.lists || [];
        } else {
          newLists = self.cachedLists || [];
          return deferred.reject();
        }
        self.twitterBackend.subs((function(self, deferred) {
          return function(success, data, status) {
            if(success && data) {
              self.cachedLists = newLists.concat(data.lists || []).map((list) => {
                let result = Object.create(null);
                for(let prop in list) {
                  if(list.hasOwnProperty(prop) && prop !== "user") {
                    result[prop] = list[prop];
                  }
                }
                return result;
              });
              return deferred.resolve();
            }
            return deferred.reject();
          };
        })(self, deferred));
        return deferred.notify();
      };
    })(this, d));
    return d.promise();
  },

  changeSearch: function(timelineId, searchQuery) {
    var timeline = this.getTimeline(timelineId);
    if(!timeline) {
      return false;
    }
    return timeline.changeSearchQuery(searchQuery);
  },

  getSearchQuery: function(timelineId) {
    var timeline = this.getTimeline(timelineId);
    if(!timeline) {
      return null;
    }
    return timeline.getSearchQuery();
  },

  changeList: function(timelineId, listData) {
    var timeline = this.getTimeline(timelineId);
    if(!timeline) return null;
    timeline.changeList(listData);
    return undefined;
  },

  getListId: function(timelineId) {
    var timeline = this.getTimeline(timelineId || this.currentTimelineId);
    if(!timeline) return null;
    var listId = timeline.getListId();
    if(listId && this.cachedLists) {
      // Check if the listId really exists
      for(var i = 0, len = this.cachedLists.length; i < len; ++i) {
        if(this.cachedLists[i].id_str == listId) {
          return listId;
        } else if(this.cachedLists[i].uri == listId) { // migration
          return this.cachedLists[i].id_str;
        }
      }
    }
    return null;
  },

  getList: function(timelineId) {
    var timeline = this.getTimeline(timelineId || this.currentTimelineId);
    if(!timeline) return null;
    var listId = timeline.getListId();
    if(listId && this.cachedLists) {
      for(var i = 0, len = this.cachedLists.length; i < len; ++i) {
        if(this.cachedLists[i].id_str == listId) {
          return this.cachedLists[i];
        }
      }
    }
    return null;
  },

  giveMeTweets: function(timelineId, callback, syncNew, cacheOnly) {
    var timeline = this.getTimeline(timelineId);
    if(!timeline) {
      callback([], timelineId);
      return undefined;
    }
    var originalCallback = callback;
    if(syncNew && timeline.template.includeInUnified) {
      callback = function(self) {
        return function(tweets, timelineId) {
          originalCallback(tweets, timelineId);
          self.getTimeline(TimelineTemplate.UNIFIED).giveMeTweets(originalCallback, false, true);
        };
      };
    } else {
      callback = function(self) {
        return originalCallback;
      };
    }
    return timeline.giveMeTweets(callback(this), syncNew, cacheOnly);
  },

  newTweetsCount: function(timelineId) {
    return this.getTimeline(timelineId).newTweetsCount();
  },

  updateNewTweets: function() {
    var currentTimeline = this.getTimeline(this.currentTimelineId);
    if(currentTimeline.template.id == TimelineTemplate.LIKES) {
      var newTweets = this.getTimeline(this.currentTimelineId).getNewTweetsCache();
      for(var i = 0, len = newTweets.length; i < len; ++i) {
        var id = newTweets[i].id;
        this.eachTimeline(function(timeline) {
          var tweet = timeline.findTweet(id);
          if(tweet) {
            tweet.favorited = true;
          }
        }, true);
      }
    }
    currentTimeline.updateNewTweets();
    this.updateAlert();
  },

  getCurrentTimeline: function() {
    var currentTimeline = this.getTimeline(this.currentTimelineId);
    if (!currentTimeline) {
      this.orderedEachTimeline((function(self) {
        return function(timeline) {
          currentTimeline = self.currentTimelineId = timeline.timelineId;
          return false;
        };
      })(this));
    }
    return currentTimeline;
  },

  getTimeline: function(timelineId) {
    return this.timelines.get(timelineId);
  },

  currentError: function() {
    return this.getTimeline(this.currentTimelineId).getError();
  },

  connectStreaming: function() {
    if(StreamListener.getStatus() !== "disallow" && !this.suspend) {
      StreamListener.start(this.twitterBackend);
      StreamListener.subscribe(this.onStreamData, this);
      this.dispatchPopupEvent("updateStreamingStatus");
    }
  },

  disconnectStreaming: function() {
    StreamListener.unsubscribe(this);
    StreamListener.disconnect(true);
    this.onStreamData({event: 'disconnected'});
    this.dispatchPopupEvent("updateStreamingStatus");
  },

  stopAll: function() {
    this.eachTimeline(function(timeline) {
      timeline.killTimeline();
    }, true);
    this.disconnectStreaming();
    this.clearAlarms();
  },

  signout: function() {
    this.oauthTokenData.remove();
    this.stopAll();
    chrome.browserAction.setBadgeText({text: ''});
    TweetManager.instance = new TweetManager();
    var views = chrome.extension.getViews({type: 'popup'});
    if(views) {
      for(var i = 0, len = views.length; i < len; ++i) {
        views[i].close();
      }
    }
    return (views && views.length > 0);
  },

  signoutAndReauthenticate: function(attribute) {
    if(this.signout()) {
      TweetManager.instance.twitterBackend.startAuthentication();
    }
  },

  restart: function() {
    this.stopAll();
    chrome.runtime.reload();
  },

  onStreamData: function(data) {
    if(!data) return;
    var context = this.getDummyTweet();
    if(data.created_at) {
      context.created_at = data.created_at
    }
    if(data.delete) {
      const tweetId = (!!data.delete.direct_message)? data.delete.direct_message.id_str: data.delete.status.id_str;
      this.eachTimeline((timeline) => {
        timeline.removeFromCache(tweetId);
      }, true);
      return;
    }
    if(data.scrub_geo) {
      //DONOT behavior
      return;
    }
    if(data.limit) {
      //DONOT behavior
      return;
    }
    if(data.status_withheld) {
      //DONOT behavior
      return;
    }
    if(data.user_withheld) {
      //DONOT behavior
      return;
    }
    if(data.disconnect || data.event === StreamListener.events.DISCONNECTED) {
      this.dispatchPopupEvent("updateStreamingStatus");
      return;
    }
    if(data.event === StreamListener.events.CONNECTED) {
      this.dispatchPopupEvent("updateStreamingStatus");
      return;
    }
    if(data.warning) {
      switch(data.warning.code) {
        case 'FALLING_BEHIND':
          return;
        case 'FOLLOWS_OVER_LIMIT':
          OptionsBackend.saveOption('use_streaming_api', false);
          context.text = chrome.i18n.getMessage("ue_follows_over_limit");
          break;
        case 'SET_WARNING':
          context.text = data.warning.message;
          break;
        default:
          console.log(data);
          return;
      }
    }
    if(data.friends_str || data.friends) {
      //TODO users/lookup may call
      return;
    }
    if(data.event) {
      var entityForUserMentions = {};
      if(data.source && data.source.id_str && data.source.screen_name) {
        entityForUserMentions = {
          "id": data.source.id_str,
          "id_str": data.source.id_str,
          "screen_name": data.source.screen_name,
          "name": data.source.name,
          "indices": [
            0, // static messages
            data.source.screen_name.length
          ]
        };
      }
      var fixingEntities = function(targetString, searchString, entityForUserMentions) {
        if(entityForUserMentions.indices) {
          var index = targetString.indexOf(searchString);
          if(entityForUserMentions.indices[0] !== index) {
            entityForUserMentions.indices[0] = index;
            entityForUserMentions.indices[1] = index + searchString.length;
          }
        }
        return entityForUserMentions;
      };
      switch(data.event) {
        case 'access_revoked':
          this.signout();
          return; // do not notification
        case 'block':
          this._removeUser({unfollow: true, blocked: true, userData: data.target})
          return; // do not notification
        case 'unblock':
          this.blockedIdsSet.delete(data.target.id_str);
          this.resetTimeline(TimelineTemplate.HOME);
          this.resetTimeline(TimelineTemplate.UNIFIED);
          return; // do not notification
        case 'like':
        case 'favorite':
          if(data.source.id_str == this.twitterBackend.userId) {
            var favTimeline = this.getTimeline(TimelineTemplate.LIKES);
            if(favTimeline) {
              favTimeline.pushTweet(data.target_object);
            }
            this.eachTimeline(function(timeline) {
              var tweet = timeline.findTweet(data.target_object.id_str);
              if(tweet) {
                tweet.favorited = true;
              }
            }, true);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_like", [data.source.screen_name]);
            context.entities.user_mentions.push(fixingEntities(context.text, data.source.screen_name, entityForUserMentions));
            if(data.target_object) {
              var likeUrl = `https://twitter.com/${data.target.screen_name}/status/${data.target_object.id_str}`;
              var likeDisplayUrl = `${likeUrl.substr(8, 26)}${String.fromCharCode(8230)}`;
              context.text += ` ${likeDisplayUrl}`;
              var index = context.text.indexOf(likeDisplayUrl);
              var likeEntitiy = {
                url: likeUrl,
                display_url: likeDisplayUrl,
                expanded_url: likeUrl,
                indices: [index, (index + likeDisplayUrl.length)]
              };
              context.entities.urls.push(likeEntitiy);
              context.quoted_status = data.target_object;
              context.quoted_status_id_str = data.target_object.id_str;
            }
          }
          break;
        case 'unLike':
        case 'unfavorite':
          if(data.source.id_str == this.twitterBackend.userId) {
            var favTimeline = this.getTimeline(TimelineTemplate.LIKES);
            if(favTimeline) {
              favTimeline.removeFromCache(data.target_object.id_str);
            }
            this.eachTimeline(function(timeline) {
              var tweet = timeline.findTweet(data.target_object.id_str);
              if(tweet) {
                tweet.favorited = false;
              }
            }, true);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_unlike", [data.source.screen_name]);
            context.entities.user_mentions.push(fixingEntities(context.text, data.source.screen_name, entityForUserMentions));
            if(data.target_object) {
              var unLikeUrl = `https://twitter.com/${data.target.screen_name}/status/${data.target_object.id_str}`;
              var unLikeDisplayUrl = `${unLikeUrl.substr(8, 26)}${String.fromCharCode(8230)}`;
              context.text += ` ${unLikeDisplayUrl}`;
              var index = context.text.indexOf(unLikeDisplayUrl);
              var unLikeEntitiy = {
                url: unLikeUrl,
                display_url: unLikeDisplayUrl,
                expanded_url: unLikeUrl,
                indices: [index, (index + unLikeDisplayUrl.length)]
              };
              context.entities.urls.push(unLikeEntitiy);
              context.quoted_status = data.target_object;
              context.quoted_status_id_str = data.target_object.id_str;
            }
          }
          break;
        case 'follow':
          if(data.source.id_str == this.twitterBackend.userId) {
            if(!this.followingIdsMap.has(data.target.id_str)) {
              this._addFollowingUser(data.target);
            }
            return; // do not notification
          } else {
            this.followersIdsSet.add(data.source.id_str);
            context.text = chrome.i18n.getMessage("n_follow", [data.source.screen_name]);
            context.entities.user_mentions.push(fixingEntities(context.text, data.source.screen_name, entityForUserMentions));
          }
          break;
        case 'unfollow':
          if(this.followingIdsMap.has(data.target.id_str)) {
            this._removeUser({unfollow: true, blocked: false, userData: data.target});
          }
          return; // do not notification
        case 'list_created':
        case 'list_destroyed':
        case 'list_updated':
          this.retrieveLists(true);
          return; // do not notification
        case 'list_member_added':
          if(data.source.id_str == this.twitterBackend.userId) {
            console.log('You add member for list ' + data.target_object.full_name);
            console.log(data);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_list_member_added", [data.source.screen_name]);
            context.entities.user_mentions.push(fixingEntities(context.text, data.source.screen_name, entityForUserMentions));
          }
          break;
        case 'list_member_removed':
          if(data.source.id_str == this.twitterBackend.userId) {
            console.log('You remove member for list ' + data.target_object.full_name);
            console.log(data);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_ist_member_removed", [data.source.screen_name]);
            context.entities.user_mentions.push(fixingEntities(context.text, data.source.screen_name, entityForUserMentions));
          }
          break;
        case 'list_user_subscribed':
          if(data.source.id_str == this.twitterBackend.userId) {
            console.log('You subscribe list ' + data.target_object.full_name);
            console.log(data);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_list_user_subscribed", [data.source.screen_name]);
            context.entities.user_mentions.push(fixingEntities(context.text, data.source.screen_name, entityForUserMentions));
          }
          break;
        case 'list_user_unsubscribed':
          if(data.source.id_str == this.twitterBackend.userId) {
            console.log('You unsubscribe list ' + data.target_object.full_name);
            console.log(data);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_list_user_unsubscribed", [data.source.screen_name]);
            context.entities.user_mentions.push(fixingEntities(context.text, data.source.screen_name, entityForUserMentions));
          }
          break;
        case 'user_update':
          console.log('Your profile is updated');
          console.log(data);
          return; // do not notification
          break;
        case 'retweeted_retweet':
          console.log('Your retweet is retweeted');
          console.log(data);
          return; // do not notification
          break;
        case 'quoted_tweet':
          if(data.source.id_str == this.twitterBackend.userId) {
            console.log('You quote ' + data.target_object.id_str);
            console.log(data);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_quoted_tweet", [data.source.screen_name]);
            context.entities.user_mentions.push(fixingEntities(context.text, data.source.screen_name, entityForUserMentions));
            if(data.target_object && Array.isArray(data.target_object.entities.urls)) {
              var quotedEntry = data.target_object.entities.urls[data.target_object.entities.urls.length - 1] || {};
              if(quotedEntry.url && quotedEntry.display_url && quotedEntry.expanded_url) {
                context.text += ` ${quotedEntry.url}`;
                var index = context.text.indexOf(quotedEntry.url);
                quotedEntry.indices[0] = index;
                quotedEntry.indices[1] = index + quotedEntry.url.length;
                context.entities.urls.push(quotedEntry);
                context.quoted_status = data.target_object.quoted_status;
                context.quoted_status_id_str = data.target_object.quoted_status_id_str;
              }
            }
          }
          break;
        case 'update_trends':
          context = data;
          break;
        case 'likes_retweet':
        case 'favorited_retweet':
          console.log('Your retweet is likes');
          console.log(data);
          return; // do not notification
          break;
        default:
          console.log(data);
          return;
      }
    }
    if(context.text !== '' && OptionsBackend.get('unified_visible') && OptionsBackend.get('notification_include_unified')) {
      var notification = this.getTimeline(TimelineTemplate.NOTIFICATION);
      if(notification) notification._handleStreamData(context);
    }
  },

  retrieveFollowingUsers: function(D, cursor) {
    var d;
    if(!D) {
      d = new $.Deferred();
    } else {
      d = D;
    }
    if(!cursor) {
      this.followingUsersIds = [];
      cursor = "-1";
    }
    this.twitterBackend.friendsIds((function(self, deferred) {
      return function(success, data, status) {
        if(!success) {
          return deferred.reject();
        }
        self.followingUsersIds = self.followingUsersIds.concat(data.ids || []);
        if(data.next_cursor_str !== '0') {
          self.retrieveFollowingUsers(deferred, data.next_cursor_str);
          return deferred.notify();
        } else if(self.followingUsersIds.length > 0) {
          self.lookupFollowingUsers(deferred);
          return deferred.notify();
        } else {
          return deferred.resolve();
        }
      };
    })(this, d), cursor);
    if(!D) {
      return d.promise();
    } else {
      return d.notify();
    }
  },

  lookupFollowingUsers: function(D, lookupTargets) {
    var d;
    if(!D) {
      d = new $.Deferred();
    } else {
      d = D;
    }
    if(!lookupTargets) {
      this.followingIdsMap.clear();
      this.followingUsersNames = [];
      lookupTargets = [];
      for(var i = 0, len = Math.ceil(this.followingUsersIds.length / 100.0); i < len; ++i) {
        var index = i * 100;
        lookupTargets.push(this.followingUsersIds.slice(index, index + 100));
      }
    }
    this.twitterBackend.lookupUsers((function(self, deferred) {
      return function(success, data, status, context) {
        if(!success) {
          return deferred.reject();
        }
        for(var i = 0, len = data.length; i < len; ++i) {
          var user = data[i];
          self.followingIdsMap.set(user.id_str, user);
          self.followingUsersNames.push(user.screen_name);
        }
        self.followingUsersNames.sort(function(a, b) {
          return a.toUpperCase().localeCompare(b.toUpperCase());
        });
        if(lookupTargets.length > 0) {
          self.lookupFollowingUsers(deferred, lookupTargets);
          return deferred.notify();
        } else {
          return deferred.resolve();
        }
      };
    })(this, d), lookupTargets.shift());
    if(!D) {
      return d.promise();
    } else {
      return d.notify();
    }
  },

  getFollowingUsers: function() {
    return this.followingUsersNames;
  },

  getFollowingIdsMap: function() {
    return this.followingIdsMap;
  },

  resetTimeline: function(timelineId) {
    var timeline = this.getTimeline(timelineId);
    if(timeline) {
      timeline.reset();
    }
  },

  followUser: function(callback, userId) {
    if(this.isChurnAction(userId)) {
      return callback(false, {churn: true});
    }
    this.churnActionsMap.set(userId, Date.now());
    this.twitterBackend.follow((function(self) {
      return function(success, userData) {
        if(success) {
          self._addFollowingUser(userData);
        } else {
          self.churnActionsMap.delete(userId);
        }
        callback(success, userData);
      }
    })(this), userId);
  },

  _removeUser: function(context) {
    if(context.unfollow) {
      // remove id_str from followingIdsMap and followingUsersIds
      this.followingIdsMap.delete(context.userData.id_str);
      var position = -1;
      if(Array.isArray(this.followingUsersIds)) {
        position = this.followingUsersIds.indexOf(context.userData.id_str);
      }
      if(position > -1) {
        this.followingUsersIds.splice(position, 1);
      }
      // remove screen_name from followingUsersNames
      var position = -1;
      if(Array.isArray(this.followingUsersNames)) {
        position = this.followingUsersNames.indexOf(context.userData.screen_name);
      }
      if(position > -1) {
        this.followingUsersNames.splice(position, 1);
      }
    }
    if(context.muting) {
      this.mutingIdsSet.add(context.userData.id_str);
    }
    if(context.blocked) {
      this.blockedIdsSet.add(context.userData.id_str);
      this.eachTimeline(function(timeline) {
        timeline.purgeBlockedTweets();
      }, true);
    }
    this.resetTimeline(TimelineTemplate.HOME);
    this.resetTimeline(TimelineTemplate.UNIFIED);
  },

  unfollowUser: function(callback, userId) {
    if(this.isChurnAction(userId)) {
      return callback(false, {churn: true});
    }
    this.churnActionsMap.set(userId, Date.now());
    this.twitterBackend.unfollow((function(self) {
      return function(success, userData) {
        if(success) {
          self._removeUser({unfollow: true, blocked: false, muting: null, userData: userData});
        } else {
          self.churnActionsMap.delete(userId);
        }
        callback(success, userData);
      };
    })(this), userId);
  },

  blockUser: function(callback, userId) {
    if(this.isChurnAction(userId)) {
      return callback(false, {churn: true});
    }
    this.churnActionsMap.set(userId, Date.now());
    this.twitterBackend.block((function(self) {
      return function(success, userData) {
        if(success) {
          self._removeUser({unfollow: true, blocked: true, muting: null, userData: userData});
        } else {
          self.churnActionsMap.delete(userId);
        }
        callback(success, userData);
      };
    })(this), userId);
  },

  reportUser: function(callback, userId) {
    if(this.isChurnAction(userId)) {
      return callback(false, {churn: true});
    }
    this.churnActionsMap.set(userId, Date.now());
    this.twitterBackend.report((function(self) {
      return function(success, userData) {
        if(success) {
          self._removeUser({unfollow: true, blocked: true, muting: null, userData: userData});
        } else {
          self.churnActionsMap.delete(userId);
        }
        callback(success, userData);
      };
    })(this), userId);
  },

  retrieveTrendingTopics: function() {
    if(this.cachedTrendingTopics
    && (Date.now() - (new Date(this.cachedTrendingTopics.created_at)).getTime()) < 90 * 1000) {
      return;
    }
    var woeid = OptionsBackend.get('trending_topics_woeid');
    this.twitterBackend.trendingTopics((function(self) {
      return function(success, userData) {
        if(success) {
          self.cachedTrendingTopics = userData[0];
        }
      };
    })(this), woeid);
  },

  retrieveTrendingRegions: function(callback) {
    const worldWideWoeid = {
      woeid: 1,
      name: chrome.i18n.getMessage('worldwide')
    };
    if(this.ttLocales === null) {
      this.twitterBackend.trendingPlaces(((self) => {
        return (success, userData) => {
          if(!success) {
            callback([worldWideWoeid]);
          };
          const woeids = [];
          if(Array.isArray(userData)) {
            userData.forEach((loc, i) => {
              var myName = "";
              if(loc.placeType.name === "Country") {
                myName = loc.name;
              } else if(loc.placeType.name === "Town") {
                myName = `${loc.country} - ${loc.name}`;
              } else {
                return;
              }
              woeids.push({woeid: loc.woeid, name: myName});
            });
          }
          woeids.sort((a, b) => {
            if(a.name < b.name) {
              return -1;
            }
            if(a.name > b.name) {
              return 1;
            }
            return 0;
          });
          woeids.unshift(worldWideWoeid);
          self.ttLocales = woeids;
          callback(woeids);
        };
      })(this));
    } else {
      callback(this.ttLocales || [worldWideWoeid]);
    }
  },

  isSavedSearch: function(query) {
    var result = -1;
    this.cachedSavedSearches.forEach((savedSearch, i) => {
      if(savedSearch.query == query) {
        result = i;
        return false;
      }
      return true;
    });
    return result;
  },

  retrieveSavedSearches: function(){
    this.twitterBackend.savedSearches((function(self) {
      return function(success, userData) {
        if(success && Array.isArray(userData)) {
          self.cachedSavedSearches = userData;
        }
      };
    })(this));
  },

  createSavedSearches: function(query){
    this.twitterBackend.createSavedSearches((function(self) {
      return function(success, userData, fmtError) {
        if(!success) {
          self.setWarning(fmtError);
        } else {
          self.cachedSavedSearches.push(userData);
          //TODO want to call retrieveSavedSaearches here
        }
      };
    })(this), query);
  },

  destorySavedSearches: function(query){
    var index = this.isSavedSearch(query);
    if(index < 0) {
      this.setWarning('Query is not saved.');
      return;
    }
    this.twitterBackend.destorySavedSearches((function(self) {
      return function(success, userData, fmtError) {
        if(!success) {
          self.setWarning(fmtError);
        } else {
          self.cachedSavedSearches.splice(index, 1);
          //TODO want to call retrieveSavedSaearches here
        }
      };
    })(this), this.cachedSavedSearches[index].id);
  },

  cleanupCachedData: function() {
    this.unreadTweetsSet.clear();
    this.retweetsMap.clear();
  },

  setAlarms: function() {
    this.clearAlarms();
    var now = Date.now();
    chrome.alarms.create('retrieve_lists', {
      delayInMinutes: 5,
      periodInMinutes: 5
    });
    chrome.alarms.create('retrieve_blocked_users', {
      when: now + 500,
      periodInMinutes: 5
    });
    chrome.alarms.create('retrieve_muting_users', {
      when: now + 800,
      periodInMinutes: 5
    });
    chrome.alarms.create('retrieve_following_users', {
      when: now + 1100,
      periodInMinutes: 5
    });
    chrome.alarms.create('retrieve_followers', {
      when: now + 1400,
      periodInMinutes: 5
    });
    chrome.alarms.create('retrieve_trending_topics', {
      when: now + 1700,
      periodInMinutes: 5
    });
    chrome.alarms.create('retrieve_saved_sarches', {
      when: now + 2000,
      periodInMinutes: 5
    });
    chrome.alarms.create('retrieve_twitter_configuration', {
      when: now + 2300,
      periodInMinutes: 5
    });
    chrome.alarms.create('refresh_timelines', {
      when: now + 2600,
      periodInMinutes: 5
    });
    chrome.alarms.onAlarm.addListener(this.onAlarmCallback(this));
  },

  clearAlarms: function() {
    chrome.alarms.clear('retrieve_lists');
    chrome.alarms.clear('retrieve_blocked_users');
    chrome.alarms.clear('retrieve_muting_users');
    chrome.alarms.clear('retrieve_following_users');
    chrome.alarms.clear('retrieve_followers');
    chrome.alarms.clear('retrieve_trending_topics');
    chrome.alarms.clear('retrieve_saved_sarches');
    chrome.alarms.clear('retrieve_twitter_configuration');
    chrome.alarms.clear('refresh_timelines');
    chrome.alarms.onAlarm.removeListener(this.onAlarmCallback(this));
  },

  onAlarmCallback: function(self) {
    return function(alarm) {
      switch(alarm.name) {
        case 'retrieve_lists':
          self.retrieveLists(true);
          break;
        case 'retrieve_blocked_users':
          self.retrieveBlockedUsers(null, -1);
          break;
        case 'retrieve_muting_users':
          self.retrieveMutesUsers();
          break;
        case 'retrieve_followers':
          self.retrieveFollowers();
          break;
        case 'retrieve_following_users':
          self.retrieveFollowingUsers();
          break;
        case 'retrieve_trending_topics':
          self.retrieveTrendingTopics();
          break;
        case 'retrieve_saved_sarches':
          self.retrieveSavedSearches();
          break;
        case 'retrieve_twitter_configuration':
          self.retrieveTwitterConfiguration();
          break;
        case 'refresh_timelines':
          self.refreshTimelines();
          break;
        default:
          break;
      }
    };
  },

  _addFollowingUser: function(userData) {
    this.followingIdsMap.set(userData.id_str, userData);
    this.followingUsersNames.push(userData.screen_name);
    this.followingUsersIds.push(userData.id_str);
    this.followingUsersNames.sort(function(a, b) {
      return a.toUpperCase().localeCompare(b.toUpperCase());
    });
    this.resetTimeline(TimelineTemplate.HOME);
    this.resetTimeline(TimelineTemplate.UNIFIED);
  },

  retrieveTwitterConfiguration: function() {
    this.twitterBackend.retrieveConfiguration((function(self) {
      return function(success, data) {
        if(success && data) {
          self.twitterConfiguration = Object.assign(self.twitterConfiguration, data);
          self.twitterConfiguration.once = true;
        } else if(self.twitterConfiguration.once) {
          // Do not overwrite
        }
      };
    })(this));
  },

  retrieveMutesUsers: function(D, cursor) {
    var d;
    if(!D) {
      d = new $.Deferred();
    } else {
      d = D;
    }
    if(!cursor) {
      this.mutingIdsSet.clear();
      cursor = "-1";
    }
    this.twitterBackend.mutesUsers((function(self, deferred) {
      return function(success, data, status) {
        if(!success) {
          return deferred.reject();
        }
        var mutesUsers = data.users;
        for(var i = 0, len = mutesUsers.length; i < len; ++i) {
          var user = mutesUsers[i];
          self.mutingIdsSet.add(user.id_str);
        }
        if(data.next_cursor_str !== '0') {
          self.retrieveMutesUsers(deferred, data.next_cursor_str);
          return deferred.notify();
        } else {
          return deferred.resolve();
        }
      };
    })(this, d), cursor);
    if(!D) {
      return d.promise();
    } else {
      return d.notify();
    }
  },

  muteUser: function(callback, userId) {
    if(this.isChurnAction(userId)) {
      return callback(false, {churn: true});
    }
    this.churnActionsMap.set(userId, Date.now());
    this.twitterBackend.createMutes((function(self) {
      return function(success, userData) {
        if(success) {
          self._removeUser({unfollow: false, blocked: false, muting: true, userData: userData});
        } else {
          self.churnActionsMap.delete(userId);
        }
        callback(success, userData);
      };
    })(this), userId);
  },

  unmuteUser: function(callback, userId) {
    if(this.isChurnAction(userId)) {
      return callback(false, {churn: true});
    }
    this.churnActionsMap.set(userId, Date.now());
    this.twitterBackend.destroyMutes((function(self) {
      return function(success, userData) {
        if(success) {
          self.mutingIdsSet.delete(userData.id_str);
          self.resetTimeline(TimelineTemplate.HOME);
          self.resetTimeline(TimelineTemplate.UNIFIED);
        } else {
          self.churnActionsMap.delete(userId);
        }
        callback(success, userData);
      };
    })(this), userId);
  },

  getMutingIdsSet: function() {
    return this.mutingIdsSet;
  },

  getBlockedIdsSet: function() {
    return this.blockedIdsSet;
  },

  retrieveFollowers: function(D, cursor) {
    var d;
    if(!D) {
      d = new $.Deferred();
    } else {
      d = D;
    }
    if(!cursor) {
      this.followersIdsSet.clear();
      cursor = "-1";
    }
    this.twitterBackend.followers((function(self, deferred) {
      return function(success, data, status) {
        if(!success) {
          return deferred.reject();
        }
        var followers = data.ids || [];
        followers.forEach(function(entry) {
          self.followersIdsSet.add(entry);
        });
        if(data.next_cursor_str !== '0') {
          self.retrieveFollowers(deferred, data.next_cursor_str);
          return deferred.notify();
        } else {
          return deferred.resolve();
        }
      };
    })(this, d), cursor);
    if(!D) {
      return d.promise();
    } else {
      return d.notify();
    }
  },

  getFollowersIdsSet: function() {
    return this.followersIdsSet;
  },

  getDummyTweet: function() {
    var utc = new Date().toUTCString();
    var now = Date.now();
    return {
      "created_at": utc,
      "id": "Notification" + now,
      "id_str": "Notification" + now,
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
  },
  createNotificationForUpdateTrends: function(newTrends, oldTrends) {
    if(!Array.isArray(newTrends)
    || !Array.isArray(oldTrends)
    || !(newTrends.length > 0)
    || !(oldTrends.length > 0)
    || !(OptionsBackend.get('unified_visible')
      && OptionsBackend.get('notification_include_unified')
      && OptionsBackend.get('notify_update_trends'))
    ) {
      return;
    }
    // build trends for notify
    oldTrends = oldTrends.slice(0, 10);
    var buildedTrends = newTrends.slice(0, 10).filter(function(entity) {
      return oldTrends.reduce(function(prev, current, index, arr) {
        return prev && current.name !== entity.name;
      }, true);
    });
    if(buildedTrends.length <= 0) {
      return;
    }
    // build notification
    var context = this.getDummyTweet();
    context.text = chrome.i18n.getMessage('n_update_trends') + "\n";
    buildedTrends.forEach(function(topic) {
      var index = [...(context.text || "")].length;
      var length = [...(topic.name || "")].length;
      if(topic.name.substr(0, 1) === '#') {
        context.text += topic.name + "\n";
        context.entities.hashtags.push({
          text: topic.name.substr(1),
          indices: [index, index + length]
        });
      } else {
        var expanded_url = topic.url;
        context.text += topic.name + "\n";
        context.entities.urls.push({
          url: expanded_url,
          display_url: topic.name,
          expanded_url: expanded_url,
          indices: [index, index + length]
        });
      }
    });
    context.event = 'update_trends';
    // send to stream
    this.onStreamData(context);
  },

  isChurnAction: function(id) {
    var now = Date.now();
    if(this.churnActionsMap.has(id)) {
      if(now - this.churnActionsMap.get(id) > 15 * 60 * 1000) {
        this.churnActionsMap.delete(id);
        return false;
      }
      this.churnActionsMap.set(id, now); // update time of churn
      return true;
    }
    return false;
  },

  dispatchPopupEvent: function(eventType, detail) {
    var event = new CustomEvent(eventType || "echo", {detail: detail});
    var popups = [...chrome.extension.getViews({type: "tab"}), ...chrome.extension.getViews({type: "popup"})];
    popups.forEach((popup) => {
      if(popup.dispatchEvent) {
        popup.dispatchEvent(event);
      }
    });
    event = null;
    popups = null;
  },

  getTimelineTemplate: function() {
    return TimelineTemplate;
  },

  getOptionsBackend: function() {
    return OptionsBackend;
  },

  refreshTimelines: function() {
    this.eachTimeline((timeline) => {
      switch(timeline.template.id) {
        case TimelineTemplate.UNIFIED:
        case TimelineTemplate.DMS:
        case TimelineTemplate.NOTIFICATION:
          // no behavior
          break;
        case TimelineTemplate.HOME:
        case TimelineTemplate.MENTIONS:
        case TimelineTemplate.SENT_DMS:
        case TimelineTemplate.RECEIVED_DMS:
        case TimelineTemplate.LIKES:
        case TimelineTemplate.LISTS:
        case TimelineTemplate.SEARCH:
          timeline._fetchNewTweets();
          break;
        default:
          throw new TypeError("unknown template.id");
      }
    }, true);
  }
};

function compareVersions(v1, v2) {
  if(!v1) return -1;
  if(!v2) return 1;
  for(var i = 0, len = Math.max(v1.length, v2.length); i < len; ++i) {
    if(v1[i] === undefined) return -1;
    if(v2[i] === undefined) return 1;
    if(parseInt(v1[i], 10) > parseInt(v2[i], 10)) return 1;
    if(parseInt(v1[i], 10) < parseInt(v2[i], 10)) return -1;
  }
  return 0;
}

function checkVersionChanges(manifest) {
  try {
    var currentVersion = manifest.version.split('.');
    var storageData = Persistence.version();
    var storageVersion = storageData.val();
    var options, baseUrl;
    if(!storageVersion) {
      // No previous version data let's just assume we're running the latest version
      storageData.save(currentVersion);
      return;
    }

    if(compareVersions(currentVersion, storageVersion) !== 0) {
      if(compareVersions(storageVersion, [0, 5, 7, 1]) <= 0) {
        console.log('update script to Version 0.5.7.1');
        try {
          JSON.parse(localStorage.popup_size);
        } catch(e) {
          if(typeof localStorage.popup_size === "string" && localStorage.popup_size.includes("x")) {
            localStorage.popup_size = JSON.stringify(localStorage.popup_size.split("x"));
          } else {
            localStorage.removeItem("popup_size");
          }
        }
      }
      storageData.save(currentVersion);
    }
  } catch(e) {
    /* experimental code, something can go wrong */
    console.log(e);
  }
}

function initializeExtension() {
  TweetManager.instance = new TweetManager();
  if(OptionsBackend.get('tweets_notification_style') !== 'never') {
    chrome.notifications.onClicked.addListener(function(nId) {
      chrome.notifications.clear(nId, function(cleared) {
        // no behavior
      });
    });
  }
  if(OptionsBackend.get('show_expanded_urls')) {
    chrome.webRequest.onBeforeSendHeaders.addListener(function(details) {
      var foundReferer = false;
      try {
        for(var i = 0, len = details.requestHeaders.length; i < len; i++) {
          var header = details.requestHeaders[i];
          if(/referer/i.test(header.name)) {
            // not replace
            foundReferer = true;
          }
        }
        if(!foundReferer) {
          details.requestHeaders.push({
            name: 'Referer',
            value: 'http://www.pixiv.net/'
          });
        }
      } catch(e) {
        console.log(e);
      } finally {
        return {requestHeaders: details.requestHeaders};
      }
    }, {
      urls: ['*://*.pixiv.net/*'],
      types: ['image']
    },
    ['blocking', 'requestHeaders']);
  }
}

function initializeJQueryOptions() {
  $.ajaxSetup({
    timeout: OptionsBackend.get('request_timeout')
  });
}

initializeJQueryOptions();
checkVersionChanges(chrome.runtime.getManifest());
initializeExtension();
