var loadingNewTweets = false;

function onTimelineRetrieved(tweets, timelineId) {
  if(!window) {
    //Sanity check, popup might be closed.
    return;
  }

  var timeline = tweetManager.getTimeline(timelineId);
  if(!timeline.template.visible) {
    return;
  }

  $("#loading").hide();
  if(tweets) {
    Paginator.needsMore = false;
    Renderer.assemblyTweets(tweets, timelineId);
    $("#timeline-" + timelineId).find('.inner_timeline').scrollTop(timeline.currentScroll);
  } else {
    var baseErrorMsg = tweetManager.currentError();
    var errorMsg = chrome.i18n.getMessage("ue_updatingTweets", baseErrorMsg);
    if(baseErrorMsg == '(timeout)') {
      errorMsg += chrome.i18n.getMessage("ue_updatingTweets2");
    }
    Renderer.showError(errorMsg, loadTimeline);
  }
  loadingNewTweets = false;

  prepareTimelines();
}

function loadTimeline(force, forcedTimeline) {
  loadingNewTweets = true;
  $("#loading").show();
  if(force) {
    Paginator.firstPage();
  }
  var cacheOnly = true;
  if(Paginator.needsMore) {
    cacheOnly = false;
  }
  if(!forcedTimeline) {
    forcedTimeline = tweetManager.currentTimelineId;
  }
  tweetManager.giveMeTweets(forcedTimeline, onTimelineRetrieved, force, cacheOnly);
}

function signout() {
  tweetManager.signout();
}

function suspend(forcedValue) {
  var suspendState = tweetManager.suspendTimelines(forcedValue);
  var suspended_notice = $("#suspended_notice");
  var suspend_toggle = $("#suspend_toggle");
  if(suspendState) {
    var nextOpacity = 0;
    function animateLoop() {
      if(nextOpacity == 1) {
        nextOpacity = 0.1;
      } else {
        nextOpacity = 1;
      }
      suspended_notice.animate({opacity: nextOpacity}, 1500, null, animateLoop);
    }
    suspended_notice.css({opacity: nextOpacity}).show();
    animateLoop();
    suspend_toggle.text(chrome.i18n.getMessage("resume"));
  } else {
    suspended_notice.stop().hide();
    suspend_toggle.text(chrome.i18n.getMessage("suspend_toggle"));
  }
}

function showRateLimit() {
  if(!OptionsBackend.get('show_hits_in_popup')) {
    return;
  }

  $("#popup_footer").show();
  if(tweetManager.twitterBackend) {
    var currentTime = $.now();
    var rateLimits = tweetManager.twitterBackend.remainingHitsInfo();
    var ticker = $("#hits_ticker"), tickerInner = [], displayRemainTime = '';
    ticker.empty();
    for(var key in rateLimits) {
      if(!rateLimits.hasOwnProperty(key)) continue;
      var value = rateLimits[key];
      if(value.remaining == value.limit || !$.isNumeric(value.remaining)) continue;
      if(currentTime > value.reset || !$.isNumeric(value.reset)) continue;
      var remainTime = (value.reset - currentTime) / (60 * 1000);
      if(remainTime > 1) displayRemainTime = ((remainTime > 15) ? 15: Math.ceil(remainTime)) + ' mins later';
      else displayRemainTime = 'whithin 1 minute';
      var displayText = 'API: ' + key + ' | now ' + (value.limit - value.remaining) + '/' + value.limit + ' hits/15mins' + ' | remain reset: ' + displayRemainTime;
      tickerInner.push('<li id="rateLimits_'+key.split('/').join('_')+'">'+displayText+'</li>');
    }
    ticker.html(tickerInner.join(''));

    var intervalId = 0;
    if(ticker.find('li').length > 0) {
      $("#popup_footer").css({height: '1.2em'});
      // rollup
      ticker.find('li').eq(0).hide().fadeIn(1000);
      intervalId = setInterval(function(){
        ticker.find('li').eq(0).remove();
        ticker.find('li').eq(0).hide().fadeIn(1000);
        if(ticker.find('li').length == 1) {
          clearInterval(intervalId);
          ticker.find('li').eq(0).remove();
          setTimeout(showRateLimit, 1000);
        }
      }, 2000);
    } else {
      $("#popup_footer").hide();
      twitterBackend.updateWindowHitsLimit();
      setTimeout(showRateLimit, 2000);
    }
  }
}

