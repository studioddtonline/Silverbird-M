function initializeJQueryOptions() {
  $.ajaxSetup({
    timeout: OptionsBackend.get('request_timeout')
  });
}
initializeJQueryOptions();

function ComposerData() {
  this.saveMessage = '';
  this.urlShortener = '';
  this.isComposing = false;
  this.replyId = null;
  this.replyUser = null;
}

function TweetManager() {
  this.unreadTweetsSet = new Set();
  this.retweetsMap = new Map();

  // Using an object instead of an array to take advantage of hash look-ups
  this.followingUsersIds = [];
  this.followingUsersNames = [];
  this.followingIdsMap = new Map();
  this.blockedIdsSet = new Set();
  this.mutingUsersSet = new Set();

  this.newTweetsCallback = function() {};

  this.composerData = new ComposerData();

  this.timelines = {};
  this.iconImg = null;
  this.listsCache = null;
  this.listsTabCount = OptionsBackend.get('lists_count');
  this.savedSearchCache = [];

  this.suspend = false;
  this.streamingStatus = 'initializing';

  this.timelineOrderData = Persistence.timelineOrder();
  this.oauthTokenData = Persistence.oauthTokenData();
  this.oauthTokenService = Persistence.oauthTokenService();
  this.bearerTokenData = Persistence.bearerTokenData();
  this.previousUserId = Persistence.previousUserId();

  TimelineTemplate.initTemplates(this);
  TimelineTemplate.eachTimelineTemplate((function(self) {
    return function(template) {
      self.createTimelineTemplate(template, true);
    };
  })(this));

  this.orderedEachTimeline((function(self) {
    return function(timeline) {
      self.currentTimelineId = timeline.timelineId;
      return false;
    };
  })(this));
  this.previousTimelineId = null;

  this.warningMessage = null;
  this.warningMessageHTML = null;

  this.apiHitsStates = [];
  
  this.ttLocales = null;
  this.urlExpander = null;
  this.shortener = null;

  this.authenticated = false;
  this.ready = false;
  this.twitterConfiguration = {};

  this.twitterBackend = new TwitterLib(
    (function(self) {
      return function() {
        TimelineTemplate.initAfterAuthentication();
        self.authenticated = true;
        if(!self.previousUserId.val() || self.previousUserId.val() === this.userid()) {
          self.previousUserId.remove();
        } else {
          self.previousUserId.remove();
          self.timelineOrderData.remove();
          OptionsBackend.optionsData.remove();
          chrome.runtime.reload();
          return;
        }
        $.when(
          self.retrieveLists(true),
          self.retrieveBlockedUsers(null, -1),
          self.retrieveMutesUsers(null, -1),
          self.retrieveFollowingUsers()
        )
        .done((function(self) {
          return function() {
            self.eachTimeline(function(timeline) {
              timeline.init();
            }, true);
            self.retrieveTrendingTopics();
            self.retrieveSavedSearches();
            self.retrieveHitsUpdate();
            self.retrieveBearerToken();
            self.setAlarms();
            self.sendQueue = new SendQueue(self.twitterBackend);
            self.urlExpander = new Expander();
            self.startShortener();
            self.retrieveTwitterConfiguration();
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
    (function(self) {
      return function() {
        self.onHitsUpdated.call(self, this.rateLimits);
      };
    })(this),
    this.oauthTokenData,
    this.bearerTokenData
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
    template.setVisible(true);
    return this.createTimelineTemplate(template, showOnly);
  },

  hideTimelineTemplate: function(timelineTemplateId) {
    var template = TimelineTemplate.getTemplate(timelineTemplateId);
    template.setVisible(false);
    var toDelete = [];
    this.eachTimeline(function(timeline) {
      if(timeline.template.id == timelineTemplateId) {
        timeline.killTimeline();
        toDelete.push(timeline);
      }
    }, true);
    for(var i = 0, len = toDelete.length; i < len; ++i) {
      var timeline = toDelete[i];
      delete this.timelines[timeline.timelineId];
    }
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
      this.timelines[timeline.timelineId] = timeline;
      if(this.authenticated) {
        timeline.init();
      }
      shownTimelines.push(timeline);
    }
    return shownTimelines;
  },

  hideTimeline: function(timelineId){
    var timeline = this.timelines[timelineId];
    if(!timeline) {
      return;
    }
    var shouldDelete = timeline.remove();
    if(shouldDelete) {
      delete this.timelines[timelineId];
    }
  },

  toggleUnified: function(templateId, forcedState) {
    var template = TimelineTemplate.getTemplate(templateId);
    var newState = !template.includeInUnified;
    if(forcedState !== undefined) {
      newState = forcedState;
    }
    template.setIncludeInUnified(newState);
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
    template.setShowNotification(newState);
  },

  setWarning: function(msg, showHTML) {
    if(OptionsBackend.get('unified_visible') && OptionsBackend.get('notification_include_unified')) {
      this.onStreamData({
        "created_at": new Date().toUTCString(),
        "warning":{
          "code": "SET_WARNING",
          "message": msg
        }
      });
    } else {
      this.warningMessage = msg;
      this.warningMessageHTML = showHTML;
    }
  },

  clearWarning: function() {
    this.warningMessage = null;
    this.warningMessageHTML = null;
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
      return function(success, data, status, context) {
        if(!success) {
          return deferred.reject();
        }
        context = parseInt(context) || 0;
        var blockedUsers = data.users;
        for(var i = 0, len = blockedUsers.length; i < len; ++i) {
          var user = blockedUsers[i];
          self.blockedIdsSet.add(user.id_str);
        }
        if(data.next_cursor > 0 && data.next_cursor > context) {
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
    for(var tId in this.timelines) {
      var timeline = this.timelines[tId];
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
    for(tId in this.timelines) {
      timeline = this.timelines[tId];
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
        timeline = this.timelines[tId];
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
    for(var entry of totalUnreadNewIds.entries()) {
      if(!uniqueCounter.has(entry[1])) uniqueCounter.add(entry[1]);
    }
    var totalUnreadNewCount = uniqueCounter.size;
    if(totalUnreadNewCount === 0) {
      chrome.browserAction.setTitle({title: "Silverbird M"});
      chrome.browserAction.setBadgeText({text: ''});
    } else {
      var tweet_string = totalUnreadNewCount > 1 ? 'newtweets_plural' : 'newtweets_singular';
      var title = chrome.i18n.getMessage("newTweets", [totalUnreadNewCount, chrome.i18n.getMessage(tweet_string)]);
      chrome.browserAction.setTitle({title: title});
      chrome.browserAction.setBadgeText({text: '' + totalUnreadNewCount});
    }
    if(OptionsBackend.get('tweets_notification_style') !== 'never') {
      this.showTweetsNotifications(unreadNewTweets);
    }
  },

  showTweetsNotifications: function(tweetsToNotify) {
    if(!tweetsToNotify || tweetsToNotify.length === 0) return;
    var maxTweetsNotifications = OptionsBackend.get('notification_max_popups') || 0;
    if(maxTweetsNotifications === 0) return;
    if(maxTweetsNotifications > 0 && tweetsToNotify.length > maxTweetsNotifications) {
      tweetsToNotify.splice(maxTweetsNotifications, tweetsToNotify.length - maxTweetsNotifications);
    }
    try {
      var fadeoutTime = OptionsBackend.get('notification_fade_timeout') || 4000;
      for(var entry of tweetsToNotify.entries()) {
        var tweet = entry[1];
        if(tweet.retweeted_status) tweet = tweet.retweeted_status;
        var user = tweet.user, notificationText = tweet.text || '';
        var notificationId = '__Silverbird_M__' + tweet.id_str;
        chrome.notifications.getAll(function(notifications) {
          if(!notifications[notificationId]) {
            var notificationTitle = user.name + ' @' + user.screen_name;
            var notificationImage = user.profile_image_url.replace(/_normal\.(jpe?g|gif|png|bmp)$/, '.$1');
            var p = new Promise(function(resolve, reject) {
              setTimeout(resolve, fadeoutTime, notificationId);
              chrome.notifications.create(notificationId, {
                type: 'basic',
                iconUrl: notificationImage,
                title: notificationTitle,
                message: notificationText.replace(/\r|\r?\n/g, "\n")
              }, function(nId) {
                // no behavior
              });
            });
            p.then(function(nId) {
              chrome.notifications.getAll(function(notifications) {
                if(notifications[nId]) {
                  chrome.notifications.clear(nId, function(wasCleared) {
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
    if(this.newTweetsCallback) {
      this.eachTimeline((function(self) {
        return function(timeline) {
          var newTweets = timeline.newTweetsCount();
          try {
            // The callback might be invalid (popup not active), so let's ignore errors for now.
            self.newTweetsCallback(newTweets[0], newTweets[1], timeline.timelineId);
          } catch(e) { /* ignoring */ }
        };
      })(this));
    }
    this.updateAlert();
  },

  enqueueTweet: function(msg, replyId, replyUser, isDM, media) {
    this.sendQueue.enqueueTweet(msg, replyId, replyUser, isDM, media);
  },

  postRetweet: function(callback, id) {
    return this.twitterBackend.retweet((function(self) {
      return function(success, data, status) {
        if(success) {
          self.retweetsMap.set(id, data.id);
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
    this.twitterBackend.showTweet(function(success, data, status) {
      if(success) {
        tweet.inReplyToTweet = data;
      }
      callback(success, data, status);
    }, tweet.in_reply_to_status_id);
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

  favorite: function(callback, id) {
    return this.twitterBackend.favorite((function(self) {
      return function(success, data, status) {
        if(success) {
          var favTimeline = self.timelines[TimelineTemplate.FAVORITES];
          if(favTimeline) {
            favTimeline.pushTweet(data);
          }
          self.eachTimeline(function(timeline) {
            var tweet = timeline.findTweet(id);
            if(tweet) tweet.favorited = true;
          }, true);
        }
        callback(success, data, status);
      };
    })(this), id);
  },

  unFavorite: function(callback, id) {
    return this.twitterBackend.unFavorite((function(self) {
      return function(success, data, status) {
        if(success) {
          var favTimeline = self.timelines[TimelineTemplate.FAVORITES];
          if(favTimeline) {
            favTimeline.removeFromCache(id);
          }
          self.eachTimeline(function(timeline) {
            var tweet = timeline.findTweet(id);
            if(tweet) tweet.favorited = false;
          }, true);
        }
        callback(success, data, status);
      }
    })(this), id);
  },

  retrieveLists: function(force) {
    var d = new $.Deferred();
    var newLists = force ? null: this.listsCache;
    this.twitterBackend.lists((function(self, deferred) {
      return function(success, data, status) {
        if(success && data) {
          newLists = data.lists || [];
        } else {
          newLists = self.listsCache || [];
          return deferred.reject();
        }
        self.twitterBackend.subs((function(self, deferred) {
          return function(success, data, status) {
            if(success && data) {
              self.listsCache = newLists.concat(data.lists || []);
              for(var i = 0, len = self.listsCache; i < len; i++) {
                if(self.listsCache[i].user) delete self.listsCache[i].user;
              }
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
    var timeline = this.timelines[timelineId];
    if(!timeline) {
      return false;
    }
    return timeline.changeSearchQuery(searchQuery);
  },

  getSearchQuery: function(timelineId) {
    var timeline = this.timelines[timelineId];
    if(!timeline) {
      return null;
    }
    return timeline.getSearchQuery();
  },

  changeList: function(timelineId, listData) {
    var timeline = this.timelines[timelineId];
    if(!timeline) return null;
    timeline.changeList(listData);
    return undefined;
  },

  getListId: function(timelineId) {
    var timeline = this.timelines[timelineId || this.currentTimelineId];
    if(!timeline) return null;
    var listId = timeline.getListId();
    if(listId && this.listsCache) {
      // Check if the listId really exists
      for(var i = 0, len = this.listsCache.length; i < len; ++i) {
        if(this.listsCache[i].id_str == listId) {
          return listId;
        } else if(this.listsCache[i].uri == listId) { // migration
          return this.listsCache[i].id_str;
        }
      }
    }
    return null;
  },

  getList: function(timelineId) {
    var timeline = this.timelines[timelineId || this.currentTimelineId];
    if(!timeline) return null;
    var listId = timeline.getListId();
    if(listId && this.listsCache) {
      for(var i = 0, len = this.listsCache.length; i < len; ++i) {
        if(this.listsCache[i].id_str == listId) {
          return this.listsCache[i];
        }
      }
    }
    return null;
  },

  giveMeTweets: function(timelineId, callback, syncNew, cacheOnly) {
    var timeline = this.timelines[timelineId];
    if(!timeline) {
      callback([], timelineId);
      return undefined;
    }
    var originalCallback = callback;
    if(syncNew && timeline.template.includeInUnified) {
      callback = function(self) {
        return function(tweets, timelineId) {
          originalCallback(tweets, timelineId);
          self.timelines[TimelineTemplate.UNIFIED].giveMeTweets(originalCallback, false, true);
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
    return this.timelines[timelineId].newTweetsCount();
  },

  updateNewTweets: function() {
    var currentTimeline = this.timelines[this.currentTimelineId];
    if(currentTimeline.template.id == TimelineTemplate.FAVORITES) {
      var newTweets = this.timelines[this.currentTimelineId].getNewTweetsCache();
      for(var i = 0, len = newTweets.length; i < len; ++i) {
        var id = newTweets[i].id;
        this.eachTimeline(function(timeline) {
          var tweet = timeline.findTweet(id);
          if(tweet)
            tweet.favorited = true;
        }, true);
      }
    }
    currentTimeline.updateNewTweets();
    this.updateAlert();
  },

  getCurrentTimeline: function() {
    var currentTimeline = this.timelines[this.currentTimelineId];
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
    return this.timelines[timelineId];
  },

  currentError: function() {
    return this.timelines[this.currentTimelineId].getError();
  },

  connectStreaming: function() {
    if(OptionsBackend.get('use_streaming_api') && !this.suspend) {
      StreamListener.start(this.twitterBackend);
      StreamListener.subscribe(this.onStreamData, this);
      this.streamingStatus = 'connect';
    } else {
      this.streamingStatus = 'disallow';
    }
  },

  disconnectStreaming: function() {
    StreamListener.unsubscribe(this);
    StreamListener.disconnect(true);
    this.onStreamData({event: 'disconnected'});
    this.streamingStatus = 'disconnect';
  },

  suspendTimelines: function(suspend) {
    var oldSuspendState = this.suspend;
    if(suspend !== undefined) {
      this.suspend = suspend;
    } else {
      this.suspend = !this.suspend;
    }
    if(oldSuspendState !== this.suspend) {
      if(this.suspend) {
        this.disconnectStreaming();
        this.clearAlarms();
      } else {
        this.connectStreaming();
        this.setAlarms();
      }
    }
    return this.suspend;
  },

  stopAll: function() {
    this.eachTimeline(function(timeline) {
      timeline.killTimeline();
      delete timeline;
    }, true);
    this.disconnectStreaming();
    this.clearAlarms();
  },

  signout: function() {
    this.oauthTokenData.remove();
    this.bearerTokenData.remove();
    this.previousUserId.save(this.twitterBackend.userid());
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

  retrieveHitsUpdate: function() {
    this.twitterBackend.updateWindowHitsLimit();
  },

  onHitsUpdated: function(rateLimits) {
    var apihits = '';
    var nextResetDate = Date.now();
    var remaining = 5;
    for(var key in rateLimits) {
      if(!rateLimits.hasOwnProperty(key)) continue;
      var value = rateLimits[key];
      if(!$.isNumeric(value.remaining)) continue;
      var newResetDate = value.reset;
      if(value.remaining == 0 && newResetDate > nextResetDate) {
        apihits = "exceededAPIHits";
        remaining = value.remaining;
        nextResetDate = newResetDate;
      } else if(value.remaining <= 2 && newResetDate > nextResetDate) {
        if(remaining == 0) continue;
        apihits = "warningAPIHits";
        remaining = value.remaining;
        nextResetDate = newResetDate;
      }
    }
    if(apihits != '') {
      var resetDateObj = new Date(nextResetDate);
      this.setWarning(chrome.i18n.getMessage(apihits, [chrome.extension.getURL('options.html'), resetDateObj.toLocaleDateString(), resetDateObj.toLocaleTimeString()]), true);
    }
  },

  onStreamData: function(data) {
    if(!data) return;
    var context = {
      "created_at": data.created_at || new Date().toUTCString(),
      "id": "Notification" + Date.now(),
      "id_str": "Notification" + Date.now(),
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
    if(data.delete) {
      //DONOT behavior
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
      this.streamingStatus = 'disconnect';
      return;
    }
    if(data.event === StreamListener.events.CONNECTED) {
      this.streamingStatus = 'connect';
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
      var sourceForEntities = {
        "id": data.source.id_str,
        "id_str": data.source.id_str,
        "screen_name": data.source.screen_name,
        "name": data.source.name,
        "indices": [
          0, // static messages
          data.source.screen_name.length
        ]
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
        case 'favorite':
          if(data.source.id_str == this.twitterBackend.userid()) {
            var favTimeline = this.timelines[TimelineTemplate.FAVORITES];
            if(favTimeline) {
              favTimeline.pushTweet(data.target_object);
            }
            this.eachTimeline(function(timeline) {
              var tweet = timeline.findTweet(data.target_object.id_str);
              if(tweet) tweet.favorited = true;
            }, true);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_favorite", [data.source.screen_name]);
            context.entities.user_mentions.push(sourceForEntities);
            context.in_favorite_to = data.target_object;
          }
          break;
        case 'unfavorite':
          if(data.source.id_str == this.twitterBackend.userid()) {
            var favTimeline = this.timelines[TimelineTemplate.FAVORITES];
            if(favTimeline) {
              favTimeline.removeFromCache(data.target_object.id_str);
            }
            this.eachTimeline(function(timeline) {
              var tweet = timeline.findTweet(data.target_object.id_str);
              if(tweet) tweet.favorited = false;
            }, true);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_unfavorite", [data.source.screen_name]);
            context.entities.user_mentions.push(sourceForEntities);
            context.in_unfavorite_to = data.target_object;
          }
          break;
        case 'follow':
          if(data.source.id_str == this.twitterBackend.userid()) {
            if(!this.followingIdsMap.has(data.target.id_str)) {
              this._addFollowingUser(data.target);
            }
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_follow", [data.source.screen_name]);
            context.entities.user_mentions.push(sourceForEntities);
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
          if(data.source.id_str == this.twitterBackend.userid()) {
            console.log('You add member for list ' + data.target_object.full_name);
            console.log(data);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_list_member_added", [data.source.screen_name]);
            context.entities.user_mentions.push(sourceForEntities);
          }
          break;
        case 'list_member_removed':
          if(data.source.id_str == this.twitterBackend.userid()) {
            console.log('You remove member for list ' + data.target_object.full_name);
            console.log(data);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_ist_member_removed", [data.source.screen_name]);
            context.entities.user_mentions.push(sourceForEntities);
          }
          break;
        case 'list_user_subscribed':
          if(data.source.id_str == this.twitterBackend.userid()) {
            console.log('You subscribe list ' + data.target_object.full_name);
            console.log(data);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_list_user_subscribed", [data.source.screen_name]);
            context.entities.user_mentions.push(sourceForEntities);
          }
          break;
        case 'list_user_unsubscribed':
          if(data.source.id_str == this.twitterBackend.userid()) {
            console.log('You unsubscribe list ' + data.target_object.full_name);
            console.log(data);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_list_user_unsubscribed", [data.source.screen_name]);
            context.entities.user_mentions.push(sourceForEntities);
          }
          break;
        case 'user_update':
          console.log('Your profile is updated');
          console.log(data);
          return; // do not notification
          break;
        default:
          console.log(data);
          return;
      }
    }
    if(context.text !== '' && OptionsBackend.get('unified_visible') && OptionsBackend.get('notification_include_unified')) {
      var notification = this.timelines[TimelineTemplate.NOTIFICATION];
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
      return function(success, data, status, context) {
        if(!success) {
          return deferred.reject();
        }
        context = parseInt(context) || 0;
        self.followingUsersIds = self.followingUsersIds.concat(data.ids || []);
        if(data.next_cursor > 0 && data.next_cursor > context) {
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

  followUser: function(callback, username) {
    this.twitterBackend.follow((function(self) {
      return function(success, userData) {
        if(success) {
          self._addFollowingUser(userData);
        }
        callback(success, userData);
      }
    })(this), username);
  },

  _removeUser: function(context) {
    if(context.unfollow) {
      this.followingIdsMap.delete(context.userData.id_str);
      var position = $.inArray(context.userData.screen_name, this.followingUsersNames);
      if(position > -1) {
        this.followingUsersNames.splice(position, 1);
      }
      var position = $.inArray(context.userData.id_str, this.followingUsersIds);
      if(position > -1) {
        this.followingUsersIds.splice(position, 1);
      }
    }
    if(context.muting) {
      this.mutingUsersSet.add(context.userData.screen_name);
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

  unfollowUser: function(callback, username) {
    this.twitterBackend.unfollow((function(self) {
      return function(success, userData) {
        if(success) {
          self._removeUser({unfollow: true, blocked: false, muting: null, userData: userData});
        }
        callback(success, userData);
      };
    })(this), username);
  },

  blockUser: function(callback, username) {
    this.twitterBackend.block((function(self) {
      return function(success, userData) {
        if(success) {
          self._removeUser({unfollow: true, blocked: true, muting: null, userData: userData});
        }
        callback(success, userData);
      };
    })(this), username);
  },

  reportUser: function(callback, username) {
    this.twitterBackend.report((function(self) {
      return function(success, userData) {
        if(success) {
          self._removeUser({unfollow: true, blocked: true, muting: null, userData: userData});
        }
        callback(success, userData);
      };
    })(this), username);
  },

  retrieveTrendingTopics: function() {
    var woeid = OptionsBackend.get('trending_topics_woeid');
    if(this.lastTrendsTime && this.cachedTrendingTopics && (Date.now() - this.lastTrendsTime) < 90 * 1000) {
      return;
    }
    this.lastTrendsTime = Date.now();
    this.twitterBackend.trendingTopics((function(self) {
      return function(success, userData) {
        if(success) {
          self.cachedTrendingTopics = userData[0];
        }
      };
    })(this), woeid);
  },

  retrieveTrendingRegions: function(callback) {
    var worldWideWoeid = {
      woeid: 1,
      name: chrome.i18n.getMessage('worldwide')
    };
    if(this.ttLocales === null) {
      this.twitterBackend.trendingPlaces((function(self) {
        return function(success, userData) {
          if(!success) return;
          var woeids = [];
          $.each(userData, function(i, loc) {
            var myName = "";
            if(loc.placeType.name == "Country") {
              myName = loc.name;
            } else if(loc.placeType.name == "Town") {
              myName = loc.country + ' - ' + loc.name;
            } else {
              return;
            }
            woeids.push({woeid: loc.woeid, name: myName});
          });
          woeids.sort(function(a, b) {
            if(a.name < b.name) return -1;
            if(a.name > b.name) return 1;
            return 0;
          });
          woeids.unshift(worldWideWoeid);
          self.ttLocales = woeids;
          callback(woeids);
        };
      })(this));
    }
    return this.ttLocales || [worldWideWoeid];
  },

  isSavedSearch: function(query) {
    for(var i = 0, len = this.savedSearchCache.length; i < len; i++){
      if(this.savedSearchCache[i].query == query) return i;
    }
    return -1;
  },

  retrieveSavedSearches: function(){
    this.twitterBackend.savedSearches((function(self) {
      return function(success, userData) {
        if(success) {
          self.savedSearchCache = userData;
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
          self.savedSearchCache.push(userData);
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
          self.savedSearchCache.splice(index, 1);
          //TODO want to call retrieveSavedSaearches here
        }
      };
    })(this), this.savedSearchCache[index].id);
  },

  retrieveBearerToken: function() {
    if(!OptionsBackend.get('use_bearer_token')) {
      this.bearerTokenData.remove();
      return;
    }
    this.twitterBackend.retrieveBearerToken((function(self) {
      return function(success, data, status, context, request) {
        if(!success || !data.access_token) {
          self.bearerTokenData.remove();
          OptionsBackend.saveOption('use_bearer_token', false);
        } else {
          self.bearerTokenData.save(data.access_token);
        }
      };
    })(this));
  },

  cleanupCachedData: function() {
    this.unreadTweetsSet.clear();
    this.retweetsMap.clear();
  },

  setAlarms: function() {
    this.clearAlarms();
    var retrieve_blocked_users_interval = OptionsBackend.get('blockedusers_refresh_interval') || 5,
      retrieve_trending_topics_interval = OptionsBackend.get('trends_in_places') || 5,
      retrieve_saved_searches_interval = OptionsBackend.get('saved_searches') || 5;
    const retrieve_lists_interval = 5, // static
      retrieve_following_users_interval = 5, // static
      retrieve_hits_update_interval = 1, // static
      retrieve_muting_users_interval = 5; // static
    chrome.alarms.create('retrieve_lists', {
      delayInMinutes: retrieve_lists_interval,
      periodInMinutes: retrieve_lists_interval
    });
    chrome.alarms.create('retrieve_blocked_users', {
      delayInMinutes: retrieve_blocked_users_interval,
      periodInMinutes: retrieve_blocked_users_interval
    });
    chrome.alarms.create('retrieve_following_users', {
      delayInMinutes: retrieve_following_users_interval,
      periodInMinutes: retrieve_following_users_interval
    });
    chrome.alarms.create('retrieve_trending_topics', {
      delayInMinutes: retrieve_trending_topics_interval,
      periodInMinutes: retrieve_trending_topics_interval
    });
    chrome.alarms.create('retrieve_saved_sarches', {
      delayInMinutes: retrieve_saved_searches_interval,
      periodInMinutes: retrieve_saved_searches_interval
    });
    chrome.alarms.create('retrieve_hits_update', {
      delayInMinutes: retrieve_hits_update_interval,
      periodInMinutes: retrieve_hits_update_interval
    });
    chrome.alarms.create('retrieve_muting_users', {
      delayInMinutes: retrieve_muting_users_interval,
      periodInMinutes: retrieve_muting_users_interval
    });
    chrome.alarms.onAlarm.addListener(this.onAlarmCallback(this));
  },
  
  clearAlarms: function() {
    chrome.alarms.clear('retrieve_lists');
    chrome.alarms.clear('retrieve_blocked_users');
    chrome.alarms.clear('retrieve_following_users');
    chrome.alarms.clear('retrieve_trending_topics');
    chrome.alarms.clear('retrieve_saved_sarches');
    chrome.alarms.clear('retrieve_hits_update');
    chrome.alarms.clear('retrieve_muting_users');
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
        case 'retrieve_following_users':
          self.retrieveFollowingUsers();
          break;
        case 'retrieve_trending_topics':
          self.retrieveTrendingTopics();
          break;
        case 'retrieve_saved_sarches':
          self.retrieveSavedSearches();
          break;
        case 'retrieve_hits_update':
          self.retrieveHitsUpdate();
          break;
        case 'retrieve_muting_users':
          self.retrieveMutesUsers();
          break;
        default:
          break;
      }
    };
  },

  startShortener: function() {
    this.shortener = new Shortener(OptionsBackend.get('url_shortener'));
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

  registerPopupCallbacks: function(callbacks) {
    var nobehavior = function() {};
    this.newTweetsCallback = callbacks.newTweets || this.newTweetsCallback || nobehavior;
    callbacks = null;
  },

  unregisterPopupCallbacks: function() {
    var nobehavior = function() {};
    this.newTweetsCallback = nobehavior;
  },

  retrieveTwitterConfiguration: function() {
    this.twitterBackend.retrieveConfiguration((function(self) {
      return function(success, data) {
        self.twitterConfiguration = data || {};
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
      this.mutingUsersSet.clear();
      cursor = "-1";
    }
    this.twitterBackend.mutesUsers((function(self, deferred) {
      return function(success, data, status, context) {
        if(!success) {
          return deferred.reject();
        }
        context = parseInt(context) || 0;
        var mutesUsers = data.users;
        for(var i = 0, len = mutesUsers.length; i < len; ++i) {
          var user = mutesUsers[i];
          self.mutingUsersSet.add(user.screen_name);
        }
        if(data.next_cursor > 0 && data.next_cursor > context) {
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

  muteUser: function(callback, username) {
    this.twitterBackend.createMutes((function(self) {
      return function(success, userData) {
        if(success) {
          self._removeUser({unfollow: false, blocked: false, muting: true, userData: userData});
        }
        callback(success, userData);
      };
    })(this), username);
  },

  unmuteUser: function(callback, username) {
    this.twitterBackend.destroyMutes((function(self) {
      return function(success, userData) {
        if(success) {
          self.mutingUsersSet.delete(userData.screen_name);
          self.resetTimeline(TimelineTemplate.HOME);
          self.resetTimeline(TimelineTemplate.UNIFIED);
        }
        callback(success, userData);
      };
    })(this), username);
  },

  getMutingUsersSet: function() {
    return this.mutingUsersSet;
  },

  getBlockedIdsSet: function() {
    return this.blockedIdsSet;
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
    if(storageVersion) {
      storageVersion = JSON.parse(storageVersion);
    } else {
      // No previous version data let's just assume we're running the latest version
      storageData.save(JSON.stringify(currentVersion));
      return;
    }

    if(compareVersions(currentVersion, storageVersion) !== 0) {
      if(compareVersions(storageVersion, [0, 5, 2, 4]) <= 0
      && OptionsBackend.get('name_attribute') !== 'both') {
        OptionsBackend.saveOption('compliant_twitter_display_requirements', false);
      }
      if(compareVersions(storageVersion, [0, 5, 2, 17]) <= 0) {
        OptionsBackend.setDefault('blockedusers_refresh_interval');
      }
      if(compareVersions(storageVersion, [0, 5, 2, 21]) <= 0
      && OptionsBackend.get('tweets_notification_style') !== 'desktop') {
        OptionsBackend.saveOption('tweets_notification_style', 'never');
      }
      if(compareVersions(storageVersion, [0, 5, 2, 23]) <= 0
      && typeof OptionsBackend.get('home_notify') !== 'boolean') {
        console.log('update script to Version 0.5.2.23');
        OptionsBackend.saveOption('home_notify', OptionsBackend.get('home_on_page'));
        OptionsBackend.saveOption('mentions_notify', OptionsBackend.get('mentions_on_page'));
        OptionsBackend.saveOption('dms_notify', OptionsBackend.get('dms_on_page'));
        OptionsBackend.saveOption('favorites_notify', OptionsBackend.get('favorites_on_page'));
        OptionsBackend.saveOption('lists_notify', OptionsBackend.get('lists_on_page'));
        OptionsBackend.saveOption('search_notify', OptionsBackend.get('search_on_page'));
        OptionsBackend.saveOption('notification_include_unified', true);
        OptionsBackend.saveOption('home_on_page', undefined);
        OptionsBackend.saveOption('mentions_on_page', undefined);
        OptionsBackend.saveOption('dms_on_page', undefined);
        OptionsBackend.saveOption('favorites_on_page', undefined);
        OptionsBackend.saveOption('lists_on_page', undefined);
        OptionsBackend.saveOption('search_on_page', undefined);
        OptionsBackend.saveOption('notification_on_page', undefined);
      }
      if(compareVersions(storageVersion, [0, 5, 4, 2]) <= 0
      && OptionsBackend.get('image_upload_service') == 'twitpic.com') {
        console.log('update script to Version 0.5.4.2');
        OptionsBackend.saveOption('image_upload_service', 'pic.twitter.com');
      }
      if(compareVersions(storageVersion, [0, 5, 4, 6]) <= 0
      && typeof OptionsBackend.get('font_family') !== '"Hiragino Kaku Gothic ProN", meiryo, Helvetica, Arial, sans-serif, "Segoe UI Symbol", "Apple Color Emoji", Symbola') {
        console.log('update script to Version 0.5.4.6');
        OptionsBackend.saveOption('font_family', '"Noto Sans Japanese", "Roboto", Helvetica, Arial, sans-serif, "Segoe UI Symbol", "Apple Color Emoji", Symbola');
      }
      storageData.save(JSON.stringify(currentVersion));
    }
  } catch(e) {
    /* experimental code, something can go wrong */
    console.log(e);
  }
}

initializeExtension();
checkVersionChanges(chrome.runtime.getManifest());

function initializeExtension() {
  TweetManager.instance = new TweetManager();
  chrome.notifications.onClicked.addListener(function(nId) {
    chrome.notifications.clear(nId, function(cleared) {
      // no behavior
    });
  });
}
