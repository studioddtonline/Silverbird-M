var backgroundPage = chrome.extension.getBackgroundPage();
var OptionsBackend = backgroundPage.OptionsBackend;
var urlExpander = backgroundPage.urlExpander;
var tweetManager = backgroundPage.TweetManager.instance;
var ImageService = backgroundPage.ImageService;
var fadeTimeout = OptionsBackend.get('notification_fade_timeout');

$(document).ready(function() {
  var tweet = tweetManager.injectTweets.shift();
  var progress = $('#progress');
  Renderer.setContext('desktop');
  $(document.body)
  .prepend(
    $.parseHTML(Renderer.renderTweet(tweet, false))
  )
  .click(function() {
    progress.stop().hide();
  })
  .on('unload', function() {
    progress.remove();
    this.remove();
  })
  .on('mouseover', '.handleLink', function(event) {
    if(!this.dataset.handleLinkBase) return;
    var baseUrl = (this.dataset.handleLinkBase === "undefined")? null: this.dataset.handleLinkBase;
    Renderer.handleLink(this, baseUrl);
    this.removeAttribute("data-handle-link-base");
    this.removeAttribute("data-handle-link-expanded");
    this.removeAttribute("data-handle-link-media");
  })
  .on('mouseover', '.createUserActionMenu', function(event) {
    if(!this.dataset.createUserActionMenu) return;
    Renderer.createUserActionMenu(this, this.dataset.createUserActionMenu);
    this.removeAttribute("data-create-user-action-menu");
  })
  .on('mouseover', '.handleHashTag', function(event) {
    if(!this.dataset.handleHashTag) return;
    Renderer.handleHashTag(this, this.dataset.handleHashTag);
    this.removeAttribute("data-handle-hash-tag");
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