function newTweetsAvailable(count, unreadCount, timelineId) {
  if(!window) {
    //Sanity check, popup might be closed.
    return;
  }
  var currentTimeline = tweetManager.currentTimelineId;
  if(timelineId != currentTimeline) {
    var updateTab = $("#tab_\\#timeline-" + timelineId);
    if(unreadCount === 0) {
      updateTab.removeClass('update_modifier');
      return;
    }
    updateTab.addClass('update_modifier');
    return;
  }
  if(count === 0) return;
  var tweets_string = count > 1 ? "tweet_plural" : "tweet_singular";
  $("#update_tweets").text(chrome.i18n.getMessage("newTweetsAvailable", [count, chrome.i18n.getMessage(tweets_string)])).fadeIn();
}

function updateNotificationFunc(timeline) {
  var timelineId = timeline.timelineId;
  var newTweetsInfo = tweetManager.newTweetsCount(timelineId);
  var newTweetsCount = newTweetsInfo[0];

  if(timeline.timelineId == tweetManager.currentTimelineId && timeline.currentScroll === 0) {
    if(newTweetsCount > 0) {
      tweetManager.updateNewTweets();
      $("#tab_\\#timeline-" + timelineId).removeClass('update_modifier');
    }
  } else {
    newTweetsAvailable(newTweetsCount, newTweetsInfo[1], timelineId);
  }
}

function loadNewTweets() {
  Paginator.firstPage(true);
  $("#tab_\\#timeline-" + tweetManager.currentTimelineId).removeClass('update_modifier');
  $("#update_tweets").fadeOut();

  prepareAndLoadTimeline();
}

function loadTrends() {
  var currentTTLocale = OptionsBackend.get('trending_topics_woeid');

  $("#trending_topics").actionMenu({
    loading: 'img/loading.gif',
    parentContainer: '#workspace'
  });

  tweetManager.retrieveTrendingTopics(function(userData) {
    var actions = [];

    if(userData) {
      for(var i = 0, len = userData.trends.length; i < len; ++i) {
        (function(trendName) {
          actions.push({
            name: trendName,
            action: function(event) {
              TimelineTab.addNewSearchTab(trendName, event.isAlternateClick);
            }
          });
        })(userData.trends[i].name);
      }
    } else {
      actions.push({
        name: 'Error, try again.',
        action: function(event) {
          loadTrends();
        }
      });
    }

    $("#trending_topics").actionMenu({
      actions: actions
    });
  }, currentTTLocale);
}

function loadSavedSearch() {
  $("#saved_searches").actionMenu({
    loading: 'img/loading.gif',
    parentContainer: '#workspace'
  });

  tweetManager.retrieveSavedSearches(function(userData) {
    var actions = [];

    if(userData.length > 0) {
      for(var i = 0, len = userData.length; i < len; ++i) {
        (function(query) {
          actions.push({
            name: (query.length > 10) ? query.substring(0, 10) + '...': query,
            action: function(event) {
              TimelineTab.addNewSearchTab(query, event.isAlternateClick);
            }
          });
        })(userData[i].query);
      }
    } else {
      actions.push({
        name: 'Empty or Error',
        action: function(event) {
          loadSavedSearch();
        }
      });
    }

    $("#saved_searches").actionMenu({
      actions: actions
    });
  });
}

function prepareTimelines() {
  $("#update_tweets").hide();

  updateNotificationFunc(tweetManager.getCurrentTimeline());
  tweetManager.eachTimeline(function(timeline) {
    if(timeline.timelineId != tweetManager.currentTimelineId) {
      updateNotificationFunc(timeline);
    }
  });
}

function prepareAndLoadTimeline() {
  prepareTimelines();
  loadTimeline();
}

