var SearchTab = {
  addSearchTab: function(timelineId, pos, setFocus) {
    var inputHtml = ['<input type="text" spellcheck="false" class="search_selector" id="', timelineId, '-selector"></input>'].join('');
    TimelineTab.addTab(timelineId, inputHtml, pos);
    var inputEl = $(['#', timelineId, '-selector'].join(''));
    inputEl.val(tweetManager.getSearchQuery(timelineId));
    if(setFocus) {
      inputEl.focus();
    }

    inputEl.blur(function(e) {
      SearchTab.updateSearchEvent(e);
    });
    inputEl.keyup(function(e) {
      if(e && e.which == 13) { // Enter
        inputEl.blur();
      }
    });
    inputEl.keydown(function(e) {
      if(e && (e.which == 8 || e.which == 46 || e.which == 13 || e.which == 39 || e.which == 37 || e.which == 32)) {
        e.stopPropagation();
      }
    });
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
    $(['#', timelineId, '-selector'].join('')).val(searchQuery);
    if(tweetManager.changeSearch(timelineId, searchQuery)) {
      if(!isBackground) {
        Paginator.firstPage(true);
        prepareAndLoadTimeline();
      }
    }
  }
};
