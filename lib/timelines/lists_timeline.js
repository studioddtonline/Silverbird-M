function ListsTweetsTimeline(timelineId, manager, template, listId, orderNumber) {
  MultipleTweetsTimeline.call(this, timelineId, manager, template, listId, orderNumber);
}

$.extend(ListsTweetsTimeline.prototype, MultipleTweetsTimeline.prototype, {
  listParams: null,
  changeList: function(listId) {
    this._changeData(listId);
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
  _changeData: function(listId) {
    var currentLists = this.template.getUserData();
    if(!currentLists) {
      currentLists = [];
    }

    if(listId) {
      var listsCache = this.manager.listsCache;
      if (listsCache !== null) {
        for(var i = 0, len = listsCache.length; i < len; i++) {
          var value = listsCache[i];
          if(value.uri == listId) {
            this._setTimelinePath('lists/statuses');
            this.listParams = {
              list_id: value.id,
              slug: value.slug
            };
            break;
          }
        }
      }
    } else {
      this._setTimelinePath(null);
    }

    this.timelineData = listId;
    this.reset();

    currentLists[this.orderNumber] = listId;
    this.template.setUserData(currentLists);
  },

  /* overridden */
  _doBackendRequest: function(path, callback, context, params) {
    params = $.extend({}, params, this.listParams);
    this.manager.twitterBackend.timeline(path, callback, context, params);
  }
});