function initializeWorkspace() {

  tweetManager.registerNewTweetsCallback(newTweetsAvailable);
  $("#workspace").show();
  ThemeManager.init();

  if(ThemeManager.isPopup) {
    Renderer.setContext('popup');
  } else {
    Renderer.setContext('standalone');
  }

  TimelineTab.init();
  tweetManager.orderedEachTimeline(function(timeline) {
    if(timeline.template.id == TimelineTemplate.SEARCH) {
      SearchTab.addSearchTab(timeline.timelineId);
    } else {
      TimelineTab.addTab(timeline.timelineId, timeline.template.timelineName);
    }
  });
  ThemeManager.handleSortableTabs();

  if(OptionsBackend.get('compose_position') == 'bottom') {
    var composeArea = $("#compose_tweet_area").detach();
    var composeButton = $("#compose_tweet").detach();
    $("#workspace").append(composeArea).append(composeButton);
  }

  //Delay loading, improving responsiveness
  setTimeout(function() {
    ThemeManager.handleWindowResizing();
    Lists.init();
    ContextMenu.init();

    TimelineTab.select(tweetManager.currentTimelineId);
    Composer.init();
    Shortener.init();

    prepareAndLoadTimeline();

    $("#timeline-" + tweetManager.currentTimelineId).find('.inner_timeline').scrollTop(tweetManager.getCurrentTimeline().currentScroll);

    tweetManager.registerWarningsCallback(function(msg, showHTML) {
      Renderer.warningsCallback.call(Renderer, msg, false, showHTML);
    });
    suspend(tweetManager.suspend);
    showRateLimit();

    WorkList.init();
    Autocomplete.init();
    $("#shorten_current").attr("title", chrome.i18n.getMessage("shorten_current"));
    $("#detach_img").attr("title", chrome.i18n.getMessage("detach_window"));

    $("#options_page_link").anyClick(function() {
      openTab(chrome.extension.getURL('options.html'));
    });
    
    loadTrends();
    loadSavedSearch();
    
    ImageUpload.init();

    backgroundPage._gaq.push(['_trackPageview', 'popup.html']);
  }, 0);
}

var bindEvents = function() {
  $(window).unload(function() {
    if(tweetManager) {
      tweetManager.registerWarningsCallback(null);
      tweetManager.registerNewTweetsCallback(null);
      tweetManager.sendQueue.cleanUpCallbacks();
      tweetManager.eachTimeline(function(timeline) {
        timeline._cleanUpCache();
      }, true);
    }
    if(UploadManager) {
      UploadManager.unregisterCallbacks();
    }
    $('a').remove();
    $('img').remove();
    this.remove();
  });

  $(document)
  .on('click', '.msg-trigger-requestnewtoken', function() {
    OAuth.requestNewToken();
  })
  .on('click', '.msg-trigger-openoptions', function() {
    chrome.tabs.create({
      url: chrome.extension.getURL('options.html')
    });
  });
  $("#warning .dismiss").click(Renderer.hideMessage.bind(Renderer));
  $("#signout").click(function(ev) {
    ev.preventDefault();
    signout();
  });
  $("#refresh_trigger").click(function(ev) {
    ev.preventDefault();
    Composer.refreshNew();
  });
  $("#suspend_toggle").click(function(ev) {
    ev.preventDefault();
    suspend();
  });
  $("#detach_trigger").click(function(ev) {
    ev.preventDefault();
    Renderer.detach();
  });
  $("#update_tweets").click(loadNewTweets);
  $("#btnAuthorize").click(myOAuth.registerPin.bind(myOAuth));
  $("#enter_pin").find("a").click(function(ev) {
    ev.preventDefault();
    myOAuth.requestNewToken();
  });

  Composer.bindEvents();
  WorkList.bindEvents();
};

$(function() {
  bindEvents();

  $("input.i18n").each(function() {
    $(this).val(chrome.i18n.getMessage(this.id));
  });

  $("span.i18n").each(function() {
    $(this).text(chrome.i18n.getMessage(this.id));
  });

  $("a.i18n").each(function() {
    $(this).text(chrome.i18n.getMessage(this.id));
  });

  if(!backgroundPage.SecretKeys.hasValidKeys()) {
    Renderer.showError(chrome.i18n.getMessage('invalid_keys'));
    $("#workspace").show().height(300);
    ThemeManager.init();
    return;
  }

  if(!twitterBackend.authenticated()) {
    if(twitterBackend.tokenRequested()) {
      $("#enter_pin").show();
    }
    return;
  }

  initializeWorkspace();
});
