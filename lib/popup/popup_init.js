var loadingNewTweets = false;
var currentTimelineTweetPositions = [];

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
  AnyClick.clearEventListeners();
  tweetManager.urlExpander.clear();
  if(tweets) {
    if(tweets.length === 0) {
      tweets = [tweetManager.getDummyTweet()];
      tweets[0].text = chrome.i18n.getMessage("ue_updatingTweets_nofetched");
    }
    Paginator.needsMore = false;
    Renderer.assemblyTweets(tweets, timelineId);
    var currentInnerTimeline = $("#timeline-" + timelineId).find('.inner_timeline');
    currentInnerTimeline.scrollTop(timeline.currentScroll);
    if(OptionsBackend.get('use_keyboard_shortcuts')
    && timelineId == tweetManager.currentTimelineId) {
      caliculateTweetPositions();
    }
  } else {
    var baseErrorMsg = tweetManager.currentError() || chrome.i18n.getMessage("undefined_message");
    if(baseErrorMsg === '(This user is protected)') {
      tweets = [tweetManager.getDummyTweet()];
      tweets[0].text = chrome.i18n.getMessage("ue_unauthorized_user");
      onTimelineRetrieved(tweets, timelineId);
      return;
    } else {
      var errorMsg = chrome.i18n.getMessage("ue_updatingTweets", baseErrorMsg);
      var tryAgainFunc = loadTimeline;
      var showHtml = false;
      if(baseErrorMsg == '(timeout)') {
        errorMsg += chrome.i18n.getMessage("ue_updatingTweets_timeout");
        tryAgainFunc = null;
      } else if(baseErrorMsg == '(Too Many Requests)') {
        errorMsg = chrome.i18n.getMessage('exceededAPIHits');
        tryAgainFunc = null;
      } else if(baseErrorMsg == '(Could not authenticate you)') {
        errorMsg = chrome.i18n.getMessage("ue_updatingTweets_noauthenticate");
        tryAgainFunc = null;
      } else {
        console.log(baseErrorMsg);
      }
      Renderer.showError(errorMsg, tryAgainFunc);
    }
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
  window.close();
}

