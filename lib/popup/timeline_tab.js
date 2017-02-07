var TimelineTab = {
  init: function() {
    $("#tabs").tabs({
      beforeActivate: function(event, ui) {
        tweetManager.previousTimelineId = tweetManager.currentTimelineId;
        tweetManager.currentTimelineId = ui.newTab.data("timelineId");
        TimelineTab.handleScroll(tweetManager.previousTimelineId, false);
        Renderer.removeListenerForNewActions();
        Renderer.applyUnobserve();
        prepareTimelines();
      },
      activate: function(event, ui) {
        document.activeElement.blur();
        ui.oldPanel.find('.inner_timeline').empty();
        TimelineTab.handleScroll(tweetManager.currentTimelineId, true);
        loadTimeline();
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
          TimelineTab.addTab(timeline.timelineId, `<select id="${timeline.timelineId}-selector" data-timeline-id="${timeline.timelineId}"></select>`);
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
    ThemeManager.initWindowResizing($(`#timeline-${timelineId}`));
    ContextMenu.initSingleTimeline(timelineId);
  },

  removeTab: function(timelineId) {
    this.handleScroll(timelineId, false);
    if(timelineId == tweetManager.currentTimelineId && tweetManager.previousTimelineId) {
      AnyClick.clearEventListeners();
      this.select(tweetManager.previousTimelineId);
    }
    $("#tab_\\#timeline-"+timelineId).remove();
    $("#timeline-"+timelineId).remove();
    $("#tabs").tabs('refresh');
    tweetManager.hideTimeline(timelineId);
    tweetManager.updateAlert();
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

  scroll: function(scrollTo = null) {
    if(typeof scrollTo !== "number") {
      return;
    }
    document.querySelector(`#timeline-${tweetManager.currentTimelineId} .inner_timeline`).scrollTop = scrollTo;
  },

  handleScroll(timelineId = tweetManager.currentTimelineId, doHandle = true) {
    const timeline = tweetManager.getTimeline(timelineId);
    const threshold = 50;
    const target = document.querySelector(`#timeline-${timelineId} .inner_timeline`);
    if(!target) {
      return;
    }
    if(!!doHandle) {
      target._handler = (event) => {
        const scrollAmount = timeline.currentScroll - event.target.scrollTop;
        timeline.currentScroll = event.target.scrollTop;
        const maxScroll = event.target.scrollHeight - event.target.clientHeight;
        if(scrollAmount < 0 && (maxScroll - event.target.scrollTop) < threshold) {
          if(document.getElementById("loading").style.display === "none") {
            Paginator.nextPage();
          }
        }
      };
      target.addEventListener("scroll", target._handler, {passive: true});
    } else {
      if(!!target._handler) {
        target.removeEventListener("scroll", target._handler, {passive: true});
        target._handler = undefined;
      }
    }
  }
};
