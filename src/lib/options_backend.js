"use strict";
let OptionsBackend = (() => {
  const defaultOptions = {
    tweets_per_page: 15,
    max_cached_tweets: 60,
    url_shortener: 'none',
    shortener_token: '',
    shortener_refresh_token: '',
    share_include_title: false,
    name_attribute: 'both',
    request_timeout: 15000,
    icon_size: 'icon_normal',

    use_streaming_api: true,
    use_keyboard_shortcuts: false,
    compliant_twitter_display_requirements: true,
    hidden_user_icons: false,
    display_simple_name: false,
    hidden_footer: false,
    hidden_timestamp: false,
    hidden_reply_info: false,
    hidden_retweet_info: false,
    hidden_retweet_count: false,
    hidden_like_count: false,
    hidden_client_name: false,
    hidden_dm_info: false,
    hidden_geo_info: false,
    hidden_list_info: false,

    tweets_notification_style: 'desktop',
    home_notify: false,
    mentions_notify: true,
    dms_notify: true,
    likes_notify: false,
    lists_notify: true,
    search_notify: false,
    notification_notify: false,
    badge_only_for_notification: false,

    home_visible: true,
    mentions_visible: true,
    dms_visible: true,
    likes_visible: true,
    lists_visible: true,
    search_visible: true,
    notification_visible: false,

    unified_visible: true,
    home_include_unified: true,
    mentions_include_unified: true,
    dms_include_unified: true,
    likes_include_unified: false,
    lists_include_unified: false,
    search_include_unified: false,
    notification_include_unified: true,

    home_exclude_blocked_muted: false,
    mentions_exclude_blocked_muted: false,
    dms_exclude_blocked_muted: false,
    likes_exclude_blocked_muted: false,
    lists_exclude_blocked_muted: false,
    search_exclude_blocked_muted: false,
    notification_exclude_blocked_muted: true,

    home_exclude_retweet: false,
    mentions_exclude_retweet: false,
    dms_exclude_retweet: false,
    likes_exclude_retweet: false,
    lists_exclude_retweet: false,
    search_exclude_retweet: false,
    notification_exclude_retweet: true,

    reply_all: false,
    show_expanded_urls: true,

    lists_user_data: null,
    search_user_data: null,

    home_tweets_color: 'rgba(0, 72, 255, 0.15)',
    mentions_tweets_color: 'rgba(255, 255, 0, 0.15)',
    dms_tweets_color: 'rgba(0, 255, 0, 0.15)',
    lists_tweets_color: 'rgba(255, 0, 0, 0.15)',
    likes_tweets_color: 'rgba(0, 0, 0, 0)',
    search_tweets_color: 'rgba(0, 0, 0, 0)',
    notification_tweets_color: 'rgba(0, 0, 0, 0)',

    notification_fade_timeout: 6000,
    font_size: '1.0em',
    show_user_autocomplete: true,

    trending_topics_woeid: 1,
    notify_update_trends: true
  };
  const optionsData = Persistence.options();
  let cachedOptions = null;
  return Object.create(null, {
    "save": {
      value: (optionsMap, skipReload) => {
        optionsData.save(optionsMap);
        if(skipReload) {
          return;
        }
        cachedOptions = OptionsBackend.load();
      }
    },
    "load": {
      value: (forceDefault) => {
        var map = Object.assign({}, defaultOptions);
        if(forceDefault) {
          return map;
        }
        try {
          var parsedMap = optionsData.val();
          if(parsedMap) {
            map = Object.assign(map, parsedMap);
          }
        } catch(e) { /* ignored */ }
        return map;
      }
    },
    "saveOption": {
      value: (option, value) => {
        if(cachedOptions === null) {
          cachedOptions = OptionsBackend.load();
        }
        cachedOptions[option] = value;
        OptionsBackend.save(cachedOptions, true);
      }
    },
    "setDefault": {
      value: (option) => {
        OptionsBackend.saveOption(option, defaultOptions[option]);
      }
    },
    "get": {
      value: (option) => {
        if(cachedOptions === null) {
          cachedOptions = OptionsBackend.load();
        }
        return cachedOptions[option];
      }
    },
    "getDefault": {
      value: (option) => {
        return defaultOptions[option];
      }
    },
    "getAll": {
      value: (filter = null) => {
        if(cachedOptions === null) {
          cachedOptions = OptionsBackend.load();
        }
        if(!!filter) {
          let selected = {};
          try {
            const regexp = new RegExp(`${filter}`, "i");
            for(let key of Object.keys(cachedOptions)) {
              if(regexp.test(key)) {
                selected[key] = cachedOptions[key];
              }
            }
          } catch(e) {
            console.error(e);
            selected = {};
          } finally {
            return selected;
          }
        } else {
          return cachedOptions;
        }
      }
    }
  });
})();

