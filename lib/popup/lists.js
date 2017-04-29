var Lists = {
  update: function(timelineId) {
    const selector_value = '__chromedbird__selector__';
    const update_value = '__chromedbird__update_lists__';
    const options = tweetManager.cachedLists.map((list) => {
      try {
        return `<option value="${list.id_str}" data-list="${escape(JSON.stringify(list))}">${list.name}</option>`;
      } catch(e) {
        return "";
      }
    });
    options.unshift(`
      <option value="${selector_value}" data-list="${escape(JSON.stringify({id_str: selector_value}))}">
        ${chrome.i18n.getMessage("selectList")}
      </option>
    `);
    options.push(`
      <option value="${update_value}" data-list="${escape(JSON.stringify({id_str: update_value}))}">
        ${chrome.i18n.getMessage("updateLists")}
      </option>
    `);
    const optionsHtml = options.join("");
    const timelines = tweetManager.timelineOrder || [];
    timelines.forEach((timeline) => {
      if(/^lists_/.test(timeline) || timeline === timelineId) {
        $(`#${timeline}-selector`)
        .empty()
        .html(optionsHtml)
        .val(tweetManager.getListId(timeline) || selector_value)
        .simpleSelect({
          timeline: timeline,
          change: (function(m) {
            return function(data) {
              if(data.id_str === selector_value) {
                return false;
              }
              if(data.id_str === update_value) {
                m.retrieveLists();
                return false;
              }
              m.changeList(timeline, data);
              Paginator.needsMore = false;
              prepareAndLoadTimeline();
              return true;
            };
          })(tweetManager)
        });
      }
    });
  }
};
