var TimelineTab = {
  init: function() {
    $("#tabs").tabs({
      beforeActivate: (function(manager) {
        return function(event, ui) {
          manager.previousTimelineId = manager.currentTimelineId;
          manager.currentTimelineId = ui.newTab.data("timelineId");
          TimelineTab.handleScroll(manager.previousTimelineId, false);
          Renderer.preClearance();
          prepareTimelines();
        };
      })(tweetManager),
      activate: (function(manager) {
        return function(event, ui) {
          document.activeElement.blur();
          ui.oldPanel.find('.inner_timeline').empty();
          TimelineTab.handleScroll(manager.currentTimelineId, true);
          loadTimeline();
        };
      })(tweetManager)
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
    const insertTabEl = `
      <li id="tab_\#timeline-${timelineId}" data-timeline-id="${timelineId}" class="timeline_tab">
        <a href="\#timeline-${timelineId}">${tabName}</a>
      </li>
    `;
    const panelEl = `
      <div class="timeline" id="timeline-${timelineId}">
        <div class="inner_timeline"></div>
      </div>
    `;
    const tabDiv = $("#tabs");
    const tabUl = tabDiv.find(".ui-tabs-nav");
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
    if(timelineId == tweetManager.currentTimelineId && tweetManager.previousTimelineId) {
      this.select(tweetManager.previousTimelineId);
    }
    const tab = document.querySelector(`#tab_\\#timeline-${timelineId}`);
    if(tab) {
      tab.parentNode.removeChild(tab);
    }
    this.handleScroll(timelineId, false);
    const panel = document.querySelector(`#timeline-${timelineId}`);
    if(panel) {
      Renderer.preClearance(panel);
      panel.parentNode.removeChild(panel);
    }
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
      target.handlerScroll = ((t) => {
        return (event) => {
          const scrollAmount = t.currentScroll - event.target.scrollTop;
          t.currentScroll = event.target.scrollTop;
          const maxScroll = event.target.scrollHeight - event.target.clientHeight;
          if(scrollAmount < 0 && (maxScroll - event.target.scrollTop) < threshold) {
            if(!document.querySelector("silm-loadingicon").visible) {
              Paginator.nextPage();
            }
          }
        };
      })(timeline);
      target.addEventListener("scroll", target.handlerScroll, {passive: true});
    } else {
      if(!!target.handlerScroll) {
        target.removeEventListener("scroll", target.handlerScroll, {passive: true});
        target.handlerScroll = null;
      }
    }
  }
};
