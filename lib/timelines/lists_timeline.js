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
  _setError(status) {
    this.currentError = status;
    if(status && status.indexOf('Not Found') != -1) {
      this._changeData(null);
    }
  }
  /* overridden */
  _changeData(listData) {
    if(listData) {
      var cachedLists = this.manager.cachedLists || [];
      if (Array.isArray(cachedLists) && cachedLists.length > 0) {
        cachedLists.forEach((value, i) => {
          if(value.id_str == listData.id_str || value.uri == listData.id_str) {
            if(value.uri == listData.id_str) {
              listData.id_str = value.id_str; // migration
            }
            this._setTimelinePath('lists/statuses');
            this.listParams.list_id = value.id_str;
            return false;
          } else {
            return true;
          }
        });
      }
    } else {
      this._setTimelinePath(null);
    }
    this.timelineData = listData.id_str;
    this.reset();
    // save state
    var currentLists = this.template.userData || [];
    currentLists[this.orderNumber] = listData.id_str;
    this.template.userData = currentLists;
  }
  /* overridden */
  _doBackendRequest(path, callback, context, params) {
    params = Object.assign({}, params, this.listParams);
    this.manager.twitterBackend.timeline(path, callback, context, params);
  }
}
