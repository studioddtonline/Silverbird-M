class NotificationManager {
  constructor() {
    if(this.hasOwnProperty("instance")) {
      return this.instance;
    } else {
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
        }
      });
      chrome.notifications.onClicked.addListener((nId) => {
        chrome.notifications.clear(nId, (wasCleared) => {
          if(this.running > 0) {
            clearTimeout(this.running);
          }
          this.__enqueue();
        });
      });
      chrome.notifications.onClosed.addListener((nId, byUser) => {
        if(byUser) {
          this.__enqueue();
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
  }

  static getInstance() {
    if(!this.hasOwnProperty("instance")) {
      Object.defineProperty(this, "instance", {
        value: new NotificationManager()
      });
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
      this.__enqueue();
    }
  }

  clearList() {
    this.queue.splice(0);
    this.running = 0;
    this.notified.clear();
  }

  __enqueue() {
    if(!this.granted) {
      this.clearList();
      return null;
    }
    if(this.running > 0) {
      clearTimeout(this.running);
      this.running = 0;
    }
    if(this.queue.length > 0) {
      this.running = -1;
      this.__notify(this.queue.shift()).catch((e) => {
        this.__enqueue();
      }); 
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
      const iconUrl = await this.__getIconUrl(tweet.user.profile_image_url_https);
      const notifiedId = await this.__createNotification(nId, {
        type: "basic",
        title: `${tweet.user.name} @${tweet.user.screen_name}`,
        message: tweet.text,
        iconUrl: iconUrl
      });
      const cleared = await this.__clearNotification(notifiedId);
      if(cleared) {
        this.__enqueue();
      }
    } catch(e) {
      console.info(e);
      this.__enqueue();
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

  async __getIconUrl(url = "/img/icon128.png") {
    const fetchIconUrl = url.replace(/_(normal|bigger|mini)\.(png|jpe?g|gif)$/i, ".$2");
    try {
      const response = await fetch(fetchIconUrl);
      if(response.ok) {
        const iconBlob = await response.blob();
        return URL.createObjectURL(iconBlob);
      } else {
        throw new TypeError("fail to fetch original icon");
      }
    } catch(e) {
      try {
        const fallbackResponse = await fetch(url);
        if(fallbackResponse.ok) {
          const iconBlob = await fallbackResponse.blob();
          return URL.createObjectURL(iconBlob);
        } else {
          throw new TypeError("fail to fetch base icon");
        }
      } catch(e) {
        return "/img/icon128.png";
      }
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
          URL.revokeObjectURL(option.iconUrl);
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
          if(wasCleared) {
            resolve(true);
          }
          resolve(false);
        });
      } catch(e) {
        reject(e);
      }
    });
  }
}
