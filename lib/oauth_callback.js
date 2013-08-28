var backgroundPage = chrome.extension.getBackgroundPage();
var tweetManager = backgroundPage.TweetManager.instance;
var OptionsBackend = backgroundPage.OptionsBackend;
var url_shortener = OptionsBackend.get('url_shortener');
if(tweetManager.shortenerAuth.tokenRequested) {
  if(url_shortener == 'googl' && location.search.search('oauth_verifier') !== -1 ){
    backgroundPage.GooglShortener.getAccessToken(location.search);
  } else if(url_shortener == 'bitly' ) {
    backgroundPage.BitLyShortener.getAccessToken(location.search);
  }
}
