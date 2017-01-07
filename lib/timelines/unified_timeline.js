"use strict";
class UnifiedTweetsTimeline extends TweetsTimeline {
  constructor(timelineId, manager, template, timelines) {
    super(timelineId, manager, template);
    this.timelines = timelines;
    this.lastRequestedId = {};
    this.currentPage = 0;
  }
  static makeJoinableCallback(joinCount, eachCallback, joinCallback) {
    return function() {
      joinCount--;
      eachCallback.apply(this, arguments);
      if(joinCount === 0) {
        joinCallback();
      }
    };
  }
  /* overridden */
  init() {
    TimelineTemplate.reloadOptions();
    TimelineTemplate.eachTimelineTemplate((function(self) {
      return function(template) {
        if(self._shouldIncludeTemplate(template)) {
          TweetManager.instance.createTimelineTemplate(template, true);
        }
      };
    })(this), true);
  }
  /* overridden */
  remove() {
    this.template.visible = false;
    if(!this.template.includeInUnified) {
      this.killTimeline();
      this._eachTimeline(function(timeline) {
        if(!timeline.template.visible) {
          var timelineId = timeline.timelineId;
          timeline.killTimeline();
          this.timelines.delete(timelineId);
        }
      });
      TimelineTemplate.reloadOptions();
      return true;
    }
    return false;
  }
  /* overridden */
  getError() {
    var err = null;
    this._eachTimeline(function(timeline) {
      if(timeline.getError()) {
        err = timeline.getError();
        return false;
      }
    });
    return err;
  }
  /* overridden */
  killTimeline() {
    /* noop */
  }
  /* overridden */
  giveMeTweets(callback, syncNew, cacheOnly, keepCache) {
    if(this.currentCallback) {
      //Handling multiple calls to giveMeTweets, just update the registered
      //callback and let the first request finish.
      this.currentCallback = callback;
      return;
    }
    this.currentCallback = callback;

    var tweetsPerPage = OptionsBackend.get('tweets_per_page');
    var maxCachedTweets = OptionsBackend.get('max_cached_tweets');
    var maxCachedPages = parseInt((maxCachedTweets / tweetsPerPage) - 1, 10);

    if(cacheOnly || syncNew) {
      if(!keepCache) {
        if(this.currentPage > maxCachedPages) {
          this.currentPage = maxCachedPages;
          this._eachTimeline(function(timeline) {
            timeline._cleanUpCache();
          });
        }
      }
    } else {
      this.currentPage += 1;
    }

    var errorAbort = false;
    var externalTweetsCache = {};
    var requiredTweets = (this.currentPage + 1) * tweetsPerPage;

    var resultTweetsList = [];
    var usedTweetsMap = {};

    var findMaxBefore = function(maxDate) {
      var maxBeforeDate = null;
      var maxBeforeTweet = null;

      var checkMaxTweet = function(timelineId) {
        var tweetsInTimeline = externalTweetsCache[timelineId];
        for(var i = 0, len = tweetsInTimeline.length; i < len; ++i) {
          var tweet = tweetsInTimeline[i];
          if(usedTweetsMap[tweet.id_str]) {
            continue;
          }
          var date = Date.parse(tweet.created_at);
          if(maxDate && date > maxDate) {
            continue;
          }
          if(!maxBeforeDate || date > maxBeforeDate) {
            maxBeforeDate = date;
            maxBeforeTweet = tweet;
            maxBeforeTweet.timelineId = timelineId;
            if(!maxBeforeTweet.silm_tweetTimelineId) {
              maxBeforeTweet.silm_tweetTimelineId = timelineId;
            }
          }
        }
      };
      var isLike = false;
      for(var timelineId in externalTweetsCache) {
        if(timelineId == 'likes') {
          //HACK: postpone
          isLike = true;
          continue;
        }
        checkMaxTweet(timelineId);
      }
      if(isLike) {
        checkMaxTweet('likes');
      }

      if(maxBeforeTweet) {
        usedTweetsMap[maxBeforeTweet.id_str] = true;
      }
      return maxBeforeTweet;
    };

    var joinFunction = function(self) {
      return function() {
        if(errorAbort) return;
        /* 2nd step: Let's cherry pick tweets until we get enough of them
           to compose our unified timeline.
        */
        while(resultTweetsList.length < requiredTweets) {
          var lastTweet = resultTweetsList[resultTweetsList.length - 1];
          var maxDate = null;
          if(lastTweet) maxDate = Date.parse(lastTweet.created_at);
          var nextTweet = findMaxBefore(maxDate);
          if(!nextTweet) break;
          resultTweetsList.push(nextTweet);
          if(resultTweetsList.length == requiredTweets) break;
          var timelineTweetsCache = externalTweetsCache[nextTweet.timelineId];
          var isLastInTimelineCache = timelineTweetsCache[timelineTweetsCache.length - 1].id_str == nextTweet.id_str;
          if(isLastInTimelineCache) {
            /* 3rd step: Some timeline went empty because all other tweets are already in
               the unified timeline, now we need to get more tweets from this timeline.
            */
            if(self.lastRequestedId[nextTweet.timelineId] == nextTweet.id_str) {
              // Avoid repeating the same query but reseting for the next time
              // because Twitter may act weirdly sometimes and simply return an
              // empty list instead of an error. Because of that, we can't rely
              // on the fact that an empty list really means the end of the tweets.
              delete self.lastRequestedId[nextTweet.timelineId];
              continue;
            }
            var newJoinableCallback = UnifiedTweetsTimeline.makeJoinableCallback(1, eachFunction(self), joinFunction(self));
            var wantedTimeline = self.timelines.get(nextTweet.timelineId);
            wantedTimeline.unifiedRunning = true;
            var requiredCount = (requiredTweets - resultTweetsList.length) + 1;
            if(requiredCount <= 2) {
              requiredCount += 1;
            }
            wantedTimeline.giveMeTweets(function(returnedTweets) {
              if(returnedTweets) { // Success
                self.lastRequestedId[nextTweet.timelineId] = nextTweet.id_str;
              }
              newJoinableCallback.apply(this, arguments);
            }, false, false, true, requiredCount);
            return;
          }
        }
        /* 4th step now we're ready to return our unified timeline. */
        var callback = self.currentCallback;
        self.currentCallback = null;
        self.tweetsCache = resultTweetsList;
        try {
          callback(resultTweetsList, self.timelineId);
        } catch(e) {
          /* ignoring, popup dead? */
          console.warn(e, e.stack);
        }
      };
    };
    var eachFunction = function(self) {
      return function (tweets, timelineId, timelineObj) {
        if(timelineObj) timelineObj.unifiedRunning = false;
        if(errorAbort) return;
        if(!tweets) {
          errorAbort = true;
          try {
            self.currentCallback(null, self.timelineId);
          } catch(e) {
            /* ignoring, popup dead? */
          }
          self.currentCallback = null;
          return;
        }
        var currentTweets = externalTweetsCache[timelineId];
        externalTweetsCache[timelineId] = tweets;
      };
    };

    /* 1st step: Let's get cached results from each timeline and call
       joinFunction when we get all the results.
    */
    var joinCount = this._countTimelines();
    var joinableCallback = UnifiedTweetsTimeline.makeJoinableCallback(joinCount, eachFunction(this), joinFunction(this));

    this._eachTimeline(function(timeline) {
      timeline.unifiedRunning = true;
      timeline.giveMeTweets(joinableCallback, syncNew, true, true);
    });

  }
  /* overridden */
  mergeNewTweets() {
    this._eachTimeline(function(timeline) {
      timeline.mergeNewTweets();
    });
  }
  /* overridden */
  getNewTweetsCount() {
    let ret = 0;
    this._eachTimeline(function(timeline) {
      ret += timeline.getNewTweetsCount();
    });
    return ret;
  }
  /* overridden */
  getNewTweetsCache() {
    return [];
  }
  /* overridden */
  removeFromCache(id) {
    let ret = false;
    this._eachTimeline(function(timeline) {
      ret = timeline.removeFromCache(id) || ret;
    });
    return ret;
  }
  /* overridden */
  findTweet(id) {
    return null;
  }
  /* Private Methods */
  _eachTimeline(callback) {
    for(let timeline of this.timelines.values()) {
      if(this._shouldIncludeTemplate(timeline.template)) {
        if(callback.call(this, timeline) === false)
          break;
      }
    }
  }
  _countTimelines() {
    var count = 0;
    this._eachTimeline(function(timeline) {
      if(this._shouldIncludeTemplate(timeline.template)) {
        ++count;
      }
    });
    return count;
  }
  _shouldIncludeTemplate(template) {
    return (template.includeInUnified && !template.hiddenTemplate) || template.id === TimelineTemplate.NOTIFICATION;
  }
}
