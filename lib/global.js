var TwitterLib = {
  URLS: {
    BASE: 'https://twitter.com/',
    SEARCH: 'https://twitter.com/search?q='
  }
};
var MAX_TWEET_SIZE = 140;

var backgroundPage = chrome.extension.getBackgroundPage();
var Persistence = backgroundPage.Persistence;
var tweetManager = backgroundPage.TweetManager.instance;
var twitterBackend = tweetManager.twitterBackend;
var OptionsBackend = backgroundPage.OptionsBackend;
var TimelineTemplate = backgroundPage.TimelineTemplate;

switch(location.pathname) {
  case "/popup.html":
    var ImageService = backgroundPage.ImageService;
    var shortener = tweetManager.shortener;

    if(backgroundPage.SecretKeys.hasValidKeys()
    && !twitterBackend.authenticated()
    && !twitterBackend.tokenRequested()) {
      twitterBackend.startAuthentication();
      window.close();
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
  });
}
