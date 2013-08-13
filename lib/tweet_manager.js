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
  this.retweets = {};
  this.injectTweets = [];

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
  })(this), true);
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
    (function(self) {
      return function() {
        TimelineTemplate.initAfterAuthentication();
        self.authenticated = true;
        $.when(
          self.retrieveLists(true),
          self.retrieveBlockedUsers(),
          self.retrieveFollowingUsers()
        )
        .done((function(self) {
          return function() {
            self.eachTimeline(function(timeline) {
              timeline.init();
            }, true);
          }
        })(self))
        .fail(function(e) {
          console.error('Fail retrieving necessary data');
        });
        self.retrieveTrendingTopics();
        self.retrieveSavedSearches();
        self.retrieveHitsUpdate();
        self.setAlarms();
        StreamListener.start(self.twitterBackend);
        StreamListener.subscribe(self.onStreamData, self);
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
    var newState = !template.showNotification;
    template.setShowNotification(newState);
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

  retrieveBlockedUsers: function() {
    var d = new $.Deferred();
    this.twitterBackend.blockedUsers((function(self, deferred) {
      return function(success, users, status, context) {
        if(!success) {
          return deferred.reject();
        }
        self.blockedUserNames = {};
        for(var i = 0, len = users.length; i < len; ++i) {
          var user = users[i];
          self.blockedUserNames[user.screen_name] = user;
        }
        self.eachTimeline(function(timeline) {
          timeline.purgeBlockedTweets();
        }, true);
        return deferred.resolve();
      };
    })(this, d));
    return d.promise();
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
    var icon = new Image();
    icon.onload = (function(self) {
      return function() {
        self.iconImg = icon;
        self.updateAlert();
        icon = null;
      };
    })(this);
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
      if(timelineTemplate.showNotification) {
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

  showTweetsNotifications: function(tweetsToNotify) {
    if(!tweetsToNotify || tweetsToNotify.length === 0) {
      return;
    }
    var maxTweetsNotifications = OptionsBackend.get('notification_max_popups');
    if(maxTweetsNotifications != -1 && tweetsToNotify.length > maxTweetsNotifications) {
      tweetsToNotify.splice(maxTweetsNotifications, tweetsToNotify.length - maxTweetsNotifications);
    }
    this.injectTweets = this.injectTweets.concat(tweetsToNotify);
    var notificationStyle = OptionsBackend.get('tweets_notification_style');
    if(notificationStyle === 'desktop') {
      try {
        var notificationCenter = window.notifications || window.webkitNotifications;
        if(!notificationCenter) {
          throw 'NotificationCenter not available';
        }
        var authStatus = notificationCenter.checkPermission();
        if(authStatus == 1 || authStatus == 2) { //Not Allowed or Denied
          throw 'Desktop notifications not allowed';
        }
        for(var i = 0, len = tweetsToNotify.length; i < len; ++i) {
          var notification;
          try {
            notification = notificationCenter.createHTMLNotification(chrome.extension.getURL('tweets_notifier.html'));
            notification.show();
          } catch(e) {
            var tweet = this.injectTweets.shift()
            var user = tweet.user, notificationText = tweet.text, notificationTitle = '', nameAttribute = 'both';
            if(tweet.retweeted_status) {
              user = tweet.retweeted_status.user;
              notificationText = tweet.retweeted_status.text;
            }
            if(!OptionsBackend.get('compliant_twitter_display_requirements')) {
              nameAttribute = OptionsBackend.get('name_attribute');
            }
            switch(nameAttribute) {
              case 'screen_name':
                notificationTitle = '@' + user.screen_name;
                break;
              case 'name':
                notificationTitle = user.name;
                break;
              default:
                notificationTitle = user.name + ' @' + user.screen_name;
                break;
            }
            var notificationImage = user.profile_image_url.replace(/_normal\.(jpe?g|gif|png)$/, '.$1');
            var notification = chrome.notifications.create('__Silverbird_M__' + tweet.id, {
              type: 'basic',
              iconUrl: notificationImage,
              title: notificationTitle,
              message: notificationText
            }, function(notificationId) {
              var timeoutId = 0;
              var clickedHandler = function(clickedNotification) {
                if(timeoutId > 0 && notificationId === clickedNotification) {
                  clearInterval(timeoutId);
                }
                chrome.notifications.onClicked.removeListener(arguments.callee);
              };
              timeoutId = setTimeout(function() {
                chrome.notifications.clear(notificationId, function(wasCleared) {
                  chrome.notifications.onClicked.removeListener(clickedHandler);
                });
              }, OptionsBackend.get('notification_fade_timeout'));
              chrome.notifications.onClicked.addListener(clickedHandler);
            });
          }
        }
      } catch(e) {
        console.warn(e);
        OptionsBackend.saveOption('tweets_notification_style', 'never');
      }
    }
  },

  registerNewTweetsCallback: function(callback) {
    this.newTweetsCallback = callback;
  },

  readTweet: function(id) {
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
          self.retweets[id] = data.id;
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
    if(force) {
      this.listsCache = null;
    }
    this.twitterBackend.lists((function(self, deferred) {
      return function(success, data, status) {
        if(success && data) {
          self.listsCache = data.lists || [];
        } else {
          self.listsCache = [];
        }
        self.twitterBackend.subs((function(self, deferred) {
          return function(success, data, status) {
            if(success && data) {
              var lists_subs = data.lists || [];
              self.listsCache = self.listsCache.concat(lists_subs);
              return deferred.resolve();
            }
            return deferred.reject();
          };
        })(self, deferred));
        return deferred.progress();
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
      this.orderedEachTimeline((function(self) {
        return function(timeline) {
          currentTimeline = self.currentTimelineId = timeline.timelineId;
          return false;
        };
      })(this), true);
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
    chrome.alarms.clearAll();
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
    if(data.delete) {
      //DONOT behavior
    }
    if(data.scrub_geo) {
      //DONOT behavior
    }
    if(data.limit) {
      //DONOT behavior
    }
    if(data.status_withheld) {
      //DONOT behavior
    }
    if(data.user_withheld) {
      //DONOT behavior
    }
    if(data.disconnect) {
      //TODO notify disconnect
    }
    if(data.warning) {
      //TODO notify stall
      //TODO handle FOLLOWS_OVER_LIMIT
    }
    if(data.friends) {
      //TODO users/lookup may call
    }
    if(data.event) {
      var context = {
        "created_at": data.created_at,
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
          0, // static messages
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
          if(data.source.id == this.twitterBackend.userid()) {
            var favTimeline = this.timelines[TimelineTemplate.FAVORITES];
            if(favTimeline) {
              favTimeline.pushTweet(data.target_object);
            }
            this.eachTimeline(function(timeline) {
              var tweet = timeline.findTweet(data.target_object.id);
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
          if(data.source.id == this.twitterBackend.userid()) {
            var favTimeline = this.timelines[TimelineTemplate.FAVORITES];
            if(favTimeline) {
              favTimeline.removeFromCache(data.target_object.id);
            }
            this.eachTimeline(function(timeline) {
              var tweet = timeline.findTweet(data.target_object.id);
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
          if(data.source.id == this.twitterBackend.userid()) {
            console.log('You follow ' + data.target.screen_name);
            console.log(data);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_follow", [data.source.screen_name]);
            context.entities.user_mentions.push(sourceForEntities);
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
          if(data.source.id == this.twitterBackend.userid()) {
            console.log('You add member for list ' + data.target_object.full_name);
            console.log(data);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_list_member_added", [data.source.screen_name]);
            context.entities.user_mentions.push(sourceForEntities);
          }
          break;
        case 'list_member_removed':
          if(data.source.id == this.twitterBackend.userid()) {
            console.log('You remove member for list ' + data.target_object.full_name);
            console.log(data);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_ist_member_removed", [data.source.screen_name]);
            context.entities.user_mentions.push(sourceForEntities);
          }
          break;
        case 'list_user_subscribed':
          if(data.source.id == this.twitterBackend.userid()) {
            console.log('You subscribe list ' + data.target_object.full_name);
            console.log(data);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_list_user_subscribed", [data.source.screen_name]);
            context.entities.user_mentions.push(sourceForEntities);
          }
          break;
        case 'list_user_unsubscribed':
          if(data.source.id == this.twitterBackend.userid()) {
            console.log('You unsubscribe list ' + data.target_object.full_name);
            console.log(data);
            return; // do not notification
          } else {
            context.text = chrome.i18n.getMessage("n_list_user_unsubscribed", [data.source.screen_name]);
            context.entities.user_mentions.push(sourceForEntities);
          }
          break;
        case 'user_update':
          context.text = 'user update';
          break;
        default:
          console.log(data);
          return;
      }
      if(OptionsBackend.get('unified_visible') && OptionsBackend.get('notification_include_unified')) {
        var notification = this.timelines[TimelineTemplate.NOTIFICATION];
        if(notification) notification._handleStreamData(context);
      }
    }
  },

  retrieveUsersData: function(usersIdList) {
    this.twitterBackend.lookupUsers((function(self) {
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
    })(this), usersIdList);
  },

  retrieveFollowingUsers: function() {
    var d = new $.Deferred();
    this.followingUsersNames = [];
    this.followingUsersMap = {};
    this.twitterBackend.friendsIds((function(self, deferred) {
      return function(success, usersData) {
        if(!success) {
          return deferred.reject();
        }
        var idsList = usersData.ids;
        if(!idsList) {
          idsList = [];
        }
        for(var i = 0, len = Math.ceil(idsList.length / 100.0); i < len; ++i) {
          var firstIndex = i * 100, idsListSlice = idsList.slice(firstIndex, firstIndex + 100);
          self.retrieveUsersData(idsListSlice);
        }
        return deferred.resolve();
      };
    })(this, d));
    return d.promise();
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
    this.twitterBackend.follow((function(self) {
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
    })(this), username);
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
    this.twitterBackend.unfollow((function(self) {
      return function(success, userData) {
        if(success) {
          self._removeUser(userData);
        }
        callback(success, userData);
      };
    })(this), username);
  },

  blockUser: function(callback, username) {
    this.twitterBackend.block((function(self) {
      return function(success, userData) {
        if(success) {
          self._removeUser(userData, true);
        }
        callback(success, userData);
      };
    })(this), username);
  },

  reportUser: function(callback, username) {
    this.twitterBackend.report((function(self) {
      return function(success, userData) {
        if(success) {
          self._removeUser(userData, true);
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
        if(success) self.cachedTrendingTopics = userData[0];
      };
    })(this), woeid);
  },

  worldWideWoeid: {
    woeid: 1,
    name: 'Worldwide'
  },

  retrieveTrendingRegions: function(callback) {
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
          woeids.unshift(self.worldWideWoeid);
          self.ttLocales = woeids;
          callback(woeids);
        };
      })(this));
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
    this.twitterBackend.savedSearches((function(self) {
      return function(success, userData) {
        if(success) self.savedSearchCache = userData;
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
          //TODO want to call retriveSavedSaearches here
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
          //TODO want to call retriveSavedSaearches here
        }
      };
    })(this), this.savedSearchCache[index].id);
  },

  retrieveBearerToken: function() {
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
    this.unreadTweets = {};
    this.retweets = {};
  },

  setAlarms: function() {
    var retrive_blocked_users_interval = OptionsBackend.get('blockedusers_refresh_interval') || 5,
      retrieve_trending_topics_interval = OptionsBackend.get('trends_in_places') || 5,
      retrieve_saved_searches_interval = OptionsBackend.get('saved_searches') || 5;
    const retrive_lists_interval = 5, // static
      retrieve_following_users_interval = 5, // static
      retrieve_hits_update_interval = 1; // static
    chrome.alarms.create('retrieve_lists', {
      delayInMinutes: retrive_lists_interval,
      periodInMinutes: retrive_lists_interval
    });
    chrome.alarms.create('retrieve_blocked_users', {
      delayInMinutes: retrive_blocked_users_interval,
      periodInMinutes: retrive_blocked_users_interval
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
    chrome.alarms.onAlarm.addListener((function(self) {
      return function(alarm) {
        self.onAlarmFired.call(self, alarm);
      };
    })(this));
  },

  onAlarmFired: function(alarm) {
    switch(alarm.name) {
      case 'retrieve_lists':
        this.retrieveLists(true);
        break;
      case 'retrieve_blocked_users':
        this.retrieveBlockedUsers();
        break;
      case 'retrieve_following_users':
        this.retrieveFollowingUsers();
        break;
      case 'retrieve_trending_topics':
        this.retrieveTrendingTopics();
        break;
      case 'retrieve_saved_sarches':
        this.retrieveSavedSearches();
        break;
      case 'retrieve_hits_update':
        this.retrieveHitsUpdate();
        break;
      default:
        break;
    }
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
}
