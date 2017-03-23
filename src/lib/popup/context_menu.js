class ContextMenu {
  static init(selector = ".ui-tabs-nav") {
    $(selector).contextMenu({
      menu: "tab_context_menu",
      onBeforeShow: ContextMenu.createMenu
    }, ContextMenu.runMenuAction);
  }

  static initSingleTimeline(timelineId) {
    ContextMenu.init(`#tab_\\#timeline-${timelineId}`);
  }

  static runMenuAction(actions, el, pos) {
    const [action, context] = actions.split('-');
    const isVisbleUnified = tweetManager.getCurrentTimeline().template.id === TimelineTemplate.UNIFIED || false;
    switch(action) {
      case "show":
        TimelineTab.addNewTab(context);
        break;
      case "remove":
        TimelineTab.removeTab(context);
        if(isVisbleUnified) {
          prepareAndLoadTimeline();
        }
        break;
      case "unified":
        tweetManager.toggleUnified(context);
        if(isVisbleUnified) {
          prepareAndLoadTimeline();
        }
        break;
      case "notify":
        tweetManager.toggleNotify(context);
        break;
      case "save":
        tweetManager.createSavedSearches(decodeURIComponent(context));
        break;
      case "delete":
        tweetManager.destorySavedSearches(decodeURIComponent(context));
        break;
      default:
        break;
    }
  }

  static createMenu(el) {
    const specificMenu = [];
    const timeline = tweetManager.getTimeline(el.data("timelineId"));
    if(!!timeline && el.is('.timeline_tab')) {
      // hide or remove tab
      let label = chrome.i18n.getMessage("remove_tab");
      if(timeline.template.includeInUnified && !timeline.template.multipleTimelines) {
        label = chrome.i18n.getMessage("hide_tab");
      }
      specificMenu.push({action: 'remove-' + timeline.timelineId, label: label});
      // saved search
      if(timeline.template.id == TimelineTemplate.SEARCH) {
        const searchQuery = (timeline.getSearchQuery() || "").trim() || "";
        if (searchQuery !== "" && !/^from:/.test(searchQuery)) {
          const context = encodeURIComponent(searchQuery);
          let savedSearchAction = "";
          let savedSearchLabel = ""; 
          const saved = tweetManager.isSavedSearch(searchQuery);
          specificMenu.push({label: 'separator'});
          if(saved < 0) {
            savedSearchAction = `save-${context}`;
            savedSearchLabel = chrome.i18n.getMessage("saveSearch");
          } else {
            savedSearchAction = `delete-${context}`;
            savedSearchLabel = chrome.i18n.getMessage("deleteSearch");
          }
          specificMenu.push({action: savedSearchAction, label: savedSearchLabel});
        }
      }
      // toggle unified and notify
      if(timeline.template.id == TimelineTemplate.UNIFIED) {
        specificMenu.push({label: 'separator'});
        TimelineTemplate.eachTimelineTemplate(function(template) {
          if(timeline.template.id == template.id) {
            return true;
          }
          let className = 'check_unmarked';
          if(template.includeInUnified) {
            className = 'check_marked';
          }
          specificMenu.push({action: 'unified-' + template.id, label: template.timelineName, className: className});
          return true;
        });
      } else if(timeline.template.id != TimelineTemplate.LIKES) {
        specificMenu.push({label: 'separator'});
        let className = 'check_unmarked';
        if(timeline.template.showNotification) {
          className = 'check_marked';
        }
        specificMenu.push({action: 'notify-' + timeline.template.id, label: chrome.i18n.getMessage("notify"), className: className});
      }
    }

    const generalMenu = [];
    TimelineTemplate.eachTimelineTemplate(function(template) {
      if(!template.visible || template.multipleTimelines) {
        let label = 'show';
        if(template.multipleTimelines) {
          label = 'add';
        }
        generalMenu.push({action: 'show-' + template.id, label: chrome.i18n.getMessage(label + '_' + template.id)});
      }
    });

    if(specificMenu.length > 0 && generalMenu.length > 0) {
      specificMenu.push({label: 'separator'});
    }

    return specificMenu.concat(generalMenu);
  }
}
