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
      var _this = this;
      if (this.manager.listsCache != null) {
        $.each(this.manager.listsCache, function(index, value){
          if(value.uri == listId) {
            _this._setTimelinePath('lists/statuses');
            _this.listParams = {
              list_id: value.id,
              slug: value.slug
            };
          }
        });
      } else {
        this.manager.lists(true, function(){
          _this._changeData(listId);
        });
      }
      delete _this;
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
