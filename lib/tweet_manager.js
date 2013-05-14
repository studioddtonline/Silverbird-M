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

  var _this = this;

  TimelineTemplate.initTemplates(this);
  TimelineTemplate.eachTimelineTemplate(function(template) {
    _this.createTimelineTemplate(template, true);
  });

  this.orderedEachTimeline(function(timeline) {
    _this.currentTimelineId = timeline.timelineId;
    return false;
  }, true);
  this.previousTimelineId = null;

  this.warningsCallback = null;
  this.warningMessage = null;
  this.autoClearWarning = false;

  this.apiHitsStates = [];
  this.firstPossibleWarnTime = null;
  
  this.ttLocales = null;

  this.authenticated = false;

  this.initIconAndAlerts();

  this.twitterBackend = new TwitterLib(
    function onAuthenticated() {
      TimelineTemplate.initAfterAuthentication();
      _this.authenticated = true;
      _this.retrieveBlockedUsers();
      _this.eachTimeline(function(timeline) {
        timeline.init();
      }, true);
      _this.retrieveFollowingUsers();
      StreamListener.start(this);
    },
    function(rateLimits) {
      _this.onHitsUpdated.call(_this, rateLimits);
    },
    this.oauthTokenData,
    this.bearerTokenData);

  this.sendQueue = new SendQueue(this.twitterBackend);
  
  this.shortenerAuth = {
    token: OptionsBackend.get('shortener_token'),
    tokenSecret: OptionsBackend.get('shortener_token_secret'),
    tokenRequested: false,
    callback: null,
    longUrl: ''
  };

  if(OptionsBackend.get('use_bearer_token')) {
    if(!this.bearerTokenData.val()) {
      this.retrieveBearerToken();
    }
  } else {
    this.bearerTokenData.remove();
  }
}

