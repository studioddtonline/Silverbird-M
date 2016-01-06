var Lists = {
  update: function(timelineId) {
    var lists = tweetManager.cachedLists || [],
        selector_value = '__chromedbird__selector__',
        update_value = '__chromedbird__update_lists__',
        selectorOptions = '<option value="' + selector_value + '" data-list="' + escape('{"id_str":"' + selector_value + '"}') + '">' + chrome.i18n.getMessage("selectList") + '</option>';
    for(var i = 0, len = lists.length; i < len; ++i) {
      if(lists[i].id_str == undefined || lists[i].name == undefined) continue;
      selectorOptions += '<option value="' + lists[i].id_str + '" data-list="' + escape('{"id_str":"' + lists[i].id_str + '","uri":"' + (lists[i].uri || '') + '"}') + '">' + lists[i].name + '</option>';
    }
    selectorOptions += '<option value="' + update_value + '" data-list="' + escape('{"id_str":"' + update_value + '"}') + '">' + chrome.i18n.getMessage("updateLists") + '</option>';
    tweetManager.eachTimeline(function(timeline) {
      if(timeline.template.id !== TimelineTemplate.LISTS || (timelineId && timelineId !== timeline.timelineId)) {
        return true;
      }
      $("#" + timeline.timelineId + "-selector")
      .empty()
      .html(selectorOptions)
      .val(tweetManager.getListId(timeline.timelineId) || selector_value)
      .simpleSelect({
        change: function(data) {
          if(data.id_str == selector_value) {
            return false;
          }
          if(data.id_str == update_value) {
            tweetManager.retrieveLists(true).done(Lists.update);
            return false;
          }
          var timelineId = this.selectEl.id.split('-')[0];
          tweetManager.changeList(timelineId, data);
          Paginator.needsMore = false;
          prepareAndLoadTimeline();
          return true;
        }
      });
      return true;
    });
  }
};
