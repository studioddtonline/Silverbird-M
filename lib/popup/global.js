var MAX_TWEET_SIZE = 140;
var backgroundPage = chrome.extension.getBackgroundPage();

var Persistence = backgroundPage.Persistence;
var tweetManager = backgroundPage.TweetManager.instance;
var twitterBackend = tweetManager.twitterBackend;
var OptionsBackend = backgroundPage.OptionsBackend;
var TimelineTemplate = backgroundPage.TimelineTemplate;
var ImageService = backgroundPage.ImageService;
var UploadManager = backgroundPage.UploadManager;

var TwitterLib;
TwitterLib = {
  URLS: {
    BASE: 'http://twitter.com/',
    SEARCH: 'http://twitter.com/search?q='
  }
};

if(backgroundPage.SecretKeys.hasValidKeys() && !twitterBackend.authenticated() && !twitterBackend.tokenRequested()) {
  twitterBackend.startAuthentication();
  window.close();
}
