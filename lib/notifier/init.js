var backgroundPage = chrome.extension.getBackgroundPage();
var OptionsBackend = backgroundPage.OptionsBackend;
var urlExpander = backgroundPage.urlExpander;
var tweetManager = backgroundPage.TweetManager.instance;
var ImageService = backgroundPage.ImageService;
chrome.i18n.getMessage = backgroundPage.chrome.i18n.getMessage;
var fadeTimeout = OptionsBackend.get('notification_fade_timeout');
var nameAttribute = OptionsBackend.get('name_attribute');

$(document).ready(function() {
  var tweet = tweetManager.injectTweets.shift();
  var progress = $('#progress');
  Renderer.setContext('desktop');
  $(document.body)
  .prepend(
    Renderer.renderTweet(tweet, false, nameAttribute)
  )
  .click(function() {
    progress.stop().hide();
  })
  .on('unload', function() {
    progress.remove();
    this.remove();
  });
  progress
  .text(chrome.i18n.getMessage("preventClosing"))
  .show()
  .css({bottom: '0px', width: '100%'})
  .animate({width: '0px'}, fadeTimeout, 'linear', function() {
    // Tell manager that this tweet shouldn't be marked as read
    tweetManager.shouldNotReadMap[tweet.id] = true;
    window.close();
  });
});

