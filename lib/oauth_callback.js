var backgroundPage = chrome.extension.getBackgroundPage();
var tweetManager = backgroundPage.TweetManager.instance;
var OptionsBackend = backgroundPage.OptionsBackend;
var url_shortener = OptionsBackend.get('url_shortener');
if(url_shortener == 'googl' && tweetManager.shortenerAuth.tokenRequested) {
  if(location.search.search('oauth_verifier') !== -1 ){
    backgroundPage.GooglShortener.getAccessToken(location.search);
  } 
}