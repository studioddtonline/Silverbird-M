var TimelineTab = {
  init: function() {
    $("#tabs").tabs({
      beforeActivate: function(event, ui) {
        tweetManager.previousTimelineId = tweetManager.currentTimelineId;
        tweetManager.currentTimelineId = ui.newTab.data("timelineId");
        setTimeout(prepareAndLoadTimeline, 0);
      },
      activate: function(event, ui) {
        ui.newPanel.find('.inner_timeline').scrollTop(tweetManager.getCurrentTimeline().currentScroll);
        document.activeElement.blur();
        ui.oldPanel.find('.inner_timeline').empty();
        $('.ui-helper-hidden-accessible').filter('[role=log]').remove();
      }
    });
  },

  addNewTab: function(templateId, automaticallyAdded) {
    var createdTimelines = tweetManager.showTimelineTemplate(templateId);
    for(var i = 0, len = createdTimelines.length; i < len; ++i) {
      var timeline = createdTimelines[i];
      pos = tweetManager.getTimelinePosition(timeline.timelineId);
      if(pos == -1) {
        pos = undefined;
      }
      switch(templateId) {
        case TimelineTemplate.SEARCH:
          SearchTab.addSearchTab(timeline.timelineId, pos, !automaticallyAdded);
          break;
        case TimelineTemplate.LISTS:
          TimelineTab.addTab(timeline.timelineId, '<select id="' + timeline.timelineId + '-selector"></select>');
          Lists.update(timeline.timelineId);
          break;
        default:
          TimelineTab.addTab(timeline.timelineId, timeline.template.timelineName, pos);
          break;
      }
      
    }
    ThemeManager.handleWindowResizing();
    ThemeManager.updateTabsOrder();
    return createdTimelines;
  },

  addNewSearchTab: function(searchQuery, isBackground) {
    var searchTimeline;
    tweetManager.eachTimeline(function(timeline) {
      if(timeline.template.id == TimelineTemplate.SEARCH && timeline.getSearchQuery() == searchQuery) {
        searchTimeline = timeline;
        return false;
      }
      return true;
    });
    if(!searchTimeline) {
      searchTimeline = TimelineTab.addNewTab(TimelineTemplate.SEARCH, true)[0];
    }
    if(searchQuery) {
      SearchTab.updateSearch(searchTimeline.timelineId, searchQuery, isBackground);
    }
  },

  addTab: function(timelineId, tabName, pos) {
    var insertTabEl = $.parseHTML(`<li id="tab_\#timeline-${timelineId}" data-timeline-id="${timelineId}" class="timeline_tab"><a href="\#timeline-${timelineId}">${tabName}</a></li>`);
    var panelEl = $.parseHTML('<div class="timeline" id="timeline-' + timelineId + '"><div class="inner_timeline"></div></div>');
    var tabDiv = $("#tabs");
    var tabUl = tabDiv.find(".ui-tabs-nav");
    if($.isNumeric(pos) && pos > 0) {
      tabUl.find(".timeline_tab").eq(pos - 1).after(insertTabEl);
    } else {
      tabUl.append(insertTabEl);
    }
    tabDiv.append(panelEl);
    tabDiv.tabs('refresh');
    $("#timeline-" + timelineId)
    .find(".inner_timeline")
    .scroll(function(e) {
      var $this = $(this);
      var timeline = tweetManager.getTimeline(timelineId);
      var threshold = 50;
      timeline.currentScroll = $this.scrollTop();
      var maxScroll = $this.prop("scrollHeight") - $this.height();
      if(maxScroll - $this.scrollTop() < threshold) {
        if(!loadingNewTweets) {
          Paginator.nextPage();
        }
      }
      $this = null;
    });
    ThemeManager.initWindowResizing($("#timeline-" + timelineId));
    ContextMenu.initSingleTimeline(timelineId);
  },

  removeTab: function(timelineId) {
    if(timelineId == tweetManager.currentTimelineId && tweetManager.previousTimelineId) {
      AnyClick.clearEventListeners();
      this.select(tweetManager.previousTimelineId);
    }
    $("#tab_\\#timeline-"+timelineId).remove();
    $("#timeline-"+timelineId).remove();
    $("#tabs").tabs('refresh');
    tweetManager.hideTimeline(timelineId);
    ThemeManager.handleWindowResizing();
    ThemeManager.updateTabsOrder();
  },

  select: function(timelineId) {
    $("#tabs").tabs('option', 'active', $("#tab_\\#timeline-"+timelineId).index());
  },

  selectLeft: function(timelineId) {
    $("#tabs").tabs('option', 'active', $("#tab_\\#timeline-"+timelineId).index() - 1);
  },

  selectRight: function(timelineId) {
    var nextIndex = $("#tab_\\#timeline-"+timelineId).index() + 1;
    if(nextIndex >= $('#tabs').find('.timeline_tab').length) nextIndex = 0;
    $("#tabs").tabs('option', 'active', nextIndex);
  },

  scroll: function(scrollTo, timelineId) {
    if(!timelineId) timelineId = tweetManager.currentTimelineId;
    $("#timeline-"+timelineId).find('.inner_timeline').scrollTop(scrollTo || 0);
  }
};
