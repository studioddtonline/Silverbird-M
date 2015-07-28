var TwitterLib = {
  URLS: {
    BASE: 'https://twitter.com/',
    SEARCH: 'https://twitter.com/search?q='
  }
};
var backgroundPage = chrome.extension.getBackgroundPage();
var Persistence = backgroundPage.Persistence;
var tweetManager = backgroundPage.TweetManager.instance;
var twitterBackend = tweetManager.twitterBackend;
var OptionsBackend = backgroundPage.OptionsBackend;
var TimelineTemplate = backgroundPage.TimelineTemplate;

switch(location.pathname) {
  case "/popup.html":
    var shortener = tweetManager.shortener;

    if(backgroundPage.SecretKeys.hasValidKeys()
    && !twitterBackend.authenticated()
    && !twitterBackend.tokenRequested()) {
      twitterBackend.startAuthentication();
      window.close();
    }
    if(location.search === "?popup") {
      chrome.tabs.query({windowType: "popup"}, function(tabs) {
        tabs.forEach(function(tab) {
          if(tab.url.indexOf(chrome.runtime.id) !== -1) {
            chrome.windows.remove(tab.windowId);
          }
        });
      });
    }
    break;
  case "/options.html":
    break;
  default:
    window.close();
    break;
}

function doLocalization() {
  Array.prototype.slice.call(document.querySelectorAll(".i18n")).forEach(function(node) {
    if(node.title) {
      node.setAttribute('title', chrome.i18n.getMessage(node.id));
    } else if(node.value && node.tagName !== 'OPTION') {
      node.setAttribute('value', chrome.i18n.getMessage(node.id));
    } else {
      node.textContent = chrome.i18n.getMessage(node.id);
    }
    node.classList.remove("i18n");
  });
}