TweetManager.prototype = {

  disableDMS: function() {
    this.hideTimelineTemplate(TimelineTemplate.DMS);
    this.toggleUnified(TimelineTemplate.DMS, false);
    var views = chrome.extension.getViews({type: 'popup'});
    if(views) {
      for(var i = 0; i < views.length; ++i) {
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
    var _this = this;
    this.twitterBackend.blockedUsers(function(success, users, status, context) {
        var refreshTime;
        if(success) {
          _this.blockedUserNames = {};
          for(var i = 0, len = users.length; i < len; ++i) {
            var user = users[i];
            _this.blockedUserNames[user.screen_name] = user;
          }
          refreshTime = OptionsBackend.get('blockedusers_refresh_interval');
          errWaitTime = null;

          _this.eachTimeline(function(timeline) {
            timeline.purgeBlockedTweets();
          }, true);
        } else {
          if(!errWaitTime) {
            errWaitTime = 5000;
          }
          refreshTime = errWaitTime;
          errWaitTime *= 2;
        }

        setTimeout(function() { _this.retrieveBlockedUsers(errWaitTime); }, refreshTime);
    });
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
    for(var i = 0; i < retList.length; ++i) {
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
    for(var i = 0; i < this.timelineOrderCache.length; ++i) {
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
    var $icon = $(document.createElement('img')).attr('src', 'img/icon19.png');
    this.iconImg = $icon[0];
    var _this = this;
    $icon.load(function() {
      _this.updateAlert();
    });
  },

  unique: function(srcList) {
    var newList = [];
    for(var i = 0; i < srcList.length; ++i) {
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

        var _this = this;
        for(i = 0; i < tweetsToNotify.length; ++i) {
          var notification = notificationCenter.createHTMLNotification(
            chrome.extension.getURL('tweets_notifier.html'));
          (function inClosure(tweet) {
            notification.onclose = function(e) {
              setTimeout(function() {
                _this.readTweet(tweet.id);
              }, 200);
            };
          })(tweetsToNotify[i]);
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
    this.notifyNewTweets();
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
      var _this = this;
      this.eachTimeline(function(timeline) {
        var newTweets = timeline.newTweetsCount();
        try {
          // The callback might be invalid (popup not active), so let's ignore errors for now.
          _this.newTweetsCallback(newTweets[0], newTweets[1], timeline.timelineId);
        } catch(e) { /* ignoring */ }
      });
    }

    this.updateAlert();
  },

  enqueueTweet: function(msg, replyId) {
    this.sendQueue.enqueueTweet(msg, replyId);
  },

  postRetweet: function(callback, id) {
    var _this = this;
    return this.twitterBackend.retweet(function(success, data, status) {
      if(success) {
        _this.retweets[id] = data.id;
      }
      callback(success, data, status);
    }, id);
  },

  getInReplyToTweet: function(callback, tweet) {
    if(tweet.inReplyToTweet) {
      callback(true, tweet.inReplyToTweet);
      return;
    }
    var _this = this;
    this.twitterBackend.showTweet(function(success, data, status) {
      if(success) {
        tweet.inReplyToTweet = data;
      }
      callback(success, data, status);
    }, tweet.in_reply_to_status_id);
  },

  destroy: function(callback, tweetTimelineId, id) {
    var _this = this;
    var firstCallback = function(success, data, status) {
      if(success) {
        _this.eachTimeline(function(timeline) {
          timeline.removeFromCache(id);
        }, true);
      }
      callback(success, data, status);
    };
    if(tweetTimelineId == TimelineTemplate.RECEIVED_DMS || tweetTimelineId == TimelineTemplate.SENT_DMS) {
      return this.twitterBackend.destroyDM(firstCallback, id);
    } else {
      return this.twitterBackend.destroy(firstCallback, id);
    }
  },

  favorite: function(callback, id) {
    var _this = this;
    var firstCallback = function(success, data, status) {
      if(success) {
        var favTimeline = _this.timelines[TimelineTemplate.FAVORITES];
        if(favTimeline) {
          favTimeline.pushTweet(data);
        }
        _this.eachTimeline(function(timeline) {
          var tweet = timeline.findTweet(id);
          if(tweet)
            tweet.favorited = true;
        }, true);
      }
      callback(success, data, status);
    };
    return this.twitterBackend.favorite(firstCallback, id);
  },

  unFavorite: function(callback, id) {
    var _this = this;
    var firstCallback = function(success, data, status) {
      if(success) {
        var favTimeline = _this.timelines[TimelineTemplate.FAVORITES];
        if(favTimeline) {
          favTimeline.removeFromCache(id);
        }
        _this.eachTimeline(function(timeline) {
          var tweet = timeline.findTweet(id);
          if(tweet)
            tweet.favorited = false;
        }, true);
      }
      callback(success, data, status);
    };
    return this.twitterBackend.unFavorite(firstCallback, id);
  },

  lists: function(force, callback) {
    if(!TimelineTemplate.getTemplate(TimelineTemplate.LISTS).visible) {
      /* No lists tab should be shown, let's just ignore the callback */
      return;
    }
    var lastCallTime = (this.twitterBackend.remainingHitsInfo())['lists/list'].last || 0;
    if(force && ($.now() - lastCallTime) > 1000) {
      this.listsCache = null;
    }
    if(!this.listsCache) {
      var _this = this;
      this.twitterBackend.lists(function(success, data, status) {
        if(success) {
          _this.listsCache = data;
          _this.twitterBackend.subs(function(success, data, status) {
            if(success) {
              _this.listsCache = _this.listsCache.concat(data);
            }
            if(callback) {
              callback(success, _this.listsCache, status);
            }
          });
        } else {
          if(callback) {
            callback(success, _this.listsCache, status);
          }
        }
      });
      delete _this;
      return;
    }
    if(callback) {
      callback(true, this.listsCache, null);
    }
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
      for(var i = 0; i < this.listsCache.length; ++i) {
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
      for(var i = 0; i < this.listsCache.length; ++i) {
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
    if(syncNew && timeline.template.includeInUnified) {
      var originalCallback = callback;
      var _this = this;
      callback = function(tweets, timelineId) {
        originalCallback(tweets, timelineId);
        _this.timelines[TimelineTemplate.UNIFIED].giveMeTweets(originalCallback, false, true);
      };
    }
    return timeline.giveMeTweets(callback, syncNew, cacheOnly);
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
      var _this = this;
      this.orderedEachTimeline(function(timeline) {
        currentTimeline = _this.currentTimelineId = timeline.timelineId;
        return false;
      }, true);
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
        StreamListener.disconnect(true);
      } else {
        StreamListener.start(this.twitterBackend);
      }
    }
    return this.suspend;
  },

  stopAll: function() {
    this.eachTimeline(function(timeline) {
      timeline.killTimeline();
      delete timeline;
    }, true);
    StreamListener.disconnect();
  },

  signout: function() {
    this.oauthTokenData.remove();
    this.bearerTokenData.remove();
    this.stopAll();
    TweetManager.instance = new TweetManager();
    var views = chrome.extension.getViews({type: 'popup'});
    if(views) {
      for(var i = 0; i < views.length; ++i) {
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
    initializeJQueryOptions();
    TweetManager.instance = new TweetManager();
  },

  onHitsUpdated: function(rateLimits) {
    var apihits = '';
    var nextResetDate = (new Date()).getTime();
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

  retrieveUsersData: function(usersIdList) {
    var _this = this;
    this.twitterBackend.lookupUsers(function(success, users) {
      if(!success) {
        // Try again in a while...
        setTimeout(function() {
          _this.retrieveUsersData(usersIdList);
        }, 120000);
        return;
      }
      for(var i = 0, len = users.length; i < len; ++i) {
        var user = users[i];
        _this.followingUsersMap[user.screen_name] = user;
        _this.followingUsersNames.push(user.screen_name);
      }
      _this.followingUsersNames.sort(function(a, b) {
        return a.toUpperCase().localeCompare(b.toUpperCase());
      });
    }, usersIdList);
  },

  retrieveFollowingUsers: function() {
    this.followingUsersNames = [];
    this.followingUsersMap = {};
    var _this = this;
    this.twitterBackend.friendsIds(function(success, usersData) {
      if(!success) {
        // Try again in a while...
        setTimeout(function() {
          _this.retrieveFollowingUsers();
        }, 120000);
        return;
      }
      var idsList = usersData.ids;
      if(!idsList) {
        idsList = [];
      }
      for(var i = 0, len = Math.ceil(idsList.length / 100.0); i < len; ++i) {
        var firstIndex = i * 100;
        var idsListSlice = idsList.slice(firstIndex, firstIndex + 100);
        _this.retrieveUsersData(idsListSlice);
      }
    });
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
    var _this = this;
    this.twitterBackend.follow(function(success, userData) {
      if(success) {
        _this.followingUsersMap[userData.screen_name] = userData;
        _this.followingUsersNames.push(userData.screen_name);
        _this.followingUsersNames.sort(function(a, b) {
          return a.toUpperCase().localeCompare(b.toUpperCase());
        });
        _this.resetTimeline(TimelineTemplate.HOME);
        _this.resetTimeline(TimelineTemplate.UNIFIED);
      }
      callback(success, userData);
    }, username);
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
    var _this = this;
    this.twitterBackend.unfollow(function(success, userData) {
      if(success) {
        _this._removeUser(userData);
      }
      callback(success, userData);
    }, username);
  },

  blockUser: function(callback, username) {
    var _this = this;
    this.twitterBackend.block(function(success, userData) {
      if(success) {
        _this._removeUser(userData, true);
      }
      callback(success, userData);
    }, username);
  },

  reportUser: function(callback, username) {
    var _this = this;
    this.twitterBackend.report(function(success, userData) {
      if(success) {
        _this._removeUser(userData, true);
      }
      callback(success, userData);
    }, username);
  },

  retrieveTrendingTopics: function(callback, woeid) {
    var _this = this;

    if(this.lastTrendsTime && this.cachedTrendingTopics && (new Date() - this.lastTrendsTime) < 90 * 1000) {
      setTimeout(function() {
        callback(_this.cachedTrendingTopics);
      }, 0);
      return;
    }
    this.lastTrendsTime = new Date();

    this.twitterBackend.trendingTopics(function(success, userData) {
      if(success) {
        _this.cachedTrendingTopics = userData[0];
      }
      callback(_this.cachedTrendingTopics);
    }, woeid);
  },

  worldWideWoeid: {
    woeid: 1,
    name: 'Worldwide'
  },

  retrieveTrendingRegions: function(callback) {
    if(this.ttLocales === null) {
      var _this = this;
      this.twitterBackend.trendingPlaces(function(success, userData) {
        if(!success) {
          return;
        }

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

        woeids.unshift(_this.worldWideWoeid);
        _this.ttLocales = woeids;
        callback(woeids);
      });
    }

    return this.ttLocales || [this.worldWideWoeid];
  },

  isSavedSearch: function(query) {
    for(var i = 0, j = this.savedSearchCache.length; i < j; i++){
      if(this.savedSearchCache[i].query == query) {
        return i;
      }
    }
    return -1;
  },

  retrieveSavedSearches: function(callback){
    var _this = this;
    this.twitterBackend.savedSearches(function(success, userData) {
      if(!success) {
        callback(_this.savedSearchCache);
      }
      _this.savedSearchCache = userData;
      callback(_this.savedSearchCache);
    });
  },

  createSavedSearches: function(query){
    var _this = this;
    this.twitterBackend.createSavedSearches(function(success, userData, fmtError) {
      if(!success) {
        _this.setWarning(fmtError);
      } else {
        _this.savedSearchCache.push(userData);
        //TODO want to call retriveSavedSaearches here
      }
    }, query);
  },

  destorySavedSearches: function(query){
    var _this = this;
    var index = this.isSavedSearch(query);
    if(index < 0) {
      this.setWarning('Query is not saved.');
      return;
    }
    this.twitterBackend.destorySavedSearches(function(success, userData, fmtError) {
      if(!success) {
        _this.setWarning(fmtError);
      } else {
        _this.savedSearchCache.splice(index, 1);
        //TODO want to call retriveSavedSaearches here
      }
    }, this.savedSearchCache[index].id);
  },

  retrieveBearerToken: function() {
    var _this = this;
    this.twitterBackend.retrieveBearerToken(function(success, bearerToken, fmtError) {
      if(!success) {
        _this.setWarning(fmtError);
        //TODO process for retry
        setTimeout(_this.retrieveBearerToken, 30 * 60 * 1000);
        return;
      }
    });
  }
};

/* Clean up old versions mess */
Persistence.cleanupOldData();

function compareVersions(v1, v2) {
  if(!v1) return -1;
  if(!v2) return 1;
  var maxLen = Math.max(v1.length, v2.length);
  for(var i = 0; i < maxLen; ++i) {
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
      if(compareVersions(storageVersion, [0, 4, 9, 5]) <= 0) {
      }
      storageData.save(JSON.stringify(currentVersion));
    }
  } catch(e) {
    /* experimental code, something can go wrong */
    console.log(e);
  }
}

initializeExtension();
$.ajax({
  type: 'GET',
  url: 'manifest.json',
  data: {},
  dataType: "json",
  timeout: 5000
})
.done(function(data, status) {
  checkVersionChanges(data);
})
.fail(function (request, status, error) {
  try {
    // Ugly hack, but currently Chrome is returning an error
    checkVersionChanges(JSON.parse(request.responseText));
  } catch(e) {
    /* Something can go wrong, ignoring... */
  }
});

function initializeExtension() {
  TweetManager.instance = new TweetManager();

  var waitingFirstRequest = true;
  var selectedResponse = null;
  var biggestArea = -1;
  chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
    if(request.cb_requesting_tweets) {
      if(waitingFirstRequest) {
        waitingFirstRequest = false;
        setTimeout(function() {
          if(selectedResponse) {
            selectedResponse({
              tweets: TweetManager.instance.injectTweets,
              nameAttribute: OptionsBackend.get('name_attribute'),
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
      return;
    }
  });
}
