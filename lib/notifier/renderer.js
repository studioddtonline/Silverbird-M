$.extend(Renderer, {
  createUserActionMenu: function(element, username) {
    AnyClick.anyClick(element, function(event) {
      openTab(TwitterLib.URLS.BASE + username);
    });
  },

  handleHashTag: function(link, value) {
    AnyClick.anyClick(link, function(ev) {
      openTab(TwitterLib.URLS.SEARCH + "%23" + value);
    });
  },

  handleLink: function(link, baseUrl, expandedUrl, mediaUrl) {
    AnyClick.anyClick(link, function() {
      openTab(baseUrl);
    });
  }
});
