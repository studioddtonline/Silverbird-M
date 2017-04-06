"use strict";
class ListsTweetsTimeline extends MultipleTweetsTimeline {
  constructor(timelineId, manager, template, listId, orderNumber) {
    super(timelineId, manager, template, listId, orderNumber);
    this.listParams = {
      list_id: ""
    };
  }
  /* overridden */
  init() {
    if(this.timelineData) {
      this._changeData({id_str: this.timelineData});
    }
    this._baseInit();
  }
  changeList(listData) {
    this._changeData(listData);
  }
  getListId() {
    return this.timelineData;
  }
  /* overridden */
  _setError(status = null) {
    this.currentError = status;
    if(/Not Found/i.test(status)) {
      this._changeData(null);
    }
  }
  /* overridden */
  _changeData(listData) {
    if(listData) {
      let cachedLists = this.manager.cachedLists || [];
      if (Array.isArray(cachedLists) && cachedLists.length > 0) {
        cachedLists.forEach((value) => {
          if(value.id_str === listData.id_str) {
            this._setTimelinePath('lists/statuses');
            this.listParams.list_id = value.id_str;
          }
        });
      }
    } else {
      this._setTimelinePath(null);
    }
    this.timelineData = listData.id_str;
    this.reset();
    this.currentScroll = 0;
    // save state
    let currentLists = this.template.userData || [];
    currentLists[this.orderNumber] = listData.id_str;
    this.template.userData = currentLists;
  }
  /* overridden */
  _doBackendRequest(path, callback, context, params) {
    if(this._isChurnRequest()) {
      callback(true, [], undefined, context);
      return;
    }
    params = Object.assign({}, params, this.listParams);
    this.manager.twitterBackend.timeline(path, callback, context, params);
  }
}
