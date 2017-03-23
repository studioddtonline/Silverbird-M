class NotificationManager {
  constructor() {
    if(!this.createdAt || (!!this.createdAt && !!NotificationManager.instance)) {
      throw new TypeError(`needs NotificationManager.getInstance()`);
    } else {
      this.__init();
    }
  }

  __init() {
    Object.defineProperties(this, {
      "queue": {
        value: []
      },
      "running": {
        value: 0,
        writable: true
      },
      "notified": {
        value: new Set()
      },
      "fetchedIcon": {
        value: new Map()
      },
      [Symbol.for("fadeTimeout")]: {
        value: 6000,
        writable: true
      },
      "fadeTimeout": {
        get: () => {
          return this[Symbol.for("fadeTimeout")];
        },
        set: (num = 6000) => {
          try {
            const parsedNum = parseInt(num, 10);
            if(parsedNum >= 1000 && parsedNum <= 8000) {
              this[Symbol.for("fadeTimeout")] = num;
            }
          } catch(e) {
            this[Symbol.for("fadeTimeout")] = 6000;
          }
        }
      },
      "granted": {
        value: false,
        writable: true
      },
      "defaultIcon": {
        get: () => {
          return "/img/icon128.png";
        }
      }
    });
    chrome.notifications.onClicked.addListener((nId) => {
      chrome.notifications.clear(nId, (wasCleared) => {
        if(this.running > 0) {
          clearTimeout(this.running);
          this.running = 0;
        }
        this.__dequeue();
      });
    });
    chrome.notifications.onClosed.addListener((nId, byUser) => {
      if(!!this.fetchedIcon.get(nId)) {
        URL.revokeObjectURL(this.fetchedIcon.get(nId));
        this.fetchedIcon.delete(nId);
      }
      if(byUser) {
        if(this.running > 0) {
          clearTimeout(this.running);
          this.running = 0;
        }
        this.__dequeue();
      }
    });
    chrome.notifications.onButtonClicked.addListener((nId, buttonIndex) => {
      console.info(`${nId}: ${buttonIndex}`);
    });
    chrome.notifications.onPermissionLevelChanged.addListener(() => {
      this.checkGranted();
    });
    chrome.notifications.onShowSettings.addListener(() => {
      this.checkGranted();
    });
    this.checkGranted();
  }

  static getInstance() {
    if(!this.prototype.createdAt) {
      Object.defineProperties(this.prototype, {
        "createdAt": {
          value: Date.now()
        }
      });
      this.instance = new NotificationManager();
      Object.freeze(this);
    }
    return this.instance;
  }

  checkGranted() {
    chrome.notifications.getPermissionLevel((level) => {
      if(level === "granted") {
        this.granted = true;
      } else {
        this.granted = false;
        this.clearList();
      }
    });
  }

  addListForNotify(list = []) {
    if(!Array.isArray(list)) {
      list = [list];
    }
    this.queue.push(...list);
    if(this.running === 0) {
      this.__dequeue();
    }
  }

  clearList() {
    this.queue.splice(0);
    this.running = 0;
    this.notified.clear();
    for(let url of this.fetchedIcon.values()) {
      URL.revokeObjectURL(url);
    }
    this.fetchedIcon.clear();
  }

  __dequeue() {
    if(!this.granted) {
      this.clearList();
      return null;
    }
    if(this.queue.length > 0) {
      if(this.running === 0) {
        this.running = -1;
        this.__notify(this.queue.shift()).catch((e) => {
          this.running = 0;
          this.__dequeue();
        });
      }
    } else {
      this.running = 0;
    }
  }

  async __notify(tweet = {id_str: null}) {
    try {
      tweet = this.__validate(tweet);
    } catch(e) {
      throw new TypeError("tweet is not valid");
    }
    // check notified
    const nId = `Silm__${tweet.id_str}`;
    if(this.notified.has(nId)) {
      throw new TypeError("notification is already notified");
    }
    // create notification
    try {
      const originalIcomUrl = tweet.user.profile_image_url_https.replace(/_(normal|bigger|mini)\.(png|jpe?g|gif)$/i, ".$2");
      const iconUrl = await this.__getIconUrl(nId, originalIcomUrl, tweet.user.profile_image_url_https);
      const notifiedId = await this.__createNotification(nId, {
        type: "basic",
        title: `${tweet.user.name} @${tweet.user.screen_name}`,
        message: tweet.text,
        iconUrl: iconUrl
      });
      if(await this.__clearNotification(notifiedId)) {
        this.running = 0;
        this.__dequeue();
      }
    } catch(e) {
      console.error(e);
      throw new TypeError("fail to create a notification");
    }
  }

  __normalize(tweet) {
    if(tweet.hasOwnProperty("direct_message")) {
      tweet = tweet.direct_message;
    } else if(tweet.hasOwnProperty("retweeted_status")) {
      tweet = tweet.retweeted_status;
    }
    if(tweet.hasOwnProperty("extended_tweet")) {
      tweet.entities = tweet.extended_tweet.entities;
      tweet.extended_entities = {
        media: tweet.extended_tweet.entities.media
      };
      tweet.full_text = tweet.extended_tweet.full_text;
    }
    if(tweet.hasOwnProperty("full_text")) {
      tweet.text = tweet.full_text;
    }
    tweet.text = (tweet.text || "").trim();
    return tweet;
  }

  __validate(tweet) {
    tweet = this.__normalize(tweet);
    if(!tweet.hasOwnProperty("id_str") || !tweet.id_str) {
      throw new TypeError("missing tweet.id_str");
    }
    if(!tweet.hasOwnProperty("user")) {
      throw new TypeError("missing tweet.user");
    }
    tweet.text = tweet.text.replace(/https?:\/\/t\.co\/\w+[^\s]/ig, "")
                           .replace(/\s+/g, " ")
                           .replace(/\r?\n+/g, "\n");
    return tweet;
  }

  async __getIconUrl(nId, url, fallbackUrl = this.defaultIcon) {
    if(!nId) {
      throw new SyntaxError("missing nId");
    }
    if(!url || url === this.defaultIcon) {
      return this.defaultIcon;
    };
    try {
      const response = await fetch(url);
      if(response.ok) {
        const iconBlob = await response.blob();
        this.fetchedIcon.set(nId, URL.createObjectURL(iconBlob));
        return this.fetchedIcon.get(nId);
      } else {
        throw new TypeError("fail to fetch original icon, go to fallback");
      }
    } catch(e) {
      return await this.__getIconUrl(nId, fallbackUrl);
    }
  }

  __createNotification(nId, option) {
    if(!nId) {
      throw new SyntaxError("missing nId");
    }
    if(!option) {
      throw new SyntaxError("missing option");
    }
    return new Promise((resolve, reject) => {
      try {
        chrome.notifications.create(nId, option, (nId) => {
          this.notified.add(nId);
          if(!!this.fetchedIcon.get(nId)) {
            URL.revokeObjectURL(this.fetchedIcon.get(nId));
            this.fetchedIcon.delete(nId);
          }
          this.running = setTimeout(() => {
            resolve(nId);
          }, this.fadeTimeout);
        });
      } catch(e) {
        reject(e);
      }
    });
  }

  __clearNotification(nId) {
    if(!nId) {
      throw new SyntaxError("missing nId");
    }
    return new Promise((resolve, reject) => {
      try {
        chrome.notifications.clear(nId, (wasCleared) => {
          if(!!this.fetchedIcon.get(nId)) {
            URL.revokeObjectURL(this.fetchedIcon.get(nId));
            this.fetchedIcon.delete(nId);
          }
          if(wasCleared) {
            resolve(true);
          } else {
            resolve(false);
          }
        });
      } catch(e) {
        reject(e);
      }
    });
  }
}
