"use strict";
const silm = (() => {
  const wm = new WeakMap();
  wm.set(window, chrome.extension.getBackgroundPage());
  wm.set(location, new URL(location));
  return {
    get background() {
      return wm.get(window);
    },
    get manager() {
      return wm.get(window).TweetManager.instance;
    },
    get backend() {
      return wm.get(window).TweetManager.instance.twitterBackend;
    },
    get options() {
      return wm.get(window).TweetManager.instance.getOptionsBackend();
    },
    get TimelineTemplate() {
      return wm.get(window).TweetManager.instance.getTimelineTemplate();
    },
    get location() {
      return wm.get(location);
    }
  };
})();

const backgroundPage = silm.background;
const tweetManager = silm.manager;
const twitterBackend = silm.backend;
const OptionsBackend = silm.options;
const TimelineTemplate = silm.TimelineTemplate;

switch(silm.location.pathname) {
  case "/popup.html":
    if(backgroundPage.SecretKeys.hasValidKeys()
    && !twitterBackend.isAuthenticated()
    && !twitterBackend.isTokenRequested()) {
      twitterBackend.readyToEnteringPIN();
      twitterBackend.startAuthentication();
      window.close();
    }
    if(silm.location.searchParams.get("window") === "popup") {
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
