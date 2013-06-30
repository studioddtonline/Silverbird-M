function initializeJQueryOptions() {
  $.ajaxSetup({
    timeout: OptionsBackend.get('request_timeout')
  });
}
initializeJQueryOptions();

urlExpander = new Expander();

function ComposerData() {
  this.saveMessage = '';
  this.urlShortener = '';
  this.isComposing = false;
  this.replyId = null;
  this.replyUser = null;
}

function TweetManager() {
  this.unreadTweets = {};
  this.readTweets = {};
  this.shouldNotReadMap = {};
  this.retweets = {};
  this.injectTweets = [];
  this.notifiedRetweets = {};

  // Using an object instead of an array to take advantage of hash look-ups
  this.blockedUserNames = {};

  this.newTweetsCallback = null;

  this.composerData = new ComposerData();

  this.timelines = {};
  this.iconImg = null;
  this.listsCache = null;
  this.listsTabCount = OptionsBackend.get('lists_count');
  this.savedSearchCache = [];

  this.suspend = false;

  this.timelineOrderData = Persistence.timelineOrder();
  this.oauthTokenData = Persistence.oauthTokenData();
  this.oauthTokenService = Persistence.oauthTokenService();
  this.bearerTokenData = Persistence.bearerTokenData();

  TimelineTemplate.initTemplates(this);
  var closure_eachTimelineTemplate = function(self) {
    return function(template) {
      self.createTimelineTemplate(template, true);
    };
  };
  TimelineTemplate.eachTimelineTemplate(closure_eachTimelineTemplate(this));

  var closure_orderedEachTimeline = function(self) {
    return function(timeline) {
      self.currentTimelineId = timeline.timelineId;
      return false;
    };
  };
  this.orderedEachTimeline(closure_orderedEachTimeline(this), true);
  this.previousTimelineId = null;

  this.warningsCallback = null;
  this.warningMessage = null;
  this.autoClearWarning = false;

  this.apiHitsStates = [];
  this.firstPossibleWarnTime = null;
  
  this.ttLocales = null;

  this.authenticated = false;

  this.initIconAndAlerts();

  var closure_onAuthenticated = function(self) {
    return function() {
      TimelineTemplate.initAfterAuthentication();
      self.authenticated = true;
      self.retrieveLists(true);
      self.retrieveBlockedUsers();
      self.retrieveFollowingUsers();
      self.retrieveTrendingTopics();
      self.retrieveSavedSearches();
      self.retrieveHitsUpdate();
      StreamListener.start(self.twitterBackend);
      StreamListener.subscribe(self.onStreamData, self);
      setTimeout(function(self) {
        self.eachTimeline(function(timeline) {
          timeline.init();
        }, true);
      }, 500, self);
    };
  };
  var closure_onHitsUpdate = function(self) {
    return function() {
      self.onHitsUpdated.call(self, rateLimits);
    };
  };
  this.twitterBackend = new TwitterLib(
    closure_onAuthenticated(this),
    closure_onHitsUpdate(this),
    this.oauthTokenData,
    this.bearerTokenData
  );

  this.sendQueue = new SendQueue(this.twitterBackend);
  
  this.shortenerAuth = {
    token: OptionsBackend.get('shortener_token'),
    tokenSecret: OptionsBackend.get('shortener_token_secret'),
    tokenRequested: false,
    callback: null,
    longUrl: ''
  };

  if(!OptionsBackend.get('use_bearer_token')) {
    this.bearerTokenData.remove();
  } else if(!this.bearerTokenData.val()) {
    this.retrieveBearerToken();
  }
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
    this.setWarning("Direct messages tab have been disabled for now. This is happening because Twitter's denying access to them for some bizarre reason. You can try enabling them again in the options page.");
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
    var newState = !template.showOnPageNotification;
    template.setShowOnPageNotification(newState);
  },

  toggleChangeIcon: function(templateId) {
    var template = TimelineTemplate.getTemplate(templateId);
    var newState = !template.showIconNotification;
    template.setShowIconNotification(newState);
  },

  setWarning: function(msg, showHTML) {
    this.warningMessage = msg;
    this.warningMessageHTML = showHTML;
    try {
      if(this.warningsCallback) {
        this.warningsCallback(msg, showHTML);
      }
    } catch(e) {
      /* ignoring, the popup window might be closed. */
    }
  },

  clearWarning: function() {
    this.warningMessage = null;
  },

  registerWarningsCallback: function(callback) {
    this.warningsCallback = callback;
    if(this.warningMessage && this.warningsCallback) {
      this.warningsCallback(this.warningMessage, this.warningMessageHTML);
    }
  },

  /**
  * Update this.blockedUsers and schedule another update after
  * "blockedusers_refresh_interval" time has elapsed.
  */
  retrieveBlockedUsers: function(errWaitTime) {
    var closure_blockedUsers = function(self) {
      return function(success, users, status, context) {
        var refreshTime;
        if(success) {
          self.blockedUserNames = {};
          for(var i = 0, len = users.length; i < len; ++i) {
            var user = users[i];
            self.blockedUserNames[user.screen_name] = user;
          }
          refreshTime = OptionsBackend.get('blockedusers_refresh_interval');
          errWaitTime = null;

          self.eachTimeline(function(timeline) {
            timeline.purgeBlockedTweets();
          }, true);
        } else {
          if(!errWaitTime) {
            errWaitTime = 5000;
          }
          refreshTime = errWaitTime;
          errWaitTime *= 2;
        }

        setTimeout(function(self) {
          self.retrieveBlockedUsers(errWaitTime);
        }, refreshTime, self);
      };
    };
    this.twitterBackend.blockedUsers(closure_blockedUsers(this));
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
  orderedEachTimeline: function(callback, includeLists) {
    var retList = [], tId, timeline;
    for(tId in this.timelines) {
      timeline = this.timelines[tId];
      if(!includeLists && timeline.template.id == TimelineTemplate.LISTS) {
        continue;
      }
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

  initIconAndAlerts: function() {
    var icon = new Image(), closure_load = function(self) {
      return function() {
        self.iconImg = icon;
        self.updateAlert();
        icon = null;
      };
    };
    icon.onload = closure_load(this);
    icon.src = 'img/icon19.png';
  },

  unique: function(srcList) {
    var newList = [];
    for(var i = 0, len = srcList.length; i < len; ++i) {
      if($.inArray(srcList[i], newList) == -1) {
        newList[newList.length] = srcList[i];
      }
    }
    return newList;
  },

  updateAlert: function() {
    var colors = [];
    var unreadNewTweets = [];
    var totalUnreadNewIds = [];
    this.eachTimeline(function(timeline) {
      var timelineId = this;
      var unreadNewIds = timeline.getNewUnreadIds();
      var timelineTemplate = timeline.template;
      if(timelineTemplate.showIconNotification) {
        totalUnreadNewIds = totalUnreadNewIds.concat(unreadNewIds);
        if(unreadNewIds.length > 0) {
          colors.push(timelineTemplate.iconNotificationColor);
        }
      }
      if(timelineTemplate.showOnPageNotification) {
        unreadNewTweets = unreadNewTweets.concat(timeline.getNewUnreadTweets());
      }
    }, true);
    var totalUnreadNewCount = this.unique(totalUnreadNewIds).length;
    var c = chrome.browserAction;
    if(colors.length === 0) {
      c.setTitle({title: "Silverbird M"});
      c.setIcon({imageData: IconCreator.paintIcon(this.iconImg, OptionsBackend.get('idle_color'))});
      c.setBadgeText({text: ''});
    } else {
      var tweet_string = totalUnreadNewCount > 1 ? 'newtweets_plural' : 'newtweets_singular';
      var title = chrome.i18n.getMessage("newTweets", [totalUnreadNewCount, chrome.i18n.getMessage(tweet_string)]);
      c.setTitle({title: title});
      c.setIcon({imageData: IconCreator.paintIcon(this.iconImg, colors)});
      c.setBadgeBackgroundColor({color: [255, 0, 0, 0]});
      c.setBadgeText({text: '' + totalUnreadNewCount});
    }
    if(unreadNewTweets.length > 0) {
      this.showTweetsNotifications(unreadNewTweets);
    }
  },

  safeTweetsNotifications: function(tweetsToNotify, shouldChangeOption) {
    if(shouldChangeOption) {
      OptionsBackend.saveOption('tweets_notification_style', 'on_page');
    }
    this.showTweetsNotifications(tweetsToNotify, true);
  },

  showTweetsNotifications: function(tweetsToNotify, forceOnPage) {
    if(!tweetsToNotify || tweetsToNotify.length === 0) {
      return;
    }
    var maxTweetsNotifications = OptionsBackend.get('notification_max_popups');
    var i;
    if(maxTweetsNotifications != -1 && tweetsToNotify.length > maxTweetsNotifications) {
      tweetsToNotify.splice(maxTweetsNotifications, tweetsToNotify.length - maxTweetsNotifications);
    }

    var notifyRetweetsOption = OptionsBackend.get('notify_retweets');
    if(notifyRetweetsOption != 'always') {
      var newTweetsToNotify = [];
      var username = this.twitterBackend.username();
      var isNever = notifyRetweetsOption == 'never';

      for(i = 0, len = tweetsToNotify.length; i < len; ++i) {
        var tweet = tweetsToNotify[i];
        if(tweet.retweeted_status && tweet.retweeted_status.user.screen_name == username) { // it is a retweet of a tweet of mine.
          if(isNever || this.notifiedRetweets[tweet.retweeted_status.id]) {
            continue;
          }
          this.notifiedRetweets[tweet.retweeted_status.id] = true;
        }
        newTweetsToNotify.push(tweet);
      }

      if(newTweetsToNotify.length === 0) {
        return;
      }
      tweetsToNotify = newTweetsToNotify;
    }

    this.injectTweets = this.injectTweets.concat(tweetsToNotify);

    var notificationStyle = OptionsBackend.get('tweets_notification_style');
    if(!forceOnPage && notificationStyle == 'desktop') {
      try {
        var notificationCenter = window.notifications || window.webkitNotifications;
        if(!notificationCenter) {
          throw 'NotificationCenter not available';
        }
        var authStatus = notificationCenter.checkPermission();
        if(authStatus == 1 || authStatus == 2) { //Not Allowed or Denied
          throw 'Desktop notifications not allowed';
        }

        for(i = 0, len = tweetsToNotify.length; i < len; ++i) {
          var notification = notificationCenter.createHTMLNotification(chrome.extension.getURL('tweets_notifier.html'));
          notification.show();
        }
      } catch(e) {
        console.warn(e);
        // Fallback to 'on page' notifications
        this.safeTweetsNotifications(tweetsToNotify, true);
      }
    } else {
      var injectHelper = function(action, file, allFrames, callback) {
        var method;
        if(action == 'script') {
          method = chrome.tabs.executeScript;
        } else if(action == 'css') {
          method = chrome.tabs.insertCSS;
        } else {
          return;
        }
        var params = {file: file};
        if(allFrames) {
          params.allFrames = true;
        }
        try {
          method.call(chrome.tabs, null, params, callback);
        } catch(e) {
          // Maybe this exception is due to allFrames = true, let's try without it
          if(allFrames) {
            try {
              method.call(chrome.tabs, null, {file: file}, callback);
            } catch(e) {
              // This time something really bad happened, logging and ignoring
              console.log(e);
            }
          } else {
            // We don't know the motive, logging and ignoring
            console.log(e);
          }
        }
      };
      injectHelper('script', 'lib/3rdparty/jquery.js', true, function() {
        injectHelper('css', 'css/injectedTweets.css', true, function() {
          injectHelper('script', 'lib/timeline_template.js', true, function() {
            injectHelper('script', 'lib/tweets_assembler.js', true);
          });
        });
      });
    }
  },

  registerNewTweetsCallback: function(callback) {
    this.newTweetsCallback = callback;
  },

  readTweet: function(id) {
    if(this.shouldNotReadMap[id]) {
      delete this.shouldNotReadMap[id];
      return;
    }
    this.readTweets[id] = true;
    delete this.unreadTweets[id];
  },

  isTweetRead: function(id) {
    return !this.unreadTweets[id];
  },

  isRetweet: function(tweet) {
    var tweetId = tweet.id;
    if(tweet.retweeted_status) {
      tweetId = tweet.retweeted_status.id;
    }
    return (this.retweets[tweetId] > 0) || tweet.current_user_retweet;
  },

  notifyNewTweets: function() {
    if(this.newTweetsCallback) {
      var closure_eachTimeline = function(self) {
        return function(timeline) {
          var newTweets = timeline.newTweetsCount();
          try {
            // The callback might be invalid (popup not active), so let's ignore errors for now.
            self.newTweetsCallback(newTweets[0], newTweets[1], timeline.timelineId);
          } catch(e) { /* ignoring */ }
        };
      };
      this.eachTimeline(closure_eachTimeline(this));
    }
    this.updateAlert();
  },

  enqueueTweet: function(msg, replyId, replyUser, media) {
    this.sendQueue.enqueueTweet(msg, replyId, replyUser, media);
  },

  postRetweet: function(callback, id) {
    var closure_retweet = function(self) {
      return function(success, data, status) {
        if(success) {
          self.retweets[id] = data.id;
        }
        callback(success, data, status);
      };
    };
    return this.twitterBackend.retweet(closure_retweet(this), id);
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
    var closure_favorite = function(self) {
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
    };
    return this.twitterBackend.favorite(closure_favorite(this), id);
  },

  unFavorite: function(callback, id) {
    var closure_unFavorite = function(self) {
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
    };
    return this.twitterBackend.unFavorite(closure_unFavorite(this), id);
  },

  retrieveLists: function(force) {
    if(force) {
      this.listsCache = null;
    }
    var closure_subs = function(self) {
      return function(success, data, status) {
        if(success && data) {
          var lists_subs = data.lists || [];
          self.listsCache = self.listsCache.concat(lists_subs);
        }
      };
    },
    closure_lists = function(self) {
      return function(success, data, status) {
        if(success && data) self.listsCache = data.lists || [];
        self.twitterBackend.subs(closure_subs(self));
      };
    };
    this.twitterBackend.lists(closure_lists(this));
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

  changeList: function(timelineId, listId) {
    var timeline = this.timelines[timelineId];
    if(!timeline) {
      return null;
    }
    timeline.changeList(listId);
    return undefined;
  },

  getListId: function(timelineId) {
    if(!timelineId) {
      timelineId = this.currentTimelineId;
    }
    var timeline = this.timelines[timelineId];
    if(!timeline) {
      return null;
    }
    var listId = timeline.getListId();
    if(listId && this.listsCache) {
      // Check if the listId really exists
      for(var i = 0, len = this.listsCache.length; i < len; ++i) {
        if(this.listsCache[i].uri == listId) {
          return listId;
        }
      }
    }
    return null;
  },

  getList: function(timelineId) {
    if(!timelineId) {
      timelineId = this.currentTimelineId;
    }
    var timeline = this.timelines[timelineId];
    if(!timeline) {
      return null;
    }
    var listId = timeline.getListId();
    if(listId && this.listsCache) {
      for(var i = 0, len = this.listsCache.length; i < len; ++i) {
        if(this.listsCache[i].uri == listId) {
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
      var closure_orderedEachTimeline = function(self) {
        return function(timeline) {
          currentTimeline = self.currentTimelineId = timeline.timelineId;
          return false;
        };
      };
      this.orderedEachTimeline(closure_orderedEachTimeline(this), true);
    }
    return currentTimeline;
  },

  getTimeline: function(timelineId) {
    return this.timelines[timelineId];
  },

  currentError: function() {
    return this.timelines[this.currentTimelineId].getError();
  },

  suspendTimelines: function(suspend) {
    var oldSuspendState = this.suspend;
    if(suspend !== undefined) {
      this.suspend = suspend;
    } else {
      this.suspend = !this.suspend;
    }
    if(oldSuspendState != this.suspend) {
      if(this.suspend) {
        StreamListener.unsubscribe(this);
        StreamListener.disconnect(true);
      } else {
        StreamListener.start(this.twitterBackend);
        StreamListener.subscribe(this.onStreamData, this);
      }
    }
    return this.suspend;
  },

  stopAll: function() {
    this.eachTimeline(function(timeline) {
      timeline.killTimeline();
      delete timeline;
    }, true);
    StreamListener.unsubscribe(this);
    StreamListener.disconnect();
  },

  signout: function() {
    this.oauthTokenData.remove();
    this.bearerTokenData.remove();
    this.stopAll();
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
    setTimeout(function(self) {
      self.retrieveHitsUpdate();
    }, 5 * 60 * 1000, this);
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
      } else if(value.remaining < 5 && newResetDate > nextResetDate) {
        if(remaining == 0) continue;
        apihits = "warningAPIHits";
        remaining = value.remaining;
        nextResetDate = newResetDate;
      }
    }
    if(apihits != '') {
      var resetDateObj = new Date(nextResetDate);
      this.autoClearWarning = true;
      this.setWarning(chrome.i18n.getMessage(apihits, [chrome.extension.getURL('options.html'), resetDateObj.toLocaleDateString(), resetDateObj.toLocaleTimeString()]), true);
    }
  },

  onStreamData: function(data) {
    if(!data) return;
    if(data.friends) {
      //TODO users/lookup may call
    }
    switch(data.event) {
      case 'block':
        break;
      case 'unblock':
        break;
      case 'favorite':
        if(data.source.id == this.twitterBackend.userid()) {
          if(console) console.debug('favorite: you are source');
        } else {
          if(console) console.debug('favorite: you are not source');
        }
        break;
      case 'unfavorite':
        if(data.source.id == this.twitterBackend.userid()) {
          if(console) console.debug('unfavorite: you are source');
        } else {
          if(console) console.debug('unfavorite: you are not source');
        }
        break;
      case 'follow':
        if(data.source.id == this.twitterBackend.userid()) {
          if(console) console.debug('follow: you are source');
        } else {
          if(console) console.debug('follow: you are not source');
        }
        break;
      case 'unfollow':
        break;
      case 'list_created':
        break;
      case 'list_destroyed':
        break;
      case 'list_updated':
        break;
      case 'list_member_added':
        if(data.source.id == this.twitterBackend.userid()) {
          if(console) console.debug('unfavorite: you are source');
        } else {
          if(console) console.debug('unfavorite: you are not source');
        }
        break;
      case 'list_member_removed':
        if(data.source.id == this.twitterBackend.userid()) {
          if(console) console.debug('unfavorite: you are source');
        } else {
          if(console) console.debug('unfavorite: you are not source');
        }
        break;
      case 'list_user_subscribed':
        if(data.source.id == this.twitterBackend.userid()) {
          if(console) console.debug('unfavorite: you are source');
        } else {
          if(console) console.debug('unfavorite: you are not source');
        }
        break;
      case 'list_user_unsubscribed':
        if(data.source.id == this.twitterBackend.userid()) {
          if(console) console.debug('unfavorite: you are source');
        } else {
          if(console) console.debug('unfavorite: you are not source');
        }
        break;
      case 'user_update':
        break;
      default:
        break;
    }
  },

  retrieveUsersData: function(usersIdList) {
    var closure_lookupUsers = function(self) {
      return function(success, users) {
        if(!success) {
          // Try again in a while...
          setTimeout(function(self) {
            self.retrieveUsersData(usersIdList);
          }, 120000, self);
          return;
        }
        for(var i = 0, len = users.length; i < len; ++i) {
          var user = users[i];
          self.followingUsersMap[user.screen_name] = user;
          self.followingUsersNames.push(user.screen_name);
        }
        self.followingUsersNames.sort(function(a, b) {
          return a.toUpperCase().localeCompare(b.toUpperCase());
        });
      };
    };
    this.twitterBackend.lookupUsers(closure_lookupUsers(this), usersIdList);
  },

  retrieveFollowingUsers: function() {
    this.followingUsersNames = [];
    this.followingUsersMap = {};
    var closure_friendsIds = function(self) {
      return function(success, usersData) {
        if(!success) {
          // Try again in a while...
          setTimeout(function(self) {
            self.retrieveFollowingUsers();
          }, 120000, self);
          return;
        }
        var idsList = usersData.ids;
        if(!idsList) {
          idsList = [];
        }
        for(var i = 0, len = Math.ceil(idsList.length / 100.0); i < len; ++i) {
          var firstIndex = i * 100, idsListSlice = idsList.slice(firstIndex, firstIndex + 100);
          self.retrieveUsersData(idsListSlice);
        }
      }
    };
    this.twitterBackend.friendsIds(closure_friendsIds(this));
  },

  getFollowingUsers: function() {
    return this.followingUsersNames;
  },

  getFollowingUsersMap: function() {
    return this.followingUsersMap;
  },

  resetTimeline: function(timelineId) {
    var timeline = this.getTimeline(timelineId);
    if(timeline) {
      timeline.reset();
    }
  },

  followUser: function(callback, username) {
    var closure_follow = function(self) {
      return function(success, userData) {
        if(success) {
          self.followingUsersMap[userData.screen_name] = userData;
          self.followingUsersNames.push(userData.screen_name);
          self.followingUsersNames.sort(function(a, b) {
            return a.toUpperCase().localeCompare(b.toUpperCase());
          });
          self.resetTimeline(TimelineTemplate.HOME);
          self.resetTimeline(TimelineTemplate.UNIFIED);
        }
        callback(success, userData);
      }
    };
    this.twitterBackend.follow(closure_follow(this), username);
  },

  _removeUser: function(userData, isBlocked) {
    delete this.followingUsersMap[userData.screen_name];
    var position = $.inArray(userData.screen_name, this.followingUsersNames);
    if(position > -1) {
      this.followingUsersNames.splice(position, 1);
    }
    this.resetTimeline(TimelineTemplate.HOME);
    this.resetTimeline(TimelineTemplate.UNIFIED);

    if(isBlocked) {
      this.blockedUserNames[userData.screen_name] = userData;
      this.eachTimeline(function(timeline) {
        timeline.purgeBlockedTweets();
      }, true);
    }
  },

  unfollowUser: function(callback, username) {
    var closure_unfollow = function(self) {
      return function(success, userData) {
        if(success) {
          self._removeUser(userData);
        }
        callback(success, userData);
      };
    };
    this.twitterBackend.unfollow(closure_unfollow(this), username);
  },

  blockUser: function(callback, username) {
    var closure_block = function(self) {
      return function(success, userData) {
        if(success) {
          self._removeUser(userData, true);
        }
        callback(success, userData);
      };
    };
    this.twitterBackend.block(closure_block(this), username);
  },

  reportUser: function(callback, username) {
    var closure_report = function(self) {
      return function(success, userData) {
        if(success) {
          self._removeUser(userData, true);
        }
        callback(success, userData);
      };
    };
    this.twitterBackend.report(closure_report(this), username);
  },

  retrieveTrendingTopics: function() {
    var woeid = OptionsBackend.get('trending_topics_woeid'),
    closure_trendingTopics = function(self) {
      return function(success, userData) {
        if(success) self.cachedTrendingTopics = userData[0];
      };
    };
    if(this.lastTrendsTime && this.cachedTrendingTopics && (Date.now() - this.lastTrendsTime) < 90 * 1000) {
      return;
    }
    this.lastTrendsTime = Date.now();
    this.twitterBackend.trendingTopics(closure_trendingTopics(this), woeid);
    setTimeout(function(self) {
      self.retrieveTrendingTopics();
    }, 5 * 60 * 1000, this);
  },

  worldWideWoeid: {
    woeid: 1,
    name: 'Worldwide'
  },

  retrieveTrendingRegions: function(callback) {
    if(this.ttLocales === null) {
      var closure_trendingPlaces = function(self) {
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
          woeids.unshift(self.worldWideWoeid);
          self.ttLocales = woeids;
          callback(woeids);
        };
      };
      this.twitterBackend.trendingPlaces(closure_trendingPlaces(this));
    }

    return this.ttLocales || [this.worldWideWoeid];
  },

  isSavedSearch: function(query) {
    for(var i = 0, len = this.savedSearchCache.length; i < len; i++){
      if(this.savedSearchCache[i].query == query) return i;
    }
    return -1;
  },

  retrieveSavedSearches: function(){
    var closure_savedSearches = function(self) {
      return function(success, userData) {
        if(success) self.savedSearchCache = userData;
      };
    };
    this.twitterBackend.savedSearches(closure_savedSearches(this));
    setTimeout(function(self) {
      self.retrieveSavedSearches();
    }, 5 * 60 * 1000, this);
  },

  createSavedSearches: function(query){
    var closure_createSavedSearches = function(self) {
      return function(success, userData, fmtError) {
        if(!success) {
          self.setWarning(fmtError);
        } else {
          self.savedSearchCache.push(userData);
          //TODO want to call retriveSavedSaearches here
        }
      };
    };
    this.twitterBackend.createSavedSearches(closure_createSavedSearches(this), query);
  },

  destorySavedSearches: function(query){
    var index = this.isSavedSearch(query);
    if(index < 0) {
      this.setWarning('Query is not saved.');
      return;
    }
    var closure_destorySavedSearches = function(self) {
      return function(success, userData, fmtError) {
        if(!success) {
          self.setWarning(fmtError);
        } else {
          self.savedSearchCache.splice(index, 1);
          //TODO want to call retriveSavedSaearches here
        }
      };
    };
    this.twitterBackend.destorySavedSearches(closure_destorySavedSearches(this), this.savedSearchCache[index].id);
  },

  retrieveBearerToken: function() {
    var closure_retrieveBearerToken = function(self) {
      return function(success, data, status, context, request) {
        if(!success || !data.access_token) {
          self.bearerTokenData.remove();
          OptionsBackend.saveOption('use_bearer_token', false);
        } else {
          self.bearerTokenData.save(data.access_token);
        }
      };
    };
    this.twitterBackend.retrieveBearerToken(closure_retrieveBearerToken(this));
  },

  cleanupCachedData: function() {
    this.unreadTweets = {};
    this.readTweets = {};
    this.shouldNotReadMap = {};
    this.retweets = {};
    this.notifiedRetweets = {};
  }
};

/* Clean up old versions mess */
Persistence.cleanupOldData();

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
      if(compareVersions(storageVersion, [0, 5, 2, 4]) <= 0) {
        if(OptionsBackend.get('name_attribute') !== 'both') {
          OptionsBackend.saveOption('compliant_twitter_display_requirements', false);
        }
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

  var waitingFirstRequest = true;
  var selectedResponse = null;
  var biggestArea = -1;
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if(request.cb_requesting_tweets) {
      if(waitingFirstRequest) {
        waitingFirstRequest = false;
        setTimeout(function() {
          if(selectedResponse) {
            selectedResponse({
              tweets: TweetManager.instance.injectTweets,
              fadeTimeout: OptionsBackend.get('notification_fade_timeout')
            });
          }
          waitingFirstRequest = true;
          TweetManager.instance.injectTweets = [];
          biggestArea = -1;
        }, 200);
      }
      var area = request.frame_area;
      if(area >= biggestArea) {
        biggestArea = area;
        selectedResponse = sendResponse;
      }
      return true;
    }
  });
}
