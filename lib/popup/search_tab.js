var SearchTab = {
  addSearchTab: function(timelineId, pos, setFocus) {
    var inputHtml = '<input type="text" spellcheck="false" class="search_selector" id="' + timelineId + '-selector"></input>';
    TimelineTab.addTab(timelineId, inputHtml, pos);
    var inputEl = $('#' + timelineId + '-selector')
    .val(tweetManager.getSearchQuery(timelineId))
    .on({
      'blur.popup': function(e) {
        SearchTab.updateSearchEvent(e);
      },
      'keyup.popup': function(e) {
        if(e && e.which == 13) { // Enter
          inputEl.blur();
        }
      },
      'keydown.popup': function(e) {
        if(e && (e.which == 8 || e.which == 46 || e.which == 40 || e.which == 39 || e.which == 38 || e.which == 37 || e.which == 32)) {
          e.stopPropagation();
        }
      },
      'drop.popup': function(e) {
        return false;
      }
    });
    if(setFocus) {
      inputEl.focus();
    }
  },

  updateSearchEvent: function(e) {
    var timelineId = e.target.id.split('-')[0];
    var searchQuery = $(e.target).val();
    SearchTab.updateSearch(timelineId, searchQuery, false);
  },

  updateSearch: function(timelineId, searchQuery, isBackground) {
    if(!isBackground && TimelineTab.timelineId == timelineId) {
      TimelineTab.select(timelineId);
    }
    $('#' + timelineId + '-selector').val(searchQuery);
    if(tweetManager.changeSearch(timelineId, searchQuery)) {
      if(!isBackground) {
        Paginator.firstPage(true);
        prepareAndLoadTimeline();
      }
    }
  }
};
