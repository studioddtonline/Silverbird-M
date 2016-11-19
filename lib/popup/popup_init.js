var currentTimelineTweetPositions = [];

function showLoading() {
  const loading = document.getElementById("loading");
  if(loading && loading.style.display === "none") {
    loading.style.display = "block";
  }
}

function hideLoading() {
  const loading = document.getElementById("loading");
  if(loading && loading.style.display !== "none") {
    loading.style.display = "none";
  }
}

function onTimelineRetrieved(tweets, timelineId) {
  if(!window) {
    //Sanity check, popup might be closed.
    return;
  }
  hideLoading();
  const currentTimeline = tweetManager.getCurrentTimeline();
  if(timelineId !== currentTimeline.timelineId) {
    return
  }
  let timeline = tweetManager.getTimeline(timelineId);
  if(!timeline || !timeline.template.visible) {
    return;
  }
  AnyClick.clearEventListeners();
  tweetManager.urlExpander.clear();
  if(tweets) {
    if(tweets.length === 0) {
      tweets = [tweetManager.getDummyTweet()];
      tweets[0].text = chrome.i18n.getMessage("ue_updatingTweets_nofetched");
    }
    Paginator.needsMore = false;
    Renderer.assemblyTweets(tweets, timelineId);
    if(OptionsBackend.get('use_keyboard_shortcuts')
    && timelineId == tweetManager.currentTimelineId) {
      caliculateTweetPositions();
    }
    TimelineTab.scroll(currentTimeline.currentScroll);
  } else {
    var baseErrorMsg = tweetManager.currentError() || chrome.i18n.getMessage("undefined_message");
    if(baseErrorMsg === '(This user is protected)') {
      tweets = [tweetManager.getDummyTweet()];
      tweets[0].text = chrome.i18n.getMessage("ue_unauthorized_user");
      onTimelineRetrieved(tweets, timelineId);
      return;
    } else {
      var errorMsg = "";
      if(baseErrorMsg === 504) {
        errorMsg = chrome.i18n.getMessage("ue_updatingTweets_timeout");
      } else if(baseErrorMsg === 500 || baseErrorMsg === 503) {
        errorMsg = chrome.i18n.getMessage('ue_twitter_is_now_unable');
      } else if(baseErrorMsg === 429) {
        errorMsg = chrome.i18n.getMessage('exceededAPIHits');
      } else if(baseErrorMsg === 401) {
        errorMsg = chrome.i18n.getMessage("ue_updatingTweets_noauthenticate");
      } else if(baseErrorMsg === 261) {
        errorMsg = chrome.i18n.getMessage("ue_restricted_write_action");
      } else {
        errorMsg = chrome.i18n.getMessage("ue_updatingTweets", baseErrorMsg);
      }
      Renderer.showError(errorMsg);
    }
  }
  prepareTimelines();
}

function loadTimeline(force = false, forcedTimeline = undefined) {
  showLoading();
  if(!!force) {
    Paginator.needsMore = false;
  }
  let cacheOnly = true;
  if(!!Paginator.needsMore) {
    cacheOnly = false;
  }
  tweetManager.giveMeTweets(forcedTimeline, onTimelineRetrieved, force, cacheOnly);
}

function signout() {
  tweetManager.signout();
  window.close();
}

function suspend() {
  var suspendWidget = document.getElementById('suspend_status');
  if(tweetManager.suspend) {
    suspendWidget.classList.remove('glyphicon-play');
    suspendWidget.classList.add('glyphicon-stop');
    suspendWidget.setAttribute('title', chrome.i18n.getMessage("timeline_suspended"));
  } else {
    suspendWidget.classList.remove('glyphicon-stop');
    suspendWidget.classList.add('glyphicon-play');
    suspendWidget.setAttribute('title', chrome.i18n.getMessage("timeline_running"));
  }
}

function newTweetsAvailable(count, timelineId) {
  if(!window) {
    //Sanity check, popup might be closed.
    return;
  }
  const currentTimeline = tweetManager.currentTimelineId;
  if(timelineId !== currentTimeline) {
    const updateTab = $("#tab_\\#timeline-" + timelineId);
    if(count === 0) {
      updateTab.removeClass('update_modifier');
    } else {
      updateTab.addClass('update_modifier');
    }
  } else {
    if(count > 0) {
      const tweets_string = count > 1 ? "tweet_plural" : "tweet_singular";
      $("#update_tweets").text(chrome.i18n.getMessage("newTweetsAvailable", [count, chrome.i18n.getMessage(tweets_string)])).fadeIn();
    } else {
      $("#update_tweets").fadeOut();
    }
  }
}