function suspend(forcedValue) {
  var suspendState = tweetManager.suspendTimelines(forcedValue);
  var suspendWidget = document.getElementById('suspend_status');
  if(suspendState) {
    suspendWidget.classList.remove('glyphicon-play');
    suspendWidget.classList.add('glyphicon-stop');
    suspendWidget.setAttribute('title', chrome.i18n.getMessage("timeline_suspended"));
  } else {
    suspendWidget.classList.remove('glyphicon-stop');
    suspendWidget.classList.add('glyphicon-play');
    suspendWidget.setAttribute('title', chrome.i18n.getMessage("timeline_running"));
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
  var trendingTopicsButton = $("#trending_topics");
  var userData = tweetManager.cachedTrendingTopics || {};
  var actions = [];

  if(userData.trends && Array.isArray(userData.trends) && userData.trends.length > 0) {
    actions = userData.trends.map(function(entry) {
      return {
        name: entry.name,
        action: function(event) {
          TimelineTab.addNewSearchTab(entry.name, event.isAlternateClick);
        }
      };
    });
  } else {
    actions = [{
      name: chrome.i18n.getMessage("ue_wait_fetch_trends"),
      action: function(event) {
        loadTrends();
      }
    }];
  }

  trendingTopicsButton.actionMenu({
    parentContainer: '#workspace',
    actions: actions
  });
  trendingTopicsButton = null;
}

function loadSavedSearch() {
  var savedSearchedButton = $("#saved_searches");
  var userData = tweetManager.savedSearchCache || [];
  var actions = [];

  if(Array.isArray(userData) && userData.length > 0) {
    actions = userData.map(function(entry) {
      return {
        name: (entry.query.length > 10) ? entry.query.substring(0, 10) + '...': entry.query,
        action: function(event) {
          TimelineTab.addNewSearchTab(entry.query, event.isAlternateClick);
        }
      };
    });
    savedSearchedButton
    .show()
    .actionMenu({
      parentContainer: '#workspace',
      actions: actions
    });
  } else {
    savedSearchedButton.hide();
  }
  savedSearchedButton = null;
}

function prepareTimelines() {
  var update_tweets = $("#update_tweets");
  if(update_tweets.css('display') !== 'none') {
    update_tweets.hide();
  }

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

function handleKeyboardShortcuts(event) {
  var through = false;
  if(document.activeElement.tagName.toLowerCase() == 'input'
  || document.activeElement.tagName.toLowerCase() == 'textarea') {
    through = true;
  }
  if(event.altKey && event.shiftKey) {
    switch(event.keyCode) {
      case 67:  // c
        Composer.showComposeArea();
        break;
      case 82:  // r
        chrome.runtime.reload();
        break;
      default:
        break;
    }
  } else if(event.ctrlKey) {
    switch(event.keyCode) {
      case 81:  // q
        window.close();
        break;
      default:
        break;
    }
  } else if (!through){
    switch(event.keyCode) {
      case 65:  // a
        TimelineTab.selectLeft(tweetManager.currentTimelineId);
        break;
      case 72:  // h
        TimelineTab.selectLeft(tweetManager.currentTimelineId);
        break;
      case 74:  // j
        TimelineTab.scroll(scrollNextTweet());
        break;
      case 75:  // k
        TimelineTab.scroll(scrollPrevTweet());
        break;
      case 76:  // l
        TimelineTab.selectRight(tweetManager.currentTimelineId);
        break;
      case 82:  // r
        if($("#update_tweets").css('display') !== 'none') {
          loadNewTweets();
        } else {
          Composer.refreshNew();
        }
        break;
      case 83:  // s
        TimelineTab.selectRight(tweetManager.currentTimelineId);
        break;
      case 84:  // t
        TimelineTab.scroll(0);
        break;
      case 85:  // u
        TimelineTab.select(TimelineTemplate.UNIFIED);
        break;
      default:
        break;
    }
  }
}

function caliculateTweetPositions() {
  var tweetsInnerTimeline = $("#timeline-" + tweetManager.currentTimelineId).find('.tweet_space'), firstOffset;
  currentTimelineTweetPositions = [];
  if(tweetsInnerTimeline.length > 0) {
    firstOffset = tweetsInnerTimeline.eq(0).offset().top;
    currentTimelineTweetPositions = tweetsInnerTimeline.map(function() {
      return $(this).offset().top - firstOffset;
    }).get();
  }
}

function scrollNextTweet() {
  var twtPositions = currentTimelineTweetPositions, twtPosLength = twtPositions.length;
  if(twtPosLength > 0) {
    var currentScrollOverTweet = 0;
    var currentTimelineScrolled = tweetManager.getCurrentTimeline().currentScroll;
    for(var i = 1; i < twtPosLength; i++) {
      if(currentTimelineScrolled > twtPositions[i]) {
        currentScrollOverTweet = i;
        continue;
      } else {
        break;
      }
    }
    if(currentScrollOverTweet < twtPosLength - 1) {
      return twtPositions[currentScrollOverTweet + 1] + 1;
    } else {
      return twtPositions[twtPosLength - 1]
    }
  }
  return 0;
}

function scrollPrevTweet() {
  var twtPositions = currentTimelineTweetPositions, twtPosLength = twtPositions.length;
  if(twtPosLength > 0) {
    var currentScrollOverTweet = 0;
    var currentTimelineScrolled = tweetManager.getCurrentTimeline().currentScroll;
    for(var i = twtPosLength - 1; i > 0; i--) {
      if(currentTimelineScrolled <= twtPositions[i] + 1) {
        currentScrollOverTweet = i;
        continue;
      } else {
        break;
      }
    }
    if(currentScrollOverTweet > 0) {
      var ret = twtPositions[currentScrollOverTweet - 1];
      return (ret > 0)? ret + 1: 0;
    }
  }
  return 0;
}

function chromeContextMenusInit() {
  chrome.contextMenus.remove('searchInSilverbirdM', function() {
    chrome.contextMenus.create({
      type: 'normal',
      id: 'searchInSilverbirdM',
      title: chrome.i18n.getMessage("c_search_on_silverbird_m"),
      contexts: ["selection"],
      onclick: function(info, tab) {
        if(info.selectionText && info.selectionText.length > 0) {
          TimelineTab.addNewSearchTab(info.selectionText);
        }
      },
      documentUrlPatterns: ['chrome-extension://' + chrome.runtime.id + '/*']
    }, function() {
      // no behavior
    });
  });
}

function displayStreamingStatus() {
  var state = tweetManager.streamingStatus;
  if(state == 'disallow' || typeof state === 'undefined') {
    $('#stream_status').remove();
    return;
  }
  var streamWidget = document.getElementById('stream_status');
  if(state == 'connect') {
    streamWidget.classList.remove('glyphicon-pause');
    streamWidget.classList.add('glyphicon-forward');
    streamWidget.setAttribute('title', chrome.i18n.getMessage('stream_connected'));
    streamWidget.dataset.status = 'connect';
  } else {
    streamWidget.classList.remove('glyphicon-forward');
    streamWidget.classList.add('glyphicon-pause');
    streamWidget.setAttribute('title', chrome.i18n.getMessage('stream_disconnected'));
    streamWidget.dataset.status = state;
  }
  streamWidget = null;
}

function tweetManagerObserver(changes) {
  changes.forEach(function(change) {
    switch(change.name) {
      case 'cachedTrendingTopics':
        loadTrends();
        break;
      case 'listsCache':
        Lists.update();
        break;
      case 'savedSearchCache':
        loadSavedSearch();
        break;
      case 'streamingStatus':
        displayStreamingStatus();
        break;
      case 'warningMessage':
        if(!window) return;
        if(tweetManager.warningMessage) {
          Renderer.warningsCallback.call(Renderer, tweetManager.warningMessage, false);
        } else {
          Renderer.hideMessage.call(Renderer);
        }
        break;
      default:
        break;
    }
  });
}

function initializeWorkspace() {
  suspend(tweetManager.suspend);
  Object.observe(tweetManager, tweetManagerObserver);
  tweetManager.registerPopupCallbacks({
    newTweets: newTweetsAvailable
  });
  $("#workspace").show();
  ThemeManager.init();

  bindEvents();
  TimelineTab.init();
  tweetManager.orderedEachTimeline(function(timeline) {
    switch(timeline.template.id) {
      case TimelineTemplate.SEARCH:
        SearchTab.addSearchTab(timeline.timelineId);
        break;
      case TimelineTemplate.LISTS:
        TimelineTab.addTab(timeline.timelineId, '<select id="' + timeline.timelineId + '-selector"></select>');
        break;
      default:
        TimelineTab.addTab(timeline.timelineId, timeline.template.timelineName);
        break;
    }
  });
  Lists.update();
  ThemeManager.handleSortableTabs();

  //Delay loading, improving responsiveness
  setTimeout(function() {
    ThemeManager.handleWindowResizing();
    ContextMenu.init();
    ConfirmDialog.init();
    TimelineTab.select(tweetManager.currentTimelineId);
    Composer.init();
    Shortener.init();
    prepareAndLoadTimeline();
    TimelineTab.scroll(tweetManager.getCurrentTimeline().currentScroll);
    WorkList.init();
    Autocomplete.init();
    chromeContextMenusInit();
    loadTrends();
    loadSavedSearch();
    displayStreamingStatus();
  }, 0);
}

function windowOnUnload() {
  chrome.contextMenus.remove('searchInSilverbirdM', function() {
    // no behavior
  });
  if(AnyClick) {
    AnyClick.clearAllEventListeners();
  }
  if(tweetManager) {
    tweetManager.cleanupCachedData();
    tweetManager.unregisterPopupCallbacks();
    tweetManager.urlExpander.clear();
    tweetManager.sendQueue.cleanUpCallbacks();
    tweetManager.eachTimeline(function(timeline) {
      timeline._cleanUpCache();
    }, true);
    Object.unobserve(tweetManager, tweetManagerObserver);
  }
  $(document).off('.popup');
  $(window).off('.popup');
  if(backgroundPage) {
    backgroundPage = null;
  }
}

function bindEvents() {
  $(window)
  .on({
    'keyup.popup': function(event) {
      if(OptionsBackend.get('use_keyboard_shortcuts')) {
        handleKeyboardShortcuts(event);
      } else {
        $(this).off(event.type);
      }
    },
//    'blur.popup': windowOnUnload,
    'beforeunload.popup': windowOnUnload
  });
  $('#options_page_link').on('click.popup', function(event) {
    event.preventDefault();
    chrome.runtime.openOptionsPage(function(event) {
      if(window) {
        windowOnUnload();
        window.close();
      }
    });
  });
  $('#signout').on('click.popup', function(event) {
    event.preventDefault();
    signout();
  });
  $('#refresh_trigger').on('click.popup', function(event) {
    event.preventDefault();
    Composer.refreshNew();
  });
  $('#suspend_status').on('click.popup', function(event) {
    event.preventDefault();
    suspend();
  });
  $('#stream_status').on('click.popup', function(event) {
    event.preventDefault();
    var state = event.target.dataset.status;
    switch(state) {
      case 'connect':
        tweetManager.disconnectStreaming();
        break;
      case 'disconnect':
        tweetManager.connectStreaming();
        break;
      case 'initializing':
      case 'disallow':
      default:
        break;
    }
  });
  $('#detach_window').on('click.popup', function(event) {
    event.preventDefault();
    Renderer.detach();
  });
  $('#twitter_link').on('click.popup', function(event) {
    event.preventDefault();
    var openUrl = 'https://twitter.com/';
    chrome.tabs.create({
      url: openUrl,
      active: true
    });
  });
  $('#update_tweets').on('click.popup', loadNewTweets);
  Composer.bindEvents();
};

$(function() {
  if(!backgroundPage.SecretKeys.hasValidKeys()) {
    Renderer.showError(chrome.i18n.getMessage('invalid_keys'));
    $("#workspace").show().height(300);
    ThemeManager.init();
    return;
  }
  if(!twitterBackend.authenticated()) {
    if(twitterBackend.tokenRequested()) {
      $(document.head).append('<link rel="import" id="importEnterPin" href="./template/enterpin.html" />');
    }
    return;
  }
  if(tweetManager.ready) {
    doLocalization();
    initializeWorkspace();
  } else {
    alert(chrome.i18n.getMessage("a_initialization_is_not_finished"));
    window.close();
  }
});
