const Lists = ((tweetManager) => {
  return {
    update: () => {
      const selector_value = "__chromedbird__selector__";
      const update_value = "__chromedbird__update_lists__";
      const options = [
        `<option
           value="${selector_value}"
           data-list="${escape(JSON.stringify({id_str: selector_value}))}"
         >${chrome.i18n.getMessage("selectList")}</option>`,
        ...tweetManager.cachedLists.map((list) => {
          try {
            return `<option
                      value="${list.id_str}"
                      data-list="${escape(JSON.stringify(list))}"
                    >${list.name}</option>`;
          } catch(e) {
            return "";
          }
        }),
        `<option
           value="${update_value}"
           data-list="${escape(JSON.stringify({id_str: update_value}))}"
         >${chrome.i18n.getMessage("updateLists")}</option>`
      ].join("");
      tweetManager.eachTimeline((timeline) => {
        if(!/^lists_/.test(timeline.timelineId)) {
          return true;
        }
        $(`#${timeline.timelineId}-selector`)
        .empty()
        .html(options)
        .val(tweetManager.getListId(timeline.timelineId) || selector_value)
        .simpleSelect({
          timeline: timeline.timelineId,
          change: (data) => {
            if(data.id_str === selector_value) {
              return false;
            }
            if(data.id_str === update_value) {
              tweetManager.retrieveLists();
              return false;
            }
            tweetManager.changeList(timeline.timelineId, data);
            Paginator.needsMore = false;
            prepareAndLoadTimeline();
            return true;
          }
        });
        return true;
      });
    }
  };
})(tweetManager);