function updateNotificationFunc(timelineId = tweetManager.currentTimelineId) {
  const count = tweetManager.getNewTweetsCount(timelineId);
  if(timelineId === tweetManager.currentTimelineId) {
    if(count > 0) {
      tweetManager.mergeNewTweets();
    }
    document.getElementById(`tab_#timeline-${timelineId}`).classList.remove("update_modifier");
  } else {
    newTweetsAvailable(count, timelineId);
  }
}

function loadNewTweets() {
  Paginator.needsMore = false;
  $("#tab_\\#timeline-" + tweetManager.currentTimelineId).removeClass('update_modifier');
  $("#update_tweets").fadeOut();

  prepareAndLoadTimeline();
}

function loadTrends() {
  var trendingTopicsButton = $("#trending_topics");
  var userData = tweetManager.cachedTrendingTopics || {};
  var actions = [];

  if(userData.trends && Array.isArray(userData.trends) && userData.trends.length > 0) {
    actions = userData.trends.slice(0, 10).map(function(entry) {
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

function loadSavedSearches() {
  var savedSearchedButton = $("#saved_searches");
  var userData = tweetManager.cachedSavedSearches || [];
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

  updateNotificationFunc(tweetManager.currentTimelineId);
  tweetManager.eachTimeline((timeline) => {
    if(timeline.timelineId !== tweetManager.currentTimelineId) {
      updateNotificationFunc(timeline.timelineId);
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
  const tweetsInnerTimeline = document.querySelectorAll(".tweet_space");
  currentTimelineTweetPositions = [];
  if(!!tweetsInnerTimeline) {
    currentTimelineTweetPositions = [...tweetsInnerTimeline].map((e) => e.offsetTop);
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
  const state = (!!tweetManager.userstream)? (tweetManager.userstream.state || false): false;
  if(!OptionsBackend.get("use_streaming_api")) {
    $('#stream_status').remove();
    return;
  }
  const streamWidget = document.getElementById('stream_status');
  if(state) {
    streamWidget.classList.remove('glyphicon-pause');
    streamWidget.classList.add('glyphicon-forward');
    streamWidget.setAttribute('title', chrome.i18n.getMessage('stream_connected'));
    streamWidget.dataset.status = 'connected';
  } else {
    streamWidget.classList.remove('glyphicon-forward');
    streamWidget.classList.add('glyphicon-pause');
    streamWidget.setAttribute('title', chrome.i18n.getMessage('stream_disconnected'));
    streamWidget.dataset.status = state;
  }
}

function initializeWorkspace() {
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
    suspend(tweetManager.suspend);
    ThemeManager.handleWindowResizing();
    ContextMenu.init();
    ConfirmDialog.init();
    TimelineTab.select(tweetManager.currentTimelineId);
    Composer.init();
    Shortener.init();
    WorkList.init();
    Autocomplete.init();
    chromeContextMenusInit();
    loadTrends();
    loadSavedSearches();
    displayStreamingStatus();
  }, 0);
}

function bindEvents() {
  if(OptionsBackend.get('use_keyboard_shortcuts')) {
    $(window).on('keyup.popup', function(event) {
      handleKeyboardShortcuts(event);
    });
  }
  $(window)
  .on({
    'updateTimeline': function(event) {
      if(event.originalEvent) {
        event = event.originalEvent;
      }
      newTweetsAvailable(event.detail.count, event.detail.timelineId);
    },
    'updateTrendingTopics': function(event) {
      loadTrends();
    },
    'updateLists': function(event) {
      Lists.update();
    },
    'updateSavedSearches': function(event) {
      loadSavedSearches();
    },
    'updateStreamingStatus': function(event) {
      displayStreamingStatus();
    },
    'updateWarningMessage': function(event) {
      if(event.originalEvent) {
        event = event.originalEvent;
      }
      if(event.detail && event.detail !== "") {
        Renderer.showMessage(event.detail, false);
      }
    },
    'updateSuspend': function(event) {
      if(event.originalEvent) {
        event = event.originalEvent;
      }
      suspend();
    },
    'updateVisibility': function(event) {
      if(event.originalEvent) {
        event = event.originalEvent;
      }
      if(event.detail && event.detail !== "") {
        $(".tweet").filter("[tweetid='" + event.detail + "']").parents('.tweet_space').first().hide('blind', { direction: "vertical" });
      }
    }
  });
  $('#options_page_link').on('click.popup', function(event) {
    event.preventDefault();
    chrome.runtime.openOptionsPage(function(event) {
      if(window) {
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
    tweetManager.suspend = !tweetManager.suspend;
  });
  $('#stream_status').on('click.popup', function(event) {
    event.preventDefault();
    const state = (!!tweetManager.userstream)? (tweetManager.userstream.state || false): false;
    if(state) {
      tweetManager.disconnectStreaming();
    } else {
      tweetManager.connectStreaming();
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
  if(!twitterBackend.isAuthenticated()) {
    if(twitterBackend.isTokenRequested()) {
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
