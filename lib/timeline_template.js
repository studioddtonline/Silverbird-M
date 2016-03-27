"use strict";
const TimelineTemplate = class TimelineTemplate {
  constructor(templateName, manager) {
    Object.defineProperties(this, {
      "tweetManager": {
        value: manager
      },
      "_templateUniqueId": {
        value: 0,
        writable: true
      },
      "id": {
        value: templateName,
        writable: true
      },
      "optionsPrefix": {
        value: ((id) => {
          if(id == TimelineTemplate.SENT_DMS || id == TimelineTemplate.RECEIVED_DMS) {
            return TimelineTemplate.DMS;
          }
          return id;
        })(templateName),
        writable: true
      },
      "timelineName": {
        value: undefined,
        writable: true
      },
      "timelinePath": {
        value: undefined,
        writable: true
      },
      "factory": {
        value: undefined,
        writable: true
      },
      "multipleTimelines": {
        value: false,
        writable: true
      },
      "hiddenTemplate": {
        value: false,
        writable: true
      },
      [Symbol.for("visible")]: {
        value: false,
        writable: true
      },
      "visible": {
        get: () => {
          return this[Symbol.for("visible")];
        },
        set: (bool) => {
          this[Symbol.for("visible")] = !!bool;
          OptionsBackend.saveOption(this.optionsPrefix + '_visible', this[Symbol.for("visible")]);
        }
      },
      [Symbol.for("includeInUnified")]: {
        value: false,
        writable: true
      },
      "includeInUnified": {
        get: () => {
          return this[Symbol.for("includeInUnified")];
        },
        set: (bool) => {
          this[Symbol.for("includeInUnified")] = !!bool;
          OptionsBackend.saveOption(this.optionsPrefix + '_include_unified', this[Symbol.for("includeInUnified")]);
        }
      },
      [Symbol.for("showNotification")]: {
        value: false,
        writable: true
      },
      "showNotification": {
        get: () => {
          return this[Symbol.for("showNotification")];
        },
        set: (bool) => {
          this[Symbol.for("showNotification")] = !!bool;
          OptionsBackend.saveOption(this.optionsPrefix + '_notify', this[Symbol.for("showNotification")]);
        }
      },
      [Symbol.for("userData")]: {
        value: undefined,
        writable: true
      },
      "userData": {
        get: () => {
          let data = this[Symbol.for("userData")];
          if(typeof data === "string") {
            try {
              return JSON.parse(data);
            } catch(e) {
              return data;
            }
          } else {
            return data;
          }
        },
        set: (data) => {
          this[Symbol.for("userData")] = data;
          OptionsBackend.saveOption(this.optionsPrefix + '_user_data', data);
        }
      },
      "refreshInterval": {
        value: undefined,
        writable: true
      },
      "excludeBlockedMuted": {
        value: undefined,
        writable: true
      },
      "excludeRetweet": {
        value: undefined,
        writable: true
      },
      "overlayColor": {
        value: undefined,
        writable: true
      },
      "loadOptions": {
        value: () => {
          this.visible = OptionsBackend.get(this.optionsPrefix + '_visible');
          this.refreshInterval = OptionsBackend.get(this.optionsPrefix + '_refresh_interval');
          this.includeInUnified = OptionsBackend.get(this.optionsPrefix + '_include_unified') && OptionsBackend.get('unified_visible');
          this.excludeBlockedMuted = OptionsBackend.get(this.optionsPrefix + '_exclude_blocked_muted');
          this.excludeRetweet = OptionsBackend.get(this.optionsPrefix + '_exclude_retweet');
          this.showNotification = OptionsBackend.get(this.optionsPrefix + '_notify');
          this.userData = OptionsBackend.get(this.optionsPrefix + '_user_data');
          this.overlayColor = OptionsBackend.get(this.optionsPrefix + '_tweets_color');
        }
      },
      "createTimelines": {
        value: () => {
          let createdTimelines = this.factory.create();
          this._templateUniqueId += createdTimelines.length;
          return createdTimelines;
        }
      },
      "addTimeline": {
        value: () => {
          let addedTimeline = this.factory.addTimeline(this._templateUniqueId);
          this._templateUniqueId += 1;
          return addedTimeline;
        }
      },
      "initTemplate": {
        value: () => {
          this.loadOptions();

          switch(this.id) {
            case TimelineTemplate.UNIFIED:
              this.timelineName = chrome.i18n.getMessage("w_Unified");
              this.factory = new UnifiedTimelineFactory(this);
              break;
            case TimelineTemplate.HOME:
              this.timelineName = chrome.i18n.getMessage("w_Home");
              this.templatePath = 'statuses/home_timeline';
              this.factory = new DefaultTimelineFactory(this);
              break;
            case TimelineTemplate.MENTIONS:
              this.timelineName = '@';
              this.templatePath = 'statuses/mentions_timeline';
              this.factory = new DefaultTimelineFactory(this);
              break;
            case TimelineTemplate.DMS:
              this.timelineName = chrome.i18n.getMessage("w_DM");
              this.factory = new UnifiedDMsTimelineFactory(this);
              break;
            case TimelineTemplate.SENT_DMS:
              this.hiddenTemplate = true;
              this.timelineName = chrome.i18n.getMessage("w_SentDM");
              this.templatePath = 'direct_messages/sent';
              this.factory = new DMTimelineFactory(this);
              break;
            case TimelineTemplate.RECEIVED_DMS:
              this.hiddenTemplate = true;
              this.timelineName = chrome.i18n.getMessage("w_ReceivedDM");
              this.templatePath = 'direct_messages';
              this.factory = new DMTimelineFactory(this);
              break;
            case TimelineTemplate.LIKES:
              this.timelineName = chrome.i18n.getMessage("w_Likes");
              this.templatePath = 'favorites/list';
              this.factory = new LikesTimelineFactory(this);
              break;
            case TimelineTemplate.LISTS:
              this.timelineName = chrome.i18n.getMessage("w_Lists");
              this.factory = new ListsTimelineFactory(this);
              this.multipleTimelines = true;
              break;
            case TimelineTemplate.SEARCH:
              this.timelineName = chrome.i18n.getMessage("w_Search");
              this.factory = new SearchTimelineFactory(this);
              this.multipleTimelines = true;
              break;
            case TimelineTemplate.NOTIFICATION:
              this.hiddenTemplate = true;
              this.timelineName = chrome.i18n.getMessage("w_Notification");
              this.factory = new NotificationTimelineFactory(this);
              break;
            default:
              // bug
              throw 'unrecognized timeline template id';
              break;
          }
        }
      }
    });
    this.initTemplate();
  }
  // Timeline Names
  static get UNIFIED() {
    return "unified";
  }
  static get HOME() {
    return "home";
  }
  static get MENTIONS() {
    return "mentions";
  }
  static get DMS() {
    return "dms";
  }
  static get SENT_DMS() {
    return "sentdms";
  }
  static get RECEIVED_DMS() {
    return "receiveddms";
  }
  static get LIKES() {
    return "likes";
  }
  static get LISTS() {
    return "lists";
  }
  static get SEARCH() {
    return "search";
  }
  static get NOTIFICATION() {
    return "notification";
  }

  static get TimelineNames() {
    return [TimelineTemplate.UNIFIED, TimelineTemplate.HOME, TimelineTemplate.MENTIONS,
            TimelineTemplate.DMS, TimelineTemplate.SENT_DMS, TimelineTemplate.RECEIVED_DMS,
            TimelineTemplate.LIKES, TimelineTemplate.LISTS, TimelineTemplate.SEARCH,
            TimelineTemplate.NOTIFICATION];
  }

  // Class Methods
  static initTemplates(manager) {
    if(!TimelineTemplate.hasOwnProperty("timelineTemplates")) {
      Object.defineProperty(TimelineTemplate, "timelineTemplates", {
        value: new Map()
      });
    }
    TimelineTemplate.TimelineNames.forEach((name) => {
      TimelineTemplate.timelineTemplates.set(name, new TimelineTemplate(name, manager));
    });
  }
  static initAfterAuthentication(userName) {
    TimelineTemplate.getTemplate(TimelineTemplate.MENTIONS).timelineName = "@" + userName;
  }
  static getTemplate(templateId) {
    return this.timelineTemplates.get(templateId);
  }
  static eachTimelineTemplate(callback, includeHidden) {
    for(let [index, name] of TimelineTemplate.TimelineNames.entries()) {
      let template = this.timelineTemplates.get(name);
      if(template.hiddenTemplate && !includeHidden) {
        continue;
      }
      if(callback(template) === false) {
        break;
      }
    }
  }
  static reloadOptions() {
    TimelineTemplate.eachTimelineTemplate((template) => {
      template.loadOptions();
    });
  }
}
