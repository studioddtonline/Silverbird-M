function ListsTweetsTimeline(timelineId, manager, template, listId, orderNumber) {
  MultipleTweetsTimeline.call(this, timelineId, manager, template, listId, orderNumber);
}

$.extend(ListsTweetsTimeline.prototype, MultipleTweetsTimeline.prototype, {
  /* overridden */
  init: function() {
    if(this.timelineData) {
      this._changeData({id_str: this.timelineData});
    }
    this._baseInit();
  },

  listParams: null,
  changeList: function(listData) {
    this._changeData(listData);
  },

  getListId: function() {
    return this.timelineData;
  },

  /* overridden */
  _setError: function(status) {
    this.currentError = status;
    if(status && status.indexOf('Not Found') != -1) {
      this._changeData(null);
    }
  },

  /* overridden */
  _changeData: function(listData) {
    var currentLists = this.template.getUserData();
    if(!currentLists) {
      currentLists = [];
    }

    if(listData) {
      var listsCache = this.manager.listsCache;
      if (listsCache !== null) {
        for(var i = 0, len = listsCache.length; i < len; i++) {
          var value = listsCache[i];
          if(value.id_str == listData.id_str || value.uri == listData.id_str) {
            if(value.uri == listData.id_str) listData.id_str = value.id_str; // migration
            this._setTimelinePath('lists/statuses');
            this.listParams = {
              list_id: value.id_str
            };
            break;
          }
        }
      }
    } else {
      this._setTimelinePath(null);
    }

    this.timelineData = listData.id_str;
    this.reset();

    currentLists[this.orderNumber] = listData.id_str;
    this.template.setUserData(currentLists);
  },

  /* overridden */
  _doBackendRequest: function(path, callback, context, params) {
    params = $.extend({}, params, this.listParams);
    this.manager.twitterBackend.timeline(path, callback, context, params);
  }
});
