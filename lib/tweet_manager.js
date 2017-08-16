"use strict";

function TweetManager() {
  this.unreadTweetsSet = new Set();
  this.retweetsMap = new Map();

  // Using an object instead of an array to take advantage of hash look-ups
  this.churnActionsMap = new Map([[Symbol.for("SilM"), Date.now()]]);

  this.composerData = new ComposerData();

  this.timelines = new Map();
  this.iconImg = null;

  this.timelineOrderData = Persistence.timelineOrder();
  this.oauthTokenData = Persistence.oauthTokenData();
  this.windowPositionData = Persistence.windowPosition();
  this.popupSizeData = Persistence.popupSize();
  this.cachedListsOwnershipsData = Persistence.cachedListsOwnerships();
  this.cachedListsSubscriptionsData = Persistence.cachedListsSubscriptions();
  this.cachedSavedSearchesData = Persistence.cachedSavedSearches();
  this.cachedFollowingIdsData = Persistence.cachedFollowingIds();
  this.cachedFollowingNamesData = Persistence.cachedFollowingNames();
  this.cachedFollowersIdsData = Persistence.cachedFollowersIds();
  this.cachedBlockedIdsData = Persistence.cachedBlockedIds();
  this.cachedMutingIdsData = Persistence.cachedMutingIds();

  this.previousTimelineId = null;

  this.ttLocales = null;
  this.urlExpander = null;

  this.authenticated = false;
  this.ready = false;
  this.twitterConfiguration = {
    characters_reserved_per_media: 24,
    max_media_per_upload: 1,
    photo_size_limit: 3145728,
    short_url_length: 23,
    short_url_length_https: 23,
    tweet_text_character_limit: 140,
    dm_text_character_limit: 10000
  };

  this.userstream = null;

  Object.defineProperties(this, {
    "cachedLists": {
      get: () => {
        return [...this.cachedListsOwnerships, ...this.cachedListsSubscriptions].filter(value => !!value) || [];
      }
    },
    [Symbol.for("listsOwnerships")]: {
      value: undefined,
      writable: true
    },
    "cachedListsOwnerships": {
      get: () => {
        if(!this[Symbol.for("listsOwnerships")]) {
          this[Symbol.for("listsOwnerships")] = this.cachedListsOwnershipsData.val() || [];
        }
        return this[Symbol.for("listsOwnerships")];
      },
      set: (lists = []) => {
        if(Array.isArray(lists)) {
          this[Symbol.for("listsOwnerships")] = lists;
          this.cachedListsOwnershipsData.save(lists);
        }
      }
    },
    [Symbol.for("listsSubscriptions")]: {
      value: undefined,
      writable: true
    },
    "cachedListsSubscriptions": {
      get: () => {
        if(!this[Symbol.for("listsSubscriptions")]) {
          this[Symbol.for("listsSubscriptions")] = this.cachedListsSubscriptionsData.val() || [];
        }
        return this[Symbol.for("listsSubscriptions")];
      },
      set: (lists = []) => {
        if(Array.isArray(lists)) {
          this[Symbol.for("listsSubscriptions")] = lists;
          this.cachedListsSubscriptionsData.save(lists);
        }
      }
    },
    [Symbol.for("savedSearches")]: { // Array
      value: undefined,
      writable: true
    },
    "cachedSavedSearches": {
      get: () => {
        if(!this[Symbol.for("savedSearches")]) {
          this[Symbol.for("savedSearches")] = this.cachedSavedSearchesData.val() || [];
        }
        return this[Symbol.for("savedSearches")];
      },
      set: (savedSearches = []) => {
        if(Array.isArray(savedSearches)) {
          this[Symbol.for("savedSearches")] = savedSearches;
          this.cachedSavedSearchesData.save(savedSearches);
        }
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
    },
    [Symbol.for("timelineOrder")]: { // array
      value: undefined,
      writable: true
    },
    "timelineOrder": {
      get: () => {
        return this[Symbol.for("timelineOrder")] || this.timelineOrderData.val() || [];
      },
      set: (order = []) => {
        if(Array.isArray(order)) {
          this[Symbol.for("timelineOrder")] = order;
          this.timelineOrderData.save(order);
        }
      }
    },
    [Symbol.for("followingIds")]: { // Set
      value: undefined,
      writable: true
    },
    "cachedFollowingIdsSet": {
      get: () => {
        if(!this[Symbol.for("followingIds")]) {
          this[Symbol.for("followingIds")] = new Set(this.cachedFollowingIdsData.val()) || new Set();
        }
        return this[Symbol.for("followingIds")];
      },
      set: (followingIds = new Set()) => {
        if(followingIds instanceof Set) {
          this[Symbol.for("followingIds")] = followingIds;
          this.cachedFollowingIdsData.save([...followingIds]);
        } else if(Array.isArray(followingIds)) {
          this[Symbol.for("followingIds")] = new Set(followingIds);
          this.cachedFollowingIdsData.save(followingIds);
        }
      }
    },
    [Symbol.for("followingNames")]: { // Array
      value: undefined,
      writable: true
    },
    "cachedFollowingNames": {
      get: () => {
        if(!this[Symbol.for("followingNames")]) {
          this[Symbol.for("followingNames")] = this.cachedFollowingNamesData.val() || [];
        }
        return this[Symbol.for("followingNames")];
      },
      set: (followingNames = []) => {
        if(Array.isArray(followingNames)) {
          followingNames.sort(function(a, b) {
            return a.toUpperCase().localeCompare(b.toUpperCase());
          });
          this[Symbol.for("followingNames")] = followingNames;
          this.cachedFollowingNamesData.save(followingNames);
        }
      }
    },
    [Symbol.for("followersIds")]: { // Set
      value: undefined,
      writable: true
    },
    "cachedFollowersIdsSet": {
      get: () => {
        if(!this[Symbol.for("followersIds")]) {
          this[Symbol.for("followersIds")] = new Set(this.cachedFollowersIdsData.val()) || new Set();
        }
        return this[Symbol.for("followersIds")];
      },
      set: (followersIds = new Set()) => {
        if(followersIds instanceof Set) {
          this[Symbol.for("followersIds")] = followersIds;
          this.cachedFollowersIdsData.save([...followersIds]);
        } else if(Array.isArray(followersIds)) {
          this[Symbol.for("followersIds")] = new Set(followersIds);
          this.cachedFollowersIdsData.save(followersIds);
        }
      }
    },
    [Symbol.for("blockedIds")]: { // Set
      value: undefined,
      writable: true
    },
    "cachedBlockedIdsSet": {
      get: () => {
        if(!this[Symbol.for("blockedIds")]) {
          this[Symbol.for("blockedIds")] = new Set(this.cachedBlockedIdsData.val()) || new Set();
        }
        return this[Symbol.for("blockedIds")];
      },
      set: (blockedIds = new Set()) => {
        if(blockedIds instanceof Set) {
          this[Symbol.for("blockedIds")] = blockedIds;
          this.cachedBlockedIdsData.save([...blockedIds]);
        } else if(Array.isArray(blockedIds)) {
          this[Symbol.for("blockedIds")] = new Set(blockedIds);
          this.cachedBlockedIdsData.save(blockedIds);
        }
      }
    },
    [Symbol.for("mutingIds")]: { // Set
      value: undefined,
      writable: true
    },
    "cachedMutingIdsSet": {
      get: () => {
        if(!this[Symbol.for("mutingIds")]) {
          this[Symbol.for("mutingIds")] = new Set(this.cachedMutingIdsData.val()) || new Set();
        }
        return this[Symbol.for("mutingIds")];
      },
      set: (mutingIds = new Set()) => {
        if(mutingIds instanceof Set) {
          this[Symbol.for("mutingIds")] = mutingIds;
          this.cachedMutingIdsData.save([...mutingIds]);
        } else if(Array.isArray(mutingIds)) {
          this[Symbol.for("mutingIds")] = new Set(mutingIds);
          this.cachedMutingIdsData.save(mutingIds);
        }
      }
    },
    "nm": {
      value: NotificationManager.getInstance()
    }
  });

  TimelineTemplate.initTemplates(this);
  TimelineTemplate.eachTimelineTemplate((template) => {
    this.createTimelineTemplate(template, true);
  });
  this.orderedEachTimeline((timeline) => {
    this.currentTimelineId = timeline.timelineId;
    return false;
  });

  this.twitterBackend = new TwitterLib(
    (success, data) => {
      TimelineTemplate.initAfterAuthentication(this.twitterBackend.userName);
      this.authenticated = true;
      if(this.cachedLists.length === 0 || this.cachedListsOwnerships.length !== data.listed_count) {
        this.retrieveLists().then(() => {
          this.eachTimeline(function(timeline) {
            if(timeline.template.id === TimelineTemplate.LISTS) {
              timeline.init();
            }
          });
        })
      }
      if(this.cachedFollowingIdsSet.size !== data.friends_count || this.cachedFollowingNames.length === 0) {
        this.retrieveFollowingUsers().then(() => {
          this.lookupFollowingUsers();
        }).catch((e) => {
          console.error(e);
        });
      }
      if(this.cachedFollowersIdsSet.size !== data.followers_count) {
        this.retrieveFollowers().catch((e) => {
          console.error(e);
        });
      }
      if(this.cachedBlockedIdsSet.size === 0) {
        this.retrieveBlockedUsers().catch((e) => {
          console.error(e);
        });
      }
      if(this.cachedMutingIdsSet.size === 0) {
        this.retrieveMutesUsers().catch((e) => {
          console.error(e);
        });
      }
      this.eachTimeline(function(timeline) {
        timeline.init();
      }, true);
      this.setAlarms();
      this.sendQueue = new SendQueue(this);
      this.connectStreaming();
      this.chromeContextMenusInit();
      this.ready = true;
    },
    this.oauthTokenData,
    SecretKeys.twitter.consumerSecret,
    SecretKeys.twitter.consumerKey
  );
  this.urlExpander = new Expander();
}

TweetManager.prototype = {
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

  setInfoToPopup: function(msg) {
    this.dispatchPopupEvent("silmMessage", {
      type: "showMessage",
      target: {
        type: "info",
        message: msg
      }
    });
  },

  setWarningToPopup: function(msg) {
    this.dispatchPopupEvent("silmMessage", {
      type: "showMessage",
      target: {
        type: "warning",
        message: msg
      }
    });
  },

  setErrorToPopup: function(msg) {
    this.dispatchPopupEvent("silmMessage", {
      type: "showMessage",
      target: {
        type: "error",
        message: msg
      }
    });
  },

  retrieveBlockedUsers: function(context = {cursor: "-1", current: []}) {
    if(context.cursor === "-1" && this.isChurnAction("retrieveBlockedUsers")) {
      return Promise.resolve();
    }
    return (new Promise((resolve, reject) => {
      this.twitterBackend.blockedUsers((success, data, status) => {
        if(!!success && !!data) {
          context.cursor = data.next_cursor_str || "0";
          context.current = context.current.concat(data.users.map((user) => user.id_str) || []);
          return resolve(context);
        }
        return reject(status);
      }, context.cursor);
    })).then((context) => {
      if(typeof context.cursor === "string" && context.cursor !== "0") {
        return this.retrieveBlockedUsers(context);
      }
      this.cachedBlockedIdsSet = new Set(context.current || []);
      this.eachTimeline((timeline) => {
        timeline.purgeBlockedTweets();
      }, true);
      return Promise.resolve();
    }).catch((status) => {
      console.log(status);
      return Promise.reject();
    });
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

  orderedEachTimeline: function(callback) {
    const ret = [];
    for(let [tId, timeline] of this.timelines.entries()) {
      let orderedPos = this.getTimelinePosition(tId);
      if(orderedPos === -1) {
        orderedPos = ret.length;
      }
      if(!!ret[orderedPos]) {
        ret.splice(orderedPos, 0, tId);
      } else {
        ret[orderedPos] = tId;
      }
    }
    for(let tId of ret) {
      if(!!tId) {
        let timeline = this.getTimeline(tId);
        if(timeline.template.visible && !timeline.template.hiddenTemplate) {
          if(callback.call(tId, timeline) === false) {
            break;
          }
        }
      }
    }
  },

  getTimelinePosition: function(timelineId) {
    return this.timelineOrder.indexOf(timelineId);
  },

  updateAlert: function() {
    let tweetsForNotify = new Map();
    let tweetsForBadge = new Set();
    const badgeFlag = OptionsBackend.get('badge_only_for_notification');
    this.eachTimeline(function(timeline) {
      const showNotification = timeline.template.showNotification;
      timeline.getNewTweetsCache().forEach((tweet) => {
        const tId = tweet.id_str;
        tweetsForBadge.add(tId);
        if(showNotification) {
          tweetsForNotify.set(tId, tweet);
        }
        if(!showNotification && !!badgeFlag) {
          tweetsForBadge.delete(tId);
        }
      });
    }, true);
    this.badgeIcon(tweetsForBadge.size);
    this.showTweetsNotifications([...tweetsForNotify].map(([key, value]) => {
      return JSON.parse(JSON.stringify(value)); // broken copy
    }));
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

  showTweetsNotifications: function(tweetsToNotify = []) {
    if(tweetsToNotify.length === 0
    || OptionsBackend.get("tweets_notification_style") === "never") {
      return;
    }
    this.nm.fadeTimeout = OptionsBackend.get("notification_fade_timeout");
    this.nm.addListForNotify(tweetsToNotify);
  },

  readTweet: function(id) {
    this.unreadTweetsSet.delete(id);
  },

  isTweetRead: function(id) {
    return !this.unreadTweetsSet.has(id);
  },

  isRetweeted: function(tweet) {
    let tweetId = tweet.id_str;
    if(!!tweet.current_user_retweet) {
      this.retweetsMap.set(tweetId, tweet.current_user_retweet.id_str);
    } else if(!!tweet.retweeted_status) {
      tweetId = tweet.retweeted_status.id_str;
    }
    return this.retweetsMap.has(tweetId);
  },

  notifyNewTweets: function() {
    this.eachTimeline((timeline) => {
      this.dispatchPopupEvent("updateTimeline", {
        timelineId: timeline.timelineId,
        count: timeline.getNewTweetsCount()
      });
    });
    this.updateAlert();
  },

  enqueueTweet: function(msg, replyId, replyUser, isDM, mediaIds, attachmentUrl) {
    this.sendQueue.enqueueTweet(msg, replyId, replyUser, isDM, mediaIds, attachmentUrl);
  },

  postRetweet: function(callback, id) {
    if(this.isChurnAction(id)) {
      return callback(false, {churn: true});
    }
    return this.twitterBackend.retweet((function(self) {
      return function(success, data, status) {
        if(!!success && !!data) {
          self.retweetsMap.set(id, data.id);
          let homeTimeline = self.getTimeline(TimelineTemplate.HOME);
          if(!!homeTimeline) {
            Object.defineProperty(data, "from", {
              value: "post"
            });
            homeTimeline.onStreamData(data);
          }
        } else {
          self.churnActionsMap.delete(id);
        }
        callback(success, data, status);
      };
    })(this), id);
  },

  getInReplyToTweet: function(callback, tweetId) {
    if(!callback || !tweetId) {
      throw new TypeError("missing arguments");
    }
    this.twitterBackend.showTweet((success, data, status) => {
      if(!success) {
        data = DummyTweet.generate();
        data.id = data.id_str = tweetId;
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
      } else {
        const replaseFunc = (data) => {
          const text = this.isBlocked(data.user.id_str)? chrome.i18n.getMessage("n_blocked_user"): this.isMuting(data.user.id_str)? chrome.i18n.getMessage("n_muting_user"): "";
          if(text !== "") {
            const replase = DummyTweet.generate();
            replase.id = replase.id_str = data.id_str;
            replase.text = replase.full_text = text;
            data = replase;
          }
          if(data.quoted_status) {
            data.quoted_status = replaseFunc(data.quoted_status);
          }
          if(data.retweeted_status) {
            data.retweeted_status = replaseFunc(data.retweeted_status);
          }
          return data;
        };
        data = replaseFunc(data);
      }
      callback(true, data);
    }, tweetId);
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
        if(!!success && !!data) {
          var favTimeline = self.getTimeline(TimelineTemplate.LIKES);
          if(favTimeline) {
            Object.defineProperty(data, "from", {
              value: "post"
            });
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

  retrieveLists: function() {
    return Promise.all([
      this.retrieveOwnerships(),
      this.retrieveSubscriptions()
    ]).then(() => {
      this.dispatchPopupEvent("updateLists");
      return Promise.resolve();
    }).catch(() => {
      return Promise.reject();
    });
  },

  retrieveOwnerships: function(context = {cursor: "-1", current: []}) {
    if(context.cursor === "-1" && this.isChurnAction("retrieveOwnerships")) {
      return Promise.resolve();
    }
    return (new Promise((resolve, reject) => {
      this.twitterBackend.lists((success, data, status) => {
        if(!!success && !!data) {
          context.cursor = data.next_cursor_str || "0";
          context.current = context.current.concat(data.lists || []);
          return resolve(context);
        }
        return reject(status);
      }, context.cursor);
    })).then((context) => {
      if(typeof context.cursor === "string" && context.cursor !== "0") {
        return this.retrieveOwnerships(context);
      }
      this.cachedListsOwnerships = context.current || [];
      return Promise.resolve();
    }).catch((status) => {
      console.log(status);
      return Promise.reject();
    });
  },

  retrieveSubscriptions: function(context = {cursor: "-1", current: []}) {
    if(context.cursor === "-1" && this.isChurnAction("retrieveSubscriptions")) {
      return Promise.resolve();
    }
    return (new Promise((resolve, reject) => {
      this.twitterBackend.subs((success, data, status) => {
        if(!!success && !!data) {
          context.cursor = data.next_cursor_str || "0";
          context.current = context.current.concat(data.lists || []);
          return resolve(context);
        }
        return reject(status);
      }, context.cursor);
    })).then((context) => {
      if(typeof context.cursor === "string" && context.cursor !== "0") {
        return this.retrieveSubscribe(context);
      }
      this.cachedListsSubscriptions = context.current || [];
      return Promise.resolve();
    }).catch((status) => {
      console.log(status);
      return Promise.reject();
    });
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
    const list = this.getList(timelineId);
    if(!list) {
      return null;
    } else {
      return list.id_str || null;
    }
  },

  getList: function(timelineId) {
    const timeline = this.getTimeline(timelineId || this.currentTimelineId);
    if(!timeline) {
      return null;
    }
    const listId = timeline.getListId();
    if(listId && this.cachedLists) {
      for(let list of this.cachedLists) {
        if(list.id_str === listId) {
          return list;
        }
      }
    }
    return null;
  },

  giveMeTweets: function(timelineId = this.currentTimelineId, syncNew = false, cacheOnly = true) {
    const timeline = this.getTimeline(timelineId);
    const isTimelineVisible = timelineId === this.currentTimelineId && timeline.template.visible;
    let callback = isTimelineVisible? (tweets = [], timelineId) => {
      if(!Array.isArray(tweets)) {
        tweets = [];
      }
      this.dispatchPopupEvent("timelineRetrieved", {
        tweets: tweets.slice(0),
        timelineId: timelineId,
        currentTimelineId: this.currentTimelineId,
        currentScroll: timeline.currentScroll || 0,
        errorMessage: this.currentError() || undefined
      });
    }: () => {
      this.dispatchPopupEvent("loading", {state: false});
    };
    if(!timeline) {
      callback([], timelineId);
      return;
    }
    if(syncNew && timeline.template.includeInUnified) {
      const originalCallback = callback;
      callback = (tweets = [], timelineId, context, unified = this.getTimeline(TimelineTemplate.UNIFIED)) => {
        originalCallback(tweets, timelineId);
        unified.giveMeTweets(originalCallback, false, true);
      };
    }
    timeline.giveMeTweets(callback, syncNew, cacheOnly);
  },

  getNewTweetsCount: function(timelineId = this.currentTimelineId) {
    return this.getTimeline(timelineId).getNewTweetsCount();
  },

  mergeNewTweets: function() {
    const currentTimeline = this.getTimeline(this.currentTimelineId);
    if(currentTimeline.template.id === TimelineTemplate.LIKES) {
      let newLikes = currentTimeline.getNewTweetsCache();
      for(let like of newLikes){
        let id = like.id_str;
        this.eachTimeline((timeline) => {
          let tweet = timeline.findTweet(id);
          if(!!tweet) {
            tweet.favorited = true;
          }
        }, true);
      }
    }
    currentTimeline.mergeNewTweets();
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

  connectStreaming: async function() {
    if(this.isChurnAction("connectStreaming")) {
      return;
    }
    if(!!OptionsBackend.get("use_streaming_api") && !this.suspend) {
      if(!this.userstream) {
        this.userstream = new UserStream(
          SecretKeys.twitter.consumerKey,
          SecretKeys.twitter.consumerSecret,
          TweetManager.instance.oauthTokenData.val()
        );
      }
      if(!this.userstream.state) {
        if(!await this.userstream.connect((data) => {
          this.dispatchPopupEvent("updateStreamingStatus");
          if(!!data.direct_message && !!data.direct_message.sender) {
            data.direct_message.user = data.direct_message.sender;
          }
          this.eachTimeline((timeline) => {
            timeline.onStreamData(data);
          }, true);
          this.onStreamData(data);
        })) {
          console.warn("UserStream: disconnect");
        };
      }
    }
  },

  disconnectStreaming: function() {
    if(!!this.userstream && this.userstream.state) {
      this.userstream.disconnect();
      this.userstream = null;
    }
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
    this.cachedListsOwnershipsData.remove();
    this.cachedListsSubscriptionsData.remove();
    this.cachedSavedSearchesData.remove();
    this.cachedFollowingIdsData.remove();
    this.cachedFollowingNamesData.remove();
    this.cachedFollowersIdsData.remove();
    this.cachedBlockedIdsData.remove();
    this.cachedMutingIdsData.remove();
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
    if(!data) {
      return;
    }
    var context = DummyTweet.generate();
    if(data.created_at) {
      context.created_at = data.created_at
    }
    if(data.delete) {
      const tweetId = (!!data.delete.direct_message)? data.delete.direct_message.id_str: data.delete.status.id_str;
      let dispatch = false;
      this.eachTimeline((timeline) => {
        dispatch = timeline.removeFromCache(tweetId) || dispatch;
      }, true);
      if(dispatch) {
        this.dispatchPopupEvent("silmMessage", {
          type: "hideTweet",
          target: tweetId
        });
        this.notifyNewTweets();
      };
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
    if(data.disconnect) {
      console.warn(data.disconnect);
      this.disconnectStreaming();
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
        default:
          console.log(data);
          return;
      }
    }
    if(data.friends_str && Array.isArray(data.friends_str)) {
      if(this.cachedFollowingIdsSet.size < data.friends_str.length) {
        this.cachedFollowingIdsSet = new Set(data.friends_str);
      }
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
          this.cachedBlockedIdsSet = this.cachedBlockedIdsSet.delete(data.target.id_str);
          this.resetTimeline(TimelineTemplate.HOME);
          this.resetTimeline(TimelineTemplate.UNIFIED);
          return; // do not notification
        case 'mute':
          this._removeUser({unfollow: false, muting: true, userData: data.target})
          return; // do not notification
        case 'unmute':
          this.cachedMutingIdsSet = this.cachedMutingIdsSet.delete(data.target.id_str);
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
            if(!this.isFollowing(data.target.id_str)) {
              this._addFollowingUser(data.target);
            }
            return; // do not notification
          } else {
            this.cachedFollowersIdsSet = this.cachedFollowersIdsSet.add(data.source.id_str);
            this.twitterBackend.userData.followers_count += 1;
            context.text = chrome.i18n.getMessage("n_follow", [data.source.screen_name]);
            context.entities.user_mentions.push(fixingEntities(context.text, data.source.screen_name, entityForUserMentions));
          }
          break;
        case 'unfollow':
          if(this.isFollowing(data.target.id_str)) {
            this._removeUser({unfollow: true, blocked: false, userData: data.target});
          }
          return; // do not notification
        case 'list_created':
        case 'list_destroyed':
        case 'list_updated':
          this.retrieveLists();
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

  retrieveFollowingUsers: function(context = {cursor: "-1", current: []}) {
    if(context.cursor === "-1" && this.isChurnAction("retrieveFollowingUsers")) {
      return Promise.resolve();
    }
    return (new Promise((resolve, reject) => {
      this.twitterBackend.friendsIds((success, data, status) => {
        if(!!success && !!data) {
          context.cursor = data.next_cursor_str || "0";
          context.current = context.current.concat(data.ids || []);
          return resolve(context);
        }
        return reject(status);
      }, context.cursor);
    })).then((context) => {
      if(typeof context.cursor === "string" && context.cursor !== "0") {
        return this.retrieveFollowingUsers(context);
      }
      this.cachedFollowingIdsSet = new Set(context.current || []);
      return Promise.resolve();
    }).catch((status) => {
      console.log(status);
      return Promise.reject();
    });
  },

  lookupFollowingUsers: function(context = {lookupTargets: [], current: []}) {
    if(context.lookupTargets.length === 0 && this.isChurnAction("lookupFollowingUsers")) {
      return Promise.resolve();
    }
    if(context.lookupTargets.length === 0) {
      let len = Math.ceil(this.cachedFollowingIdsSet.size / 100.0);
      if(len > 14) {
        console.warn("too match following targets.");
        len = 14;
      }
      for(let i = 0; i < len; ++i) {
        context.lookupTargets.push([...this.cachedFollowingIdsSet].slice((i * 100), (i * 100) + 100));
      }
    }
    return (new Promise((resolve, reject) => {
      this.twitterBackend.lookupUsers((success, data, status) => {
        if(!!success && !!data) {
          context.current = context.current.concat(data.map((entry) => entry.screen_name) || []);
          return resolve(context);
        }
        return reject(status);
      }, context.lookupTargets.shift());
    })).then((context) => {
      if(context.lookupTargets.length > 0) {
        return this.lookupFollowingUsers(context);
      }
      this.cachedFollowingNames = context.current || [];
      return Promise.resolve();
    }).catch((status) => {
      console.log(status);
      return Promise.reject();
    });
  },

  getFollowingUsers: function() {
    return this.cachedFollowingNames;
  },

  isFollowing: function(id = "0") {
    return this.cachedFollowingIdsSet.has(id);
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
    if(context.unfollow || context.blocked) {
      this.cachedFollowingIdsSet = this.cachedFollowingIdsSet.delete(context.userData.id_str);
      this.cachedFollowingNames = this.cachedFollowingNames.filter((entry) => {
        return entry !== context.userData.screen_name;
      });
      this.twitterBackend.userData.friends_count -= 1;
    }
    if(context.muting) {
      this.cachedMutingIdsSet = this.cachedMutingIdsSet.add(context.userData.id_str);
      this.eachTimeline(function(timeline) {
        timeline.purgeBlockedTweets();
      }, true);
    }
    if(context.blocked) {
      this.cachedBlockedIdsSet = this.cachedBlockedIdsSet.add(context.userData.id_str);
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
    let result = -1;
    this.cachedSavedSearches.forEach((savedSearch, i) => {
      if(savedSearch.query == query) {
        result = i;
      }
    });
    return result;
  },

  retrieveSavedSearches: function(){
    this.twitterBackend.savedSearches((success, userData) => {
      if(!!success) {
        this.cachedSavedSearches = userData;
        this.dispatchPopupEvent("updateSavedSearches", userData);
      }
    });
  },

  createSavedSearches: function(query){
    this.twitterBackend.createSavedSearches((success, userData, fmtError) => {
      if(!success) {
        this.setErrorToPopup(fmtError);
      } else {
        this.cachedSavedSearches = [...this.cachedSavedSearches, userData].filter((search) => {
          return !!search && !!search.id_str;
        });
        this.dispatchPopupEvent("updateSavedSearches", this.cachedSavedSearches);
      }
    }, query);
  },

  destorySavedSearches: function(query){
    const index = this.isSavedSearch(query);
    if(index < 0) {
      this.setErrorToPopup('Query is not saved.');
      return;
    }
    this.twitterBackend.destorySavedSearches((success, userData, fmtError) => {
      if(!!success && !!userData && !!userData.id_str) {
        const destroyedId = userData.id_str;
        this.cachedSavedSearches = this.cachedSavedSearches.filter((search) => {
          return search.id_str !== destroyedId;
        });
        this.dispatchPopupEvent("updateSavedSearches", this.cachedSavedSearches);
      } else {
        this.setErrorToPopup(fmtError);
      }
    }, this.cachedSavedSearches[index].id_str);
  },

  cleanupCachedData: function() {
    this.unreadTweetsSet.clear();
    this.retweetsMap.clear();
    this.nm.clearList();
  },

  setAlarms: function() {
    this.clearAlarms();
    var now = Date.now();
    chrome.alarms.create('retrieve_lists', {
      delayInMinutes: 60,
      periodInMinutes: 60
    });
    chrome.alarms.create('retrieve_blocked_users', {
      delayInMinutes: 60,
      periodInMinutes: 60
    });
    chrome.alarms.create('retrieve_muting_users', {
      delayInMinutes: 60,
      periodInMinutes: 60
    });
    chrome.alarms.create('retrieve_following_users', {
      delayInMinutes: 60,
      periodInMinutes: 60
    });
    chrome.alarms.create('retrieve_followers', {
      delayInMinutes: 60,
      periodInMinutes: 60
    });
    chrome.alarms.create('retrieve_trending_topics', {
      when: now + 1700,
      periodInMinutes: 5
    });
    chrome.alarms.create('retrieve_saved_sarches', {
      when: now + 5 * 60 * 1000,
      periodInMinutes: 60
    });
    chrome.alarms.create('retrieve_twitter_configuration', {
      when: now + 2300,
      periodInMinutes: 60
    });
    chrome.alarms.create('refresh_timelines', {
      delayInMinutes: 5,
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
          self.retrieveLists();
          break;
        case 'retrieve_blocked_users':
          self.retrieveBlockedUsers();
          break;
        case 'retrieve_muting_users':
          self.retrieveMutesUsers();
          break;
        case 'retrieve_followers':
          self.retrieveFollowers();
          break;
        case 'retrieve_following_users':
          self.retrieveFollowingUsers().then(() => {
            self.lookupFollowingUsers();
          }).catch((e) => {
            console.error(e);
          });
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
          self.connectStreaming();
          break;
        default:
          break;
      }
    };
  },

  _addFollowingUser: function(userData) {
    if(!this.cachedFollowingNames.includes(userData.screen_name)) {
      this.cachedFollowingNames = this.cachedFollowingNames.concat(userData.screen_name);
    }
    if(!this.isFollowing(userData.id_str)) {
      this.cachedFollowingIdsSet = this.cachedFollowingIdsSet.add(userData.id_str);
    }
    this.twitterBackend.userData.friends_count += 1;
    this.resetTimeline(TimelineTemplate.HOME);
    this.resetTimeline(TimelineTemplate.UNIFIED);
  },

  retrieveTwitterConfiguration: function() {
    this.twitterBackend.retrieveConfiguration((success, data) => {
      if(!!success && !!data) {
        this.twitterConfiguration = Object.assign(this.twitterConfiguration, data);
      }
    });
  },

  retrieveMutesUsers: function(context = {cursor: "-1", current: []}) {
    if(context.cursor === "-1" && this.isChurnAction("retrieveMutesUsers")) {
      return Promise.resolve();
    }
    return (new Promise((resolve, reject) => {

      this.twitterBackend.mutesUsers((success, data, status) => {
        if(!!success && !!data) {
          context.cursor = data.next_cursor_str || "0";
          context.current = context.current.concat(data.users.map((user) => user.id_str) || []);
          return resolve(context);
        }
        return reject(status);
      }, context.cursor);
    })).then((context) => {
      if(typeof context.cursor === "string" && context.cursor !== "0") {
        return this.retrieveMutesUsers(context);
      }
      this.cachedMutingIdsSet = new Set(context.current || []);
      this.eachTimeline((timeline) => {
        timeline.purgeBlockedTweets();
      }, true);
      return Promise.resolve();
    }).catch((status) => {
      console.log(status);
      return Promise.reject();
    });
  },

  muteUser: function(callback, userId) {
    if(this.isChurnAction(userId)) {
      return callback(false, {churn: true});
    }
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
    this.twitterBackend.destroyMutes((function(self) {
      return function(success, userData) {
        if(success) {
          self.cachedMutingIdsSet = self.cachedMutingIdsSet.delete(userData.id_str);
          self.resetTimeline(TimelineTemplate.HOME);
          self.resetTimeline(TimelineTemplate.UNIFIED);
        } else {
          self.churnActionsMap.delete(userId);
        }
        callback(success, userData);
      };
    })(this), userId);
  },

  isMuting: function(id = "0") {
    return this.cachedMutingIdsSet.has(id);
  },

  isBlocked: function(id = "0") {
    return this.cachedBlockedIdsSet.has(id);
  },

  retrieveFollowers: function(context = {cursor: "-1", current: []}) {
    if(context.cursor === "-1" && this.isChurnAction("retrieveFollowers")) {
      return Promise.resolve();
    }
    return (new Promise((resolve, reject) => {
      this.twitterBackend.followers((success, data, status) => {
        if(!!success && !!data) {
          context.cursor = data.next_cursor_str || "0";
          context.current = context.current.concat(data.ids || []);
          return resolve(context);
        }
        return reject(status);
      }, context.cursor);
    })).then((context) => {
      if(typeof context.cursor === "string" && context.cursor !== "0") {
        return this.retrieveFollowers(context);
      }
      this.cachedFollowersIdsSet = new Set(context.current || []);
      return Promise.resolve();
    }).catch((status) => {
      console.log(status);
      return Promise.reject();
    });
  },

  isFollowedBy: function(id = "0") {
    return this.cachedFollowersIdsSet.has(id);
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
    const context = DummyTweet.generate({text: `${chrome.i18n.getMessage('n_update_trends')}\n`});
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
    const now = Date.now();
    const prev = parseInt(this.churnActionsMap.get(id), 10) || undefined;
    this.churnActionsMap.set(id, now);
    if(!!prev) {
      if(now - prev > 3 * 60 * 1000) {
        return false;
      }
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
          timeline.giveMeTweets(this.notifyNewTweets.bind(this), true, false, false);
          break;
        default:
          throw new TypeError("unknown template.id");
      }
    }, true);
  },

  unblockUser: function(callback, userId) {
    if(this.isChurnAction(userId)) {
      return callback(false, {churn: true});
    }
    this.twitterBackend.unblock((function(self) {
      return function(success, userData) {
        if(success) {
          self.cachedBlockedIdsSet = self.cachedBlockedIdsSet.delete(userData.id_str);
          self.resetTimeline(TimelineTemplate.HOME);
          self.resetTimeline(TimelineTemplate.UNIFIED);
        } else {
          self.churnActionsMap.delete(userId);
        }
        callback(success, userData);
      };
    })(this), userId);
  },

  chromeContextMenusInit: function() {
    const id = "searchInSilverbirdM";
    const checkLastError = () => {
      const lastError = chrome.runtime.lastError;
      if(!!lastError) {
        console.info(lastError);
      }
    };
    chrome.contextMenus.remove(id, () => {
      checkLastError();
      chrome.contextMenus.create({
        type: "normal",
        id,
        title: chrome.i18n.getMessage("c_search_on_silverbird_m"),
        contexts: ["selection"],
        onclick: (info, tab) => {
          if(info.selectionText && info.selectionText.length > 0) {
            this.dispatchPopupEvent("silmMessage", {
              type: "createSearchTab",
              target: info.selectionText
            });
          }
        },
        documentUrlPatterns: [`chrome-extension://${chrome.runtime.id}/*`]
      }, checkLastError);
    });
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
  if(OptionsBackend.get('show_expanded_urls')) {
    chrome.webRequest.onBeforeSendHeaders.addListener(function(details) {
      try {
        if(!details.requestHeaders.reduce((prev, current) => {
          return prev || /referer/i.test(current.name);
        }, false)) {
          details.requestHeaders.push({
            name: 'Referer',
            value: 'https://www.pixiv.net/'
          });
        }
      } catch(e) {
        console.log(e);
      } finally {
        return {requestHeaders: details.requestHeaders};
      }
    }, {
      urls: ['*://*.pixiv.net/*', '*://i.pximg.net/*'],
      types: ['image', 'xmlhttprequest']
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
navigator.serviceWorker.register("/sw.js").then((registration) => {
  registration.addEventListener("updatefound", (event) => {
    //console.info("sw:updatefound: %o", event);
    registration.update();
  });
  return navigator.serviceWorker.ready;
}).then((registration) => {
  if (navigator.serviceWorker.controller) {
    //console.info(`sw:current page is already controlled.`);
    return Promise.resolve(navigator.serviceWorker.controller);
  }
  return new Promise((resolve, reject) => {
    navigator.serviceWorker.addEventListener("controllerchange", (event) => {
      //console.info("sw:controllerchange: %o", event);
      resolve(navigator.serviceWorker.controller);
    });
  });
}).then((controller) => {
  //console.info("sw:controller: %o", controller);
  initializeExtension();
}).catch((e) => {
  console.error(`ServiceWorker is not working.`);
  initializeExtension();
});
