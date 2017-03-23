"use strict";
class SearchTweetsTimeline extends MultipleTweetsTimeline {
  constructor(timelineId, manager, template, searchQuery, orderNumber) {
    super(timelineId, manager, template, searchQuery, orderNumber);
  }
  changeSearchQuery(searchQuery) {
    if(searchQuery == this.timelineData) {
      return false;
    }
    this._changeData(searchQuery);
    return true;
  }
  getSearchQuery() {
    return this.timelineData;
  }
  /* overridden */
  _changeData(searchQuery) {
    let currentData = this.template.userData || [];
    this.timelinePath = this.timelineData = searchQuery;
    this.reset();
    this.currentScroll = 0;
    // save state
    currentData[this.orderNumber] = searchQuery;
    this.template.userData = currentData;
  }
  /* overridden */
  _doBackendRequest(path, callback, context, params) {
    if(this._isChurnRequest()) {
      callback(true, [], undefined, context);
      return;
    }
    const [, screenName, excludeRts] = (this.timelineData || "").match(/^from:\s*(\w+)(.*?$)/i) || [null, null, null];
    if(!!screenName && screenName !== "") {
      params = Object.assign({}, params, {
        screen_name: screenName,
        include_rts: (excludeRts || "").includes("exclude:retweets")? "false": "true"
      });
      this.manager.twitterBackend.usersTimeline(callback, context, params);
    } else {
      params = Object.assign({}, params, {
        q: this.timelineData.replace("'", "%25")
      });
      this.manager.twitterBackend.searchTimeline(callback, context, params);
    }
  }
  /* overridden */
  _baseInit() {
    this.giveMeTweets((success = false) => {
      if(!success) {
        this.firstRun = false;
      }
    });
  }
}

