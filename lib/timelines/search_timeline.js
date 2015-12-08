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
    var currentData = this.template.getUserData();
    if(!currentData) {
      currentData = [];
    }
    this.timelinePath = this.timelineData = searchQuery;
    this.reset();
    currentData[this.orderNumber] = searchQuery;
    this.template.setUserData(currentData);
  }
  /* overridden */
  _doBackendRequest(path, callback, context, params) {
    var isUsernameMatchData = this.timelineData.match(/^from:\s*(\w+$)/i);
    if(isUsernameMatchData) {
      params = Object.assign({}, params, {
        screen_name: isUsernameMatchData[1]
      });
      this.manager.twitterBackend.usersTimeline(callback, context, params);
    } else {
      var queryParams = Object.assign({}, params, {
        q: this.timelineData.replace("'", "%25")
      });
      this.manager.twitterBackend.searchTimeline(callback, context, queryParams);
    }
  }
}

