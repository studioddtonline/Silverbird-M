var Lists = {
  update: function(timelineId) {
    var selector_value = '__chromedbird__selector__',
        update_value = '__chromedbird__update_lists__';
    var optionsForSelector = tweetManager.cachedLists.map((list) => {
      try {
        return `<option value="${list.id_str}" data-list="${escape(JSON.stringify(list))}">${list.name}</option>`;
      } catch(e) {
        return "";
      }
    });
    optionsForSelector.unshift(`<option value="${selector_value}" data-list="${escape(JSON.stringify({id_str: selector_value}))}">${chrome.i18n.getMessage("selectList")}</option>`);
    optionsForSelector.push(`<option value="${update_value}" data-list="${escape(JSON.stringify({id_str: update_value}))}">${chrome.i18n.getMessage("updateLists")}</option>`);

    tweetManager.eachTimeline(function(timeline) {
      if(timeline.template.id !== TimelineTemplate.LISTS || (timelineId && timelineId !== timeline.timelineId)) {
        return true;
      }
      $(`#${timeline.timelineId}-selector`)
      .empty()
      .html(optionsForSelector.join(""))
      .val(tweetManager.getListId(timeline.timelineId) || selector_value)
      .simpleSelect({
        timeline: timeline.timelineId,
        change: function(data) {
          if(data.id_str == selector_value) {
            return false;
          }
          if(data.id_str == update_value) {
            tweetManager.retrieveLists(true);
            return false;
          }
          tweetManager.changeList(this.selectEl.dataset.timelineId, data);
          Paginator.needsMore = false;
          prepareAndLoadTimeline();
          return true;
        }
      });
      return true;
    });
  }
};
