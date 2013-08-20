var backgroundPage = chrome.extension.getBackgroundPage();
var ImageService = backgroundPage.ImageService;
var tweetManager = backgroundPage.TweetManager.instance;
var twitterBackend = tweetManager.twitterBackend;
var OptionsBackend = backgroundPage.OptionsBackend;
var Persistence = backgroundPage.Persistence;
var TimelineTemplate = backgroundPage.TimelineTemplate;
chrome.i18n.getMessage = backgroundPage.chrome.i18n.getMessage;
