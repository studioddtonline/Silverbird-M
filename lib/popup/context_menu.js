var ContextMenu = {
  init: function(selector) {
    var _this = this;
    if(!selector) {
      selector = '.ui-tabs-nav';
    }
    $(selector).contextMenu({
      menu: 'tab_context_menu',
      onBeforeShow: function(el) {
        return _this.createMenu(el);
      }
    }, function(action, el, pos) {
      return _this.runMenuAction(action, el, pos);
    });
  },

  initSingleTimeline: function(timelineId) {
    this.init('#tab_\\#timeline-' + timelineId);
  },

  runMenuAction: function(action, el, pos) {
    var actionParts = action.split('-');
    var templateId = actionParts[1];
    if(actionParts[0] == 'show') {
      TimelineTab.addNewTab(templateId);
    } else if(actionParts[0] == 'remove') {
      var timelineId = actionParts[1];
      TimelineTab.removeTab(timelineId);
      if(tweetManager.getCurrentTimeline().template.id == TimelineTemplate.UNIFIED) {
        prepareAndLoadTimeline();
      }
    } else if(actionParts[0] == 'unified') {
      tweetManager.toggleUnified(templateId);
      if(tweetManager.getCurrentTimeline().template.id == TimelineTemplate.UNIFIED) {
        prepareAndLoadTimeline();
      }
    } else if(actionParts[0] == 'notify') {
      tweetManager.toggleNotify(templateId);
    } else if(actionParts[0] == 'icon') {
      tweetManager.toggleChangeIcon(templateId);
    }
  },

  createMenu: function(el) {
    var specificMenu = [];
    var timeline = null;
    if(el.is('.timeline_tab')) {
      timeline = tweetManager.getTimeline(el[0].id.split('-')[1]);
      var label = chrome.i18n.getMessage("remove_tab");
      if(timeline.template.includeInUnified && !timeline.template.multipleTimelines) {
        label = chrome.i18n.getMessage("hide_tab");
      }
      specificMenu.push({action: 'remove-' + timeline.timelineId, label: label});

      if(timeline.template.id == TimelineTemplate.UNIFIED) {
        specificMenu.push({label: 'separator'});
        TimelineTemplate.eachTimelineTemplate(function(template) {
          if(timeline.template.id == template.id) {
            return true;
          }
          var className = 'check_unmarked';
          if(template.includeInUnified) {
            className = 'check_marked';
          }
          specificMenu.push({action: 'unified-' + template.id, label: template.timelineName, className: className});
          return true;
        });
      } else if(timeline.template.id != TimelineTemplate.FAVORITES) {
        specificMenu.push({label: 'separator'});
        var className = 'check_unmarked';
        if(timeline.template.showOnPageNotification) {
          className = 'check_marked';
        }
        specificMenu.push({action: 'notify-' + timeline.template.id, label: chrome.i18n.getMessage("notify"), className: className});

        className = 'check_unmarked';
        if(timeline.template.showIconNotification) {
          className = 'check_marked';
        }
        specificMenu.push({action: 'icon-' + timeline.template.id, label: chrome.i18n.getMessage("changeIcon"), className: className});
      }
    }

    var generalMenu = [];
    TimelineTemplate.eachTimelineTemplate(function(template) {
      if(!template.visible || template.multipleTimelines) {
        var label = 'show';
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

};
