class SilMPopup {
  constructor() {
    if(!this.appId || (!!this.appId && !!SilMPopup.instance)) {
      throw new TypeError(`needs SilMPopup.getInstance()`);
    } else {
      this.__init();
    }
  }
  static getInstance() {
    if(!this.prototype.appId) {
      Object.defineProperties(this.prototype, {
        "appId": {
          value: chrome.runtime.id
        }
      });
      this.instance = new SilMPopup();
      Object.freeze(this);
    }
    return this.instance;
  }
  __init() {
    if(!window) {
      throw new TypeError("missing window");
    }
    window.addEventListener("silmMessage", this.handlerSilMEvents);
    this.sendAction({action: "requestStatus", detail: {}});
  }
  sendAction(action = {action: "echo"}) {
    chrome.runtime.sendMessage(this.appId, action, {}, (response) => {
      console.info(`sendAction: %s`, response);
    });
  }
  handlerSilMEvents(event, self = SilMPopup.getInstance()) {
    if(!event.detail || !event.detail.type || !event.detail.target) {
      return;
    }
    switch(event.detail.type) {
      case "updateStatus":
        self.handlerUpdate(event.detail.target);
        break;
      case "echo":
      default:
        break;
    }
  }
  handlerUpdate(detail) {
    Object.entries(detail).forEach(([key, value], index) => {
      switch(key) {
        case "suspended":
          suspend(value);
          break;
        case "trendingTopics":
          loadTrends(value);
          break;
        case "savedSearches":
          loadSavedSearches(value);
          break;
        case "userstreamConnected":
          userstreamConnected(value);
          break;
        case "userstreamEnabled":
          userstreamEnabled(value);
          break;
        case "twitterConfiguration":
          break;
        default:
          //console.info(`%s: %o`, key, value);
          break;
      }
    });
  }
  localize(nodes = document.querySelectorAll("i18n")) {
    if(!nodes[Symbol.iterator]) {
      nodes = [nodes];
    }
    nodes.forEach((node) => {
      const currentText = node.textContent || "";
      const converted = chrome.i18n.getMessage(node.id) || currentText;
      switch(true) {
        case !!node.title:
          node.setAttribute("title", converted);
          break;
        case !!node.value && node.tagName !== "OPTION":
          node.setAttribute("value", converted);
          break;
        default:
          node.textContent = converted;
          break;
      }
      node.classList.remove("i18n");
    });
  }
}
const popup = SilMPopup.getInstance();
