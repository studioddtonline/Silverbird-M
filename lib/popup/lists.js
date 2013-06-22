var Lists = {
  init: function() {
    if(!window) { // Popup closed
      return;
    }
    var lists = tweetManager.listsCache, selector_value = '__chromedbird__selector__', update_value = '__chromedbird__update_lists__';
    if(!lists) {
      lists = [];
    }
    tweetManager.eachTimeline(function(timeline) {
      if(timeline.template.id != TimelineTemplate.LISTS) {
        return true;
      }
      var $listSelect = $("#" + timeline.timelineId + "-selector");
      if($listSelect.length === 0) {
        var pos = tweetManager.getTimelinePosition(timeline.timelineId);
        if(pos == -1) {
          pos = undefined;
        }
        TimelineTab.addTab(timeline.timelineId, '<select id="' + timeline.timelineId + '-selector"></select>', pos);
        $listSelect = $("#" + timeline.timelineId + "-selector");
      }
      var elArrStr = '<option value="' + selector_value + '">' + chrome.i18n.getMessage("selectList") + '</option>';
      for(var j = 0, k = lists.length; j < k; ++j) {
        if(lists[j].uri == undefined || lists[j].name == undefined) continue;
        elArrStr += '<option value="' + lists[j].uri + '">' + lists[j].name + '</option>';
      }
      elArrStr += '<option value="' + update_value + '">' + chrome.i18n.getMessage("updateLists") + '</option>';
      $listSelect
      .empty()
      .html(elArrStr)
      .val(tweetManager.getListId(timeline.timelineId) || selector_value)
      .simpleSelect({
        change: function(value, label) {
          if(value == selector_value) {
            return false;
          }
          if(value == update_value) {
            tweetManager.retrieveLists(true);
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
    ThemeManager.handleWindowResizing();
  }
};
