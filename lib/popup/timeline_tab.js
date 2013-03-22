var TimelineTab = {
  init: function() {
    $("#tabs").tabs({
      active: 0,
      beforeActivate: function(event, ui) {
        tweetManager.previousTimelineId = tweetManager.currentTimelineId;
        tweetManager.currentTimelineId = ui.newPanel.selector.split('-')[1];
        prepareAndLoadTimeline();
      },
      activate: function(event, ui) {
        $('[aria-expanded="true"]', ui.newPanel.context).scrollTop(tweetManager.getCurrentTimeline().currentScroll);
      }
    });
  },

  addNewTab: function(templateId, automaticallyAdded) {
    var createdTimelines = tweetManager.showTimelineTemplate(templateId);
    if(templateId == TimelineTemplate.LISTS) {
      Lists.init();
    } else {
      for(var i = 0, len = createdTimelines.length; i < len; ++i) {
        var timeline = createdTimelines[i];
        pos = tweetManager.getTimelinePosition(timeline.timelineId);
        if(pos == -1) {
          pos = undefined;
        }
        if(templateId == TimelineTemplate.SEARCH) {
          SearchTab.addSearchTab(timeline.timelineId, pos, !automaticallyAdded);
        } else {
          TimelineTab.addTab(timeline.timelineId, timeline.template.timelineName, pos);
        }
      }
      ThemeManager.handleWindowResizing();
    }
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
    $('<li id="tab_\#timeline-'+timelineId+'" class="timeline_tab"><a href="\#timeline-'+timelineId+'"><span>'+tabName+'</span></a></li>').appendTo("#tabs .ui-tabs-nav");
    $('<div class="timeline" id="timeline-'+timelineId+'"><div class="inner_timeline"></div></div>').appendTo("#tabs");
    $("#tabs").tabs('refresh');
    var tabEl = $("#timeline-" + timelineId + ' .inner_timeline');
    tabEl.scroll(function(e) {
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
    });
    ContextMenu.initSingleTimeline(timelineId);
  },

  removeTab: function(timelineId) {
    if(timelineId == tweetManager.currentTimelineId && tweetManager.previousTimelineId) {
      this.select(tweetManager.previousTimelineId);
    }
    var targetTab = $("#tabs > ul li[aria-controls=timeline-"+timelineId+"]").remove();
    $("#timeline-"+timelineId).remove();
    $("#tabs").tabs('refresh');
    tweetManager.hideTimeline(timelineId);
    ThemeManager.handleWindowResizing();
    ThemeManager.updateTabsOrder();
  },

  select: function(timelineId) {
    $("#tabs").tabs({active: $("#tabs > ul li[aria-controls=timeline-"+timelineId+"]").index()});
  }
};
