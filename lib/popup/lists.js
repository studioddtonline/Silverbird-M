var Lists = {
  update: function(timelineId) {
    if(!window) { // Popup closed
      return;
    }
    var lists = tweetManager.listsCache || [],
        selector_value = '__chromedbird__selector__',
        update_value = '__chromedbird__update_lists__',
        selectorOptions = '<option value="' + selector_value + '">' + chrome.i18n.getMessage("selectList") + '</option>';
    for(var i = 0, len = lists.length; i < len; ++i) {
      if(lists[i].uri == undefined || lists[i].name == undefined) continue;
      selectorOptions += '<option value="' + lists[i].uri + '">' + lists[i].name + '</option>';
    }
    selectorOptions += '<option value="' + update_value + '">' + chrome.i18n.getMessage("updateLists") + '</option>';
    tweetManager.eachTimeline(function(timeline) {
      if(timeline.template.id !== TimelineTemplate.LISTS || (timelineId && timelineId !== timeline.timelineId)) {
        return true;
      }
      $("#" + timeline.timelineId + "-selector")
      .empty()
      .html(selectorOptions)
      .val(tweetManager.getListId(timeline.timelineId) || selector_value)
      .simpleSelect({
        change: function(value, label) {
          if(value == selector_value) {
            return false;
          }
          if(value == update_value) {
            tweetManager.retrieveLists(true).done(Lists.update);
            return false;
          }
          var timelineId = this.selectEl.id.split('-')[0];
          tweetManager.changeList(timelineId, value);
          Paginator.firstPage(true);
          prepareAndLoadTimeline();
          return true;
        }
      });
      return true;
    });
  }
};
