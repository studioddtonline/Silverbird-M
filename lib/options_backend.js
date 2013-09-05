OptionsBackend = {
  defaultOptions: {
    home_refresh_interval: 300 * 1000,
    mentions_refresh_interval: 300 * 1000,
    dms_refresh_interval: 300 * 1000,
    lists_refresh_interval: 300 * 1000,
    favorites_refresh_interval: 300 * 1000,
    search_refresh_interval: 300 * 1000,
    blockedusers_refresh_interval: 5,
    trends_in_places: 5,
    saved_searches: 5,
    tweets_per_page: 15,
    max_cached_tweets: 60,
    url_shortener: 'bitly',
    shortener_token: '',
    shortener_token_secret: '',
    share_include_title: false,
    name_attribute: 'both',
    request_timeout: 15000,
    compose_position: 'top',
    icon_size: 'icon_normal',

    use_streaming_api: true,
    use_bearer_token: false,
    use_keyboard_shortcuts: false,
    compliant_twitter_display_requirements: true,
    hidden_user_icons: false,
    display_simple_name: false,
    hidden_footer: false,
    hidden_timestamp: false,
    hidden_reply_info: false,
    hidden_retweet_info: false,
    hidden_retweet_count: false,
    hidden_client_name: false,
    hidden_dm_info: false,
    hidden_geo_info: false,
    hidden_list_info: false,
    aggressive_flat: false,

    tweets_notification_style: 'desktop',
    home_notify: false,
    mentions_notify: true,
    dms_notify: true,
    favorites_notify: false,
    lists_notify: true,
    search_notify: false,
    notification_notify: false,
    badge_only_for_notification: false,

    home_visible: true,
    mentions_visible: true,
    dms_visible: true,
    favorites_visible: true,
    lists_visible: true,
    search_visible: true,
    notification_visible: false,

    unified_visible: true,
    home_include_unified: true,
    mentions_include_unified: true,
    dms_include_unified: true,
    favorites_include_unified: false,
    lists_include_unified: false,
    search_include_unified: false,
    notification_include_unified: true,

    reply_all: false,
    show_expanded_urls: true,

    lists_user_data: null,

    home_tweets_color: 'rgba(0, 72, 255, 0.15)',
    mentions_tweets_color: 'rgba(255, 255, 0, 0.15)',
    dms_tweets_color: 'rgba(0, 255, 0, 0.15)',
    lists_tweets_color: 'rgba(255, 0, 0, 0.15)',
    favorites_tweets_color: 'rgba(0, 0, 0, 0)',
    search_tweets_color: 'rgba(0, 0, 0, 0)',
    notification_tweets_color: 'rgba(0, 0, 0, 0)',

    notification_fade_timeout: 6000,
    theme: 'css/chromified.css,css/chromified-theme/jquery-ui-1.7.2.custom.css',
    font_family: '"Hiragino Kaku Gothic ProN", meiryo, Helvetica, Arial, sans-serif',
    font_size: '1.0em',
    show_hits_in_popup: false,
    show_user_autocomplete: true,

    notification_max_popups: 20,
    open_searches_internally: true,
    image_upload_service: 'twitpic.com',

    trending_topics_woeid: 1
  },
  cachedOptions: null,
  optionsData: Persistence.options(),
  save: function(optionsMap, skipReload) {
    this.optionsData.save(JSON.stringify(optionsMap));
    if(skipReload) {
      return;
    }
    this.cachedOptions = this.load();
  },
  load: function(forceDefault) {
    var map = $.extend(true, {}, this.defaultOptions);
    if(forceDefault) {
      return map;
    }
    try {
      var parsedMap = JSON.parse(this.optionsData.val());
      if(parsedMap)
        $.extend(true, map, parsedMap);
    } catch(e) { /* ignored */ }
    return map;
  },
  saveOption: function(option, value) {
    if(this.cachedOptions === null) {
      this.cachedOptions = this.load();
    }
    this.cachedOptions[option] = value;
    this.save(this.cachedOptions, true);
  },
  setDefault: function(option) {
    this.saveOption(option, this.defaultOptions[option]);
  },
  get: function(option) {
    if(this.cachedOptions === null) {
      this.cachedOptions = this.load();
    }
    return this.cachedOptions[option];
  }
};
