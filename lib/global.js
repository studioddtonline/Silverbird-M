var backgroundPage = chrome.extension.getBackgroundPage();
var tweetManager = backgroundPage.TweetManager.instance;
var twitterBackend = tweetManager.twitterBackend;
var OptionsBackend = tweetManager.getOptionsBackend();
var TimelineTemplate = tweetManager.getTimelineTemplate();
const silm = new URL(location);

switch(silm.pathname) {
  case "/popup.html":
    if(backgroundPage.SecretKeys.hasValidKeys()
    && !twitterBackend.isAuthenticated()
    && !twitterBackend.isTokenRequested()) {
      twitterBackend.readyToEnteringPIN();
      twitterBackend.startAuthentication();
      window.close();
    }
    if(silm.searchParams.get("window") === "popup") {
      chrome.tabs.query({windowType: "popup"}, function(tabs) {
        tabs.forEach(function(tab) {
          if(tab.url.includes(chrome.runtime.id)) {
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

function doLocalization(nodes = document.querySelectorAll(".i18n")) {
  nodes.forEach((node) => {
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
